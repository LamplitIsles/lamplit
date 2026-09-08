## What Full adds

Full extends Core with Hindsight graph memory, image generation, PostgreSQL memory storage, and Codex Bridge. It runs four services:

- `lamplit`: the Web and Companion application.
- `hindsight`: the long-term memory service.
- `hindsight-postgres`: the memory database.
- `codex-bridge`: authenticated with the operator’s own ChatGPT OAuth account.

Core and Full are different sets of capabilities, rather than free and paid tiers. You cover the cost of your machine and model usage.

## Prepare the deployment directory

You need Linux amd64 with an AVX2-capable CPU, Docker, and Docker Compose. Full uses CPU-based ONNX INT8 memory embeddings by default; Hindsight has a four-CPU quota. Get a complete checkout of the [public repository](https://github.com/LamplitIsles/lamplit) and run the following commands at its root. Choose a published stable version for your deployment.

```bash
export HINDSIGHT_POSTGRES_PASSWORD='replace-with-a-long-private-value'
mkdir -p keet-runtime
docker compose up -d
```

**Replace the placeholder with your own strong password** and keep it in your private deployment environment. Future Compose commands need the same environment variable. Do not commit the password to the repository.

The empty `keet-runtime` directory lets Full start without Keet. See [Stay close through Keet](/docs/keet/) when you are ready to connect it.

The repository’s `compose.yaml` pins the application version and the independently versioned service images by digest. Use those references; the memory services do not need local builds.

For existing installations, updating the checkout does not change running containers. Apply the new image during your planned upgrade, keeping the existing PostgreSQL volume and stored memory vectors.

## Sign in to Codex Bridge

The image contains no account credentials. Use your own authorization:

```bash
docker compose run --rm --entrypoint /usr/local/bin/kepos-codex-bridge \
  codex-bridge login \
  --auth-file /var/lib/kepos-codex-bridge/auth.json

docker compose restart codex-bridge
```

Complete this step yourself; it may open a browser. Authorization data stays in a separate volume. Do not copy it into an image or the repository. Configure other model service keys in DSH.

## Check and open

```bash
docker compose ps
docker compose logs --tail=20 lamplit
```

Open the tokenized Web address from the logs. After signing in, enter [Companion](http://127.0.0.1:3080/companion/). For a remote deployment, set up SSH forwarding as described in the [Core guide](/docs/start/).

Application and control ports bind to host loopback by default. The database has no host port. Public access requires separate TLS, authentication proxy, and network configuration.

## Already using Core?

Back up Core’s state and workspace first. Full uses different default volume names, so starting Full **does not automatically continue with your Core data**. This release has no general one-click migration flow. Keep the persistence boundaries separate, and never let two application instances write to the same state at once.

Read about [long-term memory](/docs/memory/) and [backup boundaries](/docs/care/) before planning a move of existing data.
