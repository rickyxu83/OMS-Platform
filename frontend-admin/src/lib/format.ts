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
export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

/**
 * 日期格式化：ISO 字符串 -> "YYYY-MM-DD"。空值返回 "-"。
 */
export function formatDate(value?: string | null) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

/**
 * 日期范围："YYYY-MM-DD HH:mm 至 YYYY-MM-DD HH:mm"；单边缺省显示另一边，全空返回 "-"。
 */
export function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "-";
  if (start && end) return `${formatDateTime(start)} 至 ${formatDateTime(end)}`;
  return formatDateTime(start || end);
}

/**
 * 文件大小：字节数 -> "512 B" / "2.5 KB" / "3.1 MB"；空值/0 返回 "-"。
 */
export function formatFileSize(value?: number) {
  const size = Number(value || 0);
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Date 对象 -> "YYYY-MM-DD"（本地时区），供按天分组的统计逻辑使用。
 */
export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
