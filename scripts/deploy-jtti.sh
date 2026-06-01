#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_TARGET="${JTTI_SSH_TARGET:-jtti}"
REMOTE_ROOT="${JTTI_REMOTE_ROOT:-/root/service-sheet-rc}"
DEPLOY_TARGET="${1:-all}"

build_admin() {
  (cd "$ROOT_DIR/frontend-admin" && npm run build)
}

build_engineer() {
  (cd "$ROOT_DIR/frontend-engineer" && npm run build)
}

deploy_frontend() {
  local name="$1"
  local local_dist="$2"
  local remote_dir="$3"
  local archive="/tmp/service-sheet-${name}-dist.tgz"
  local remote_archive="/tmp/service-sheet-${name}-dist.tgz"
  local remote_new="/tmp/service-sheet-${name}-new"

  tar -C "$local_dist" -czf "$archive" .
  scp "$archive" "$SSH_TARGET:$remote_archive"
  ssh "$SSH_TARGET" "set -e
mkdir -p '$REMOTE_ROOT/backups'
backup_dir='$REMOTE_ROOT/backups/${name}-site-'\$(date +%Y%m%d%H%M%S)
mkdir -p \"\$backup_dir\"
if [ -d '$remote_dir' ]; then cp -a '$remote_dir' \"\$backup_dir/current\"; fi
rm -rf '$remote_new'
mkdir -p '$remote_new'
tar -xzf '$remote_archive' -C '$remote_new'
mkdir -p '$remote_dir'
find '$remote_dir' -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a '$remote_new'/. '$remote_dir'/
echo \"deployed $name to $remote_dir; backup: \$backup_dir\"
"
}

case "$DEPLOY_TARGET" in
  all)
    build_admin
    build_engineer
    deploy_frontend admin "$ROOT_DIR/frontend-admin/dist" "$REMOTE_ROOT/app/site/admin"
    deploy_frontend engineer "$ROOT_DIR/frontend-engineer/dist" "$REMOTE_ROOT/app/site/engineer"
    ;;
  admin)
    build_admin
    deploy_frontend admin "$ROOT_DIR/frontend-admin/dist" "$REMOTE_ROOT/app/site/admin"
    ;;
  engineer)
    build_engineer
    deploy_frontend engineer "$ROOT_DIR/frontend-engineer/dist" "$REMOTE_ROOT/app/site/engineer"
    ;;
  *)
    echo "Usage: $0 [all|admin|engineer]" >&2
    exit 2
    ;;
esac
