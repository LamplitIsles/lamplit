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
const inputs = JSON.parse(readFileSync(resolve(root, "config/plugin-inputs.json"), "utf8"));

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

for (const plugin of inputs.npm) {
  addPackage({
    name: plugin.name,
    versionInfo: plugin.version,
    license: plugin.license,
    downloadLocation: plugin.tarball,
    source: plugin.source,
    checksums: [{ algorithm: "SHA512", checksumValue: Buffer.from(plugin.integrity.slice("sha512-".length), "base64").toString("hex") }],
  });
}
addPackage({
  name: inputs.keet.name,
  versionInfo: inputs.keet.version,
  license: inputs.keet.license,
  downloadLocation: `${inputs.keet.repository.replace(/\.git$/, "")}/archive/${inputs.keet.commit}.tar.gz`,
  source: `${inputs.keet.repository.replace(/\.git$/, "")}/tree/${inputs.keet.commit}`,
  checksums: [{ algorithm: "SHA256", checksumValue: inputs.keet.archiveSha256 }],
});

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
    created: args.get("--created") ?? new Date().toISOString(),
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
