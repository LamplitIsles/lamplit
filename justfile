set dotenv-load
set unstable
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# Keep a plain `just` invocation as a recipe index.
[private]
default:
    @just --list

# Run fast repository-owned checks without building images.
check:
    @pnpm run check

# Build and inspect only the Core and Full application images.
dagger-check:
    @DAGGER_NO_NAG=1 dagger -q call -m dagger check --source .

# Publish Core and Full from the current checkout's matching stable tag.
# Requires GHCR_USERNAME and GHCR_TOKEN in the ignored .env file.
[script("bash")]
publish-app-images release_tag:
    set -euo pipefail
    username="${GHCR_USERNAME:-}"
    token="${GHCR_TOKEN:-}"
    release_tag="{{ release_tag }}"

    # Validate the stable tag, credentials, and tag/current-commit relationship
    # before Dagger starts. The helper never contacts GHCR or prints a secret.
    revision="$(GHCR_USERNAME="$username" GHCR_TOKEN="$token" node scripts/validate-app-publication.ts "$release_tag")"

    # Dagger reads the token as a Secret through env:GHCR_TOKEN; it is never a
    # command-line argument, build argument, or value persisted in the cache.
    export GHCR_TOKEN="$token"
    DAGGER_NO_NAG=1 dagger -q call -m dagger publish \
      --source . \
      --release-tag "$release_tag" \
      --revision "$revision" \
      --registry-username "$username" \
      --registry-password env:GHCR_TOKEN

# Verify the pulled, digest-pinned memory-service images in disposable containers.
verify-memory-images:
    @pnpm run verify:memory-images
