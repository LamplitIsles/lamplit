# Container operations

This document covers the day-two boundaries of the first Lamplit release. It
assumes the commands in the root README have already been used and that the
operator owns the host, Docker daemon, database backups, and OAuth accounts.

Lamplit is source-available under Elastic License 2.0, not represented as OSI
open source. Public Core/Full self-hosting and any official managed hosting
are separate choices: BYOK keeps provider choice and model-token costs with
the user, while Lamplit Points apply only to Lamplit-provided hosted resources
and value. Hosted control-plane terms are outside this repository.

## Persistence boundaries

Lamplit deliberately has no single catch-all data directory. Keep each
boundary on its own named volume or bind mount:

| Data | Compose volume | Container path | Backup/restore unit |
| --- | --- | --- | --- |
| DSH settings, profiles, sessions, plugin state | `lamplit-dsh-state` | `/home/lamplit/.local/state/dsh` | Copy or archive the volume while Lamplit is stopped |
| Partner files and Companion relationship state | `lamplit-partner-workspace` | `/workspace` | Back up separately from DSH state |
| Keet identity | `lamplit-keet-identity` | `/var/lib/lamplit/keet` and `/workspace/.dsh/dsh-keet` | Back up privately; never include the runtime bytes |
| Keet runtime | operator bind | `/opt/keet-runtime:ro` | Obtain again from the operator's supported Keet distribution |
| Hindsight memory | `lamplit-hindsight-postgres` | PostgreSQL data directory | PostgreSQL dump, not a container-layer copy |
| Codex Bridge OAuth | `lamplit-codex-bridge-auth` | `/var/lib/kepos-codex-bridge` | Treat `auth.json` as a secret |

Do not mount a pre-existing host DSH home into the image. Migration of an
existing home is intentionally outside this release. A fresh state volume is
seeded once; a non-empty state volume is never overwritten by an image update.

## Backups and upgrades

Stop the services that write a boundary before copying it. For PostgreSQL,
prefer a custom-format dump so extension metadata and large objects remain
restorable:

```sh
docker compose stop hindsight
docker compose exec -T hindsight-postgres \
  pg_dump -U hindsight -d hindsight -Fc > hindsight-$(date +%Y%m%d).dump
docker compose start hindsight
```

Restore into a new, disposable PostgreSQL volume first. Check that the dump
contains the `pgroonga` and `vector` extensions and that the target image
reports PGroonga 4.0.8 and pgvector 0.8.6 before switching the Compose image.
Keep the old volume until a real memory read and write have succeeded.

For Lamplit image upgrades, pin an immutable `X.Y.Z-full` tag, stop the old
application, and start the new image with the same named volumes. The image
seed is idempotent and does not replace existing settings or profiles. Back up
DSH state and the Partner workspace independently so a failed application
upgrade cannot silently change both recovery units.

## Health and troubleshooting

Inspect the rendered model and service state before changing anything:

```sh
docker compose config
docker compose ps
docker compose logs --tail=100 lamplit hindsight hindsight-postgres codex-bridge
```

- If Lamplit is reachable but a Partner has no memory, check
  `docker compose ps hindsight hindsight-postgres` and the Hindsight logs. The
  database health check verifies both extension versions before Hindsight is
  started.
- If Hindsight is unhealthy, confirm that `HINDSIGHT_POSTGRES_PASSWORD` is
  identical for both services, that the PostgreSQL volume is writable by uid
  999, and that the model path is present in the Hindsight image. The image is
  intentionally offline after build; it does not fetch from Hugging Face at
  startup.
- If the Keet integration reports disconnected/setup, verify that the
  operator-prepared Linux x86-64 Keet 4.21.0 directory is mounted at
  `/opt/keet-runtime` and is readable. Do not copy it into an image or into
  the identity volume. Lamplit and Companion should remain usable without it.
- If dsh-mail is inert, configure its existing mailbox MCP and OAuth settings
  in DSH. Lamplit does not provision an address or ship mailbox credentials.
- If the bridge is unauthenticated, perform the operator login from the README
  using the `codex-bridge` service's private auth volume, then restart that
  service. Never put the resulting file in an image, repository, or Compose
  environment value.

The default ports bind to `127.0.0.1`. Put a reviewed TLS/authentication proxy
in front of them before exposing any service beyond the host, and preserve the
database's internal-only network. The supplied hardening (`read_only`, dropped
capabilities, no-new-privileges, tmpfs) is a baseline, not a substitute for
host and network policy.

## Safe validation

`bun run check` only parses and validates repository-owned artifacts. The
end-to-end `dagger call -m dagger check --source .` builds only disposable
Linux amd64 Core and Full application containers, verifies their capabilities
and metadata, and does not use credentials or paid model calls. Run
`bun run verify:memory-images` separately before publishing the prebuilt Kosmos
service images; it does not build them and checks the local source `localDigest`
values. The publication helper records and checks the separate public registry
`publishedDigest` values after an authenticated pull, so a stale local
`RepoDigest` cannot validate a failed publication. For a running Core smoke, use
`node scripts/test-core-smoke.mjs` with a test-owned image and temporary
directories; it never points at the operator's DSH home.

When exporting or redistributing an application image, retain
`/usr/share/doc/lamplit/` with its SPDX SBOM, `THIRD_PARTY_NOTICES.md`, and
separate Hindsight MIT and `kepos-hindsight` Apache-2.0 license texts. The
PostgreSQL dump is the only tested Hindsight memory export/import unit in this
release; Keet identity and mailbox data do not yet have a tested portable
export path.
