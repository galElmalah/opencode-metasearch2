#!/usr/bin/env node

/**
 * Local development helper: copies a locally-built metasearch binary into
 * the correct platform package directory.
 *
 * Usage:
 *   node scripts/prepare-packages.mjs /path/to/metasearch [version]
 *
 * Example:
 *   node scripts/prepare-packages.mjs ~/.cargo/bin/metasearch 0.1.0
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const PLATFORMS = {
  "darwin-arm64": "metasearch",
  "darwin-x64": "metasearch",
  "linux-x64": "metasearch",
  "linux-arm64": "metasearch",
  "win32-x64": "metasearch.exe",
};

const binPath = process.argv[2];
const version = process.argv[3];

if (!binPath) {
  console.error("Usage: node scripts/prepare-packages.mjs <binary-path> [version]");
  process.exit(1);
}

if (!fs.existsSync(binPath)) {
  console.error(`Binary not found: ${binPath}`);
  process.exit(1);
}

// Detect current platform
const platformKey = `${process.platform}-${process.arch}`;
const binaryName = PLATFORMS[platformKey];

if (!binaryName) {
  console.error(`Unsupported platform: ${platformKey}`);
  console.error(`Supported: ${Object.keys(PLATFORMS).join(", ")}`);
  process.exit(1);
}

const pkgDir = path.join("npm", platformKey);
const binDir = path.join(pkgDir, "bin");

fs.mkdirSync(binDir, { recursive: true });
fs.copyFileSync(binPath, path.join(binDir, binaryName));
fs.chmodSync(path.join(binDir, binaryName), 0o755);

console.log(`Copied ${binPath} -> ${path.join(binDir, binaryName)}`);

// Update version if provided
if (version) {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`Updated ${pkgJsonPath} to version ${version}`);
}

const stat = fs.statSync(path.join(binDir, binaryName));
console.log(`Binary size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
