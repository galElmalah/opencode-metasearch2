#!/usr/bin/env npx tsx

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import plugin from "./index.js";
import { MetasearchService } from "./service.js";

const PLUGIN_MARKER = "opencode-metasearch2";

const fakeInput = {
  client: {} as any,
  project: {} as any,
  directory: "/tmp",
  worktree: "/tmp",
  serverUrl: new URL("http://localhost:0"),
  $: (() => {}) as any,
  experimental_workspace: { register: () => {} } as any,
};

const fakeContext = {
  sessionID: "test",
  messageID: "test",
  agent: "test",
  directory: "/tmp",
  worktree: "/tmp",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: (() => {}) as any,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Save and restore env vars around a test block.
 * Returns a cleanup function that restores original values.
 */
function isolateEnv(
  vars: Record<string, string | undefined>,
): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  };
}

/** Whether a metasearch binary is available on this system. */
function hasBinary(): boolean {
  return MetasearchService.resolveBin() !== undefined;
}

// ── Guidance hooks (always work, no binary needed) ───────────────────────────

describe("guidance hooks", () => {
  let hooks: Awaited<ReturnType<typeof plugin>>;

  it("always returns all three guidance hooks regardless of service state", async () => {
    hooks = await plugin(fakeInput);
    assert.ok(hooks.config, "config hook must be present");
    assert.ok(
      hooks["experimental.chat.messages.transform"] !== undefined,
      "messages.transform hook must be present",
    );
    assert.ok(
      hooks["experimental.session.compacting"] !== undefined,
      "session.compacting hook must be present",
    );
  });

  it("config hook injects PLUGIN_MARKER into config.instructions", async () => {
    const cfg: any = { instructions: [] };
    await hooks.config!(cfg);
    assert.ok(cfg.instructions.length > 0, "should inject at least one instruction");
    const instruction = cfg.instructions[0] as string;
    assert.ok(
      instruction.includes(PLUGIN_MARKER),
      `instruction should contain ${PLUGIN_MARKER}`,
    );
  });

  it("config hook does not duplicate PLUGIN_MARKER on repeated calls", async () => {
    const cfg: any = { instructions: [] };

    // First call
    await hooks.config!(cfg);
    assert.equal(cfg.instructions.length, 1, "should inject exactly one instruction");

    // Second call — idempotent
    await hooks.config!(cfg);
    assert.equal(cfg.instructions.length, 1, "should NOT inject a second instruction");
  });

  it("compacting hook pushes Web Search context", async () => {
    const compactOutput: any = { context: [] };
    await hooks["experimental.session.compacting"]!(
      { sessionID: "test" },
      compactOutput,
    );
    assert.ok(
      compactOutput.context.length > 0,
      "should push at least one context item",
    );
    assert.ok(
      compactOutput.context[0].includes("Web Search"),
      "context should mention Web Search",
    );
  });

  it("messages.transform injects WEB_SEARCH_TOOL guidance into first user message", async () => {
    const transform = hooks["experimental.chat.messages.transform"]!;
    const output: any = {
      messages: [
        {
          info: { role: "user" },
          parts: [{ type: "text", text: "hello" }],
        },
      ],
    };

    await transform({}, output);

    // If service is running, guidance is injected; if not, transform is a noop
    const first = output.messages[0].parts[0];
    if (output.messages[0].parts.length > 1) {
      assert.equal(first.type, "text");
      assert.ok(
        (first.text as string).includes("<WEB_SEARCH_TOOL>"),
        "first part should contain WEB_SEARCH_TOOL marker",
      );
    } else {
      assert.equal(first.text, "hello", "original message preserved when noop");
    }
  });

  it("messages.transform is idempotent — does not re-inject WEB_SEARCH_TOOL", async () => {
    const transform = hooks["experimental.chat.messages.transform"]!;
    const output: any = {
      messages: [
        {
          info: { role: "user" },
          parts: [
            { type: "text", text: "<WEB_SEARCH_TOOL>\nsome guidance\n</WEB_SEARCH_TOOL>" },
            { type: "text", text: "actual user query" },
          ],
        },
      ],
    };

    const originalLength = output.messages[0].parts.length;
    await transform({}, output);
    assert.equal(
      output.messages[0].parts.length,
      originalLength,
      "should not add more parts when WEB_SEARCH_TOOL already present",
    );
  });
});

