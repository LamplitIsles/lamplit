# Lamplit

**A self-hosted home for one AI Partner.**

One person. One Partner. A workspace, a voice, and memory that lasts across
sessions.

Lamplit brings DSH Companion, research, speech, email, and optional Keet
messaging into a Linux distribution you can run on your own machine. Lamplit
Full adds graph-backed long-term memory and image generation.

> Your companion, your model keys, your memories.

## Try Lamplit Core

Core is the smallest way in: one container, no model key required just to open
the UI, and no mailbox or Keet runtime required to start.

```bash
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

Read the one-time tokenized DSH Web URL from the logs, then open it in your
browser:

```bash
docker logs lamplit-core --tail=20
```

The Companion is also available directly at
<http://127.0.0.1:3080/companion/>.

`latest` is a rolling Core tag. Use a versioned tag when you need reproducible
upgrades and rollback. On first start, Lamplit copies its seed profile only
when the DSH state volume is empty. Restarting does not overwrite user files.

## Why Lamplit

Most AI products give you another assistant inside another account. Lamplit is
for a different kind of relationship: one persistent AI Partner with a place
to live, tools to act through, and continuity across sessions.

The important boundaries stay visible:

- **Your model access:** bring your own provider keys and keep model-token
  costs with your chosen provider.
- **Your persistence:** DSH state, the Partner workspace, Keet identity,
  graph-backed long-term memory, and bridge credentials live in separate
  mounts.
- **Your choice:** run the public images yourself or choose official Lamplit
  hosting when it is offered.
- **Honest portability:** the current release documents what can be backed up
  and restored without pretending every identity can already move
  automatically.

Lamplit is an independent community distribution powered by DSH and Guion
packages. It is not an official DeepSeek product.

## Choose Core or Full

Both variants come from the same GHCR package lineage and target Linux amd64.

| Capability | Core | Full |
| --- | --- | --- |
| DSH Web and Companion | yes | yes |
| Guion Web research | yes | yes |
| Kepos Speech | yes | yes |
| Agent mailbox integration | yes | yes |
| Optional Keet identity | yes | yes |
| Hindsight long-term memory | no | yes |
| ImageGen | no | yes |
| PostgreSQL memory store | no | yes |
| Kepos Codex Bridge | no | yes |

Core is the lightweight path for running a Partner without graph-backed
long-term memory or image generation. Full gives the Partner a longer memory
and starts four services:

```text
lamplit              Full DSH/Companion application (3080)
hindsight            Hindsight 0.9.2 with ONNX INT8 multilingual embeddings (8888/9999)
hindsight-postgres   PostgreSQL 18 + PGroonga 4.0.8 + pgvector 0.8.6
codex-bridge         Kepos Codex Bridge with operator-owned ChatGPT OAuth
```

The database has no host port. User-facing and control-plane ports bind to host
loopback by default.

## Run Lamplit Full

Full requires an amd64 CPU with AVX2. Hindsight uses the published ONNX INT8
image by default, with a four-CPU quota and four inference threads. See
[`docs/hindsight-onnx.md`](docs/hindsight-onnx.md) for measurements and tuning.

From a repository checkout, choose a private database password and start the
Compose stack:

```bash
export HINDSIGHT_POSTGRES_PASSWORD='replace-with-a-long-private-value'
mkdir -p keet-runtime
docker compose up -d
```

The empty `keet-runtime` directory lets Full start without Keet. To enable
Keet, prepare the supported runtime outside this repository and point
`KEET_RUNTIME_PATH` at it before running Compose; see
[Give your Partner a Keet identity](#give-your-partner-a-keet-identity).

The Codex Bridge image contains no credentials. Log in with an operator-owned
auth file, then restart only that service:

```bash
docker compose run --rm --entrypoint /usr/local/bin/kepos-codex-bridge \
  codex-bridge login \
  --auth-file /var/lib/kepos-codex-bridge/auth.json

docker compose restart codex-bridge
```

The login is a human action and may open a browser. Never commit the bridge
`auth.json` or copy it into Lamplit.

Inspect the rendered topology without starting anything:

```bash
docker compose config
# or
pnpm run test:compose
```

The default application image in `compose.yaml` is a versioned Full release.
The memory services and Codex Bridge are independently versioned and pinned by
their published registry digests. Set `LAMPLIT_IMAGE` to upgrade Lamplit; only
override the other service images after verifying their new digests.

## Configure your Partner

The image contains example configuration files at:

```text
/opt/lamplit/settings.example.yaml
/opt/lamplit/profile.patch.example.yml
```

Mount your own files read-only and opt in explicitly:

```bash
docker run ... \
  --volume "$PWD/settings.yaml:/etc/lamplit/settings.override.yaml:ro" \
  --env LAMPLIT_SETTINGS_OVERRIDE=/etc/lamplit/settings.override.yaml \
  --volume "$PWD/profile.patch.yml:/etc/lamplit/profile.override.yml:ro" \
  --env LAMPLIT_PROFILE_OVERRIDE=/etc/lamplit/profile.override.yml \
  ghcr.io/lamplitisles/lamplit:1.0.0
