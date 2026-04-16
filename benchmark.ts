#!/usr/bin/env npx tsx

import { performance } from "node:perf_hooks";
import { MetasearchService } from "./service.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STARTUP_TIMEOUT_MS = 30_000; // generous for benchmarking
const REQUEST_TIMEOUT_MS = 15_000;

const DEFAULT_QUERIES = [
  "typescript performance",
  "nodejs streams",
  "rust vs go",
  "openai api",
  "linux kernel",
];

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(1)}ms`;
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

async function runBenchmark(numQueries?: number) {
  const queries = DEFAULT_QUERIES;
  const iterations = numQueries ?? queries.length;

  console.log("=".repeat(64));
  console.log("  metasearch2 benchmark");
  console.log("=".repeat(64));
  console.log();

  // ── Phase 1: Binary resolution ──────────────────────────────────────
  console.log("--- Phase 1: Binary Resolution ---");
  const t0 = performance.now();
  const binPath = MetasearchService.resolveBin();
  const resolveTime = performance.now() - t0;

  if (!binPath) {
    console.error(
      "\nERROR: metasearch2 binary not found.\n" +
        "  Install with: npm install opencode-metasearch2\n" +
        "  Or: cargo install metasearch\n" +
        "  Or set METASEARCH_BIN to the binary path.\n",
    );
    process.exit(1);
  }

  console.log(`  Binary found: ${binPath}`);
  console.log(`  Resolve time: ${fmtMs(resolveTime)}`);
  console.log();

  // ── Phase 2-3: Service startup ─────────────────────────────────────
  console.log("--- Phase 2: Service Startup ---");
  const service = new MetasearchService({
    binPath,
    startupTimeoutMs: STARTUP_TIMEOUT_MS,
    autoInstall: false,
  });

  const t1 = performance.now();
  try {
    await service.start();
  } catch (err) {
    console.error(
      `\nERROR: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
  const startupTime = performance.now() - t1;

  console.log(`  Startup time: ${fmtMs(startupTime)}`);
  console.log();

  // ── Startup summary ────────────────────────────────────────────────
  console.log("--- Startup Summary ---");
  console.log(`  ${"Phase".padEnd(22)} ${"Duration".padStart(12)}`);
  console.log(`  ${"─".repeat(22)} ${"─".repeat(12)}`);
  console.log(
    `  ${"Binary resolution".padEnd(22)} ${fmtMs(resolveTime).padStart(12)}`,
  );
  console.log(
    `  ${"Service startup".padEnd(22)} ${fmtMs(startupTime).padStart(12)}`,
  );
  console.log(`  ${"─".repeat(22)} ${"─".repeat(12)}`);
  console.log(
    `  ${"TOTAL".padEnd(22)} ${fmtMs(resolveTime + startupTime).padStart(12)}`,
  );
  console.log();

  // ── Phase 3: Search benchmark ──────────────────────────────────────
  console.log("--- Phase 3: Search Benchmark ---");
  console.log(`  Running ${iterations} queries...\n`);

  const latencies: number[] = [];
  const results: {
    query: string;
    latencyMs: number;
    resultCount: number;
    error?: string;
  }[] = [];

  for (let i = 0; i < iterations; i++) {
    const query = queries[i % queries.length];

    const tq = performance.now();
    try {
      const text = await service.search(query);
      const elapsed = performance.now() - tq;
      const parsed = JSON.parse(text);
      const count = parsed[0]?.search_results?.length ?? 0;
      latencies.push(elapsed);
      results.push({ query, latencyMs: elapsed, resultCount: count });
    } catch (err) {
      const elapsed = performance.now() - tq;
      latencies.push(elapsed);
      results.push({
        query,
        latencyMs: elapsed,
        resultCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Per-query table ────────────────────────────────────────────────
  const qCol = 30;
  const header = `  ${"#".padEnd(4)} ${"Query".padEnd(qCol)} ${"Latency".padStart(12)} ${"Results".padStart(8)} ${"Status".padStart(8)}`;
  console.log(header);
  console.log(
    `  ${"─".repeat(4)} ${"─".repeat(qCol)} ${"─".repeat(12)} ${"─".repeat(8)} ${"─".repeat(8)}`,
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const q =
      r.query.length > qCol ? r.query.slice(0, qCol - 3) + "..." : r.query;
    const status = r.error ? `ERR` : "OK";
    console.log(
      `  ${String(i + 1).padEnd(4)} ${q.padEnd(qCol)} ${fmtMs(r.latencyMs).padStart(12)} ${String(r.resultCount).padStart(8)} ${status.padStart(8)}`,
    );
  }

  console.log();

  // ── Aggregate stats ────────────────────────────────────────────────
  if (latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);

    console.log("--- Search Latency Summary ---");
    console.log(`  ${"Metric".padEnd(12)} ${"Value".padStart(12)}`);
    console.log(`  ${"─".repeat(12)} ${"─".repeat(12)}`);
    console.log(`  ${"Min".padEnd(12)} ${fmtMs(min).padStart(12)}`);
    console.log(`  ${"Max".padEnd(12)} ${fmtMs(max).padStart(12)}`);
    console.log(`  ${"Avg".padEnd(12)} ${fmtMs(avg).padStart(12)}`);
    console.log(`  ${"p50".padEnd(12)} ${fmtMs(p50).padStart(12)}`);
    console.log(`  ${"p95".padEnd(12)} ${fmtMs(p95).padStart(12)}`);
    console.log(`  ${"─".repeat(12)} ${"─".repeat(12)}`);
    console.log(`  ${"Queries".padEnd(12)} ${String(latencies.length).padStart(12)}`);
    console.log(
      `  ${"Errors".padEnd(12)} ${String(results.filter((r) => r.error).length).padStart(12)}`,
    );
  }

  console.log();
  console.log("=".repeat(64));
  console.log("  Benchmark complete");
  console.log("=".repeat(64));

  // ── Cleanup ────────────────────────────────────────────────────────
  service.stop();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const numArg = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
if (numArg !== undefined && (isNaN(numArg) || numArg < 1)) {
  console.error("Usage: npx tsx benchmark.ts [num_queries]");
  console.error("  num_queries: number of search queries to run (default: 5)");
  process.exit(1);
}

runBenchmark(numArg).catch((err) => {
  console.error(`\nFatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
