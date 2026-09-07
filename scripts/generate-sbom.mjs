#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value.startsWith("--")) args.set(value, process.argv[index + 1]);
}

const lockfile = resolve(root, args.get("--lockfile") ?? "docker/lamplit/runtime-package-lock.json");
const output = resolve(root, args.get("--output") ?? "sbom/lamplit.spdx.json");
const version = args.get("--version") ?? "0.1.0-source";
const lock = JSON.parse(readFileSync(lockfile, "utf8"));

const packageId = (name, versionInfo) =>
  `SPDXRef-${name}-${versionInfo}`.replace(/[^A-Za-z0-9.-]+/g, "-");
const purl = (name, versionInfo) => {
  const parts = name.startsWith("@") ? name.split("/", 2) : [name];
  const encodedName = parts.length === 2
    ? `${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`
    : encodeURIComponent(parts[0]);
  return `pkg:npm/${encodedName}@${encodeURIComponent(versionInfo)}`;
};
const expression = (value) => (typeof value === "string" && value.length > 0 ? value : "NOASSERTION");

const packages = new Map();
const addPackage = ({ name, versionInfo, license, downloadLocation, source }) => {
  const key = `${name}@${versionInfo}`;
  if (packages.has(key)) return;
  const entry = {
    SPDXID: packageId(name, versionInfo),
    name,
    versionInfo,
    downloadLocation: downloadLocation ?? "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: expression(license),
    licenseDeclared: expression(license),
    copyrightText: "NOASSERTION",
    externalRefs: [
      {
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: purl(name, versionInfo),
      },
    ],
  };
  if (source) entry.homepage = source;
  packages.set(key, entry);
};

addPackage({
  name: "lamplit",
  versionInfo: version,
  license: "Elastic-2.0",
  downloadLocation: "https://github.com/LamplitIsles/lamplit",
  source: "https://github.com/LamplitIsles/lamplit",
});

for (const [location, metadata] of Object.entries(lock.packages ?? {})) {
  if (!location.startsWith("node_modules/")) continue;
  const name = location.slice("node_modules/".length);
  addPackage({
    name,
    versionInfo: metadata.version,
    license: metadata.license,
    downloadLocation: metadata.resolved,
  });
}

const direct = [
  ["@guionai/dsh-web", "0.6.2", "Apache-2.0", "https://github.com/GuionAI/web"],
  ["@lamplitisles/dsh-companion", "0.2.3", "Apache-2.0", "https://github.com/LamplitIsles/dsh-companion"],
  ["@lamplitisles/kepos-speech", "0.2.4", "Apache-2.0", "https://github.com/LamplitIsles/kepos-speech"],
  ["@lamplitisles/dsh-mail", "0.1.0", "Apache-2.0", "https://github.com/LamplitIsles/dsh-mail/tree/008c76fcbca764457678e8f63438b206ee9490f0"],
  ["@lamplitisles/dsh-keet", "0.1.0", "Apache-2.0", "https://github.com/lamplitisles/keet-for-agent/tree/1741c5e7ada7919db4a6b241db23ceefa39d875d"],
  ["@lamplitisles/kepos-hindsight", "0.2.0", "Apache-2.0", "https://github.com/LamplitIsles/kepos-hindsight"],
  ["@lamplitisles/dsh-imagegen", "0.4.0", "Apache-2.0", "https://github.com/LamplitIsles/kepos-imagegen"],
];
for (const [name, versionInfo, license, source] of direct) {
  addPackage({ name, versionInfo, license, downloadLocation: source, source });
}

const sortedPackages = [...packages.values()].sort((left, right) =>
  `${left.name}@${left.versionInfo}`.localeCompare(`${right.name}@${right.versionInfo}`),
);
const rootPackage = sortedPackages.find((entry) => entry.name === "lamplit");
const relationships = sortedPackages
  .filter((entry) => entry !== rootPackage)
  .map((entry) => ({
    spdxElementId: rootPackage.SPDXID,
    relationshipType: "DEPENDS_ON",
    relatedSpdxElement: entry.SPDXID,
  }));
relationships.push({
  spdxElementId: "SPDXRef-DOCUMENT",
  relationshipType: "DESCRIBES",
  relatedSpdxElement: rootPackage.SPDXID,
});

const document = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: `Lamplit container distribution ${version}`,
  documentNamespace: `https://lamplitisles.github.io/lamplit/sbom/${version}`,
  creationInfo: {
    created: "2026-09-07T00:00:00Z",
    creators: ["Organization: LamplitIsles"],
    licenseListVersion: "3.27",
  },
  documentDescribes: [rootPackage.SPDXID],
  packages: sortedPackages,
  relationships,
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
process.stdout.write(`wrote ${output} (${sortedPackages.length} packages)\n`);
