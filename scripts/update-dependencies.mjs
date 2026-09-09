#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { json, readJson, renderPluginArtifacts, validatePluginInputs } from "./dependency-inputs.mjs";
import { validateDependencyArtifacts } from "./validate-dependency-artifacts.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function packageMetadata(name) {
  const metadata = JSON.parse(await fetchBytes(`https://registry.npmjs.org/${name}/latest`));
  assert.equal(metadata.name, name, "npm returned a different package");
  assert.match(metadata.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
  return metadata;
}

function archiveFile(bytes, path) {
  const temporary = mkdtempSync(join(tmpdir(), "lamplit-archive-"));
  try {
    const archive = join(temporary, "source.tgz");
    writeFileSync(archive, bytes);
    return execFileSync("tar", ["-xOzf", archive, "--wildcards", path], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

async function keetSource(current) {
  const head = execFileSync("git", ["ls-remote", current.repository, "HEAD"], { encoding: "utf8", timeout: 30_000 }).trim().split(/\s+/)[0];
  assert.match(head, /^[0-9a-f]{40}$/, "Keet HEAD must resolve to a full commit");
  if (head === current.commit) return current;
  const archive = await fetchBytes(`${current.repository.replace(/\.git$/, "")}/archive/${head}.tar.gz`);
  const pkg = JSON.parse(archiveFile(archive, "*/packages/dsh-keet/package.json"));
  assert.equal(pkg.name, current.name);
  assert.equal(pkg.license, current.license, "Keet license changed; review before updating");
  return { ...current, version: pkg.version, commit: head, archiveSha256: sha256(archive) };
}

function inspectImage(reference) {
  return JSON.parse(execFileSync("skopeo", ["inspect", "--no-creds", "--no-tags", `docker://${reference}`], {
    encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  }));
}

export async function bridgeSnapshot(current, inspect = inspectImage, date = new Date().toISOString().slice(0, 10)) {
  const repository = current.published.slice(0, current.published.lastIndexOf(":"));
  const latest = await inspect(`${repository}:latest`);
  const revision = latest.Labels?.["org.opencontainers.image.revision"];
  assert.match(revision ?? "", /^[0-9a-f]{40}$/, "Bridge image is missing its source revision");
  assert.equal(`${latest.Os}/${latest.Architecture}`, "linux/amd64", "Bridge must support linux/amd64");
  assert.match(latest.Digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(latest.Labels?.["org.opencontainers.image.licenses"], "Apache-2.0", "Bridge license changed; review before updating");
  const sourceTag = `sha-${revision}`;
  const published = `${repository}:${sourceTag}`;
  const immutable = await inspect(published);
  assert.equal(immutable.Digest, latest.Digest, "Bridge latest and immutable source tag disagree; retry after publication finishes");
  if (current.published === published && current.digest === latest.Digest) return current;
  return { published, sourceTag, digest: latest.Digest, sourceRevision: revision, verifiedAt: date };
}

export function readCurrent(directory) {
  return {
    runtime: readJson(directory, "docker/lamplit/runtime-package.json"),
    plugins: validatePluginInputs(readJson(directory, "config/plugin-inputs.json")),
    memory: readJson(directory, "config/memory-images.json"),
  };
}

export async function collectUpdates(current, providers = {}) {
  const getPackage = providers.packageMetadata ?? packageMetadata;
  const [runtimePackages, npm, keet, bridge] = await Promise.all([
    Promise.all(Object.keys(current.runtime.dependencies).map(async (name) => [name, (await getPackage(name)).version])),
    Promise.all(current.plugins.npm.map(async (plugin) => {
      const metadata = await getPackage(plugin.name);
      assert.equal(metadata.license, plugin.license, `${plugin.name}: license changed; review before updating`);
      return {
        ...plugin, version: metadata.version, license: metadata.license,
        tarball: metadata.dist.tarball, integrity: metadata.dist.integrity,
        source: `https://www.npmjs.com/package/${plugin.name}/v/${metadata.version}`,
      };
    })),
    (providers.keetSource ?? keetSource)(current.plugins.keet),
    bridgeSnapshot(current.memory.images.codexBridge, providers.inspectImage),
  ]);
  const next = {
    runtime: { ...current.runtime, dependencies: Object.fromEntries(runtimePackages) },
    plugins: validatePluginInputs({ npm, keet }),
    memory: { ...current.memory, images: { ...current.memory.images, codexBridge: bridge } },
  };
  const rows = [
    ...runtimePackages.map(([name, version]) => ({ name, current: current.runtime.dependencies[name], latest: version })),
    ...npm.map((plugin, index) => ({ name: plugin.name, current: current.plugins.npm[index].version, latest: plugin.version })),
    { name: keet.name, current: current.plugins.keet.commit, latest: keet.commit },
    { name: "codex-bridge", current: current.memory.images.codexBridge.sourceTag, latest: bridge.sourceTag },
  ];
  return { ...next, rows };
}

export function bridgeInventory(bridge) {
  return [
    "<!-- BEGIN BRIDGE INVENTORY -->",
    "## Codex Bridge",
    "",
    "Compose follows the bridge's `latest` tag. The update command verifies the",
    "matching source tag and records this immutable snapshot for reproducibility:",
    "",
    `- Image: \`${bridge.published}\``,
    `- Digest: \`${bridge.digest}\``,
    `- Source revision: \`${bridge.sourceRevision ?? bridge.sourceTag.slice(4)}\``,
    "- Declared image license: Apache-2.0",
    ...(bridge.verifiedAt ? [`- Registry metadata verified: ${bridge.verifiedAt}`] : []),
    "",
    "This records the published OCI metadata; it does not claim a package-level",
    "license audit of the bridge's operating-system layers.",
    "<!-- END BRIDGE INVENTORY -->",
  ].join("\n");
}

export function resolveRuntimeLock(temporary, runtime, lock, run = execFileSync) {
  const directory = join(temporary, "runtime");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), json(runtime));
  writeFileSync(join(directory, "package-lock.json"), lock);
  // npm rejects the same path loaded at both user and global config levels.
  const userConfig = join(temporary, "user.npmrc");
  const globalConfig = join(temporary, "global.npmrc");
  writeFileSync(userConfig, "");
  writeFileSync(globalConfig, "");
  run("npm", [
    "install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund",
    `--userconfig=${userConfig}`, `--globalconfig=${globalConfig}`, `--cache=${join(temporary, "npm-cache")}`,
  ], { cwd: directory, stdio: "inherit", timeout: 180_000 });
  return readFileSync(join(directory, "package-lock.json"), "utf8");
}

export async function applyUpdates(directory, update, version, options = {}) {
  assert.match(version ?? "", /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "--write requires --version X.Y.Z for the release SBOM");
  const run = options.run ?? execFileSync;
  const current = readCurrent(directory);
  const files = renderPluginArtifacts(directory, update.plugins, update.runtime);
  files.set("config/plugin-inputs.json", json(update.plugins));
  files.set("config/memory-images.json", json(update.memory));
  files.set("docker/lamplit/runtime-package.json", json(update.runtime));
  const inventoryPath = "docs/service-image-license-inventory.md";
  const inventory = readFileSync(join(directory, inventoryPath), "utf8");
  const pattern = /<!-- BEGIN BRIDGE INVENTORY -->[\s\S]*?<!-- END BRIDGE INVENTORY -->/;
  assert(pattern.test(inventory), "missing bridge inventory markers");
  files.set(inventoryPath, inventory.replace(pattern, bridgeInventory(update.memory.images.codexBridge)));

  // Resolve external artifacts and generate the complete update in a test-owned
  // temporary tree. A registry/install/generation failure leaves the checkout alone.
  const temporary = mkdtempSync(join(tmpdir(), "lamplit-dependencies-"));
  const stage = (path, content) => {
    mkdirSync(dirname(join(temporary, path)), { recursive: true });
    writeFileSync(join(temporary, path), content);
  };
  try {
    let lock = readFileSync(join(directory, "docker/lamplit/runtime-package-lock.json"), "utf8");
    if (json(current.runtime.dependencies) !== json(update.runtime.dependencies)) {
      lock = resolveRuntimeLock(temporary, update.runtime, lock, run);
    }
    const locked = JSON.parse(lock);
    assert.deepEqual(locked.packages[""].dependencies, update.runtime.dependencies, "npm did not produce the requested runtime lock");
    files.set("docker/lamplit/runtime-package-lock.json", lock);

    const hindsight = update.plugins.npm.find((plugin) => plugin.name === "@lamplitisles/dsh-hindsight");
    const oldHindsight = current.plugins.npm.find((plugin) => plugin.name === hindsight.name);
    if (hindsight.integrity !== oldHindsight.integrity) {
      const archive = await (options.fetchBytes ?? fetchBytes)(hindsight.tarball);
      assert.equal(`sha512-${createHash("sha512").update(archive).digest("base64")}`, hindsight.integrity, "Hindsight tarball integrity mismatch");
      files.set("licenses/dsh-hindsight-Apache-2.0.txt", archiveFile(archive, "package/LICENSE"));
    }
    for (const [path, content] of files) stage(path, content);
    stage("scripts/generate-sbom.mjs", readFileSync(join(directory, "scripts/generate-sbom.mjs")));
    const previousSbom = readJson(directory, "sbom/lamplit.spdx.json");
    const sameRelease = previousSbom.packages.find((item) => item.name === "lamplit")?.versionInfo === version;
    const created = sameRelease ? previousSbom.creationInfo.created : new Date().toISOString();
    run(process.execPath, [join(temporary, "scripts/generate-sbom.mjs"), "--version", version, "--created", created], { stdio: "inherit", timeout: 30_000 });
    files.set("sbom/lamplit.spdx.json", readFileSync(join(temporary, "sbom/lamplit.spdx.json"), "utf8"));
    validateDependencyArtifacts(temporary);

    const changed = [];
    for (const [path, content] of files) {
      if (readFileSync(join(directory, path), "utf8") === content) continue;
      writeFileSync(join(directory, path), content);
      changed.push(path);
    }
    return changed;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const { values } = parseArgs({ options: { write: { type: "boolean" }, version: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) {
    console.log("Usage: node scripts/update-dependencies.mjs [--write --version X.Y.Z]\nWithout --write, report npm latest versions, Keet HEAD, and the published Codex Bridge snapshot.\nRequires Node 24, git, tar, skopeo, and npm; never commits, publishes, or deploys.");
    return;
  }
  if (values.write) assert.match(values.version ?? "", /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "--write requires --version X.Y.Z");
  else assert(!values.version, "--version requires --write");
  const update = await collectUpdates(readCurrent(root));
  console.table(update.rows);
  console.log(`Codex Bridge verified digest: ${update.memory.images.codexBridge.digest}`);
  if (values.write) {
    const files = await applyUpdates(root, update, values.version);
    console.log(files.length ? `Updated:\n${files.join("\n")}\nRun pnpm run check and dagger call -m dagger check --source . before releasing.` : "All dependency artifacts are current.");
  }
}

if (import.meta.main) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
