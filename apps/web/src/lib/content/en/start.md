## Before you start

Use a **Linux amd64** machine with Docker installed and access to GHCR images. The current images do not promise native ARM or Apple Silicon support.

Core includes Web, Companion, speech, research, mailbox integration, and an optional Keet connection. Choose [Full](/docs/full/) for Hindsight long-term memory and image generation.

You can open the interface without a model key. To talk with your Partner, configure a model service and its credentials. Email and Keet can come later.

## Start Core

Create three persistent volumes for DSH state, your Partner’s workspace, and their Keet identity. Keep the separate identity volume even if you are not using Keet yet.

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

`latest` is the rolling Core tag. For reproducible upgrades and rollback, use an `X.Y.Z` tag from the [published versions](https://github.com/LamplitIsles/lamplit/tags).

## Open your shared space

Find the one-time tokenized Web address in the logs and open it in your browser:

```bash
docker logs lamplit-core --tail=20
```

After signing in to Web, open [Companion](http://127.0.0.1:3080/companion/). Configure your model service and credentials in DSH, then begin getting to know your Partner. There is no preset romantic persona: choose their name and the relationship you want to share, whether as a boyfriend, girlfriend, or another kind of companion.

If Docker runs on a remote machine, `127.0.0.1` in your browser refers to the device in front of you. Set up SSH port forwarding first, replacing the account and host in this example:

```bash
ssh -L 3080:127.0.0.1:3080 your-user@your-host
```

Keep the SSH connection open, then visit the local address. The token in the logs is an access credential; keep it private.

## Restart and keep your data

```bash
docker restart lamplit-core
```

Restarting does not overwrite existing state. Initial settings are written only when the state volume is empty. DSH state and your Partner’s workspace are separate data sets: back them up independently, and do not mount an existing personal DSH home directly into the image.

Next, [connect Keet](/docs/keet/), or learn about [settings and backups](/docs/care/).
