# Release and mirror operations

Forgejo `LamplitIsles/lamplit` is the canonical repository. Woodpecker is the
check and application-image release authority; GitHub is a passive mirror and
GHCR remains the public package surface. Mirroring and package visibility are
external repository settings; this repository cannot create or change them.

Lamplit-owned code and image assembly are licensed under Elastic License 2.0
(`Elastic-2.0`). The source and Core/Full images are intended to remain public
and free for compliant self-hosting, but Lamplit is source-available and does
not claim OSI open-source status. The Elastic License restriction on a hosted
or managed service keeps the hosted control plane and its terms outside this
repository. Users may instead choose official managed hosting when Lamplit
offers it; that service is governed separately.

## One-time operator prerequisites

1. Configure the Forgejo-to-GitHub mirror for `LamplitIsles/lamplit` and verify
   that the mirror preserves tags and the default branch. The mirror does not
   run release automation.
2. In Woodpecker, enable this repository and create the `ghcr_username` and
   `ghcr_token` repository secrets. They are exposed only to the stable-tag
   publish step as `GHCR_USERNAME` and `GHCR_TOKEN`; pull-request and ordinary
   main-branch checks receive neither secret.
3. Assign the repository to a trusted Woodpecker agent that provides the
   established persistent-cache Dagger runner/socket. The runner owns its
   engine storage and cache across builds; this workflow does not start an
   engine, set a runner host, or mount a repository-specific cache volume.
4. Set the GHCR package visibility to public when publishing the promised
   public source/image artifacts, and verify that setting after the first push;
   the repository cannot provision it. The operator-selected Codex Bridge
   image is not published by this repository.
5. Keep the checkout/source URL metadata pointed at
   `https://github.com/LamplitIsles/lamplit`; GHCR uses it to associate the
   package with the mirrored repository.
6. Do not add registry passwords or provider/OAuth credentials to repository
   files. Woodpecker supplies the two repository secrets only to Dagger's
   application-image publication operation.

No deployment, DNS, TLS, ingress, provider provisioning, or hosted control
plane is performed by the Woodpecker workflow. Each Lamplit release keeps
`LICENSE`, `THIRD_PARTY_NOTICES.md`, `licenses/`, and the SBOM together;
upstream Hindsight 0.9.2 remains MIT and `@lamplitisles/kepos-hindsight`
remains Apache-2.0. The separately published memory-service images have their
own publisher-side inventory in `docs/service-image-license-inventory.md`.

## Versioning contract

Create a stable tag in Forgejo and let it mirror as `vX.Y.Z`:

| Artifact | Immutable tag | Rolling tag |
| --- | --- | --- |
| Core application | `ghcr.io/lamplitisles/lamplit:X.Y.Z` | `latest` |
| Full application | `ghcr.io/lamplitisles/lamplit:X.Y.Z-full` | `full` |

The memory stack is independent of Lamplit application releases. Its
independently published service images are published separately as
`ghcr.io/lamplitisles/lamplit-hindsight:0.1.1` and
`ghcr.io/lamplitisles/lamplit-hindsight-postgres:0.1.1`. For each image,
`config/memory-images.json` records the source `localDigest` used before a
publication and the public registry `publishedDigest` consumed by
`compose.yaml`; the values can differ because registry manifests are the
release artifact. The private build recipes stay outside this public repository.
Copy `.env.example` to the ignored `.env`, fill in `GHCR_USERNAME` and
`GHCR_TOKEN`, and run `just publish-memory-images`; the recipe verifies the
existing local images before authenticating, never prints the token, and calls
the existing helper without building either service image. After pushing, the
helper pulls each published tag with the authenticated runtime and compares its
remote `RepoDigest` with `publishedDigest`, rather than trusting stale local
metadata. Run
`just verify-memory-images` alone for the non-mutating verification path. The
helper refuses to push unless its explicit `--push` script entry is used and
fails if the remote digest differs from the recorded published manifest.

Application publication has a separate local fallback. From the exact
checkout commit identified by the stable tag, copy `.env.example` to the
ignored `.env`, fill in `GHCR_USERNAME` and `GHCR_TOKEN`, and run:

```sh
just publish-app-images vX.Y.Z
```

The recipe rejects prerelease or non-current tags, missing or placeholder
credentials, and starts no Dagger work until those checks pass. It passes the
tag's full commit SHA explicitly to Dagger and supplies the token only as
`env:GHCR_TOKEN`; it publishes the same immutable and rolling Core/Full
references as Woodpecker. It does not verify, build, or publish the independent
memory-service images.

