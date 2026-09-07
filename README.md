# Lamplit

Lamplit is an independent community distribution for a
self-hosted one-to-one AI Partner. It is powered by DSH and Guion packages,
but it is not an official DeepSeek product. The first release targets Linux
amd64 and is published as Core and Full variants of one GHCR package.

> Your companion, your model keys, your memories — self-host it or let Lamplit run it for you.

Lamplit's source and Core/Full images are publicly available and free for
compliant self-hosting under the Elastic License 2.0 (`Elastic-2.0`). Lamplit
is source-available and does not claim OSI open-source status. You can choose
the public self-hosted path documented here or official managed hosting from
Lamplit when offered; hosted control-plane terms and availability are outside
this repository. Bring your own provider keys (BYOK) to keep provider choice
and model-token costs with you. Lamplit Points cover only Lamplit-provided
hosted resources and value; they do not turn third-party model usage into a
Lamplit license or promise a portable hosted account.

The Lamplit license applies to Lamplit-owned code and image assembly. Bundled
upstream components retain their own terms: upstream Hindsight 0.9.2 is MIT,
and `@lamplitisles/kepos-hindsight` is Apache-2.0. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), the preserved texts under
[`licenses/`](licenses/), and the machine-readable
[`sbom/lamplit.spdx.json`](sbom/lamplit.spdx.json) before redistributing an
image.

## Core: one container

Core is the small trial path. It includes the DSH Web and Companion surfaces,
Guion Web research, Kepos Speech, dsh-mail, and the optional dsh-keet
integration. It does not start Hindsight or ImageGen and it does not require a
provider, mailbox, or Keet runtime to serve its UI.

Create test-owned persistence locations, then start the newest stable Core:

```sh
docker volume create lamplit-core-state
docker volume create lamplit-core-workspace
docker volume create lamplit-core-keet
docker run -d --name lamplit-core \
  --user 1000:1000 \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m,mode=1777 \
  --publish 127.0.0.1:3080:3080 \
  --volume lamplit-core-state:/home/lamplit/.local/state/dsh \
  --volume lamplit-core-workspace:/workspace \
  --volume lamplit-core-keet:/var/lib/lamplit/keet \
  --volume lamplit-core-keet:/workspace/.dsh/dsh-keet \
  ghcr.io/lamplitisles/lamplit:latest
```

Read the one-time tokenized stock DSH URL from the container logs, then open
that URL (the launcher prints it with the published `127.0.0.1:3080` port):

```sh
docker logs lamplit-core --tail=20
```

The Companion surface is directly available at
<http://127.0.0.1:3080/companion/>. `latest` is a rolling tag; use a versioned
tag when you need a reproducible upgrade. The first start
copies the image-owned seed profile only when the DSH state volume is empty.
Stopping and restarting preserves that state and never copies over user
files. The workspace is a separate volume so Partner files and DSH internals
do not share a backup boundary.

### Core configuration

The image includes example files at `/opt/lamplit/settings.example.yaml` and
`/opt/lamplit/profile.patch.example.yml`. To use your own files, mount them
read-only and opt in explicitly:

```sh
docker run ... \
  --volume "$PWD/settings.yaml:/etc/lamplit/settings.override.yaml:ro" \
  --env LAMPLIT_SETTINGS_OVERRIDE=/etc/lamplit/settings.override.yaml \
  --volume "$PWD/profile.patch.yml:/etc/lamplit/profile.override.yml:ro" \
  --env LAMPLIT_PROFILE_OVERRIDE=/etc/lamplit/profile.override.yml \
  ghcr.io/lamplitisles/lamplit:1.0.0
```

Settings are copied only into a new state volume; a non-empty volume is
refused with an actionable message. A profile file is passed as a final DSH
patch layer and is never silently installed into state. Provider API keys and
OAuth grants belong in DSH Settings/credential storage or runtime secrets,
never in an image or committed example.

### Optional integrations

Keet is an integration, not a redistributed runtime. Obtain the supported
Linux x86-64 Keet 4.21.0 runtime yourself and mount its prepared directory
read-only at `/opt/keet-runtime`. The dsh-keet package expects the supported
runtime tuple under `DSH_HOME/runtimes/keet/4.21.0-linux-x64`; the launcher
creates that state-local symlink to the mount. Keep the Partner identity in the
separate writable Keet volume mounted at both `/var/lib/lamplit/keet` and
`/workspace/.dsh/dsh-keet`. If the mount is absent, empty, or incompatible,
the plugin reports its disconnected/setup state while DSH and Companion remain
available.

