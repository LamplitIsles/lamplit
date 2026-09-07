#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseSourceRevision, parseStableReleaseTag } from "../dagger/src/release.ts"

export interface PublicationValidationInput {
  readonly releaseTag: string
  readonly username: string
  readonly token: string
  readonly taggedRevision: string
  readonly currentRevision: string
}

export interface PublicationValidationResult {
  readonly tag: string
  readonly version: string
  readonly revision: string
}

export interface GitRevisionResult {
  readonly taggedRevision: string
  readonly currentRevision: string
}

export interface GitRevisionOptions {
  readonly cwd?: string
  readonly git?: (args: readonly string[]) => string
}

const PLACEHOLDER = /^(?:replace-with|your(?:[-_ ]|$)|change(?:[-_ ]|$)|placeholder(?:[-_ ]|$)|example(?:[-_ ]|$))/i

function validateCredential(name: string, value: string): void {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${name} is required in .env`)
  if (PLACEHOLDER.test(normalized)) throw new Error(`${name} is still a placeholder`)
}

/** Validate all local publication inputs without contacting a registry. */
export function validateApplicationPublication(
  input: PublicationValidationInput,
): PublicationValidationResult {
  const parsed = parseStableReleaseTag(input.releaseTag)
  validateCredential("GHCR_USERNAME", input.username)
  validateCredential("GHCR_TOKEN", input.token)

  const taggedRevision = parseSourceRevision(input.taggedRevision)
  const currentRevision = parseSourceRevision(input.currentRevision)
  if (taggedRevision !== currentRevision) {
    throw new Error(`release tag ${parsed.tag} must identify the current checkout commit`)
  }

  return { tag: parsed.tag, version: parsed.version, revision: currentRevision }
}

/** Resolve the annotated or lightweight release tag and current checkout. */
export function resolveTaggedCheckoutRevision(
  releaseTag: string,
  options: GitRevisionOptions = {},
): GitRevisionResult {
  const parsed = parseStableReleaseTag(releaseTag)
  const git = options.git ?? ((args: readonly string[]) =>
    execFileSync("git", [...args], { cwd: options.cwd, encoding: "utf8" }).trim())

  let taggedRevision: string
  let currentRevision: string
  try {
    taggedRevision = git(["rev-parse", "--verify", `refs/tags/${parsed.tag}^{commit}`])
    currentRevision = git(["rev-parse", "HEAD"])
  } catch {
    throw new Error(`release tag ${parsed.tag} must exist in the current checkout`)
  }
  return { taggedRevision, currentRevision }
}

function main(): void {
  const releaseTag = process.argv[2] ?? ""
  const revisions = resolveTaggedCheckoutRevision(releaseTag)
  const validated = validateApplicationPublication({
    releaseTag,
    username: process.env.GHCR_USERNAME ?? "",
    token: process.env.GHCR_TOKEN ?? "",
    ...revisions,
  })
  process.stdout.write(`${validated.revision}\n`)
}

const isDirectExecution = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isDirectExecution) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 64
  }
}