There is no `full-latest`. Dagger rejects prerelease, abbreviated, leading-zero,
and build-metadata tags before any registry authentication is attached.

## Pre-tag verification

Run the repository checks on the exact commit that will be tagged:

```sh
bun install
bun run check
dagger call -m dagger check --source .
```

The public Dagger module builds and publishes only the Core and Full
application roles, targets Linux amd64, checks image users/entrypoints/
capability manifests and OCI metadata, and parses the Compose topology. Its
`check` function does not build or inspect Hindsight or PostgreSQL. Before the
independent memory-image publication,
run `just verify-memory-images`; its disposable network-disabled probes
load the pinned 384-dimensional multilingual model and verify PGroonga 4.0.8
plus pgvector 0.8.6 without reading live state. A Core runtime smoke may be
run with test-owned mounts using the README command. Do not pass a real DSH
home, credential file, or provider token to any check.

Generate the machine-readable release inventory before tagging and keep the
human-readable notices beside it:

```sh
node scripts/generate-sbom.mjs --version X.Y.Z
node scripts/validate-license-artifacts.mjs
```

The same SBOM and notice bundle is installed in every published application
image under `/usr/share/doc/lamplit/`. The independently published service
images retain their upstream notices and are published separately; Lamplit does
not rebuild them here.

## Dagger cache ownership

The release path has two cache layers with separate owners. The trusted
Woodpecker agent provides the persistent Dagger runner and its engine/cache
backing, so Dagger's graph and module cache volumes survive between pipeline
runs. Lamplit's Dagger module mounts locked, project/toolchain-qualified
package-manager stores and installed-dependency caches:

- Bun downloads and the dsh-mail project-root `node_modules` use
  `lamplit-dsh-mail-bun-downloads-bun-1.3.13-linux-amd64-v1` and
  `lamplit-dsh-mail-node-modules-bun-1.3.13-linux-amd64-v1`.
- dsh-keet's pnpm 11 content-addressed store and root `node_modules/.pnpm`
  virtual store use separate `lamplit-dsh-keet-*` caches qualified by pnpm
  11.22.0, Node 24.20.0, and Linux amd64.
- guionai/web has separate `lamplit-guionai-web-*` pnpm 10 store and virtual
  store caches qualified by pnpm 10.26.2, Node 24.20.0, and Linux amd64.
- The shared npm download cache is
  `lamplit-npm-downloads-node-24.20.0-linux-amd64-v1`.

The installed trees are Dagger-owned and are never taken from the host:
`node_modules` remains excluded at the source boundary. Each frozen install
remains authoritative, and pnpm recreates workspace links around its cached
root virtual store. The three installed trees are not shared between
dsh-mail, dsh-keet, and guionai/web. These caches contain no source trees,
build outputs, registry auth, or secrets. The workflow does not create a
second engine or cache layer, and the module caches are useful across runs only
when the agent keeps the Dagger engine/cache persistent.

## Woodpecker workflow behavior

The single `.woodpecker/release.yaml` workflow runs the Dagger repository check
for pull requests and pushes to `main`. A stable `vX.Y.Z` tag runs only the
publish step, so Core and Full are built, inspected, and validated once rather
than being rebuilt by a separate check. The publish step passes Woodpecker's
immutable `CI_COMMIT_SHA` as Dagger's required revision and authenticates only
the two application-image `publish()` operations. Ordinary checks never receive
GHCR credentials. The workflow uses the agent-provided persistent-cache Dagger
runner through `ghcr.io/tta-lab/dagger-cli:0.21.7`; runner provisioning and
cache ownership remain operator infrastructure prerequisites. The module-level
package-manager caches described above are mounted inside the Dagger build,
not by Woodpecker.

The memory-image verification and publication helpers are separate, explicit
operator actions and are not part of the public Dagger or Woodpecker release
path.

If a release fails, inspect the Dagger output and GHCR package permissions,
correct the source commit or repository setting, and create a new stable tag.
Do not retag an existing version to point at different bytes. Rolling tags are
convenience pointers and are updated only after their immutable images publish.

## Post-release checks

After Woodpecker succeeds, verify all immutable manifests are present for
`linux/amd64`, pull the Core tag using credentials appropriate to the chosen
package visibility, and run the documented Core smoke. For Full, render
`docker compose config` with the immutable image variables and verify the
database health gate before starting it.
