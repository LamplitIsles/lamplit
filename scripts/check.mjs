#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const run = (script, args = []) => {
  execFileSync(process.execPath, [join(root, "scripts", script), ...args], { cwd: root, stdio: "inherit" });
};
run("validate-compose.mjs");
run("validate-workflows.mjs");
run("verify-no-keet-assets.mjs");
run("validate-license-artifacts.mjs");
run("validate-dependency-artifacts.mjs");
execFileSync("bash", ["-n", join(root, "docker/lamplit/entrypoint.sh")], { cwd: root, stdio: "inherit" });
execFileSync("node", ["--check", join(root, "docker/lamplit/launcher.mjs")], { cwd: root, stdio: "inherit" });
execFileSync("node", ["--check", join(root, "docker/lamplit/proxy.mjs")], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [
  "--test",
  join(root, "tests/release-references.test.ts"),
  join(root, "tests/memory-images.test.mjs"),
  join(root, "tests/dependency-updates.test.mjs"),
], { cwd: root, stdio: "inherit" });
execFileSync("pnpm", ["run", "web:check"], { cwd: root, stdio: "inherit" });
process.stdout.write("Lamplit repository checks passed (run `dagger call -m dagger check --source .` for image builds)\n");
