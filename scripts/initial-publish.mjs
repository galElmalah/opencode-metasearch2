#!/usr/bin/env node

/**
 * One-time initial publish of all packages to npm.
 *
 * - Places real binary for current platform (darwin-arm64)
 * - Creates placeholder stubs for other platforms so npm accepts the package
 * - Publishes all 5 platform packages + the main plugin
 * - Cleans up stubs after publishing
 *
 * Usage:
 *   npm login  # first, if not already logged in
 *   node scripts/initial-publish.mjs
 *   node scripts/initial-publish.mjs --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const dryRun = process.argv.includes("--dry-run");
const ROOT = path.resolve(import.meta.dirname, "..");

const PLATFORMS = [
  { dir: "darwin-arm64", binary: "metasearch" },
  { dir: "darwin-x64", binary: "metasearch" },
  { dir: "linux-x64", binary: "metasearch" },
  { dir: "linux-arm64", binary: "metasearch" },
  { dir: "win32-x64", binary: "metasearch.exe" },
];

// Find local binary (first existing path wins)
const LOCAL_BIN = (() => {
  const candidates = [
    process.env.METASEARCH_BIN,
    "/tmp/metasearch2-build/bin/metasearch",
    path.join(process.env.HOME ?? "", ".cargo", "bin", "metasearch"),
  ];
  return candidates.find((p) => p && fs.existsSync(p));
})();

const currentPlatform = `${process.platform}-${process.arch}`;

if (!LOCAL_BIN) {
  console.error("No metasearch binary found. Set METASEARCH_BIN or build first.");
  process.exit(1);
}

console.log(`Current platform: ${currentPlatform}`);
console.log(`Local binary: ${LOCAL_BIN}`);
console.log(`Dry run: ${dryRun}\n`);

// Step 1: Place binaries
console.log("--- Placing binaries ---\n");
const createdStubs = [];

for (const { dir, binary } of PLATFORMS) {
  const binDir = path.join(ROOT, "npm", dir, "bin");
  const binPath = path.join(binDir, binary);

  fs.mkdirSync(binDir, { recursive: true });

  if (dir === currentPlatform && fs.existsSync(LOCAL_BIN)) {
    fs.copyFileSync(LOCAL_BIN, binPath);
    fs.chmodSync(binPath, 0o755);
    const size = (fs.statSync(binPath).size / 1024 / 1024).toFixed(1);
    console.log(`  ${dir}: real binary (${size} MB)`);
  } else {
    // Create a placeholder script that tells the user to update
    const stub =
      binary.endsWith(".exe")
        ? Buffer.from("placeholder")
        : `#!/bin/sh\necho "metasearch2: placeholder binary for ${dir}. Run the CI workflow to get a real build." && exit 1\n`;
    fs.writeFileSync(binPath, stub);
    fs.chmodSync(binPath, 0o755);
    console.log(`  ${dir}: placeholder stub`);
    createdStubs.push(binPath);
  }
}

// Step 2: Temporarily strip provenance (only works in CI with OIDC)
console.log("\n--- Disabling provenance for local publish ---\n");
const modifiedPkgs = [];

for (const { dir } of PLATFORMS) {
  const pkgPath = path.join(ROOT, "npm", dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.publishConfig?.provenance) {
    delete pkg.publishConfig.provenance;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    modifiedPkgs.push(pkgPath);
  }
}
const mainPkgPath = path.join(ROOT, "package.json");
const mainPkgData = JSON.parse(fs.readFileSync(mainPkgPath, "utf8"));
if (mainPkgData.publishConfig?.provenance) {
  delete mainPkgData.publishConfig.provenance;
  fs.writeFileSync(mainPkgPath, JSON.stringify(mainPkgData, null, 2) + "\n");
  modifiedPkgs.push(mainPkgPath);
}
console.log(`  Stripped provenance from ${modifiedPkgs.length} package(s)\n`);

// Step 3: Publish platform packages
console.log("--- Publishing platform packages ---\n");
let failed = 0;

for (const { dir } of PLATFORMS) {
  const pkgDir = path.join(ROOT, "npm", dir);
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")
  );
  console.log(`  ${pkgJson.name}@${pkgJson.version}`);

  try {
    const flags = dryRun ? "--dry-run" : "";
    execSync(`npm publish --access public ${flags}`, {
      cwd: pkgDir,
      stdio: "inherit",
    });
    console.log(`  -> ok\n`);
  } catch {
    console.error(`  -> FAILED\n`);
    failed++;
  }
}

// Step 4: Build and publish main package
console.log("--- Publishing main package ---\n");
const mainPkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
);
console.log(`  ${mainPkg.name}@${mainPkg.version}`);

try {
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  const flags = dryRun ? "--dry-run" : "";
  execSync(`npm publish --access public ${flags}`, {
    cwd: ROOT,
    stdio: "inherit",
  });
  console.log(`  -> ok\n`);
} catch {
  console.error(`  -> FAILED\n`);
  failed++;
}

// Step 4: Restore provenance in package.json files
console.log("--- Restoring provenance ---\n");
for (const pkgPath of modifiedPkgs) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.publishConfig = pkg.publishConfig || {};
  pkg.publishConfig.provenance = true;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}
console.log(`  Restored provenance in ${modifiedPkgs.length} package(s)\n`);

// Step 5: Clean up stubs (keep real binary)
console.log("--- Cleanup ---\n");
for (const stubPath of createdStubs) {
  fs.rmSync(stubPath);
  console.log(`  removed ${path.relative(ROOT, stubPath)}`);
}

if (failed > 0) {
  console.error(`\n${failed} package(s) failed to publish.`);
  process.exit(1);
}

console.log("\nDone. Now configure OIDC trusted publishers on npmjs.com for each package.");
console.log(
  "Go to: https://www.npmjs.com/package/<package-name>/access -> Trusted Publishers"
);
