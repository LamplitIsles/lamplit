import {
  Container,
  Directory,
  Secret,
  argument,
  dag,
  func,
  object,
} from "@dagger.io/dagger"
import type { Platform } from "@dagger.io/dagger"
import {
  publishReferences,
  registryHost,
  referencesForVersion,
  type ImageReferenceSet,
} from "./release.js"

const NODE_IMAGE =
  "node:24.20.0-bookworm-slim@sha256:6642ef280aebc09c4541bee0b15c9f89f0f3f3c247ddee79ae1d37eddfdcbbaa"
const BUN_IMAGE =
  "oven/bun:1.3.13@sha256:bb35eafd10b2e969809384850ff0474ba36a491239d715864bc87787b4cdf0a4"
const DSH_MAIL_REPOSITORY = "https://github.com/LamplitIsles/dsh-mail.git"
const DSH_MAIL_COMMIT = "008c76fcbca764457678e8f63438b206ee9490f0"
const DSH_MAIL_ARCHIVE_SHA256 = "dcd4bc760f0601744165810cca0fdff0090d220473afc82c85dc70d2d5cdc3c6"
const DSH_KEET_REPOSITORY = "https://github.com/lamplitisles/keet-for-agent.git"
const DSH_KEET_COMMIT = "1741c5e7ada7919db4a6b241db23ceefa39d875d"
const DSH_KEET_ARCHIVE_SHA256 = "6cd313f74b3c0ffcf85be30e9816159906fb1b0972b46766c849cf849449fa2e"
const GUION_WEB_REPOSITORY = "https://github.com/GuionAI/web.git"
// The released @guionai/web package predates the managed DSH preset command;
// build that command from the public commit that introduced it while keeping
// the published package as the runtime's compatibility dependency.
const GUION_WEB_COMMIT = "7d4a228cc6d0519e30b8ac2da066fa3a7ef3b2e8"
const GUION_WEB_ARCHIVE_SHA256 = "c43816294b97a7818e26d19c82b81f94bb9496ba84ee4b91d7658e913f315e80"
const LAMPLIT_SOURCE = "https://github.com/LamplitIsles/lamplit"
const LAMPLIT_LICENSE = "Elastic-2.0"
const DEFAULT_VERSION = "0.1.0"
const LINUX_AMD64 = "linux/amd64" as Platform

const SOURCE_IGNORE = [
  ".git",
  ".scratch",
  "node_modules",
  "dagger/sdk",
  "**/.DS_Store",
]

/**
 * Dagger build and release interface for the independent Lamplit distribution.
 * Every application image function is callable on its own; `check` composes
 * the same two functions used by publication and validates their observable
 * contracts. The independently published memory-stack images are deliberately
 * not build inputs to this public module.
 */
@object()
export class Lamplit {
  /** Build the lightweight Linux amd64 Lamplit Core image. */
  @func()
  async core(
    @argument({ ignore: SOURCE_IGNORE }) source: Directory,
  ): Promise<Container> {
    return this.application(source, "core")
  }

  /** Build the Full Linux amd64 Lamplit image with its external-service adapters. */
  @func()
  async full(
    @argument({ ignore: SOURCE_IGNORE }) source: Directory,
  ): Promise<Container> {
    return this.application(source, "full")
  }

  /**
   * Build and inspect the promised application roles and validate the rendered
   * Compose contract. No registry credentials or memory-stack build inputs are
   * needed for this check.
   */
  @func()
  async check(
    @argument({ ignore: SOURCE_IGNORE }) source: Directory,
  ): Promise<string> {
    // Keep the public check's peak memory bounded on small release runners;
    // the two images remain independently callable and cacheable.
    const core = await this.core(source)
    await core.sync()
    const full = await this.full(source)
    await full.sync()
    const inspection = await this.inspectApplications(source, core, full)

    return JSON.stringify(
      {
        ok: true,
        platform: "linux/amd64",
        images: [inspection.core, inspection.full],
        compose: inspection.compose,
      },
      null,
      2,
    )
  }

