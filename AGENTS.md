# OMS（运维智管 / OMS-Platform）

单仓全栈项目：`backend/`（Node.js + Express + MySQL，Docker 隌署）、`frontend-admin/`（React 管理端，唯一前端入口）、`ocr/`、`scripts/`（部署与 seed 脚本）、`docs/`（部署与 agent 协作文档）、`specs/`（历史功能规格存档，spec-kit 已卸载）。

# 部署

## 隐私约定

本文件会随仓库提交，只保留公开的部署流程和权限约定。真实服务器、SSH 别名、远程目录、域名、Cookie 域名、CORS 白名单等信息放在本地私有文件中，不提交到 GitHub：

- `AGENTS.local.md`
- `docs/deploy.local.md`
- `scripts/deploy.local.env`
- 各端 `.env.local` / `.env.production` / `.env.production.local`

## 部署配置

部署脚本从环境变量或 `scripts/deploy.local.env` 读取真实配置。

| 变量 | 说明 |
|---|---|
| `DEPLOY_SSH_TARGET` | SSH 主机别名或目标 |
| `DEPLOY_REMOTE_ROOT` | 远程项目根目录 |
| `DEPLOY_BACKEND_RELATIVE` | 后端目录相对远程根目录的位置，默认 `app/backend` |
| `DEPLOY_SITE_RELATIVE` | 前端站点目录相对远程根目录的位置，默认 `app/site` |
| `DEPLOY_BACKEND_CONTAINER` | 后端容器名，仅 `deploy-seed.sh` 需要 |
| `CORS_ALLOWED_ORIGINS` | 后端允许的前端 Origin，逗号分隔 |
| `SESSION_COOKIE_DOMAIN` | 需要跨子域共享登录态时配置 |

如需多套环境，可在 `scripts/deploy.local.env` 中定义 `DEPLOY_<PROFILE>_*` 变量，然后使用 `bash scripts/deploy.sh <profile> <target>`。

## 部署目标约定

- **正式服务（生产）部署固定部署到腾讯云生产服务器**（部署脚本 profile 为 `tencent`），除用户明确指示外，不得部署到其他环境
- **测试服（profile 为 `rn`）部署源为当前 feature 分支**（`deploy.sh` 默认部署当前分支）：佬验收的就是待合并的那份代码；验收通过后尽快合 main，不在测试服长期挂未合并代码，下一次 rn 部署会自然覆盖
- 执行任何部署前，必须依次确认：① 目标 profile ② 目标环境当前运行版本，两者匹配后才可执行
- 不允许用 feature/实验分支直接覆盖**生产**：`deploy.sh` 对 `tencent` profile 有硬检查——当前分支必须是 main 且与 origin/main 同步，否则拒绝部署（可用 `DEPLOY_REQUIRE_MAIN=1` 给其他 profile 加同样检查）

## 发布工作流（2026-09-01 修订：验收闸门下移到生产部署，测试服从 feature 分支部署）

本项目为单人 + AI 开发：佬只看效果不看代码，全部 git/GitHub 操作由 AI 执行。**main 是唯一长期分支**；不再设集成分支或其它长期并行分支。核心原则：**佬在测试服验收的东西 = 最终发布的东西**。

`main` 已开启 GitHub 分支保护：**禁止直接 push、禁止 force push**（含管理员）。所有变更必须走 PR，任何提交都不能直接落在 main 上。

**一次发布的完整流程**：
1. 开发：改完提交到**短命分支**（`feat/<描述>` / `fix/<描述>` / `hotfix/<描述>`）；需要并行开发时开 worktree（`.worktrees/<feat>`），用完合回并清理
2. 验证：后端 `npm test` + `npm run check`；前端对应端 `npm run build`；admin 端 `npx tsc --noEmit`（保持 0 错误）
3. **先部署测试服**：在 feature 分支上直接 `bash scripts/deploy.sh rn <target>` → 佬在测试服验收；验收不通过就在原分支继续修、修完重新部署 rn
4. 验收通过后**合 main**：短命分支 → PR 合 main（一律走 PR，`gh pr merge --merge --delete-branch`）→ `git pull --ff-only`
5. **再部署生产**：回 main 同步后 `bash scripts/deploy.sh tencent <target>`（脚本硬检查必须在 main）→ 健康检查

**唯一验收闸门在生产部署**：佬在测试服验收通过 + 全量验证绿，二者缺一不可；AI 不得自行合 main，更不得自行部署生产。

**命令速查**：

