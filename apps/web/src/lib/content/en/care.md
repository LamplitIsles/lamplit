## Models and credentials

Once DSH is open, configure the model service you choose. API keys and OAuth grants are runtime credentials; keep them in DSH credential storage or private secrets.

When you use remote models, research, or email services, relevant content is still sent to their providers. Self-hosting gives you control over the runtime and persistent data; it does not make every capability offline.

## Override the initial configuration

The image includes two example files:

```text
/opt/lamplit/settings.example.yaml
/opt/lamplit/profile.patch.example.yml
```

Prepare your own files and mount them read-only. Add these arguments before the image name in the complete Core startup command:

```bash
--volume "$PWD/settings.yaml:/etc/lamplit/settings.override.yaml:ro" \
--env LAMPLIT_SETTINGS_OVERRIDE=/etc/lamplit/settings.override.yaml \
--volume "$PWD/profile.patch.yml:/etc/lamplit/profile.override.yml:ro" \
--env LAMPLIT_PROFILE_OVERRIDE=/etc/lamplit/profile.override.yml \
```

Settings are written only to a new, empty state volume; existing state is never overwritten. The profile patch is the final patch layer and is not silently installed into state. Manage everyday settings through your existing runtime rather than resetting the state volume.

## Email is another optional connection

The agent mailbox is one real email address owned by your Partner. Lamplit includes the integration, but not a pre-provisioned address or OAuth grant. Configure a compatible mailbox MCP and OAuth issuer that you operate in DSH. An unconfigured mailbox stays inert and does not block startup.

## Back up these data sets separately

| Data | Core volume | Full volume |
| --- | --- | --- |
| DSH state and sessions | `lamplit-core-state` | `lamplit-dsh-state` |
| Partner workspace | `lamplit-core-workspace` | `lamplit-partner-workspace` |
| Keet identity | `lamplit-core-keet` | `lamplit-keet-identity` |
| Hindsight memory | Not included | `lamplit-hindsight-postgres` |
| Codex Bridge authorization | Not included | `lamplit-codex-bridge-auth` |

Stop services that write to file-based volumes before copying them. Export the database using the [memory backup guide](/docs/memory/). Keep identities, authorization data, and backups private.

DSH state lives at `/home/lamplit/.local/state/dsh`; the Partner workspace is `/workspace`. Preserve these as separate persistence boundaries.

## Upgrade

Back up first, then choose an explicit version. Core uses `X.Y.Z` and Full uses `X.Y.Z-full`. Their rolling tags are `latest` and `full`; there is no `full-latest` tag.

For Full, set `LAMPLIT_IMAGE` to select the application image, then update Compose. The memory services and Codex Bridge have independent versions and digests; their references do not change with the application version number.

Keep the existing named volumes. First-start seed configuration does not overwrite existing files. Upgrading does not automatically migrate a hosted account, Keet identity, or mailbox data.

## Common questions

**The interface will not open:** check container state and logs first. Ports bind to `127.0.0.1` by default; remote deployments need SSH forwarding or a separately configured authentication proxy.

```bash
# Core
docker ps --filter name=lamplit-core
docker logs lamplit-core --tail=100

# Full
docker compose ps
docker compose logs --tail=100 lamplit hindsight hindsight-postgres codex-bridge
```

**Your Partner has no long-term memory:** confirm you are using Full, then check Hindsight and the database. Both services need the same database password. The database volume must be writable by uid 999.

**Keet is disconnected:** check that a supported, readable runtime is mounted read-only at `/opt/keet-runtime`. Keep runtime files out of the identity volume.

**The bridge is unauthenticated:** complete the operator login in the [Full guide](/docs/full/), then restart only `codex-bridge`.

## License and support

Lamplit is an independent, source-available community distribution under Elastic License 2.0, with free, compliant self-hosting. It is not OSI open source or an official DeepSeek product. Upstream components retain their own licenses.

Official managed hosting is not available yet. This release does not promise one-click public ingress, automatic account migration, or support outside the documented runtime combinations. See the repository’s [LICENSE](https://github.com/LamplitIsles/lamplit/blob/main/LICENSE) for the full terms.
