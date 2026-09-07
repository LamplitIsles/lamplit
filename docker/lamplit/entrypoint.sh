#!/bin/sh
set -eu

DSH_HOME="${DSH_HOME:-/home/lamplit/.local/state/dsh}"
export DSH_HOME
export HOME="${HOME:-/home/lamplit}"
export PATH="/opt/dsh-runtime/node_modules/.bin:${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"

seed_state() {
  mkdir -p "$DSH_HOME"
  if [ -z "$(find "$DSH_HOME" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    # Plain recursive copy avoids attempting to preserve image-layer ownership
    # and timestamps on rootless bind mounts.
    cp -R /opt/lamplit/seed-state/. "$DSH_HOME/"
    # A rootless bind mount may be owned by the host uid mapped to container
    # root; keep the caller-provided mode instead of failing startup when the
    # non-root Lamplit uid cannot chmod the mount root.
    chmod 700 "$DSH_HOME" 2>/dev/null || :
  elif [ ! -f "$DSH_HOME/profiles/web/package.json" ]; then
    # Never seed or repair a non-empty state volume. A partial or foreign
    # state directory must be inspected or migrated by the operator instead
    # of being silently mixed with image-owned profile files.
    echo "lamplit: refusing to seed non-empty DSH state without profiles/web/package.json" >&2
    echo "lamplit: use an empty state volume for first start or repair this state explicitly" >&2
    exit 64
  fi
}

copy_new_settings_override() {
  override="${LAMPLIT_SETTINGS_OVERRIDE:-}"
  [ -n "$override" ] || return 0
  [ -r "$override" ] || {
    echo "lamplit: settings override is not readable: $override" >&2
    exit 64
  }
  target="$DSH_HOME/settings.yaml"
  if [ -s "$target" ]; then
    echo "lamplit: refusing settings override; state already contains $target" >&2
    echo "lamplit: use a fresh state volume or edit the state-owned settings file" >&2
    exit 64
  fi
  cp "$override" "$target"
  chmod 600 "$target"
}

link_optional_keet_runtime() {
  # dsh-keet resolves its supported runtime under DSH_HOME. A symlink keeps
  # that package contract while the actual operator-supplied bytes remain a
  # read-only bind mount outside every Lamplit image layer.
  runtime_root="$DSH_HOME/runtimes/keet"
  runtime_target="$runtime_root/4.21.0-linux-x64"
  mkdir -p "$runtime_root"
  if [ ! -e "$runtime_target" ] && [ ! -L "$runtime_target" ]; then
    ln -s /opt/keet-runtime "$runtime_target"
  fi
}

seed_state
copy_new_settings_override
link_optional_keet_runtime

# DSH deliberately rejects wildcard listeners. Keep its own listener on
# loopback and use a byte-for-byte proxy for Docker/Compose port forwarding.
# The proxy's bind address is independently configurable; supplied examples
# publish that container port only on host loopback.
proxy_host="${LAMPLIT_HOST:-0.0.0.0}"
proxy_port="${LAMPLIT_PORT:-3080}"
dsh_port="${LAMPLIT_DSH_PORT:-3081}"

case "$proxy_host" in
  "")
    echo "lamplit: LAMPLIT_HOST cannot be empty" >&2
    exit 64
    ;;
esac

case "$proxy_port:$dsh_port" in
  *[!0-9:]*|*:|:*|*:0|0:*)
    echo "lamplit: LAMPLIT_PORT and LAMPLIT_DSH_PORT must be numeric non-zero ports" >&2
    exit 64
    ;;
esac
if [ "$proxy_port" = "$dsh_port" ]; then
  echo "lamplit: LAMPLIT_PORT and LAMPLIT_DSH_PORT must differ" >&2
  exit 64
fi

if [ -n "${LAMPLIT_PROFILE_OVERRIDE:-}" ]; then
  [ -r "$LAMPLIT_PROFILE_OVERRIDE" ] || {
    echo "lamplit: profile override is not readable: $LAMPLIT_PROFILE_OVERRIDE" >&2
    exit 64
  }
fi

# dsh's live patch watcher uses Node's internal module hooks. The distributed
# CLI intentionally leaves this opt-in so ordinary callers do not depend on
# an experimental runtime flag; the image opts in because live profile state
# is part of its documented persistence contract. The launcher owns both
# child processes, forwards container signals, and rewrites DSH's internal
# token URL to the published port.
if [ -n "${LAMPLIT_PROFILE_OVERRIDE:-}" ]; then
  exec node /usr/local/bin/lamplit-launcher.mjs \
    --proxy-host "$proxy_host" --proxy-port "$proxy_port" --dsh-port "$dsh_port" -- \
    --profile web --host 127.0.0.1 --port "$dsh_port" --no-open \
    --patch "$LAMPLIT_PROFILE_OVERRIDE" "$@"
else
  exec node /usr/local/bin/lamplit-launcher.mjs \
    --proxy-host "$proxy_host" --proxy-port "$proxy_port" --dsh-port "$dsh_port" -- \
    --profile web --host 127.0.0.1 --port "$dsh_port" --no-open "$@"
fi