```bash
# 1. 从 main 切新分支
git checkout main && git pull --ff-only origin main
git checkout -b fix/简短描述

# 2. 提交（中文，按下方提交规范）
git add <文件> && git commit -m "主题：要点"

# 3. 部署测试服给佬验收（在 feature 分支上执行，deploy.sh 会推送当前分支）
bash scripts/deploy.sh rn <target>

# 4. 验收通过：推送并建 PR（title/body 用中文）
git push -u origin <分支名>
gh pr create --base main --head <分支名> --title "主题" --body "说明"

# 5. 合并（--merge 生成合并提交，--delete-branch 删分支；gh 会自动切回原分支）
gh pr merge --merge --delete-branch

# 6. 回 main 同步后部署生产（tencent profile 有 main 分支硬检查）
git checkout main && git pull --ff-only origin main
bash scripts/deploy.sh tencent <target>
```

**注意事项：**
- 每次工作结束推送分支到 origin（**推送即备份**）；短命分支合完即删，不留长期分支
- 可见变更照旧升版本号（见提交规范）
- 不要在 main 上直接 commit 再 push：分支保护会拒绝，deploy.sh 也会因 push 失败中止
- `gh pr create` 报 GraphQL 错误多为 GitHub 服务短暂抽风，稍后重试；**务必确认 PR 已合并（`gh pr view <编号> --json state,mergedAt`）再继续部署**
- 分支合并后本地记得删掉已合并的本地分支（`git branch -d <分支名>`，远端已被 --delete-branch 删除）
- 部署前 `git status` 确认工作区干净（含 `.playwright-cli/` 等临时目录，需要先清理）

**生产热修**：从 main 切 `hotfix/<描述>` → 修复 → PR 合 main → 部署生产（可跳过测试服，但事后把修复在测试服验证一遍）。

**提前上线部分功能**：由 AI 评估拆分或权限暗启动方案，报佬决定后执行。

## 一键部署

```bash
# 默认环境（读取 DEPLOY_* 或 scripts/deploy.local.env）
bash scripts/deploy.sh all              # 全量：Git → 后端 → 前端
bash scripts/deploy.sh backend          # 仅后端
bash scripts/deploy.sh frontend         # 仅前端
bash scripts/deploy.sh admin            # 仅管理端

# 指定本地私有 profile
bash scripts/deploy.sh <profile> all
bash scripts/deploy.sh <profile> backend
bash scripts/deploy.sh <profile> front
bash scripts/deploy.sh <profile> admin
```

部署流程：上传后端源码 → Docker rebuild → 构建管理端前端 → 上传 dist。旧 `/engineer` 静态路径已废弃，工程师工单填写统一走管理端入口。

> **注意**：`deploy.sh` 会先把当前分支推送到 GitHub，但**不会自动提交**——工作区有未提交变更时脚本会列出文件并报错退出。部署前必须自行 `git commit`（这是有意为之，防止误提交敏感/无关文件）。

## 提交规范

- 提交信息用**中文**，一行主题概括动作与对象（如 `修复巡检计划列表 500：…`、`安全加固：…`），需要时正文用 `-` 列出要点
- 按逻辑单元拆分提交（安全修复 / 性能优化 / 死代码清理分开），不要混在一个大提交里
- 部署即发布：推送到 `origin/main` 的内容会被部署脚本带上生产，不要推半成品
- 每次可见功能、页面展示、交互或发布内容变更，都必须同步提升管理端版本号。至少更新 `frontend-admin/package.json`、`frontend-admin/package-lock.json` 顶层版本，以及 `frontend-admin/src/config/app.ts` 中 `APP_VERSION` 的 fallback，确保登录页和左下角"系统版本"会变化。仅文档、注释、部署脚本或后端内部不可见修复可不提升前端版本；如后端包本身发布语义变化，再同步更新 `backend/package.json` 与 `backend/package-lock.json`。

## 部署前后检查（AI 执行部署时必做）

**部署前：**

1. `git status` 干净、改动已按逻辑提交
2. 后端改动跑 `npm run check`（语法检查）；前端改动跑对应端 `npm run build`，admin 端另跑 `npx tsc --noEmit`（当前保持 0 错误）
3. 涉及管理端可见改动时，确认版本号已随提交更新：`frontend-admin/package.json`、`frontend-admin/package-lock.json`、`frontend-admin/src/config/app.ts` 三处一致
4. 涉及 `backend/src/config/env.js` 启动门禁的改动：先确认服务器 compose 已设 `NODE_ENV=production` 和 `JWT_SECRET`，否则容器会启动失败（这是有意的安全门禁）

**部署后（deploy.sh 自身没有健康检查）：**

