# OMS Platform 使用说明

<p align="right">
  <a href="./user-guide.en.md">🌐 English</a> ·
  <strong>中文</strong> ·
  <a href="./user-guide.zh-CN.md">🇨🇳 简体中文</a> ·
  <a href="./user-guide.zh-TW.md">🌏 繁體中文</a>
</p>

这是 OMS Platform 的通用中文使用说明。若需要指定字形版本，请查看 [简体中文](./user-guide.zh-CN.md) 或 [繁體中文](./user-guide.zh-TW.md)。

## 快速入口

- 统一登录页：`https://<admin-domain>/login`
- 管理工作台：用于工单、客户资产、设备、巡检、月报、用户和审计管理。
- 工程师工作台：用于查看任务、填写服务表、管理草稿、查看月报和维护个人签名。

## 基本流程

1. 使用统一登录页登录。
2. 根据账号权限选择管理工作台或工程师工作台。
3. 管理人员在管理端创建、派发和跟踪工单。
4. 工程师在工程师端查看任务并填写服务表。
5. 服务表提交后，可用于分享、导出和月报统计。

## 权限摘要

| 角色 | 工程师端 | 管理端 |
|---|---|---|
| `engineer` | 只看自己的工单 | 不能登录 |
| `engineering_supervisor` | 可只看自己的工单 | 可见全部工单 |
| `supervisor` | 不能登录 | 可见全部工单 |
| `admin` | 不能登录 | 全部权限 |

## 日常操作建议

- 管理人员应及时维护客户、设备和联系人信息，避免工程师填写服务表时缺少基础资料。
- 工程师应优先从任务进入服务表，确保服务记录与工单关联。
- 网络不稳定时可先保存草稿，确认内容完整后再提交。
- 上传附件前请确认文件不包含无关隐私信息。

## 隐私提醒

公开截图或文档前，请移除或打码客户名称、手机号、地址、工单号、设备序列号、签名、Token、Cookie、API Key 和 `.env` 内容。

## 详细版本

- [English user guide](./user-guide.en.md)
- [简体中文使用说明](./user-guide.zh-CN.md)
- [繁體中文使用說明](./user-guide.zh-TW.md)
