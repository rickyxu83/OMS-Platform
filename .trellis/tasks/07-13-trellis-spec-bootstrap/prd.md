# Trellis 规范最小引导

## Goal

为下一项功能开发建立一套最小且可执行的 Trellis 规范。规范必须来自仓库当前实现，而不是通用偏好，覆盖 API 路由、鉴权、日志、测试和管理端表单的既有模式。

## Confirmed Facts

- 仓库由 `backend`（Node.js + Express + MySQL）和 `frontend-admin`（React + Vite）组成，见 `README.md`。
- 当前 `.trellis/spec/` 已有 guides、backend 和 frontend 索引；本任务应先检查并以现有结构为准。
- 用户要求不修改应用代码，不进行重构。
- 当前 backend 与 frontend 规范均为待填写模板；现有通用 thinking guides 不作为应用约定来源，见 `.trellis/spec/backend/index.md`、`.trellis/spec/frontend/index.md` 与 `.trellis/spec/guides/index.md`。
- 已将代码调研结论固化在 `research/pattern-evidence.md`，其中包含每个候选规则的源码路径与边界说明。

## Requirements

- 逐项调研 API 路由、鉴权检查、日志、测试与前端表单，并记录可复查的代码路径。
- 仅为在当前代码中找到具体示例的模式写入或更新 Trellis 规范。
- 每条规范规则都必须引用至少一个具体文件路径；无法证实的模式不写为规则。
- 规范保持最小化，服务于下一项功能任务，不扩展为全面架构重写或通用最佳实践文档。
- 不修改 `backend/`、`frontend-admin/` 或其他应用运行时代码。
- 后端规范只覆盖当前可证实的路由装配、认证与授权、错误/审计/后台日志和现有测试执行方式。
- 前端规范只覆盖当前可证实的受控表单、共享 UI primitives、API 提交、错误反馈与现有质量门禁。

## Acceptance Criteria

- [ ] API 路由、鉴权、日志、测试与前端表单各有至少一个已核实的代码示例路径。
- [ ] 新增或更新的 `.trellis/spec/` 内容中的每条规范规则均含具体文件路径引用。
- [ ] 规范只陈述当前代码示例直接支持的约定，未将推测或偏好写成硬规则。
- [ ] Git diff 仅包含 `.trellis/` 任务与规范文档，不含应用代码改动。
- [ ] 规划审阅确认最小规范文件集后，才启动任务并开始写入 `.trellis/spec/`。

## Out of Scope

- 修改应用代码、配置、依赖、测试行为或 UI。
- 设计新的路由、鉴权、日志、测试或表单架构。
- 补齐仓库中没有代码证据的规范主题。