```bash
# 在服务器上验证（SSH 别名见 scripts/deploy.local.env）
docker ps --filter name=backend --format '{{.Status}}'                      # 应为 Up
docker logs --tail 20 <backend容器名>                                        # 无报错、监听日志正常
docker exec <backend容器名> wget -qO- http://127.0.0.1:3000/api/v1/health    # {"ok":true}
```

**排查生产 500：** `errorHandler` 会对 500 打 `console.error`（含请求路径与堆栈），直接 `docker logs <backend容器名>` 查看。

## 基础设施约定

- 生产前置反向代理为**单层 Caddy**，后端 `app.set('trust proxy', 1)` 与之匹配；若以后在前面加 SLB/CDN 层，需同步调整该值，否则限流按错误 IP 计数
- 数据库结构变更走代码内的 `ensure*` 惰性迁移函数（请求时执行 `CREATE TABLE IF NOT EXISTS` / 条件 `ALTER`），无独立迁移工具。写这类函数注意：`query()` 直接返回 rows，`connection.execute()` 返回 `[rows, fields]`，两种形态不要混用（曾导致巡检计划 500）
- 删除被外键依赖的索引前，先补一个能支撑外键的替代索引，并遵循"先建新、后删旧"顺序

## 目录结构差异

不同环境的目录结构通过 `DEPLOY_BACKEND_RELATIVE` 和 `DEPLOY_SITE_RELATIVE` 变量适配，不在公开文档中记录真实路径。

## 权限说明

| 角色 | 管理端 |
|---|---|
| `engineer`（工程师） | 使用工单填写入口，接口按本人过滤；可删除派给自己的 draft/assigned/rejected 工单、可作废本人已结案工单（产品裁决 2026-07-22：有意设计，勿当越权修复） |
| `engineering_supervisor`（工程主管） | 可使用工单填写入口；派单管理可见全部工单 |
| `operations_director`（运营负责人） | 可见全部工单 |
| `administrative_supervisor`（行政主管） | 管理端业务数据只读，不可派单/审批/编辑/删除/改设置 |
| `admin`（管理员） | 全部权限 |

工单填写入口请求本人相关数据时带 `?mine=1`，后端据此过滤 `effectiveEngineerId`。

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default mattpocock/skills triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context domain documentation layout. See `docs/agents/domain.md`.

## Agent 工作流规则（2026-08-10 起试用）

1. **先判断自己身份再决定流程**：动手前先确认主会话模型（是否支持视觉、是否付费）。不要机械套用"主会话 + 子代理"流水线。
2. **不做本地 mock/模拟验证**：代码改动跑完项目自带测试（`npm run test:mr`）+ `npx tsc --noEmit` + `npm run build` 通过后，直接部署测试服（profile 见本地私有 `scripts/deploy.local.env`），由用户自己上去验收。禁止为验证视觉效果做 headless Chrome mock 截屏、本地 PDF 模拟等耗时环节。
3. **子代理使用原则**：
   - 主会话是免费模型（如 deepseek-v4-flash-free）：能自己干的活（改代码、跑测试、提交、部署、git/SSH 操作）一律自己干，不派子代理。
   - `executor` 仅在主会话是付费模型（如 k3）且想把重复性 grunt work 甩给免费子代理时才派。
   - `vision` 仅在主会话无视觉且必须看图时才派，一次调用合并所有问题。
   - `reviewer` 仅在涉及部署/打印/计费等高风险改动、且主会话是付费模型时才派。
4. **工具调用连续失败熔断（2026-08-23 起，基于 47 连跪教训）**：遵循全局 `~/.pi/agent/AGENTS.md` 的熔断铁律（2026-08-24 实锤版，唯一权威版本）——同一工具调用连续失败 2~3 次停止原样重试；`do_not_retry_same_call: true` 是指令不是话术提示；结构性错误逐字段对比实际 JSON 与工具要求后再改发，确认是模型能力缺陷时直接换策略（换工具类型/换工作流）或提醒佬换模型。每次失败后在复盘说明中附上**实际发出的 JSON 片段**，证明看到的是真实输出而非空谈。
5. **大功能先写轻量 spec（2026-08-31 起）**：满足任一"难回退"标准的改动——动数据表结构、动认证/权限、动计费或对外承诺的行为、跨三个以上模块、做错要回滚代价高——动手前先写轻量规格存到 `specs/<编号>-<名称>/`（至少 `spec.md`，涉及数据结构时加 `data-model.md`），经佬确认后再写代码；小/中型改动按现有流程直接做，不做 spec。