  /**
   * Publish immutable and rolling references for one stable `vX.Y.Z` tag.
   * Registry authentication is attached only to the publish operation.
   */
  @func()
  async publish(
    @argument({ ignore: SOURCE_IGNORE }) source: Directory,
    releaseTag: string,
    registryUsername: string,
    registryPassword: Secret,
  ): Promise<string> {
    const parsed = publishReferences(releaseTag)
    const revision = process.env.GITHUB_SHA ?? "unknown"
    const core = await this.application(source, "core", parsed.core.split(":").pop() ?? DEFAULT_VERSION, revision)
    await core.sync()
    const full = await this.application(source, "full", parsed.full.split(":").pop()?.replace(/-full$/, "") ?? DEFAULT_VERSION, revision)
    await full.sync()
    const inspection = await this.inspectApplications(source, core, full)
    const host = registryHost(parsed.core)
    const publishOne = async (image: Container, references: readonly string[]): Promise<string[]> => {
      const authenticated = image.withRegistryAuth(host, registryUsername, registryPassword)
      return Promise.all(references.map((reference) => authenticated.publish(reference)))
    }
    const [coreRefs, fullRefs] = await Promise.all([
      publishOne(core, [parsed.core, parsed.rollingCore]),
      publishOne(full, [parsed.full, parsed.rollingFull]),
    ])
    return JSON.stringify(
      {
        ok: true,
        platform: "linux/amd64",
        images: [inspection.core, inspection.full],
        compose: inspection.compose,
        tag: parsed,
        published: {
          core: coreRefs,
          full: fullRefs,
        },
      },
      null,
      2,
    )
  }

  private async inspectApplications(
    source: Directory,
    core: Container,
    full: Container,
  ): Promise<{ core: Record<string, unknown>; full: Record<string, unknown>; compose: string }> {
    const [coreSummary, fullSummary, compose] = await Promise.all([
      this.inspectApplication(core, "core"),
      this.inspectApplication(full, "full"),
      dag
        .container()
        .from(NODE_IMAGE)
        .withMountedDirectory("/src", source)
        .withWorkdir("/src")
        .withExec(["npm", "install", "--no-save", "--ignore-scripts", "--no-audit", "--no-fund", "yaml@2.9.0"])
        .withExec(["node", "scripts/validate-compose.mjs"])
        .stdout(),
    ])
    return { core: coreSummary, full: fullSummary, compose: compose.trim() }
  }

  private async application(
    source: Directory,
    variant: "core" | "full",
    version = DEFAULT_VERSION,
    revision = process.env.GITHUB_SHA ?? "dev",
  ): Promise<Container> {
    const plugins = await this.pluginArtifacts()
    const context = source.withDirectory(".build/plugins", plugins)
    return context.dockerBuild({
      platform: LINUX_AMD64,
      buildArgs: this.imageBuildArgs(version, revision, variant),
    })
  }

  private imageBuildArgs(
    version: string,
    revision = process.env.GITHUB_SHA ?? "dev",
    variant?: "core" | "full",
  ): Array<{ name: string; value: string }> {
    return [
      { name: "LAMPLIT_VERSION", value: version },
      { name: "LAMPLIT_REVISION", value: revision },
      { name: "LAMPLIT_SOURCE", value: LAMPLIT_SOURCE },
      { name: "LAMPLIT_LICENSE", value: LAMPLIT_LICENSE },
      ...(variant ? [{ name: "VARIANT", value: variant }] : []),
    ]
  }

  private async inspectApplication(container: Container, variant: "core" | "full"): Promise<Record<string, unknown>> {
    const capabilities = JSON.parse(await container.file("/opt/lamplit/capabilities.json").contents()) as {
      variant: string
      plugins: string[]
    }
    const [user, entrypoint, platform, noKeetRuntime, noCredentialStore, notices, sbom, imageLicense] = await Promise.all([
      container.user(),
      container.entrypoint(),
      container.platform(),
      container.withExec(["sh", "-ec", "test ! -e /opt/keet-runtime/bare && test ! -e /opt/keet-runtime/core-worker.bundle"]).sync(),
      container.withExec(["sh", "-ec", "test ! -e /home/lamplit/.local/state/dsh/.credentials.yaml"]).sync(),
      container.file("/usr/share/doc/lamplit/THIRD_PARTY_NOTICES.md").contents(),
      container.file("/usr/share/doc/lamplit/sbom.spdx.json").contents(),
      container.label("org.opencontainers.image.licenses"),
    ])
    if (capabilities.variant !== variant) throw new Error(`capability manifest variant mismatch: ${capabilities.variant}`)
    if (user !== "1000:1000" && user !== "1000") throw new Error(`application image is not non-root: ${user}`)
    if (platform !== "linux/amd64") throw new Error(`unexpected application platform: ${platform}`)
    if (!noKeetRuntime || !noCredentialStore) throw new Error("application image contains forbidden runtime state")
    if (!entrypoint.some((value) => value.includes("lamplit-entrypoint"))) throw new Error("application entrypoint is not Lamplit's state-safe launcher")
    if (!notices.includes("Hindsight") || !notices.includes("kepos-hindsight")) throw new Error("application image is missing third-party notices")
    if (!sbom.includes('"spdxVersion": "SPDX-2.3"')) throw new Error("application image is missing its SPDX SBOM")
    if (imageLicense !== LAMPLIT_LICENSE) throw new Error(`application image has unexpected license label: ${imageLicense}`)
    return { role: variant, user, platform, license: imageLicense, entrypoint, plugins: capabilities.plugins }
  }

