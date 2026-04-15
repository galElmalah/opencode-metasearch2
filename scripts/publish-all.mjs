#!/usr/bin/env node

/**
 * Publish all platform packages to npm.
 * Run after prepare-packages.mjs has placed binaries.
 *
 * Usage:
 *   NPM_TOKEN=... node scripts/publish-all.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const dryRun = process.argv.includes("--dry-run");
const packagesDir = "npm";

const packages = fs.readdirSync(packagesDir).filter((d) => {
  const pkgJson = path.join(packagesDir, d, "package.json");
  if (!fs.existsSync(pkgJson)) return false;
  const binDir = path.join(packagesDir, d, "bin");
  return fs.existsSync(binDir) && fs.readdirSync(binDir).length > 0;
});

if (packages.length === 0) {
  console.error("No packages with binaries found. Run prepare-packages.mjs first.");
  process.exit(1);
}

console.log(`Publishing ${packages.length} package(s)${dryRun ? " (dry run)" : ""}:\n`);

let failed = 0;

for (const pkg of packages) {
  const pkgDir = path.join(packagesDir, pkg);
  const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));

  console.log(`  ${pkgJson.name}@${pkgJson.version}`);

  try {
    const cmd = `npm publish${dryRun ? " --dry-run" : ""}`;
    execSync(cmd, { cwd: pkgDir, stdio: "inherit" });
    console.log(`  -> published\n`);
  } catch {
    console.error(`  -> FAILED\n`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} package(s) failed to publish.`);
  process.exit(1);
}

console.log("Done.");
