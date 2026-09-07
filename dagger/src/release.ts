export interface ImageReferenceSet {
  readonly core: string
  readonly full: string
  readonly rollingCore: string
  readonly rollingFull: string
}

export interface ReleaseVersion {
  readonly tag: string
  readonly version: string
}

const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** Parse only stable release tags; prereleases never publish released images. */
export function parseStableReleaseTag(value: string): ReleaseVersion {
  const tag = value.trim()
  const match = STABLE_TAG.exec(tag)
  if (!match) throw new Error(`release tag must match vX.Y.Z (received ${value})`)
  return { tag, version: tag.slice(1) }
}

/** Validate an already-normalized image version. */
export function parseVersion(value: string): string {
  const version = value.trim()
  if (!VERSION.test(version)) throw new Error(`version must match X.Y.Z (received ${value})`)
  return version
}

/** Generate every immutable and rolling GHCR reference for one stable tag. */
export function publishReferences(
  releaseTag: string,
  registry = "ghcr.io/lamplitisles",
): ImageReferenceSet {
  const { version } = parseStableReleaseTag(releaseTag)
  return referencesForVersion(version, registry)
}

/** Generate references for Dagger callers that already hold X.Y.Z. */
export function referencesForVersion(
  versionInput: string,
  registry = "ghcr.io/lamplitisles",
): ImageReferenceSet {
  const version = parseVersion(versionInput)
  const prefix = registry.replace(/\/$/, "")
  return {
    core: `${prefix}/lamplit:${version}`,
    full: `${prefix}/lamplit:${version}-full`,
    rollingCore: `${prefix}/lamplit:latest`,
    rollingFull: `${prefix}/lamplit:full`,
  }
}

export function registryHost(reference: string): string {
  const host = reference.split("/", 1)[0]?.trim()
  if (!host || !host.includes(".")) throw new Error(`registry reference has no registry host: ${reference}`)
  return host
}
