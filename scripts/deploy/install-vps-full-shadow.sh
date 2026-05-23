#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="false"
RELOAD_SYSTEMD="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --no-daemon-reload)
      RELOAD_SYSTEMD="false"
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SERVICE_NAME="${MISA_SESSION_DISTILLER_SERVICE:-misa-session-distiller.service}"
ENV_FILE="${MISA_SESSION_DISTILLER_ENV_FILE:-/etc/misa-hermes/session-distiller.env}"
HOOK_SOURCE="$REPO_ROOT/scripts/deploy/misa-cybernetic-session-distiller-review.sh"
DROPIN_SOURCE="$REPO_ROOT/scripts/deploy/misa-session-distiller-cybernetic-review.conf"
HOOK_TARGET="${MISA_CYBERNETIC_HOOK_BIN:-/usr/local/bin/misa-cybernetic-session-distiller-review}"
DROPIN_DIR="${MISA_CYBERNETIC_SYSTEMD_DROPIN_DIR:-/etc/systemd/system/$SERVICE_NAME.d}"
DROPIN_TARGET="$DROPIN_DIR/cybernetic-review.conf"
REFRESH_EXPECT_COMMIT="${MISA_CYBERNETIC_REFRESH_EXPECT_COMMIT:-true}"
LEGACY_DROPIN_TARGETS=("$DROPIN_DIR/20-cybernetic-review.conf")

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

refresh_expected_commit_pin() {
  if [[ "$REFRESH_EXPECT_COMMIT" != "true" ]]; then
    echo "expected_commit_pin: skipped"
    return 0
  fi

  local expected_commit tmp
  expected_commit="$(git -C "$REPO_ROOT" rev-parse HEAD)"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] refresh MISA_CYBERNETIC_EXPECT_COMMIT=$expected_commit in $ENV_FILE"
    return 0
  fi

  tmp="$(mktemp)"
  if [[ -f "$ENV_FILE" ]]; then
    awk -v commit="$expected_commit" '
      BEGIN { done = 0 }
      /^MISA_CYBERNETIC_EXPECT_COMMIT=/ {
        print "MISA_CYBERNETIC_EXPECT_COMMIT=" commit
        done = 1
        next
      }
      { print }
      END {
        if (!done) {
          print "MISA_CYBERNETIC_EXPECT_COMMIT=" commit
        }
      }
    ' "$ENV_FILE" > "$tmp"
  else
    printf 'MISA_CYBERNETIC_EXPECT_COMMIT=%s\n' "$expected_commit" > "$tmp"
  fi

  run install -d -m 0755 "$(dirname "$ENV_FILE")"
  run install -m 0600 "$tmp" "$ENV_FILE"
  rm -f "$tmp"
  echo "expected_commit_pin: $expected_commit"
}

remove_legacy_dropins() {
  local legacy_target
  for legacy_target in "${LEGACY_DROPIN_TARGETS[@]}"; do
    if [[ "$legacy_target" == "$DROPIN_TARGET" ]]; then
      continue
    fi
    if [[ -f "$legacy_target" ]]; then
      run rm -f "$legacy_target"
      echo "legacy_dropin_removed: $legacy_target"
    fi
  done
}

if [[ ! -f "$HOOK_SOURCE" ]]; then
  echo "missing hook source: $HOOK_SOURCE" >&2
  exit 1
fi

if [[ ! -f "$DROPIN_SOURCE" ]]; then
  echo "missing drop-in source: $DROPIN_SOURCE" >&2
  exit 1
fi

echo "misa VPS full-shadow hook install"
echo "service: $SERVICE_NAME"
echo "hook_target: $HOOK_TARGET"
echo "dropin_target: $DROPIN_TARGET"
echo "scope: session-distiller ExecStartPost hook; no production memory/skill write authority"

run install -m 0755 "$HOOK_SOURCE" "$HOOK_TARGET"
run install -d -m 0755 "$DROPIN_DIR"
run install -m 0644 "$DROPIN_SOURCE" "$DROPIN_TARGET"
remove_legacy_dropins
refresh_expected_commit_pin

if [[ "$RELOAD_SYSTEMD" == "true" ]]; then
  if command -v systemctl >/dev/null 2>&1; then
    run systemctl daemon-reload
  else
    echo "systemctl not found; skipped daemon-reload" >&2
  fi
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "ok: VPS full-shadow hook dry-run completed"
  echo "next: rerun without --dry-run to install the hook"
else
  echo "ok: VPS full-shadow hook installed"
  echo "next: the hook runs after the next $SERVICE_NAME execution"
fi
