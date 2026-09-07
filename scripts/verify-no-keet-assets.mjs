#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const forbiddenNames = new Set(["bare", "core-worker.bundle"]);
const forbiddenExtensions = new Set([".AppImage", ".deb", ".rpm", ".dmg", ".exe"]);
const ignored = new Set([".git", ".scratch", "node_modules", "sdk"]);
const violations = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (forbiddenNames.has(entry.name) || [...forbiddenExtensions].some((extension) => entry.name.endsWith(extension))) violations.push(path);
  }
}
walk(root);
if (violations.length) throw new Error(`Keet runtime assets found:\n${violations.join("\n")}`);
process.stdout.write("verified that no Keet runtime asset is checked into the repository\n");
