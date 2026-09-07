#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowDir = join(root, ".github", "workflows");
const files = readdirSync(workflowDir).filter((file) => /\.(?:yml|yaml)$/.test(file));
if (!files.length) throw new Error("no GitHub workflow files found");
for (const file of files) {
  const path = join(workflowDir, file);
  const doc = YAML.parseDocument(readFileSync(path, "utf8"));
  if (doc.errors.length) throw new Error(`${file}: ${doc.errors.map((error) => error.message).join(", ")}`);
}
const release = YAML.parse(readFileSync(join(workflowDir, "release.yml"), "utf8"));
const triggers = release.on ?? release.true;
if (!triggers || !Object.hasOwn(triggers, "pull_request") || !Object.hasOwn(triggers, "push")) {
  throw new Error("release workflow must check pull requests and pushes");
}
if (!triggers.push.tags?.some((pattern) => pattern === "v*.*.*")) throw new Error("release workflow must trigger stable vX.Y.Z tags");
if (!/!startsWith\(github\.ref,\s*['"]refs\/tags\/v['"]\)/.test(String(release.jobs?.check?.if ?? ""))) {
  throw new Error("check job must skip stable tags so publication does not rebuild Core and Full");
}
if (release.jobs?.publish?.needs) throw new Error("publish job must not depend on the tag-skipped check job");
const stepCommand = (step) => `${step.run ?? ""} ${step.with?.verb ?? ""}`;
const invokes = (step, command) => step.uses?.startsWith("dagger/") && new RegExp(`\\bcall\\s+(?:-m\\s+\\S+\\s+)?${command}\\b`).test(stepCommand(step));
if (!release.jobs?.check?.steps?.some((step) => invokes(step, "check"))) throw new Error("check job must invoke Dagger");
if (!release.jobs?.publish?.steps?.some((step) => invokes(step, "publish"))) throw new Error("publish job must invoke Dagger publish");
if (!release.jobs?.publish?.steps?.some((step) => String(step.run ?? "").includes("generate-sbom.mjs"))) throw new Error("publish job must generate an SBOM");
if (!release.jobs?.publish?.steps?.some((step) => step.uses === "actions/upload-artifact@v4" && String(step.with?.path ?? "").includes("release-artifacts"))) throw new Error("publish job must upload release notices and SBOM");
if (release.jobs.publish.permissions?.packages !== "write") throw new Error("publish job must grant packages: write only where needed");
process.stdout.write(`validated ${files.length} workflow file(s)\n`);
