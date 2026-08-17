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
- **禁止把 main / 正式版本部署到测试服等其他环境**：测试服可能承载其他分支的构建物（如未合并的功能模块），用 main 覆盖会破坏测试服现状（曾导致测试服功能入口被覆盖丢失）
- 执行任何部署前，必须依次确认：① 目标 profile ② 当前分支 ③ 目标环境当前运行版本，三者匹配后才可执行
- 测试服等其他环境仅用于**用户明确指定的实验分支**验证，不得擅自用 main 或正式版本覆盖

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

## 提交与发布流程（main 已开启分支保护）

`main` 已开启 GitHub 分支保护：**禁止直接 push、禁止 force push**（含管理员）。所有变更必须走 PR，任何提交都不能直接落在 main 上。

```bash
# 1. 从 main 切新分支
git checkout main && git pull --ff-only origin main
git checkout -b fix/简短描述

# 2. 提交（中文，按上方提交规范）
git add <文件> && git commit -m "主题：要点"

# 3. 推送并建 PR（title/body 用中文）
git push -u origin <分支名>
gh pr create --base main --head <分支名> --title "主题" --body "说明"

# 4. 合并（--merge 生成合并提交，--delete-branch 删分支）
gh pr merge --merge --delete-branch

# 5. 回到 main 同步
# gh pr merge 会自动切回原分支；若在分支上则手动切回：
git checkout main && git pull --ff-only origin main

# 6. 最后才执行部署（deploy.sh 会先 push main，此时为空操作，正常通过）
bash scripts/deploy.sh <profile> <target>
```

**注意：**
- 不要在 main 上直接 commit 再 push：分支保护会拒绝，deploy.sh 也会因 push 失败中止
- `gh pr create` 报 GraphQL 错误多为 GitHub 服务短暂抽风，稍后重试；**务必确认 PR 已合并（`gh pr view <编号> --json state,mergedAt`）再继续部署**
- 分支合并后本地记得删掉已合并的本地分支（`git branch -d <分支名>`，远端已被 --delete-branch 删除）
- 部署前 `git status` 确认工作区干净（含 `.playwright-cli/` 等临时目录，需要先清理）

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

## 指挥官工作流：herdr 多 agent 并行（2026-08-12 起试用，已废弃）

> **已弃用。** 多 agent 模式增加了并行复杂度但未带来足够的实际收益。恢复原有规则：主会话自己干活，必要时用 subagent 工具派子代理。

<details>
<summary>原约定（保留备查）</summary>

适用场景：用户一次提多个需求、或明确要“指挥官/并行”模式时启用。指挥官模式下主会话保持空闲随时响应船长：项目代码改动一律派小弟执行，主会话只做调度、验收与合并，不亲手修改项目代码（文档与流程约定除外）。

**角色分工**：
- 用户（船长）：只提需求、验收，不看代码、不解冲突。
- 主会话（指挥官）：唯一对接口。负责拆解需求、判断并行/串行、派发与回收小弟、统一合并与解冲突、跑检查、提交、部署、向船长汇报。
- 小弟（执行者）：主会话用 herdr 在**新 tab** 里起的 `pi` agent，在隔离 worktree 里干活，不直接与船长对话。

**开工前**：
1. 先 `git status` + `herdr agent list` 扫一遍，看是否有其他会话正在改的文件，避免撞车；发现别的会话占用某文件时，串行安排或先与船长确认。
2. 把需求分类：
   - **ship（交付型）**：要改代码提交的 → 走 worktree 隔离流程。
   - **scout（侦察型）**：只调研出报告不改代码的 → 主会话自己查或派一个小弟查，出报告即可，不必开 worktree。

**ship 任务流程（防并行冲突的核心）**：
1. `git worktree add <path> -b <branch>` 给任务开独立工作区与分支（如 `.worktrees/feat-x` / `feat-x`）。
2. `herdr tab create --cwd <worktree-path> --label "<任务>" --no-focus` 开新 tab（**不切分 pane**），在其中 `herdr agent start <name> --kind pi --pane <pane-id>` 起小弟。
3. 派任务：`herdr agent prompt <name> "<完整任务描述：仓库/分支/要改什么/验收标准/不要碰什么>"` —— **一律不加 `--wait`**，发了就走，主会话继续干别的或先回报船长；不空等。任务描述末尾固定带上完工通知指令：`完成后执行 herdr notification show "【完成】<任务名>" --body "<一句话结果>" --sound done 并汇报`，以便船长收到桌面提醒。
4. 收结果：船长看到通知或主会话需要时 `herdr agent wait/read` 拿结果（此时多已完成，秒回不卡）。
5. 验收与合并：主会话检查小弟产出（测试/build），`git merge` 回工作分支，**冲突由主会话统一解**，不让船长碰。
6. 收尾：`git worktree remove <path>` + `herdr tab close <tab-id>`，删临时分支，保持工作区干净。

**并行/串行判断**：改**不同文件/模块**的 ship 任务可并行（各自一个 worktree）；改**同一文件**的任务一律串行（一个合并完再开下一个），从源头杜绝冲突。

**小弟命名**：按任务起语义名，小写字母/数字/连字符、≤32 字符且在 live agents 唯一（如 `ship-附件区`、`scout-签核`、`verify-构建`），仅作 herdr 寻址与展示；小弟具体干什么以任务 prompt 为准，无需另设固定人设。

**纪律**：
- 主会话是唯一的合并/提交/部署出口，小弟不直接提交到主分支、不部署。
- 不关闭非自己创建的 tab/pane/agent；不动他人的 worktree 与 stash。
- 所有给主会话/小弟的 herdr 命令以 `herdr --help` 与 `herdr --skill` 的当前语法为准，ID 从 JSON 返回里解析，不猜。
</details>