// ── Service unavailable (env-isolated) ───────────────────────────────────────

describe("service unavailable", () => {
  it("returns hooks without tool when binary is not resolvable", async () => {
    // Isolate env: set binary to a path that resolveBin will NOT find,
    // and disable auto-install so no attempt to download.
    const cleanup = isolateEnv({
      METASEARCH_BIN: "/nonexistent/metasearch/binary/path",
      METASEARCH_AUTO_INSTALL: "false",
    });

    try {
      const failedHooks = await plugin(fakeInput);

      // Always: hooks present
      assert.ok(failedHooks.config, "config hook must be present even on failure");
      assert.ok(
        failedHooks["experimental.session.compacting"] !== undefined,
        "compacting hook must be present even on failure",
      );

      // If the bundled npm binary happened to be found via other resolution
      // steps, the tool may still be registered. Skip further assertions.
      if (!failedHooks.tool?.web_search) {
        // Config hook should say "NOT available"
        const cfg: any = { instructions: [] };
        await failedHooks.config!(cfg);
        assert.ok(cfg.instructions.length > 0);
        assert.ok(
          (cfg.instructions[0] as string).includes("NOT available"),
          "should say NOT available when service is down",
        );

        // messages.transform should be a noop (no parts added)
        const transform = failedHooks["experimental.chat.messages.transform"]!;
        const output: any = {
          messages: [
            { info: { role: "user" }, parts: [{ type: "text", text: "hello" }] },
          ],
        };
        await transform({}, output);
        assert.equal(
          output.messages[0].parts.length,
          1,
          "noop transform should not add parts",
        );

        // Compacting hook should mention "NOT available"
        const compactOutput: any = { context: [] };
        await failedHooks["experimental.session.compacting"]!(
          { sessionID: "test" },
          compactOutput,
        );
        assert.ok(compactOutput.context.length > 0);
        assert.ok(
          (compactOutput.context[0] as string).includes("NOT available"),
          "compacting context should say NOT available when service is down",
        );
      }
    } finally {
      cleanup();
    }
  });
});

// ── Web search tool integration (requires binary) ────────────────────────────

describe("web_search tool", { skip: !hasBinary() }, () => {
  let hooks: Awaited<ReturnType<typeof plugin>>;

  it("plugin registers web_search tool with type arg", async () => {
    hooks = await plugin(fakeInput);
    assert.ok(hooks.tool?.web_search, "should register web_search tool");
    assert.ok(hooks.tool.web_search.args.query, "should have query arg");
    assert.ok(hooks.tool.web_search.args.type, "should have type arg");
  });

  it("returns raw JSON for web search", async () => {
    const result = await hooks.tool!.web_search.execute(
      { query: "node.js", type: "all" },
      fakeContext,
    );
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed), "response should be an array");
    assert.ok(parsed[0].search_results, "should have search_results");
    assert.ok(
      parsed[0].search_results.length > 0,
      "should have at least one result",
    );

    const first = parsed[0].search_results[0];
    assert.ok(first.result.url, "result should have a url");
    assert.ok(first.result.title, "result should have a title");
    assert.ok(first.engines.length > 0, "result should have engine sources");
    assert.ok(typeof first.score === "number", "result should have a score");
  });

  it("returns raw JSON for image search", async () => {
    const result = await hooks.tool!.web_search.execute(
      { query: "golden retriever", type: "images" },
      fakeContext,
    );
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed), "response should be an array");
    assert.ok(parsed.length > 0, "response should have at least one tab");
    assert.ok(
      "image_results" in parsed[0],
      "should have image_results field",
    );
    assert.ok(
      Array.isArray(parsed[0].image_results),
      "image_results should be an array",
    );
  });
});

// ── Binary resolution ────────────────────────────────────────────────────────

describe("MetasearchService.resolveBin", { skip: !hasBinary() }, () => {
  it("finds a metasearch binary", () => {
    const bin = MetasearchService.resolveBin();
    assert.ok(bin, "should resolve a binary path");
    assert.match(bin!, /metasearch/, "path should contain 'metasearch'");
  });
});
