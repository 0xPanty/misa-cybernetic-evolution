#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="false"
REMOTE="${MISA_CYBERNETIC_GIT_REMOTE:-origin}"
BRANCH="${MISA_CYBERNETIC_GIT_BRANCH:-main}"
SKIP_PULL="false"
SKIP_NPM_CI="false"
SKIP_FULL_SHADOW="false"
SKIP_HOOK_INSTALL="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --remote)
      REMOTE="$2"
      shift 2
      ;;
    --remote=*)
      REMOTE="${1#--remote=}"
      shift
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --branch=*)
      BRANCH="${1#--branch=}"
      shift
      ;;
    --skip-pull)
      SKIP_PULL="true"
      shift
      ;;
    --skip-npm-ci)
      SKIP_NPM_CI="true"
      shift
      ;;
    --skip-full-shadow)
      SKIP_FULL_SHADOW="true"
      shift
      ;;
    --skip-hook-install)
      SKIP_HOOK_INSTALL="true"
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

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 127
  fi
}

ensure_clean_tracked_tree() {
  git update-index -q --refresh
  if ! git diff --quiet -- || ! git diff --cached --quiet --; then
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "warning: tracked local changes would block a real update"
      return 0
    fi
    echo "refusing to update: tracked local changes exist" >&2
    echo "commit/stash local changes first, then rerun npm run update:vps-shadow" >&2
    git status --short
    exit 1
  fi
}

ensure_on_branch() {
  local current_branch
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "$BRANCH" ]]; then
    echo "refusing to update: current branch is $current_branch, expected $BRANCH" >&2
    exit 1
  fi
}

print_version_state() {
  local head remote_head version
  head="$(git rev-parse --short HEAD)"
  remote_head="$(git rev-parse --short "$REMOTE/$BRANCH" 2>/dev/null || echo unknown)"
  if command -v node >/dev/null 2>&1; then
    version="$(node -e "console.log(require('./package.json').version)")"
  else
    version="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' package.json | head -n 1)"
  fi
  echo "head: $head"
  echo "remote_head: $remote_head"
  echo "package_version: $version"
}

if [[ -d /opt/misa-node20/bin ]]; then
  export PATH="/opt/misa-node20/bin:$PATH"
fi

need_command git
if [[ "$DRY_RUN" != "true" ]]; then
  need_command npm
  need_command node
fi

cd "$REPO_ROOT"

echo "misa VPS shadow updater"
echo "repo: $REPO_ROOT"
echo "remote: $REMOTE"
echo "branch: $BRANCH"
echo "scope: fast-forward repo update, npm ci, full-shadow self-check, VPS hook refresh"

ensure_on_branch
ensure_clean_tracked_tree

echo "before:"
print_version_state

if [[ "$SKIP_PULL" != "true" ]]; then
  run git fetch "$REMOTE" "$BRANCH"
  if [[ "$DRY_RUN" != "true" ]]; then
    git rev-parse --verify "$REMOTE/$BRANCH" >/dev/null
  fi
  run git merge --ff-only "$REMOTE/$BRANCH"
else
  echo "git update skipped"
fi

if [[ "$SKIP_NPM_CI" != "true" ]]; then
  run npm ci
else
  echo "npm ci skipped"
fi

if [[ "$SKIP_FULL_SHADOW" != "true" ]]; then
  run npm run deploy:full-shadow
else
  echo "deploy:full-shadow skipped"
fi

if [[ "$SKIP_HOOK_INSTALL" != "true" ]]; then
  run npm run deploy:vps-shadow
else
  echo "deploy:vps-shadow skipped"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "ok: VPS shadow update dry-run completed"
else
  ensure_clean_tracked_tree
  echo "after:"
  print_version_state
  echo "ok: VPS shadow update completed"
fi
