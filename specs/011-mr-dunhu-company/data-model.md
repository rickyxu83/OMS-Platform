# 数据模型：MR 签单主体（company）

## 表变更

`mr_orders` 新增一列（`ensure*` 惰性迁移，遵循"先建新"原则，纯加列无破坏性）：

| 列        | 类型                   | 默认        | 说明                                                                           |
| --------- | ---------------------- | ----------- | ------------------------------------------------------------------------------ |
| `company` | `VARCHAR(16) NOT NULL` | `'dunyang'` | 签单主体：`dunyang`=敦阳（宁波）科技有限公司；`dunhu`=上海敦沪信息科技有限公司 |

- 存量行自动为 `dunyang`，无需回填脚本。
- 建议同步加索引非必需（列表筛选基数极低，暂不加）。

## 公司配置（代码常量，非数据表）

后端 MR constants 下发，前端不重复硬编码：

```js
companies: [
  {
    value: "dunyang",
    label: "敦阳（宁波）科技有限公司",
    shortLabel: "敦阳",
    enName: "STARK (NINGBO) TECHNOLOGY INC.",
    pricingModes: [1, 2, 3],
  },
  {
    value: "dunhu",
    label: "上海敦沪信息科技有限公司",
    shortLabel: "敦沪",
    enName: "SHANGHAI DUNHU INFORMATION TECHNOLOGY CO.,LTD.", // 2026-09-10 佬提供
    pricingModes: [3], // 仅"开明细"
  },
];
```

- logo：两家暂共用 `assets/dunyang-mark-trimmed.png`（佬 2026-09-10 拍板），后续提供敦沪 logo 时在常量加 `logo` 键即可。
- 内部承担方选项（WORK_OPTIONS）按 `shortLabel` 派生：敦阳单显示"敦阳"，敦沪单显示"敦沪"。

## 口径调整

- 内部供应商正则：`(敦阳|敦陽|stark|dunyang|敦沪|dunhu)`（前后端同步，含 quotation-parser / quotation-merge / quotation-layout-rules 的 own-company 判定）。
- 工程会签触发：装机/维护承担方包含**本公司内部承担方**（敦阳单看"敦阳"，敦沪单看"敦沪"）。

## 状态约束

- `company` 仅在 draft 状态可修改；提交签核后（assigned 及以后）后端拒绝变更。
- 敦沪单切换/提交时 `pricingMode` 强制为 3，后端 domain 层兜底校验。
