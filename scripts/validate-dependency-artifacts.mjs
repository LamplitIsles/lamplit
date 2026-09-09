#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, renderPluginArtifacts, validatePluginInputs } from "./dependency-inputs.mjs";

export function validateDependencyArtifacts(root) {
  const inputs = validatePluginInputs(readJson(root, "config/plugin-inputs.json"));
  const runtime = readJson(root, "docker/lamplit/runtime-package.json");
  const lock = readJson(root, "docker/lamplit/runtime-package-lock.json");
  assert.deepEqual(lock.packages[""].dependencies, runtime.dependencies, "runtime manifest and lockfile disagree");
  for (const [name, version] of Object.entries(runtime.dependencies)) {
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `runtime lock mismatch: ${name}`);
  }
  for (const [path, expected] of renderPluginArtifacts(root, inputs, runtime)) {
    assert.equal(readFileSync(join(root, path), "utf8"), expected, `${path} is out of date; run deps:update`);
  }
  const sbom = readJson(root, "sbom/lamplit.spdx.json");
  for (const plugin of inputs.npm) {
    const entry = sbom.packages.find((item) => item.name === plugin.name);
    assert.equal(entry?.versionInfo, plugin.version, `SBOM version mismatch: ${plugin.name}`);
    assert.equal(entry.licenseDeclared, plugin.license, `SBOM license mismatch: ${plugin.name}`);
    assert.equal(entry.downloadLocation, plugin.tarball, `SBOM provenance mismatch: ${plugin.name}`);
    assert.deepEqual(entry.checksums, [{ algorithm: "SHA512", checksumValue: Buffer.from(plugin.integrity.slice(7), "base64").toString("hex") }]);
  }
  const keet = sbom.packages.find((item) => item.name === inputs.keet.name);
  assert.equal(keet?.versionInfo, inputs.keet.version, "Keet SBOM version mismatch");
  assert(keet.homepage.endsWith(`/tree/${inputs.keet.commit}`), "Keet SBOM revision mismatch");
  assert.deepEqual(keet.checksums, [{ algorithm: "SHA256", checksumValue: inputs.keet.archiveSha256 }]);
}

if (import.meta.main) {
  validateDependencyArtifacts(dirname(dirname(fileURLToPath(import.meta.url))));
  console.log("dependency manifests, generated inventory, runtime lockfile, and SBOM agree");
}
