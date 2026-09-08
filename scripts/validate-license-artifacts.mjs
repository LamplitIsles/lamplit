#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const license = read("LICENSE");
if (!license.startsWith("Elastic License 2.0\n")) throw new Error("top-level LICENSE must be Elastic License 2.0");
if (!license.includes("hosted or managed\nservice")) throw new Error("Elastic License hosted-service restriction is missing");
const dockerfile = read("Dockerfile");
if (!dockerfile.includes("ARG LAMPLIT_LICENSE=Elastic-2.0")) throw new Error("Dockerfile must default its Lamplit license to Elastic-2.0");
if (!dockerfile.includes('org.opencontainers.image.licenses="${LAMPLIT_LICENSE}"')) throw new Error("Dockerfile must carry the Lamplit OCI license label");
if (!dockerfile.includes("/usr/share/doc/lamplit/LICENSE") || !dockerfile.includes("THIRD_PARTY_NOTICES.md") || !dockerfile.includes("sbom.spdx.json")) throw new Error("Dockerfile must install the Lamplit license, release notices, and its SBOM");
for (const obsolete of [["docker", "postgres", "Dockerfile"]]) {
  const path = obsolete.join("/");
  if (existsSync(resolve(root, ...obsolete))) throw new Error(`${path} must not be present in the public repository`);
}

const notices = read("THIRD_PARTY_NOTICES.md");
if (!read("NOTICE").includes("THIRD_PARTY_NOTICES.md")) throw new Error("NOTICE must point to the third-party notice index");
for (const required of [
  "Hindsight",
  "0.9.2",
  "MIT",
  "@lamplitisles/kepos-hindsight",
  "Apache-2.0",
  "sbom/lamplit.spdx.json",
]) {
  if (!notices.includes(required)) throw new Error(`third-party notices are missing ${required}`);
}

const sbom = JSON.parse(read("sbom/lamplit.spdx.json"));
if (sbom.spdxVersion !== "SPDX-2.3") throw new Error("SBOM must use SPDX-2.3");
if (!Array.isArray(sbom.packages) || sbom.packages.length < 10) throw new Error("SBOM package inventory is unexpectedly small");
const packageByName = new Map(sbom.packages.map((entry) => [entry.name, entry]));
for (const [name, expectedLicense] of [["lamplit", "Elastic-2.0"], ["@lamplitisles/kepos-hindsight", "Apache-2.0"]]) {
  const entry = packageByName.get(name);
  if (!entry || entry.licenseDeclared !== expectedLicense) throw new Error(`SBOM license mismatch for ${name}`);
}
const dshMail = packageByName.get("@lamplitisles/dsh-mail");
if (!dshMail || dshMail.versionInfo !== "0.1.2" || !dshMail.downloadLocation.startsWith("https://registry.npmjs.org/")) {
  throw new Error("SBOM must record published @lamplitisles/dsh-mail@0.1.2 provenance");
}

process.stdout.write(`license artifacts passed (${sbom.packages.length} SBOM packages)\n`);
