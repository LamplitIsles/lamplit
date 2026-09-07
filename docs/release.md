# Release and mirror operations

Forgejo `LamplitIsles/lamplit` is the canonical repository. GitHub is the
mirror and GHCR publishing surface. Mirroring and package visibility are
external repository settings; the workflow cannot create or change them.

Lamplit-owned code and image assembly are licensed under Elastic License 2.0
(`Elastic-2.0`). The source and Core/Full images are intended to remain public
and free for compliant self-hosting, but Lamplit is source-available and does
not claim OSI open-source status. The Elastic License restriction on a hosted
or managed service keeps the hosted control plane and its terms outside this
repository. Users may instead choose official managed hosting when Lamplit
offers it; that service is governed separately.

## One-time operator prerequisites

1. Configure the Forgejo-to-GitHub mirror for `LamplitIsles/lamplit` and verify
   that the mirror preserves tags and the default branch.
2. In GitHub, enable Actions for the mirror and allow the repository's
   `GITHUB_TOKEN` to write packages. Set the GHCR package visibility to public
   when publishing the promised public source/image artifacts, and verify that
   setting after the first push; the workflow cannot provision it. The
   operator-selected Codex Bridge image is not published by this repository.
3. Keep the checkout/source URL metadata pointed at
   `https://github.com/LamplitIsles/lamplit`; GHCR uses it to associate the
   package with the mirrored repository.
4. Do not add registry passwords or provider/OAuth credentials to repository
   files. The release workflow receives only the short-lived
   `secrets.GITHUB_TOKEN` and passes it to Dagger at publication time.

No deployment, DNS, TLS, ingress, provider provisioning, or hosted control
plane is performed by the release workflow. Each Lamplit release keeps
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

The memory stack is independent of Lamplit application releases. The currently
verified Kosmos images are published once as
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
node scripts/generate-sbom.mjs --version "${GITHUB_REF_NAME#v}"
node scripts/validate-license-artifacts.mjs
```

The same SBOM and notice bundle is installed in every published application
image under `/usr/share/doc/lamplit/` and is uploaded by the release workflow
as a downloadable artifact. The prebuilt service images retain their upstream
notices and are published separately; Lamplit does not rebuild them here.

## GitHub workflow behavior

The mirrored `.github/workflows/release.yml` runs the Dagger repository check on
pull requests and pushes to `main`. A push whose tag matches `v*.*.*` skips the
separate check job so the release path does not build twice. The tag's Dagger
`publish` call builds Core and Full once, inspects those same containers,
validates Compose, and then publishes with `GITHUB_TOKEN` and `packages: write`.
Publication authenticates only the two application-image `publish()` operations;
ordinary builds and tests never receive registry credentials. The memory-image
publish helper is a separate, explicit operator action and is not part of the
public Dagger or GitHub release path.

If a release fails, inspect the Dagger output and GHCR package permissions,
correct the source commit or repository setting, and create a new stable tag.
Do not retag an existing version to point at different bytes. Rolling tags are
convenience pointers and are updated only after their immutable images publish.

## Post-release checks

After Actions succeeds, verify all immutable manifests are present for
`linux/amd64`, pull the Core tag using credentials appropriate to the chosen
package visibility, and run the documented Core smoke. For Full, render
`docker compose config` with the immutable image variables and verify the
database health gate before starting it.
