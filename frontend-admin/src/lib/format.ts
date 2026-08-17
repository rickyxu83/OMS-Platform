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
