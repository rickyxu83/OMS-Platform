#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV_FILE="$ROOT_DIR/scripts/deploy.local.env"

if [ -f "$LOCAL_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$LOCAL_ENV_FILE"
  set +a
fi

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${BLUE}━━━ $1 ━━━${NC}"; }
ok()    { echo -e "${GREEN}  ✓ $1${NC}"; }
skip()  { echo -e "${YELLOW}  - $1${NC}"; }
err()   { echo -e "${RED}  ✗ $1${NC}" >&2; }

is_deploy_target() {
  case "${1:-}" in
    all|backend|frontend|front|admin|engineer|eng) return 0 ;;
    *) return 1 ;;
  esac
}

usage() {
  echo ""
  echo "用法: $0 [profile] <目标> [提交信息]"
  echo ""
  echo "目标:"
  echo "  all       全量部署：Git 推送 → 后端 → 前端"
  echo "  backend   仅部署后端：Git 推送 → 上传后端源码 → Docker 重建"
  echo "  frontend  仅部署前端：Git 推送 → 构建并上传 admin + engineer"
  echo "  front     frontend 的别名"
  echo "  admin     仅部署管理端"
  echo "  engineer  仅部署工程师端"
  echo "  eng       engineer 的别名"
  echo ""
  echo "profile: 可选，本地私有环境名。会读取 scripts/deploy.local.env 中的 DEPLOY_<PROFILE>_* 变量。"
  echo "提交信息: 可选的 git commit message，不传则自动生成"
  echo ""
  echo "必需环境变量:"
  echo "  DEPLOY_SSH_TARGET       SSH 主机别名或目标"
  echo "  DEPLOY_REMOTE_ROOT      远程项目根目录"
  echo ""
  echo "可选环境变量:"
  echo "  DEPLOY_BACKEND_RELATIVE 后端目录相对远程根目录的位置（默认：app/backend）"
  echo "  DEPLOY_SITE_RELATIVE    前端站点目录相对远程根目录的位置（默认：app/site）"
  echo "  DEPLOY_PROJECT_SLUG     临时归档名前缀（默认：oms-platform）"
  echo "  DEPLOY_BRANCH           Git 目标分支（默认：当前分支）"
  echo ""
}

apply_profile() {
  local profile="$1"
  local profile_key
  profile_key="$(printf '%s' "$profile" | tr '[:lower:]-' '[:upper:]_')"

  local suffix source_var
  for suffix in SSH_TARGET REMOTE_ROOT BACKEND_RELATIVE SITE_RELATIVE PROJECT_SLUG BRANCH; do
    source_var="DEPLOY_${profile_key}_${suffix}"
    if [ -n "${!source_var:-}" ]; then
      export "DEPLOY_${suffix}=${!source_var}"
    fi
  done

  local vite_suffix target_var
  for vite_suffix in API_BASE_URL UNIFIED_LOGIN_URL ENGINEER_WORKSPACE_URL ADMIN_HOST_PREFIX ENGINEER_HOST_PREFIX BASE_PATH AMAP_JSAPI_KEY AMAP_SECURITY_JS_CODE; do
    source_var="DEPLOY_${profile_key}_VITE_${vite_suffix}"
    target_var="VITE_${vite_suffix}"
    if [ -n "${!source_var:-}" ]; then
      export "${target_var}=${!source_var}"
    fi
  done
}

apply_vite_defaults() {
  local vite_suffix source_var target_var
  for vite_suffix in API_BASE_URL UNIFIED_LOGIN_URL ENGINEER_WORKSPACE_URL ADMIN_HOST_PREFIX ENGINEER_HOST_PREFIX BASE_PATH AMAP_JSAPI_KEY AMAP_SECURITY_JS_CODE; do
    source_var="DEPLOY_VITE_${vite_suffix}"
    target_var="VITE_${vite_suffix}"
    if [ -n "${!source_var:-}" ] && [ -z "${!target_var:-}" ]; then
      export "${target_var}=${!source_var}"
    fi
  done
}

parse_args() {
  DEPLOY_PROFILE=""
  if [ "$#" -gt 0 ] && ! is_deploy_target "$1"; then
    DEPLOY_PROFILE="$1"
    apply_profile "$DEPLOY_PROFILE"
    DEPLOY_TARGET="${2:-all}"
    COMMIT_MSG="${3:-}"
  else
    DEPLOY_TARGET="${1:-all}"
    COMMIT_MSG="${2:-}"
  fi

  SSH_TARGET="${DEPLOY_SSH_TARGET:-}"
  PROJECT_SLUG="${DEPLOY_PROJECT_SLUG:-oms-platform}"
  REMOTE_ROOT="${DEPLOY_REMOTE_ROOT:-}"
  BACKEND_RELATIVE="${DEPLOY_BACKEND_RELATIVE:-app/backend}"
  SITE_RELATIVE="${DEPLOY_SITE_RELATIVE:-app/site}"
  apply_vite_defaults
}

