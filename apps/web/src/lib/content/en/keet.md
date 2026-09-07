## Two independent identities

You use your own Keet identity on your phone. Your Partner participates in Keet conversations through a separate identity of their own. It is distinct from your personal login and from an email mailbox.

Keet is optional. Lamplit and Companion keep running when the runtime is absent; the integration shows a disconnected or setup state.

## Prepare your Partner’s runtime

Lamplit includes the integration but does not redistribute Keet’s proprietary executable, worker bundle, or native addons.

Follow the [upstream runtime preparation guide](https://github.com/lamplitisles/keet-for-agent/blob/main/docs/runtime-extraction.md) to obtain the supported **Keet 4.21.0 Linux x86-64** official release, verify its checksum, and extract the runtime. Keep the resulting `4.21.0-linux-x64` directory outside the repository.

This runtime belongs on your Partner’s Linux host. It is separate from the Keet installation on your phone.

## Connect Core

Add this read-only mount before the image name in the [Core startup command](/docs/start/), replacing the path with your actual directory:

```bash
--volume "/absolute/path/to/4.21.0-linux-x64:/opt/keet-runtime:ro" \
```

Docker cannot change the mounts of an existing container. Back up first, stop and remove the old container, then create it with the complete command including the new mount. Keep the original three named volumes; do not delete them.

## Connect Full

Set the path at the repository root and update Compose:

```bash
export KEET_RUNTIME_PATH=/absolute/path/to/4.21.0-linux-x64
docker compose up -d
```

Continue supplying the existing database password environment variable. Confirm the Keet integration is connected in DSH. Then use the integration’s conversation invitation or connection flow to join your phone and your Partner to the same conversation. Follow the controls provided by the current upstream interface.

## Keep the identity safe

The runtime is mounted read-only at `/opt/keet-runtime`. Your Partner’s identity lives in a separate writable volume. Keep these separate: runtime files can be obtained again, while identity data needs a private backup.

There is no verified one-click Keet identity export/import flow across environments yet. Copying the runtime directory does not move an identity.
