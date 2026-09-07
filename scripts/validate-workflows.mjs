#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowDir = join(root, ".woodpecker");
const workflowFiles = existsSync(workflowDir)
  ? readdirSync(workflowDir).filter((file) => /\.(?:yml|yaml)$/.test(file))
  : [];
if (workflowFiles.length !== 1) throw new Error("repository must contain exactly one Woodpecker workflow");

const workflowPath = join(workflowDir, workflowFiles[0]);
const document = YAML.parseDocument(readFileSync(workflowPath, "utf8"));
if (document.errors.length) {
  throw new Error(`${workflowFiles[0]}: ${document.errors.map((error) => error.message).join(", ")}`);
}
const workflow = document.toJSON();
const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
const step = (name) => steps.find((candidate) => candidate?.name === name);
const check = step("check");
const publish = step("publish");
if (!check || !publish) throw new Error("Woodpecker workflow must define check and publish steps");

const daggerConfig = JSON.parse(readFileSync(join(root, "dagger/dagger.json"), "utf8"));
const daggerVersion = String(daggerConfig.engineVersion ?? "").replace(/^v/, "");
if (!daggerVersion) throw new Error("dagger/dagger.json must declare an engine version");
const daggerImage = `ghcr.io/tta-lab/dagger-cli:${daggerVersion}`;
if (check.image !== daggerImage || publish.image !== daggerImage) {
  throw new Error(`check and publish must use the pinned ${daggerImage} image`);
}

const conditions = (candidate) => Array.isArray(candidate?.when) ? candidate.when : [];
const values = (condition, key) => {
  const value = condition?.[key];
  return Array.isArray(value) ? value : [value];
};
const hasCondition = (candidate, expected) => conditions(candidate).some((condition) =>
  Object.entries(expected).every(([key, value]) => values(condition, key).includes(value))
);
if (!hasCondition(check, { event: "pull_request" }) || !hasCondition(check, { event: "push", branch: "main" })) {
  throw new Error("check must run for pull requests and pushes to main");
}
if (conditions(check).some((condition) => values(condition, "event").includes("tag"))) {
  throw new Error("check must not run for tag events");
}
if (conditions(publish).length !== 1 || !hasCondition(publish, { event: "tag", ref: "refs/tags/v*.*.*" })) {
  throw new Error("publish must run only for stable version-tag events");
}

const commands = (candidate) => Array.isArray(candidate?.commands)
  ? candidate.commands.join("\n")
  : String(candidate?.commands ?? "");
if (!commands(check).includes("dagger call -m dagger check --source=.")) {
  throw new Error("check must invoke the repository Dagger check");
}
const publishCommands = commands(publish);
if (!publishCommands.includes("dagger call -m dagger publish")) throw new Error("publish must invoke Dagger publish");
if (!publishCommands.includes("CI_COMMIT_SHA") || !publishCommands.includes("--revision")) {
  throw new Error("publish must pass the immutable Woodpecker commit SHA as the revision");
}
if (!publishCommands.includes("GHCR_TOKEN") || !/--registry-password(?:=|\s+)env:GHCR_TOKEN\b/.test(publishCommands)) {
  throw new Error("publish must pass GHCR_TOKEN to Dagger as an environment Secret");
}

const checkEnvironment = check.environment ?? {};
if (Object.hasOwn(checkEnvironment, "GHCR_USERNAME") || Object.hasOwn(checkEnvironment, "GHCR_TOKEN")) {
  throw new Error("check must not receive GHCR credentials");
}
const publishEnvironment = publish.environment ?? {};
for (const [name, secret] of [["GHCR_USERNAME", "ghcr_username"], ["GHCR_TOKEN", "ghcr_token"]]) {
  if (publishEnvironment[name]?.from_secret !== secret) {
    throw new Error(`publish must receive ${name} from the ${secret} Woodpecker secret`);
  }
}

if (workflow.services?.length || workflow.volumes || steps.some((candidate) => candidate.privileged || candidate.volumes)) {
  throw new Error("the repository workflow must use the agent-provided Dagger runner and cache");
}
const serialized = JSON.stringify(workflow);
if (serialized.includes("_EXPERIMENTAL_DAGGER_RUNNER_HOST") || serialized.includes("/var/lib/dagger")) {
  throw new Error("Dagger runner and persistent cache are agent-owned, not repository workflow resources");
}

const githubWorkflowDir = join(root, ".github", "workflows");
const githubWorkflowFiles = existsSync(githubWorkflowDir)
  ? readdirSync(githubWorkflowDir).filter((file) => /\.(?:yml|yaml)$/.test(file))
  : [];
if (githubWorkflowFiles.length) throw new Error("GitHub Actions workflows must not remain in the passive mirror");

process.stdout.write(`validated ${workflowFiles.length} Woodpecker workflow file(s)\n`);
