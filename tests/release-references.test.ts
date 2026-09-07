import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import assert from "node:assert/strict"
import { test } from "bun:test"
import {
  parseStableReleaseTag,
  publishReferences,
  referencesForVersion,
  registryHost,
} from "../dagger/src/release.ts"

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test("stable v tag maps immutable and rolling references", () => {
  const parsed = parseStableReleaseTag("v1.2.3")
  assert.deepEqual(parsed, { tag: "v1.2.3", version: "1.2.3" })
  assert.deepEqual(publishReferences(parsed.tag), {
    core: "ghcr.io/lamplitisles/lamplit:1.2.3",
    full: "ghcr.io/lamplitisles/lamplit:1.2.3-full",
    rollingCore: "ghcr.io/lamplitisles/lamplit:latest",
    rollingFull: "ghcr.io/lamplitisles/lamplit:full",
  })
  assert.deepEqual(referencesForVersion(parsed.version), publishReferences(parsed.tag))
  assert.equal(registryHost("ghcr.io/lamplitisles/lamplit:1.2.3"), "ghcr.io")
})

test("prerelease and ambiguous tags are rejected", () => {
  for (const value of ["1.2.3", "v1.2.3-rc.1", "v1.2", "v01.2.3", "v1.2.3+build"]) {
    assert.throws(() => parseStableReleaseTag(value))
  }
})

test("the release tag checker accepts stable tags and rejects prereleases", () => {
  const checker = join(root, "scripts/release-tag-check.mjs")
  const stable = spawnSync(process.execPath, [checker, "v1.2.3"], { encoding: "utf8" })
  assert.equal(stable.status, 0, stable.stderr)
  assert.match(stable.stdout, /1\.2\.3/)

  const prerelease = spawnSync(process.execPath, [checker, "v1.2.3-rc.1"], { encoding: "utf8" })
  assert.notEqual(prerelease.status, 0)
})
