#!/bin/bash
# 设备型号 catalog fixture 一键部署脚本
# 用法: bash scripts/deploy-seed.sh
#
# 流程:
#   1. 把本地 catalog 数据文件推送到远程服务器
#   2. docker cp 进 backend 容器
#   3. 执行 catalog fixture sync（已存在的不会重复）
#   4. 打印最新设备总数

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV_FILE="$ROOT_DIR/scripts/deploy.local.env"

if [ -f "$LOCAL_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$LOCAL_ENV_FILE"
  set +a
fi

usage() {
  echo "用法: $0 [profile]"
  echo ""
  echo "profile: 可选，本地私有环境名。会读取 scripts/deploy.local.env 中的 DEPLOY_<PROFILE>_* 变量。"
  echo ""
  echo "必需环境变量:"
  echo "  DEPLOY_SSH_TARGET         SSH 主机别名或目标"
  echo "  DEPLOY_REMOTE_ROOT        远程项目根目录"
  echo "  DEPLOY_BACKEND_CONTAINER  后端容器名"
  echo ""
  echo "可选环境变量:"
  echo "  DEPLOY_BACKEND_RELATIVE   后端目录相对远程根目录的位置（默认：app/backend）"
  echo ""
}

apply_profile() {
  local profile="$1"
  local profile_key
  profile_key="$(printf '%s' "$profile" | tr '[:lower:]-' '[:upper:]_')"

  local suffix source_var
  for suffix in SSH_TARGET REMOTE_ROOT BACKEND_RELATIVE BACKEND_CONTAINER PROJECT_SLUG; do
    source_var="DEPLOY_${profile_key}_${suffix}"
    if [ -n "${!source_var:-}" ]; then
      export "DEPLOY_${suffix}=${!source_var}"
    fi
  done
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ -n "${1:-}" ]; then
  apply_profile "$1"
fi

SSH_TARGET="${DEPLOY_SSH_TARGET:-}"
REMOTE_ROOT="${DEPLOY_REMOTE_ROOT:-}"
BACKEND_RELATIVE="${DEPLOY_BACKEND_RELATIVE:-app/backend}"
CONTAINER="${DEPLOY_BACKEND_CONTAINER:-}"

missing=()
[ -n "$SSH_TARGET" ] || missing+=(DEPLOY_SSH_TARGET)
[ -n "$REMOTE_ROOT" ] || missing+=(DEPLOY_REMOTE_ROOT)
[ -n "$CONTAINER" ] || missing+=(DEPLOY_BACKEND_CONTAINER)

if [ "${#missing[@]}" -gt 0 ]; then
  echo "缺少部署配置：${missing[*]}" >&2
  echo "请在当前 shell 中导出变量，或在本地私有文件 scripts/deploy.local.env 中配置。" >&2
  exit 2
fi

CATALOG_RELATIVE="src/modules/device-model-catalog"
SEED_SRC="$ROOT_DIR/backend/$CATALOG_RELATIVE/fixture-data.js"
SEED_DST="$REMOTE_ROOT/$BACKEND_RELATIVE/$CATALOG_RELATIVE/fixture-data.js"
IMPORTED_SRC="$ROOT_DIR/backend/$CATALOG_RELATIVE/imported-fixture-data.js"
IMPORTED_DST="$REMOTE_ROOT/$BACKEND_RELATIVE/$CATALOG_RELATIVE/imported-fixture-data.js"

echo "=== 1/4 推送 catalog 数据文件到服务器 ==="
ssh "$SSH_TARGET" "mkdir -p '$REMOTE_ROOT/$BACKEND_RELATIVE/$CATALOG_RELATIVE'"
scp "$SEED_SRC" "$SSH_TARGET:$SEED_DST"
scp "$IMPORTED_SRC" "$SSH_TARGET:$IMPORTED_DST"

echo "=== 2/4 复制到容器 ==="
ssh "$SSH_TARGET" "docker cp $SEED_DST $CONTAINER:/app/src/modules/device-model-catalog/fixture-data.js"
ssh "$SSH_TARGET" "docker cp $IMPORTED_DST $CONTAINER:/app/src/modules/device-model-catalog/imported-fixture-data.js"

echo "=== 3/4 执行 catalog fixture sync ==="
ssh "$SSH_TARGET" "docker exec $CONTAINER node /app/src/modules/device-model-catalog/sync-cli.js --provider=fixture"

echo "=== 4/4 验证 suggest API ==="
echo "  已跳过自动登录验证；如需验证，请使用本地私有账号在服务端执行 suggest API 检查。"

echo ""
echo "✅ catalog fixture 部署完成！现在打开前端就能搜到新设备了。"