dsh-mail is shipped without a mailbox address, OAuth grant, or Guion-domain
provisioning. Configure its existing settings against a compatible mailbox
MCP and OAuth issuer that you operate; complete the OAuth flow at the
loopback callback shown by the plugin. An unconfigured mailbox is inert and
does not prevent startup.

## Full: Compose topology

Full adds the Hindsight memory adapter and ImageGen to the same application
image lineage. The supplied Compose file starts exactly four application
services:

```text
lamplit       Full DSH/Companion application (port 3080)
hindsight     Hindsight 0.9.2, local multilingual embeddings (8888/9999)
hindsight-postgres  PostgreSQL 18 + PGroonga 4.0.8 + pgvector 0.8.6
codex-bridge  Kepos Codex Bridge (operator-owned ChatGPT OAuth)
```

The database is on the `hindsight-internal` network and has no host port.
Hindsight waits for its database health check, while Lamplit has no dependency
gate and therefore remains startable when an optional service or credential is
missing. API/control-plane ports, when exposed, bind to host loopback only.
There is no Redis or Valkey service.

Before the first start, choose a private database password and prepare the
operator-owned bridge login:

```sh
export HINDSIGHT_POSTGRES_PASSWORD='replace-with-a-long-private-value'
mkdir -p keet-runtime
# Put the supported Keet runtime in keet-runtime/ when you have one.
docker compose up -d

# The bridge image has no credentials by design. Log in using a test-owned
# auth file and then restart only the bridge service:
docker compose run --rm --entrypoint /usr/local/bin/kepos-codex-bridge \
  codex-bridge login --auth-file /var/lib/kepos-codex-bridge/auth.json
docker compose restart codex-bridge
```

The bridge login is a human/operator action and may open a browser. Do not
commit the `codex_bridge_auth` volume or copy its `auth.json` into Lamplit.
Start Full with:

```sh
HINDSIGHT_POSTGRES_PASSWORD='replace-with-a-long-private-value' \
  docker compose up -d
```

