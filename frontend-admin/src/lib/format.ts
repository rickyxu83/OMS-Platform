/**
 * 统计数字千分位格式化：1234567 -> "1,234,567"。
 * 非数字/空值兜底返回原值字符串，避免统计卡渲染出 NaN。
 */
export function formatCount(value: number | string | null | undefined): string {
  if (value == null || value === "") return "0";
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("zh-CN");
}

/**
 * 日期时间格式化：ISO 字符串 -> "YYYY-MM-DD HH:mm"（截到分钟）。
 * 空值返回 "-"，供考勤/服务记录等页面表格展示统一使用。
 */
export function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}
