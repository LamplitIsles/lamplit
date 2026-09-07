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
const addPackage = ({ name, versionInfo, license, downloadLocation, source, checksums }) => {
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
  if (checksums) entry.checksums = checksums;
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
  { name: "@guionai/dsh-web", versionInfo: "0.6.2", license: "Apache-2.0", source: "https://github.com/GuionAI/web" },
  { name: "@lamplitisles/dsh-companion", versionInfo: "0.2.3", license: "Apache-2.0", source: "https://github.com/LamplitIsles/dsh-companion" },
  { name: "@lamplitisles/kepos-speech", versionInfo: "0.2.4", license: "Apache-2.0", source: "https://github.com/LamplitIsles/kepos-speech" },
  {
    name: "@lamplitisles/dsh-mail",
    versionInfo: "0.1.2",
    license: "Apache-2.0",
    downloadLocation: "https://registry.npmjs.org/@lamplitisles/dsh-mail/-/dsh-mail-0.1.2.tgz",
    source: "https://www.npmjs.com/package/@lamplitisles/dsh-mail/v/0.1.2",
    checksums: [{ algorithm: "SHA512", checksumValue: "a5712942fea0d8b33aaed29e8f929e99794ed7073ccc50e4ceec9c1095cd5e8f08b406731cf00c246e2349b579d4ecb208d7dfb646930611efb5b0efeec0f074" }],
  },
  { name: "@lamplitisles/dsh-keet", versionInfo: "0.1.0", license: "Apache-2.0", source: "https://github.com/lamplitisles/keet-for-agent/tree/1741c5e7ada7919db4a6b241db23ceefa39d875d" },
  { name: "@lamplitisles/kepos-hindsight", versionInfo: "0.2.0", license: "Apache-2.0", source: "https://github.com/LamplitIsles/kepos-hindsight" },
  { name: "@lamplitisles/dsh-imagegen", versionInfo: "0.4.0", license: "Apache-2.0", source: "https://github.com/LamplitIsles/kepos-imagegen" },
];
for (const entry of direct) {
  addPackage({ downloadLocation: entry.source, ...entry });
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