```

Settings are copied only into a new state volume. Lamplit refuses to overwrite
a non-empty one. A profile patch is applied as the final DSH patch layer and
is not silently installed into state.

Provider API keys and OAuth grants belong in DSH credential storage or runtime
secrets, never in the image or committed examples.

## Give your Partner a Keet identity

Keet support is optional. Lamplit includes the integration, but it does not
redistribute Keet's proprietary executable, worker bundle, or native addons.

Follow the
[Keet runtime preparation guide](https://github.com/lamplitisles/keet-for-agent/blob/main/docs/runtime-extraction.md)
to download the supported official Keet 4.21.0 Linux x86-64 release, verify its
checksum, and extract the runtime. Use the resulting
`4.21.0-linux-x64` directory as the read-only runtime mount.

For Core, add this line to the `docker run` command:

```bash
--volume "/absolute/path/to/4.21.0-linux-x64:/opt/keet-runtime:ro" \
```

For Full, point Compose at the same directory:

```bash
export KEET_RUNTIME_PATH=/absolute/path/to/4.21.0-linux-x64
docker compose up -d
```

The Partner's Keet identity stays in its separate writable volume; it is not
part of the runtime directory. If the runtime is absent or incompatible,
dsh-keet reports a disconnected or setup state while the rest of Lamplit
keeps running.

## Connect an agent mailbox

The dsh-mail integration ships without an email address, OAuth grant, or
Guion-domain provisioning. Configure it in DSH against a compatible mailbox
MCP and OAuth issuer that you operate. An unconfigured mailbox stays inert and
does not block startup.

## What stays yours

Lamplit keeps durable state outside its images and separates data with
different privacy and backup needs.

| Data | Default persistence | How to back it up |
| --- | --- | --- |
| Core DSH state and sessions | `lamplit-core-state` | copy or archive the stopped volume |
| Full DSH state and sessions | `lamplit-dsh-state` | copy or archive the stopped volume |
| Partner workspace and Companion state | Core or Full workspace volume | back up separately from DSH state |
| Keet runtime | operator read-only bind mount | obtain it again; do not put it in this repository |
| Partner Keet identity | Core or Full Keet identity volume | back up privately |
| Hindsight long-term memory | `lamplit-hindsight-postgres` | PostgreSQL custom-format dump |
| Codex Bridge OAuth | `lamplit-codex-bridge-auth` | back up as a secret |

Do not treat the Hindsight container filesystem or model cache as durable
data. This release also does not claim automatic migration of a hosted
account, Keet identity, or mailbox data.

For backup, restore, upgrades, and troubleshooting, see
[`docs/container-operations.md`](docs/container-operations.md).

## Security defaults

The supplied examples:

- run with fixed non-root users;
- use read-only root filesystems;
- drop all Linux capabilities and enable `no-new-privileges`;
- use tmpfs for transient paths;
- bind exposed ports to host loopback;
- keep PostgreSQL on an internal network; and
- keep credentials and writable identities outside the images.

Public ingress, TLS, authentication proxies, and network policy remain the
operator's responsibility. Do not expose the loopback-bound services directly
without a reviewed proxy in front of them.

## Images and upgrades

For a stable `vX.Y.Z` release, Lamplit publishes these application images:

| Variant | Immutable tag | Rolling tag |
| --- | --- | --- |
| Core | `ghcr.io/lamplitisles/lamplit:X.Y.Z` | `latest` |
| Full | `ghcr.io/lamplitisles/lamplit:X.Y.Z-full` | `full` |

There is no `full-latest` tag. Immutable tags are the upgrade and rollback
unit; rolling tags are convenience pointers only. Hindsight, PostgreSQL, and
Kepos Codex Bridge have independent versions and immutable references in
`compose.yaml`.

Hindsight 0.1.2 replaces the FP32 image in the supplied Compose configuration.
Existing installations switch when the operator pulls and recreates the
service; updating the repository alone does not change running containers.
Keep the existing PostgreSQL volume and document vectors when upgrading.

## Build from source

Lamplit uses Node 24 and pnpm 11.22.0 for repository checks. The TypeScript
Dagger module is the Linux amd64 image build and verification interface.

```bash
pnpm install --frozen-lockfile
pnpm run check
dagger call -m dagger check --source .
```

The checks use disposable, test-owned state. They do not call a paid model,
read a real DSH home, or use operator credentials.

Maintainers can find the image publication, mirror, and Woodpecker checklist
in [`docs/release.md`](docs/release.md). Those steps are not required to run
Lamplit.

## Self-hosting and license

Lamplit source and Core/Full images are publicly available under the Elastic
License 2.0 (`Elastic-2.0`). Lamplit is source-available and does not claim OSI
open-source status. Compliant self-hosting remains a real path; the license
does not permit a third party to offer a managed service that exposes a
substantial set of Lamplit features.

Official managed hosting is outside this repository and is not available yet.
If Lamplit Points are offered with hosted resources, they cover only
Lamplit-provided hosting and value, not third-party model usage or a portable
provider account.

Bundled upstream components keep their own licenses. In particular, upstream
Hindsight 0.9.2 is MIT and `@lamplitisles/kepos-hindsight` is Apache-2.0. Review
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), [`licenses/`](licenses/),
and [`sbom/lamplit.spdx.json`](sbom/lamplit.spdx.json) before redistributing an
image.

## Status

Lamplit is early. There is no promise yet of one-click public ingress,
automatic account portability, or support beyond the documented runtime
tuples.

What exists now is the self-hosted path: one Partner, one workspace, and a
small island you can inspect, back up, and run yourself.
