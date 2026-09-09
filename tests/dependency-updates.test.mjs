import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { json, readJson } from "../scripts/dependency-inputs.mjs";
import { applyUpdates, bridgeSnapshot, collectUpdates, readCurrent, resolveRuntimeLock } from "../scripts/update-dependencies.mjs";
import { validateDependencyArtifacts } from "../scripts/validate-dependency-artifacts.mjs";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureFiles = [
  "config/plugin-inputs.json", "config/memory-images.json",
  "docker/lamplit/runtime-package.json", "docker/lamplit/runtime-package-lock.json",
  "docker/lamplit/capabilities.core.json", "docker/lamplit/capabilities.full.json",
  "THIRD_PARTY_NOTICES.md", "docs/service-image-license-inventory.md",
  "scripts/generate-sbom.mjs", "sbom/lamplit.spdx.json",
  "licenses/dsh-hindsight-Apache-2.0.txt",
];

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "lamplit-updater-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const path of fixtureFiles) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    copyFileSync(join(repository, path), join(directory, path));
  }
  return directory;
}

const snapshot = (directory) => fixtureFiles.map((path) => [path, readFileSync(join(directory, path), "utf8")]);
const bridgeImage = () => ({
  Digest: `sha256:${"a".repeat(64)}`, Os: "linux", Architecture: "amd64",
  Labels: { "org.opencontainers.image.revision": "b".repeat(40), "org.opencontainers.image.licenses": "Apache-2.0" },
});

function providers(current) {
  return {
    packageMetadata: async (name) => {
      const plugin = current.plugins.npm.find((item) => item.name === name);
      const version = name === "@lamplitisles/dsh-companion" || name === "@guionai/web" ? "99.1.0" : plugin?.version ?? current.runtime.dependencies[name];
      return {
        name, version, license: plugin?.license ?? "Apache-2.0",
        dist: { tarball: `https://registry.npmjs.org/${name}/-/fixture-${version}.tgz`, integrity: plugin?.integrity },
      };
    },
    keetSource: async (keet) => ({ ...keet, commit: "c".repeat(40), archiveSha256: "d".repeat(64) }),
    inspectImage: async () => bridgeImage(),
  };
}

function offlineRun(command, args, options) {
  if (command !== "npm") return execFileSync(command, args, { ...options, stdio: "pipe" });
  const runtime = readJson(options.cwd, "package.json");
  const lock = readJson(options.cwd, "package-lock.json");
  lock.packages[""].dependencies = runtime.dependencies;
  for (const [name, version] of Object.entries(runtime.dependencies)) lock.packages[`node_modules/${name}`].version = version;
  writeFileSync(join(options.cwd, "package-lock.json"), json(lock));
}

test("version discovery reports package, source, and image changes without changing inputs or checkout", async (t) => {
  const directory = fixture(t);
  const current = readCurrent(directory);
  const before = structuredClone(current);
  const files = snapshot(directory);
  const update = await collectUpdates(current, providers(current));
  assert.equal(update.rows.find((row) => row.name === "@lamplitisles/dsh-companion").latest, "99.1.0");
  assert.equal(update.plugins.keet.commit, "c".repeat(40));
  assert.equal(update.memory.images.codexBridge.digest, bridgeImage().Digest);
  assert.deepEqual(update.memory.images.hindsight, current.memory.images.hindsight);
  assert.deepEqual(update.memory.images.postgres, current.memory.images.postgres);
  assert.deepEqual(current, before);
  assert.deepEqual(snapshot(directory), files);
});

