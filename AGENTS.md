# 部署

## 服务器

| 服务器 | SSH 目标 | 远程目录 | 域名 |
|---|---|---|---|
| 阿里云 | `aliyun` | `/root/service-sheet-aliyun` | eng-aliyun.tinypanel.de / admin-aliyun.tinypanel.de |
| 腾讯云 | `tencent` | `/root/service-sheet-stark` | eng.starkgrp.com / admin.starkgrp.com |

## 一键部署

```bash
# 阿里云（默认）
bash scripts/deploy.sh all              # 全量：Git → 后端 → 前端
bash scripts/deploy.sh backend          # 仅后端
bash scripts/deploy.sh frontend         # 仅前端

# 腾讯云 stark
bash scripts/deploy.sh stark            # 全量
bash scripts/deploy.sh stark backend    # 仅后端
bash scripts/deploy.sh stark front      # 仅前端
bash scripts/deploy.sh stark admin      # 仅管理端
bash scripts/deploy.sh stark eng        # 仅工程师端
```

部署流程：`git commit + push` → 上传后端源码 → Docker rebuild → 构建前端 → 上传 dist。

## 目录结构差异

阿里云后端源码在 `$REMOTE_ROOT/app/backend/`，腾讯云直接在 `$REMOTE_ROOT/backend/`。前端同理。`deploy.sh` 通过 `BACKEND_RELATIVE` 和 `SITE_RELATIVE` 变量适配。

## 权限说明

| 角色 | 工程师端 | 管理端 |
|---|---|---|
| `engineer`（工程师） | 只看自己工单 | 不能登录 |
| `engineering_supervisor`（工程主管） | 传 `mine=1` → 只看自己工单 | 可见全部工单（派单管理） |
| `supervisor`（主管） | 不能登录 | 可见全部工单 |
| `admin`（管理员） | 不能登录 | 全部权限 |

工程师端 `TasksView` 请求时带 `?mine=1`，后端据此过滤 `effectiveEngineerId`。