require_deploy_config() {
  local missing=()
  [ -n "$SSH_TARGET" ] || missing+=(DEPLOY_SSH_TARGET)
  [ -n "$REMOTE_ROOT" ] || missing+=(DEPLOY_REMOTE_ROOT)

  if [ "${#missing[@]}" -gt 0 ]; then
    echo "缺少部署配置：${missing[*]}" >&2
    echo "请在当前 shell 中导出变量，或在本地私有文件 scripts/deploy.local.env 中配置。" >&2
    exit 2
  fi
}

parse_args "$@"

if ! is_deploy_target "$DEPLOY_TARGET"; then
  usage
  exit 2
fi

require_deploy_config

if [ -n "$DEPLOY_PROFILE" ]; then
  skip "使用部署 profile：$DEPLOY_PROFILE"
fi

# ============================================================
# 1. Git: 提交本地变更 + 推送到 GitHub
# ============================================================
git_sync() {
  cd "$ROOT_DIR"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  branch="${branch:-public-clean-260601}"
  local target_branch="${DEPLOY_BRANCH:-$branch}"

  info "Git: 同步代码到 GitHub (${target_branch})"

  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    err "工作区存在未提交的变更，请先手动检查并提交后再部署（避免误提交敏感/无关文件）："
    git status --short
    exit 1
  else
    skip "没有待提交的变更"
  fi

  git push origin "HEAD:${target_branch}"
  ok "已推送到 origin/${target_branch}"
}

# ============================================================
# 2. 后端：上传源码 + Docker 构建重启
# ============================================================
deploy_backend() {
  info "部署后端"

  local remote_dir="$REMOTE_ROOT/$BACKEND_RELATIVE"
  local archive="/tmp/${PROJECT_SLUG}-backend-src.tgz"
  local remote_archive="/tmp/${PROJECT_SLUG}-backend-src.tgz"

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
    bak=\"${REMOTE_ROOT}/backups/backend-src-\$(date +%Y%m%d%H%M%S)\"
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

    for i in 1 2 3 4 5; do
      if docker compose exec -T backend npm run ensure-user-login-columns; then
        echo '  ✓ 用户登录字段已确认'
        break
      fi
      if [ \"\$i\" = 5 ]; then
        echo '  ✗ 用户登录字段迁移失败'
        exit 1
      fi
      sleep 3
    done

    for i in 1 2 3 4 5; do
      if docker compose exec -T backend npm run ensure-user-role-enum; then
        echo '  ✓ 用户角色枚举已确认'
        break
      fi
      if [ \"\$i\" = 5 ]; then
        echo '  ✗ 用户角色枚举迁移失败'
        exit 1
      fi
      sleep 3
    done
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
  local archive="/tmp/${PROJECT_SLUG}-${name}-dist.tgz"
  local remote_archive="/tmp/${PROJECT_SLUG}-${name}-dist.tgz"
  local remote_new="/tmp/${PROJECT_SLUG}-${name}-new"

  tar -C "$local_dist" -czf "$archive" .
  scp "$archive" "$SSH_TARGET:$remote_archive"

  ssh "$SSH_TARGET" "set -e
    mkdir -p '${REMOTE_ROOT}/backups'
    bak=\"${REMOTE_ROOT}/backups/${name}-site-\$(date +%Y%m%d%H%M%S)\"
    mkdir -p \"\$bak\"
    if [ -d '${remote_dir}' ]; then cp -a '${remote_dir}' \"\$bak/current\"; fi
    rm -rf '${remote_new}'
    mkdir -p '${remote_new}'
    tar -xzf '${remote_archive}' -C '${remote_new}'
    mkdir -p '${remote_dir}'
    find '${remote_dir}' -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a '${remote_new}'/. '${remote_dir}'/
    echo \"  ✓ 前端已部署，备份: \$bak\"
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
    deploy_frontend admin "$ROOT_DIR/frontend-admin/dist" "$REMOTE_ROOT/$SITE_RELATIVE/admin"
    deploy_frontend engineer "$ROOT_DIR/frontend-engineer/dist" "$REMOTE_ROOT/$SITE_RELATIVE/engineer"
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
    deploy_frontend admin "$ROOT_DIR/frontend-admin/dist" "$REMOTE_ROOT/$SITE_RELATIVE/admin"
    ok "管理端部署完成"
    ;;

  engineer|eng)
    git_sync
    build_engineer
    deploy_frontend engineer "$ROOT_DIR/frontend-engineer/dist" "$REMOTE_ROOT/$SITE_RELATIVE/engineer"
    ok "工程师端部署完成"
    ;;

  frontend|front)
    git_sync
    build_admin
    build_engineer
    deploy_frontend admin "$ROOT_DIR/frontend-admin/dist" "$REMOTE_ROOT/$SITE_RELATIVE/admin"
    deploy_frontend engineer "$ROOT_DIR/frontend-engineer/dist" "$REMOTE_ROOT/$SITE_RELATIVE/engineer"
    ok "前端全量部署完成"
    ;;

  *)
    usage
    exit 2
    ;;
esac
