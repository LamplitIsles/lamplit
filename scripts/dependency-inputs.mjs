import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const inventoryStart = "<!-- BEGIN PLUGIN INVENTORY -->";
export const inventoryEnd = "<!-- END PLUGIN INVENTORY -->";
export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const readJson = (root, path) => JSON.parse(readFileSync(join(root, path), "utf8"));

export function validatePluginInputs(inputs) {
  assert(Array.isArray(inputs.npm) && inputs.npm.length > 0, "plugin inputs must list npm packages");
  const names = new Set();
  const buildArgs = new Set();
  for (const plugin of inputs.npm) {
    assert.match(plugin.name, /^@[a-z0-9-]+\/[a-z0-9-]+$/);
    assert.match(plugin.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
    assert.match(plugin.buildArg, /^[A-Z][A-Z_]+_VERSION$/);
    assert.equal(typeof plugin.fullOnly, "boolean");
    assert.equal(plugin.license, "Apache-2.0", `${plugin.name}: review changed license before updating`);
    assert.match(plugin.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
    assert.equal(new URL(plugin.tarball).origin, "https://registry.npmjs.org");
    assert(!names.has(plugin.name) && !buildArgs.has(plugin.buildArg), "duplicate plugin or build argument");
    names.add(plugin.name);
    buildArgs.add(plugin.buildArg);
  }
  assert.equal(inputs.keet.name, "@lamplitisles/dsh-keet");
  assert.match(inputs.keet.version, /^\d+\.\d+\.\d+$/);
  assert.match(inputs.keet.commit, /^[0-9a-f]{40}$/);
  assert.match(inputs.keet.archiveSha256, /^[0-9a-f]{64}$/);
  assert.equal(inputs.keet.license, "Apache-2.0");
  assert.equal(inputs.keet.repository, "https://github.com/lamplitisles/keet-for-agent.git");
  return inputs;
}

export function pluginSpecs(inputs, variant) {
  assert(["core", "full"].includes(variant), "unknown application variant");
  return [
    ...inputs.npm.filter((plugin) => !plugin.fullOnly).map((plugin) => `${plugin.name}@${plugin.version}`),
    `${inputs.keet.name}@${inputs.keet.version}`,
    ...(variant === "full" ? inputs.npm.filter((plugin) => plugin.fullOnly).map((plugin) => `${plugin.name}@${plugin.version}`) : []),
  ];
}

export function pluginInventory(inputs) {
  const rows = inputs.npm.map((plugin) =>
    `| [\`${plugin.name}\`](${plugin.source}) | ${plugin.version} | ${plugin.license} | ${plugin.fullOnly ? "Full" : "Core / Full"} |`,
  );
  rows.push(`| \`${inputs.keet.name}\` | ${inputs.keet.version} | ${inputs.keet.license} | Core / Full |`);
  return [
    inventoryStart,
    "| Plugin | Version | License | Images |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    `Keet is built from [\`${inputs.keet.commit}\`](${inputs.keet.repository.replace(/\.git$/, "")}/tree/${inputs.keet.commit}).`,
    "The npm tarball URLs and SHA-512 integrity values are recorded in",
    "[`config/plugin-inputs.json`](config/plugin-inputs.json) and the SPDX SBOM.",
    inventoryEnd,
  ].join("\n");
}

export function renderPluginArtifacts(root, inputs, runtime) {
  validatePluginInputs(inputs);
  const files = new Map();
  for (const variant of ["core", "full"]) {
    const path = `docker/lamplit/capabilities.${variant}.json`;
    const capabilities = readJson(root, path);
    capabilities.dsh = runtime.dependencies["@deepseek-ai/dsh"];
    capabilities.plugins = pluginSpecs(inputs, variant);
    files.set(path, json(capabilities));
  }
  const notices = readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
  const start = notices.indexOf(inventoryStart);
  const end = notices.indexOf(inventoryEnd);
  assert(start >= 0 && end > start, "third-party notices are missing plugin inventory markers");
  files.set("THIRD_PARTY_NOTICES.md", notices.slice(0, start) + pluginInventory(inputs) + notices.slice(end + inventoryEnd.length));
  return files;
}
