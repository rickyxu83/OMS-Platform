# Spec: CustomerSignature 公共签署页整页视觉重做

## Type

Change

## Goal

将客户公共签署页（`/customer-signature/:token`）从"内部工具风格"整页重做为"正式对外公函风格"：品牌信头（dunyang logo + 公司名 + 文档标题）、文档化分区排版、签署完成独立视图、页脚版权/ICP。该页面是客户（外部人员）唯一可见的页面，代表公司门面。

## Scope

- 仅改动 `frontend-admin/src/pages/CustomerSignature.tsx`（单文件）
- 视觉与信息架构重做：信头、分区编号、完成态、页脚、错误态品牌化
- 复用现有资产：`dunyang-mark.png`、品牌色 `--primary: #582b8b`、SignatureCapture 组件

## Non-goals

- 不改后端：公开 API 的 GET/POST 契约、字段、错误文案全部保持现状
- 不改 `SignatureCapture` 共享组件（EngineerSignature 等也在用）
- 不动 `EngineerSignature.tsx`
- 不新增 i18n 键（该页为对外中文公函，维持简体中文硬编码现状）

## Behavior

### 未签署（signed=false）

1. 品牌信头：logo + "敦阳（宁波）科技有限公司 · OMS Platform 运维智管" + 文档大标题"客户服务确认函" + 待签署状态徽章
2. 文档主体为纸张卡片，分区编号呈现：服务信息（Case ID/客户/联系人/服务方式/类型/服务时间/有效期）→ 服务报告（问题事项/处理记录/服务结论/服务工程师）→ 签字确认（签署人输入 + 手写签名 + 清除/确认签署）
3. 提交成功后重新拉取 GET 获取权威 `signedAt`，切换到完成视图
4. 校验与错误提示行为不变：未签名提交提示"请先在签名区完成手写签名"；提交失败展示后端错误

### 已签署（signed=true，含打开即已签署）

1. 独立完成视图：大号成功标识 + "确认函已签署" + 签署时间（`signedAt`）+ 工单号/客户/签署人摘要
2. 不渲染签署表单；下方保留服务文档只读摘要供客户复核
3. 提交成功后停留在完成视图，显示"签署已提交，感谢确认"

### 异常态

- 加载中：品牌化 loading 卡片
- 链接不存在/已失效/已作废/已过期：品牌化错误页（logo + 错误说明 + 联系工程师提示），不渲染文档

### 页脚

所有状态底部统一：© 2026 敦阳（宁波）科技有限公司 + 浙ICP备2026045692号（与登录页文案一致）

## Contracts

- GET `/api/v1/customer-signature-requests/:token` → `{ item }`，字段沿用 `CustomerSignatureItem` 现有结构，新增消费 `signedAt`（已存在于响应，此前前端未用）
- POST 同路径 `{ signerName, customerSignature }` → `{ ok, serviceOrderId }`；成功后前端重新 GET 刷新 `signedAt`/`signed`
- 错误消息直接展示后端文案（链接失效/作废/过期）

## Invariants

- token 从 `useParams` 读取，`encodeURIComponent` 编码不变
- 签名 PNG dataURL 由 SignatureCapture onChange 产出，提交流程不变
- 桌面/移动均可用；移动端优先（客户多从手机邮件打开）

## Related files

- `frontend-admin/src/pages/CustomerSignature.tsx`（唯一改动文件）
- `frontend-admin/src/components/SignatureCapture.tsx`（复用，不改）
- `frontend-admin/public/dunyang-mark.png`（品牌资产）
- `frontend-admin/src/styles/theme.css`（`--primary: #582b8b`）
- `backend/src/modules/service-orders/controller.js`（契约来源，不改）

## Verification

1. `npx tsc --noEmit` 0 错误
2. `npm run test:mr` 通过
3. `npm run build` 通过
4. 部署 rn 测试服，远程 `admin/index.html` 资源 hash 与本地构建一致
5. 佬在测试服用真实签署链接验收（未签署流程 + 已签署完成页）

## Risks / unknowns

- `signedAt` 在 POST 响应中不存在，需二次 GET 获取（已在设计中覆盖）
- 签名图片不回显：payload 不含签名图 URL，完成页仅展示签署时间/签署人，不回显签名图像（有意为之，避免公开端点暴露签名文件）

## Evidence

- Confirmed by code: GET/POST payload 字段（controller.js `publicSignatureRequestPayload`/`submitCustomerSignatureRequest`）；现有页面结构（CustomerSignature.tsx）
- Confirmed by docs: 佬对重做方向的兴趣（logo、页脚、完成独立页）见 handoff 2026-08-17
- Inferred: 客户以移动端为主（邮件链接打开场景）
- Unknown: 无