The default Full image is the versioned `0.1.0-full` example in `compose.yaml`.
The Hindsight and PostgreSQL defaults are independently published `0.1.1`
service images pinned by their public registry manifest digests, and the bridge
is pinned by its published digest. Set `LAMPLIT_IMAGE` when upgrading the
application; only override the service references when you have verified a new
service digest. Inspect the rendered model without starting anything with
`docker compose config` (or the repository's `bun run test:compose`).

The memory service uses the baked
`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` model offline on
CPU with 384-dimensional vectors, PGroonga text search, pgvector search, and
RRF reranking. Its only durable volume is PostgreSQL's
`lamplit-hindsight-postgres` volume. Back it up with a PostgreSQL custom-format
dump before upgrades; do not treat the Hindsight container filesystem or
Hugging Face cache as data.

## Persistence and security contract

| Boundary | Default location | Owner | Backup separately |
| --- | --- | --- | --- |
| DSH state, sessions, settings, profile | `lamplit-dsh-state` → `/home/lamplit/.local/state/dsh` | uid/gid 1000 | yes |
| Partner workspace and Companion relationship state | `lamplit-partner-workspace` → `/workspace` | uid/gid 1000 | yes |
| Keet runtime | operator bind → `/opt/keet-runtime:ro` | operator | obtain again, do not back up into this repo |
| Partner Keet identity | `lamplit-keet-identity` → writable identity paths | uid/gid 1000 | yes, privately |
| Hindsight memory | `lamplit-hindsight-postgres` → PostgreSQL data | uid/gid 999 | PostgreSQL dump |
| Codex Bridge OAuth | `lamplit-codex-bridge-auth` | uid/gid 10001 | yes, as a secret |

Examples use a fixed non-root uid, drop all Linux capabilities, enable
no-new-privileges, and make the root filesystem read-only with tmpfs for
transient paths. Public ingress, TLS, authentication proxies, and network
policy remain operator-owned. Keep the Compose ports loopback-bound unless a
reviewed proxy is in front of them.

## Choice and portability boundaries

The current release makes these persistence boundaries observable and
backup-friendly: DSH state, the Partner workspace, the Keet identity,
Hindsight PostgreSQL data, and Codex Bridge OAuth are separate mounts. A
PostgreSQL custom-format dump is the documented Hindsight memory backup and
restore unit. This release does not claim full portability of a hosted account
or automatic migration of Keet identity or mailbox data; those remain explicit
future work (see [ADR 0005](docs/adr/0005-portability-boundaries.md)).

## Tags and packages

For a stable `vX.Y.Z` release, the public Dagger module publishes only the
application images:

| Artifact | Immutable tag | Rolling tag |
| --- | --- | --- |
| Core | `ghcr.io/lamplitisles/lamplit:X.Y.Z` | `latest` |
| Full | `ghcr.io/lamplitisles/lamplit:X.Y.Z-full` | `full` |

The prebuilt memory images are a separate operator publication from local
artifacts, currently `ghcr.io/lamplitisles/lamplit-hindsight:0.1.1` and
`ghcr.io/lamplitisles/lamplit-hindsight-postgres:0.1.1`. Their independent
versions, source `localDigest` values, and public registry `publishedDigest`
values are recorded in [`config/memory-images.json`](config/memory-images.json);
Compose pins the latter. Their private build recipes are not part of this
repository. Kepos Codex Bridge is likewise consumed from its independently
published digest. There is deliberately no `full-latest` tag.

There is deliberately no `full-latest` tag. Immutable tags are the upgrade
and rollback unit; rolling tags are convenience pointers only.

## Build and verify

The TypeScript Dagger module is the release interface. It obtains dsh-mail and
dsh-keet from their public repositories at the pinned commits declared in
`dagger/src/index.ts`, builds their package tarballs, and installs those
artifacts without vendoring source or Keet runtime bytes.

```sh
# Fast repository checks (no image builds)
bun install
bun run check

# End-to-end Linux amd64 application build, metadata inspection, capability
# checks, DSH Web preset sync/doctor, and Compose validation. This builds only
# Core and Full; it never builds Hindsight or PostgreSQL.
dagger call -m dagger check --source .

# Optional local memory-service image verification before a service publication.
just verify-memory-images

# Local application fallback: the current checkout must be the commit named by
# the stable tag. Copy .env.example to .env and fill in GHCR_USERNAME/GHCR_TOKEN.
just publish-app-images vX.Y.Z

# Explicit operator action: authenticate and push only the unchanged verified
# images. Copy .env.example to .env and fill in GHCR_USERNAME/GHCR_TOKEN first.
just publish-memory-images
```

The Dagger check uses disposable build containers and validates non-root users,
entrypoints, the Core/Full capability roster, state-safety files, and the
absence of Keet runtime assets. The opt-in memory-image verification uses
network-disabled disposable containers to load the already-built multilingual
model offline and create PostgreSQL extensions; it does not rebuild either
image or read live state. `just publish-memory-images` verifies each source
image against its `localDigest` before authenticating to GHCR, reads credentials
only from the ignored `.env`, never prints the token, and calls the existing
push helper without building either service image. After pushing, the helper
pulls each public tag through the authenticated runtime and compares its remote
`RepoDigest` with the recorded `publishedDigest`; a stale local digest cannot
make publication pass. Do not run that publication recipe until the operator
has supplied valid credentials. For a running Core smoke using only test-owned
directories and a disposable loopback port:

```sh
LAMPLIT_CORE_IMAGE=ghcr.io/lamplitisles/lamplit:latest \
  node scripts/test-core-smoke.mjs
```

No check calls a paid model, reads a real DSH home, or uses operator
credentials. Dagger caching has two layers: the trusted Woodpecker agent keeps
the Dagger engine/cache persistent between runs, while the Lamplit module keeps
package-manager stores plus isolated installed-dependency caches for the three
external plugin builds. The dsh-mail cache covers its project-root
`node_modules`; dsh-keet and guionai/web each have a separate cache for their
root `node_modules/.pnpm` virtual store, while frozen installs recreate their
workspace links. Host `node_modules` remains excluded from source input. These
cache identities are project/toolchain/runtime/platform-specific and do not
contain source trees, build outputs, registry auth, or secrets.

## Release and mirror prerequisites

Forgejo `LamplitIsles/lamplit` is canonical. Configure the Forgejo-to-GitHub
mirror and set the GitHub repository's GHCR package visibility to public for the
promised public image path; the repository cannot create or verify those
external settings. GitHub is a passive mirror and does not run Lamplit checks
or publication.

Enable the repository in Woodpecker, create `ghcr_username` and `ghcr_token`
repository secrets, and assign it to a trusted agent that provides the
persistent-cache Dagger runner/socket used by the other business repositories.
The workflow exposes those secrets only to stable `vX.Y.Z` tag publication. It
does not provision runner state or a cache volume. The local fallback is
`just publish-app-images vX.Y.Z`; it reads the ignored `.env`, requires the tag
to identify the current checkout commit, and publishes the same Core/Full
references. See [docs/release.md](docs/release.md) for the operator checklist
and [docs/container-operations.md](docs/container-operations.md) for backup and
troubleshooting procedures.
