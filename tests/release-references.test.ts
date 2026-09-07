import { spawnSync } from "node:child_process"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import assert from "node:assert/strict"
import { test } from "bun:test"
import {
  parseSourceRevision,
  parseStableReleaseTag,
  publishPlan,
  publishReferences,
  referencesForVersion,
  registryHost,
} from "../dagger/src/release.ts"
import {
  resolveTaggedCheckoutRevision,
  validateApplicationPublication,
} from "../scripts/validate-app-publication.ts"

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

test("publication plans carry one explicit revision to both application variants", () => {
  const revision = "0123456789abcdef0123456789abcdef01234567"
  assert.equal(parseSourceRevision(revision), revision)
  assert.deepEqual(publishPlan("v1.2.3", revision), {
    tag: "v1.2.3",
    version: "1.2.3",
    revision,
    core: "ghcr.io/lamplitisles/lamplit:1.2.3",
    full: "ghcr.io/lamplitisles/lamplit:1.2.3-full",
    rollingCore: "ghcr.io/lamplitisles/lamplit:latest",
    rollingFull: "ghcr.io/lamplitisles/lamplit:full",
  })
  assert.throws(() => publishPlan("v1.2.3", "unknown"))
})

test("local publication validation uses only a matching test-owned checkout", () => {
  const checkout = mkdtempSync(join(tmpdir(), "lamplit-release-"))
  try {
    const git = (args: string[]) => execFileSync("git", args, { cwd: checkout, stdio: "ignore" })
    git(["init", "--quiet"])
    git(["config", "user.email", "tests@example.invalid"])
    git(["config", "user.name", "Lamplit tests"])
    git(["commit", "--allow-empty", "--message", "test"])
    git(["tag", "--annotate", "v1.2.3", "--message", "release"])

    const revisions = resolveTaggedCheckoutRevision("v1.2.3", { cwd: checkout })
    const validated = validateApplicationPublication({
      releaseTag: "v1.2.3",
      username: "test-user",
      token: "test-token",
      ...revisions,
    })
    assert.equal(validated.revision, revisions.currentRevision)
    assert.throws(() => validateApplicationPublication({
      releaseTag: "v1.2.3",
      username: "replace-with-user",
      token: "test-token",
      ...revisions,
    }))
    assert.throws(() => validateApplicationPublication({
      releaseTag: "v1.2.3",
      username: "test-user",
      token: "test-token",
      taggedRevision: revisions.taggedRevision,
      currentRevision: "fedcba9876543210fedcba9876543210fedcba98",
    }))
  } finally {
    rmSync(checkout, { recursive: true, force: true })
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
