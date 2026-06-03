#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_TARGET="${DEPLOY_SSH_TARGET:-aliyun}"
REMOTE_ROOT="${DEPLOY_REMOTE_ROOT:-/root/service-sheet-aliyun}"
DEPLOY_TARGET="${1:-all}"
COMMIT_MSG="${2:-}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}━━━ $1 ━━━${NC}"; }
ok()    { echo -e "${GREEN}  ✓ $1${NC}"; }
skip()  { echo -e "${YELLOW}  - $1${NC}"; }

# ============================================================
# 1. Git: 提交本地变更 + 推送到 GitHub
# ============================================================
git_sync() {
  cd "$ROOT_DIR"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  branch="${branch:-public-clean-260601}"

  info "Git: 同步代码到 GitHub (${branch})"

  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    local msg="${COMMIT_MSG:-部署更新 $(date +%Y-%m-%d\ %H:%M)}"
    git add -A
    git commit -m "$msg"
    ok "已提交：${msg}"
  else
    skip "没有待提交的变更"
  fi

  git push origin "${branch}"
  ok "已推送到 origin/${branch}"
}

# ============================================================
# 2. 后端：上传源码 + Docker 构建重启
# ============================================================
deploy_backend() {
  info "部署后端"

  local remote_dir="$REMOTE_ROOT/app/backend"
  local archive="/tmp/service-sheet-backend-src.tgz"
  local remote_archive="/tmp/service-sheet-backend-src.tgz"

  # 打包（排除不需要的文件）
  cd "$ROOT_DIR/backend"
  tar -c --exclude='node_modules' \
         --exclude='.env' \
         --exclude='.DS_Store' \
         --exclude='uploads' \
         -zf "$archive" .

  scp "$archive" "$SSH_TARGET:$remote_archive"

  ssh "$SSH_TARGET" "set -e
    # 备份当前后端源码
    mkdir -p '${REMOTE_ROOT}/backups'
    bak='${REMOTE_ROOT}/backups/backend-src-\$(date +%Y%m%d%H%M%S)'
    mkdir -p \"\$bak\"
    if [ -d '${remote_dir}' ]; then cp -a '${remote_dir}' \"\$bak/current\"; fi

    # 替换源码（原子操作）
    rm -rf '${remote_dir}_new'
    mkdir -p '${remote_dir}_new'
    tar -xzf '${remote_archive}' -C '${remote_dir}_new'
    rm -rf '${remote_dir}'
    mv '${remote_dir}_new' '${remote_dir}'
    echo '  ✓ 后端源码已上传，备份: \$bak'

    # 重建并重启
    cd '${REMOTE_ROOT}'
    docker compose build backend
    docker compose up -d backend
    echo '  ✓ 后端容器已重建并重启'
  "

  rm -f "$archive"
}

# ============================================================
# 3. 前端：本地构建 + 上传 dist
# ============================================================
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
    mkdir -p '${REMOTE_ROOT}/backups'
    bak='${REMOTE_ROOT}/backups/${name}-site-\$(date +%Y%m%d%H%M%S)'
    mkdir -p \"\$bak\"
    if [ -d '${remote_dir}' ]; then cp -a '${remote_dir}' \"\$bak/current\"; fi
    rm -rf '${remote_new}'
    mkdir -p '${remote_new}'
    tar -xzf '${remote_archive}' -C '${remote_new}'
    mkdir -p '${remote_dir}'
    find '${remote_dir}' -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a '${remote_new}'/. '${remote_dir}'/
    echo '  ✓ 前端已部署，备份: '\$bak'
  "
}

# ============================================================
# Main
# ============================================================
case "$DEPLOY_TARGET" in
  all)
    info "全量部署：GitHub → 后端 → 前端"
    git_sync
    deploy_backend
    build_admin
    build_engineer
    deploy_frontend admin "$ROOT_DIR/frontend-admin/dist" "$REMOTE_ROOT/app/site/admin"
    deploy_frontend engineer "$ROOT_DIR/frontend-engineer/dist" "$REMOTE_ROOT/app/site/engineer"
    ok "全量部署完成"
    ;;

  backend)
    git_sync
    deploy_backend
    ok "后端部署完成"
    ;;

  admin)
    git_sync
    build_admin
    deploy_frontend admin "$ROOT_DIR/frontend-admin/dist" "$REMOTE_ROOT/app/site/admin"
    ok "管理端部署完成"
    ;;

  engineer)
    git_sync
    build_engineer
    deploy_frontend engineer "$ROOT_DIR/frontend-engineer/dist" "$REMOTE_ROOT/app/site/engineer"
    ok "工程师端部署完成"
    ;;

  frontend)
    git_sync
    build_admin
    build_engineer
    deploy_frontend admin "$ROOT_DIR/frontend-admin/dist" "$REMOTE_ROOT/app/site/admin"
    deploy_frontend engineer "$ROOT_DIR/frontend-engineer/dist" "$REMOTE_ROOT/app/site/engineer"
    ok "前端全量部署完成"
    ;;

  *)
    echo ""
    echo "用法: $0 <目标> [提交信息]"
    echo ""
    echo "目标:"
    echo "  all       全量部署（默认）：Git 推送 → 后端 → 前端"
    echo "  backend   仅部署后端：Git 推送 → 上传后端源码 → Docker 重建"
    echo "  frontend  仅部署前端：Git 推送 → 构建并上传 admin + engineer"
    echo "  admin     仅部署管理端"
    echo "  engineer  仅部署工程师端"
    echo ""
    echo "提交信息: 可选的 git commit message，不传则自动生成"
    echo ""
    echo "环境变量:"
    echo "  DEPLOY_SSH_TARGET    SSH 主机（默认：aliyun）"
    echo "  DEPLOY_REMOTE_ROOT   远程目录（默认：/root/service-sheet-aliyun）"
    echo "  DEPLOY_BRANCH        Git 分支（默认：当前分支）"
    echo ""
    exit 2
    ;;
esac