test("a successful update synchronizes installed-dependency contracts and provenance, then is idempotent", async (t) => {
  const directory = fixture(t);
  const current = readCurrent(directory);
  const update = await collectUpdates(current, providers(current));
  const changed = await applyUpdates(directory, update, "99.2.0", { run: offlineRun });
  assert(changed.includes("docker/lamplit/runtime-package-lock.json"));
  assert.equal(readJson(directory, "docker/lamplit/runtime-package-lock.json").packages["node_modules/@guionai/web"].version, "99.1.0");
  const full = readJson(directory, "docker/lamplit/capabilities.full.json");
  assert(full.plugins.includes("@lamplitisles/dsh-companion@99.1.0"));
  validateDependencyArtifacts(directory);
  const sbom = readJson(directory, "sbom/lamplit.spdx.json");
  assert.equal(sbom.packages.find((item) => item.name === "lamplit").versionInfo, "99.2.0");
  assert.equal(readJson(directory, "config/memory-images.json").images.codexBridge.sourceRevision, "b".repeat(40));
  assert.deepEqual(await applyUpdates(directory, update, "99.2.0", { run: offlineRun }), []);
});

test("failed lock resolution leaves all checkout files unchanged", async (t) => {
  const directory = fixture(t);
  const current = readCurrent(directory);
  const update = await collectUpdates(current, providers(current));
  const files = snapshot(directory);
  await assert.rejects(applyUpdates(directory, update, "99.2.0", { run: () => { throw new Error("registry unavailable"); } }), /registry unavailable/);
  assert.deepEqual(snapshot(directory), files);
});

test("incorrect locked package versions cannot be applied", async (t) => {
  const directory = fixture(t);
  const current = readCurrent(directory);
  const update = await collectUpdates(current, providers(current));
  const files = snapshot(directory);
  await assert.rejects(applyUpdates(directory, update, "99.2.0", {
    run(command, args, options) {
      if (command !== "npm") return offlineRun(command, args, options);
      const lock = readJson(options.cwd, "package-lock.json");
      lock.packages[""].dependencies = readJson(options.cwd, "package.json").dependencies;
      writeFileSync(join(options.cwd, "package-lock.json"), json(lock));
    },
  }), /runtime lock mismatch/);
  assert.deepEqual(snapshot(directory), files);
});

test("downloaded license artifacts must match the registry integrity before any checkout writes", async (t) => {
  const directory = fixture(t);
  const current = readCurrent(directory);
  const update = await collectUpdates(current, providers(current));
  update.plugins.npm.find((plugin) => plugin.name === "@lamplitisles/dsh-hindsight").integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;
  const files = snapshot(directory);
  await assert.rejects(applyUpdates(directory, update, "99.2.0", { run: offlineRun, fetchBytes: async () => Buffer.from("wrong artifact") }), /integrity mismatch/);
  assert.deepEqual(snapshot(directory), files);
});

test("bridge discovery rejects a racing publication and unsupported images", async () => {
  const current = { published: "ghcr.io/lamplitisles/kepos-codex-bridge:sha-old" };
  await assert.rejects(bridgeSnapshot(current, async (reference) => ({ ...bridgeImage(), Digest: `sha256:${(reference.endsWith(":latest") ? "a" : "e").repeat(64)}` })), /disagree/);
  await assert.rejects(bridgeSnapshot(current, async () => ({ ...bridgeImage(), Architecture: "arm64" })), /linux\/amd64/);
  await assert.rejects(bridgeSnapshot(current, async () => ({ ...bridgeImage(), Labels: {} })), /source revision/);
});

test("real npm resolves a lock offline using only temporary configuration and cache", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "lamplit-npm-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const runtime = { name: "lamplit-test-runtime", version: "1.0.0", private: true, dependencies: {} };
  const lock = json({ name: runtime.name, version: runtime.version, lockfileVersion: 3, packages: { "": { name: runtime.name, version: runtime.version, dependencies: {} } } });
  const resolved = JSON.parse(resolveRuntimeLock(directory, runtime, lock, (command, args, options) =>
    execFileSync(command, [...args, "--offline"], { ...options, stdio: "pipe" }),
  ));
  assert.equal(resolved.lockfileVersion, 3);
  assert.deepEqual(Object.keys(resolved.packages), [""]);
  assert.equal(resolved.packages[""].name, runtime.name);
});