  private async pluginArtifacts(): Promise<Directory> {
    const [mail, keet, guionWeb] = await Promise.all([
      this.buildMailTarball(),
      this.buildKeetTarball(),
      this.buildGuionWebTarball(),
    ])
    return dag
      .directory()
      .withFile("lamplitisles-dsh-mail.tgz", mail)
      .withFile("lamplitisles-dsh-keet.tgz", keet)
      .withFile("guionai-web.tgz", guionWeb)
  }

  private async buildMailTarball() {
    const source = this.repositoryArchive(DSH_MAIL_REPOSITORY, DSH_MAIL_COMMIT, DSH_MAIL_ARCHIVE_SHA256)
    const result = dag
      .container()
      .from(BUN_IMAGE)
      .withMountedFile("/tmp/source.tar.gz", source)
      .withExec(["mkdir", "-p", "/tmp/lamplit-source"])
      .withExec(["tar", "-xzf", "/tmp/source.tar.gz", "--strip-components=1", "-C", "/tmp/lamplit-source"])
      .withWorkdir("/tmp/lamplit-source")
      .withExec(["bun", "install", "--frozen-lockfile"])
      .withExec(["bun", "run", "build"])
      .withExec(["mkdir", "-p", "/out"])
      .withExec(["bun", "pm", "pack", "--destination", "/out"])
    const files = await result.directory("/out").entries()
    const filename = files.find((file) => file.endsWith(".tgz"))
    if (!filename) throw new Error("dsh-mail build did not produce a package tarball")
    return result.directory("/out").file(filename)
  }

  private async buildKeetTarball() {
    const source = this.repositoryArchive(DSH_KEET_REPOSITORY, DSH_KEET_COMMIT, DSH_KEET_ARCHIVE_SHA256)
    const result = dag
      .container()
      .from(NODE_IMAGE)
      .withMountedFile("/tmp/source.tar.gz", source)
      .withExec(["mkdir", "-p", "/tmp/lamplit-source"])
      .withExec(["tar", "-xzf", "/tmp/source.tar.gz", "--strip-components=1", "-C", "/tmp/lamplit-source"])
      .withWorkdir("/tmp/lamplit-source")
      .withExec(["npm", "install", "--global", "--no-audit", "--no-fund", "pnpm@11.22.0"])
      .withExec(["pnpm", "install", "--frozen-lockfile"])
      .withExec(["pnpm", "--filter", "@lamplitisles/dsh-keet", "build"])
      .withExec(["mkdir", "-p", "/out"])
      .withExec(["sh", "-ec", "cd packages/dsh-keet && pnpm pack --pack-destination /out --pack-gzip-level 9"])
    const files = await result.directory("/out").entries()
    const filename = files.find((file) => file.endsWith(".tgz"))
    if (!filename) throw new Error("dsh-keet build did not produce a package tarball")
    return result.directory("/out").file(filename)
  }

  private async buildGuionWebTarball() {
    const source = this.repositoryArchive(GUION_WEB_REPOSITORY, GUION_WEB_COMMIT, GUION_WEB_ARCHIVE_SHA256)
    const result = dag
      .container()
      .from(NODE_IMAGE)
      .withMountedFile("/tmp/source.tar.gz", source)
      .withExec(["mkdir", "-p", "/tmp/lamplit-source"])
      .withExec(["tar", "-xzf", "/tmp/source.tar.gz", "--strip-components=1", "-C", "/tmp/lamplit-source"])
      .withWorkdir("/tmp/lamplit-source")
      .withExec(["npm", "install", "--global", "--no-audit", "--no-fund", "pnpm@10.26.2"])
      .withExec(["pnpm", "install", "--frozen-lockfile"])
      .withExec(["pnpm", "--filter", "@guionai/web", "build"])
      .withExec(["mkdir", "-p", "/out"])
      .withExec(["sh", "-ec", "cd packages/web && pnpm pack --pack-destination /out"])
    const files = await result.directory("/out").entries()
    const filename = files.find((file) => file.endsWith(".tgz"))
    if (!filename) throw new Error("Guion Web build did not produce a package tarball")
    return result.directory("/out").file(filename)
  }

  /** Fetch a GitHub archive for an immutable commit without a mutable branch lookup. */
  private repositoryArchive(repository: string, commit: string, checksum: string) {
    const base = repository.replace(/\.git$/, "")
    return dag.http(`${base}/archive/${commit}.tar.gz`, {
      name: `${commit}.tar.gz`,
      checksum: `sha256:${checksum}`,
    })
  }
}

export { publishReferences, referencesForVersion, registryHost }
export type { ImageReferenceSet }
