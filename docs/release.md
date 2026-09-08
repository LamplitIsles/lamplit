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

The memory stack is independent of Lamplit application releases. Full Compose
uses `ghcr.io/lamplitisles/lamplit-hindsight:0.1.2` with ONNX INT8 embeddings
and `ghcr.io/lamplitisles/lamplit-hindsight-postgres:0.1.1`. Their public
`publishedDigest` values are recorded in `config/memory-images.json` and
consumed directly by `compose.yaml`.

Hindsight is built and independently published through the Dagger
`hindsight-publish` contract in [hindsight-onnx.md](hindsight-onnx.md). Supply
a new image version and a full source commit SHA; it verifies the exact image
before publication and creates no application release tag, rolling image, or
deployment. PostgreSQL remains an independently supplied external artifact.

To verify downloaded release images without touching live services:

```sh
docker compose pull hindsight hindsight-postgres
just verify-memory-images
```

The verifier runs the digest-pinned images in disposable, network-disabled
containers. A pull or repository update does not replace running containers;
apply an upgrade during the operator's planned deployment window.

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
pnpm install --frozen-lockfile
pnpm run check
dagger call -m dagger check --source .
```

Lamplit pins Node 24.20.0 in its application image. DSH core supports
`^22.19.0 || >=24.0.0`, and the published dsh-mail 0.1.2 plus mcporter 0.13.10
packages declare `>=24`; the live DSH runtime is Node 24.19.0. A Node 22.19
dsh-mail smoke can pass in practice, but Node 24 remains the supported
intersection of the declared contracts.

The Dagger application release path builds and publishes Core and Full,
targets Linux amd64, checks image users/entrypoints/
capability manifests and OCI metadata, and parses the Compose topology. Its
`check` function does not build or inspect Hindsight or PostgreSQL. The
independent `hindsight-check` target verifies the ONNX image using test-owned
services; `hindsight-publish` repeats those checks on the exact release image.
See [the ONNX build contract](hindsight-onnx.md). To verify pulled release
images, run `just verify-memory-images`; its disposable network-disabled probes
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
images retain their upstream notices and are published separately. The
PostgreSQL 0.1.1 artifact remains external; the ONNX Hindsight build installs
its own model notices and Python inventory as documented above.

## Dagger cache ownership

The release path has two cache layers with separate owners. The trusted
Woodpecker agent provides the persistent Dagger runner and its engine/cache
backing, so Dagger's graph and module cache volumes survive between pipeline
runs. Lamplit's Dagger module mounts locked, project/toolchain-qualified
package-manager stores and installed-dependency caches:

- dsh-keet's pnpm 11 content-addressed store and root `node_modules/.pnpm`
  virtual store use separate `lamplit-dsh-keet-*` caches qualified by pnpm
  11.22.0, Node 24.20.0, and Linux amd64.
- guionai/web has separate `lamplit-guionai-web-*` pnpm 10 store and virtual
  store caches qualified by pnpm 10.26.2, Node 24.20.0, and Linux amd64.
- The shared npm download cache is
  `lamplit-npm-downloads-node-24.20.0-linux-amd64-v1`.

The published `@lamplitisles/dsh-mail@0.1.2` package is resolved by the image's
DSH profile sync and has no Dagger source-build or installed-tree cache. The
two source-built installed trees are Dagger-owned and are never taken from the host:
`node_modules` remains excluded at the source boundary. Each frozen install
remains authoritative, and pnpm recreates workspace links around its cached
root virtual store. The two installed trees are not shared between dsh-keet and
guionai/web. These caches contain no source trees,
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

Memory-image verification remains a separate operator action. Hindsight has
its own explicit Dagger publication function; neither operation is invoked
by the Core/Full Woodpecker workflow.

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
