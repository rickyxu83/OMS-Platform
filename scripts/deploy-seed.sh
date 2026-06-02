#!/bin/bash
# 设备型号 seed 一键部署脚本
# 用法: bash scripts/deploy-seed.sh
#
# 流程:
#   1. 把本地 seed.js 推送到远程服务器
#   2. docker cp 进 backend 容器
#   3. 执行 seed（INSERT IGNORE，已存在的不会重复）
#   4. 打印最新设备总数

set -e

SSH_TARGET="${DEPLOY_SSH_TARGET:-aliyun}"
REMOTE_ROOT="${DEPLOY_REMOTE_ROOT:-/root/service-sheet-aliyun}"
SEED_SRC="backend/src/modules/device-models/seed.js"
SEED_DST="$REMOTE_ROOT/app/backend/src/modules/device-models/seed.js"
CONTAINER="service-sheet-aliyun-backend"

echo "=== 1/4 推送 seed.js 到服务器 ==="
scp "$SEED_SRC" "$SSH_TARGET:$SEED_DST"

echo "=== 2/4 复制到容器 ==="
ssh "$SSH_TARGET" "docker cp $SEED_DST $CONTAINER:/app/src/modules/device-models/seed.js"

echo "=== 3/4 执行 seed ==="
ssh "$SSH_TARGET" "docker exec $CONTAINER node /app/src/modules/device-models/seed.js"

echo "=== 4/4 验证 suggest API ==="
ssh "$SSH_TARGET" '
TOKEN=$(docker exec -i '$CONTAINER' sh -c "wget -qO- --post-data='\''{\"username\":\"admin\",\"password\":\"admin123456\"}'\'' --header='\''Content-Type: application/json'\'' http://127.0.0.1:3000/api/v1/auth/login 2>/dev/null" | sed "s/.*\"token\":\"\([^\"]*\).*/\1/")
RESULT=$(docker exec -i '$CONTAINER' sh -c "wget -qO- '\''http://127.0.0.1:3000/api/v1/device-models/suggest?q=hp%20dl380'\'' --header='\''Authorization: Bearer $TOKEN'\'' 2>/dev/null")
COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('\''items'\'',[])))" 2>/dev/null)
echo "  搜索 hp dl380 返回 $COUNT 条结果 ✓"
'

echo ""
echo "✅ seed 部署完成！现在打开前端就能搜到新设备了。"
