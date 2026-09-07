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

# Verify the existing local memory-service images without building or pushing.
verify-memory-images:
    @pnpm run verify:memory-images

# Authenticate and publish the unchanged, already verified service images.
# Requires GHCR_USERNAME and GHCR_TOKEN in the ignored .env file.
[script("bash")]
publish-memory-images:
    set -euo pipefail
    username="${GHCR_USERNAME:-}"
    token="${GHCR_TOKEN:-}"
    if [[ -z "$username" ]]; then
      echo "GHCR_USERNAME is required in .env (copy .env.example)" >&2
      exit 64
    fi
    if [[ -z "$token" ]]; then
      echo "GHCR_TOKEN is required in .env (copy .env.example)" >&2
      exit 64
    fi
    case "$username" in
      replace-with-*) echo "GHCR_USERNAME in .env is still a placeholder" >&2; exit 64 ;;
    esac
    case "$token" in
      replace-with-*) echo "GHCR_TOKEN in .env is still a placeholder" >&2; exit 64 ;;
    esac

    # Do not pass GHCR credentials into the local-image verification or push
    # helper. The token is used only as docker/podman login stdin below.
    unset GHCR_USERNAME GHCR_TOKEN
    pnpm run verify:memory-images

    auth_dir="$(mktemp -d)"
    cleanup() {
      rm -rf -- "$auth_dir"
    }
    trap cleanup EXIT
    export DOCKER_CONFIG="$auth_dir/docker"
    export REGISTRY_AUTH_FILE="$auth_dir/auth.json"
    mkdir -p "$DOCKER_CONFIG"
    runtime="${CONTAINER_RUNTIME:-docker}"
    printf '%s' "$token" | "$runtime" login ghcr.io --username "$username" --password-stdin >/dev/null
    pnpm run publish:memory-images
