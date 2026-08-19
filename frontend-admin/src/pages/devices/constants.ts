/**
 * Devices 页常量：导入模板规格、维保/状态标签映射、表格布局类、型号规范化任务参数。
 */
import type { MaintenanceImportItem } from "./types";

export const IMPORT_TEMPLATE_MAX_ROWS = 1000;

export const IMPORT_TEMPLATE_OPTIONS_SHEET = "_import_options";

export const IMPORT_TEMPLATE_MAINTENANCE_TYPES = ["待确认", "无维保", "原厂维保", "我方维保"];

export const MAINTENANCE_IMPORT_STATUS_LABELS: Record<MaintenanceImportItem["status"], string> = {
  updatable: "可更新",
  unchanged: "无变化",
  not_found: "未找到",
  conflict: "类型冲突",
  invalid: "数据异常",
  duplicate: "SN 重复",
  superseded: "较早服务期",
};

export const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  pending_confirmation: "待确认",
  none: "无维保",
  vendor: "原厂维保",
  our: "我方维保",
  original_manufacturer: "原厂维保",
  our_maintenance: "我方维保",
};

export const MAINTENANCE_TYPE_BADGE: Record<string, "default" | "secondary" | "info" | "purple"> = {
  pending_confirmation: "default",
  none: "secondary",
  vendor: "info",
  our: "purple",
  original_manufacturer: "info",
  our_maintenance: "purple",
};

export const MAINTENANCE_TYPE_HELP = "待确认表示销售仍需确认是否纳入维保，会触发维保资料提醒；无维保表示明确不纳入维保，不会触发维保资料提醒；我方维保和原厂维保需填写维保截止日期。";

export const MAINTENANCE_TYPE_ALIASES: Record<string, string> = {
  vendor: "original_manufacturer",
  our: "our_maintenance",
};

export const DEVICE_STATUS_LABELS: Record<string, string> = {
  active: "在用",
  inactive: "停用",
  maintenance: "维保中",
  scrapped: "已报废",
};

export const DEVICE_STATUS_BADGE: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
  active: "success",
  inactive: "secondary",
  maintenance: "warning",
  scrapped: "destructive",
};

export const DEVICE_TABLE_GRID = "md:grid-cols-[32px_28px_minmax(220px,1.2fr)_minmax(190px,1fr)_92px_118px_minmax(180px,0.95fr)_86px_156px]";

export const DEVICE_TABLE_READONLY_GRID = "md:grid-cols-[28px_minmax(240px,1.2fr)_minmax(200px,1fr)_92px_118px_minmax(200px,1fr)_86px]";

export const DEVICE_BADGE_CLASS = "inline-flex h-6 min-w-[74px] justify-center px-2";

export const DEVICE_STATUS_BADGE_CLASS = "inline-flex h-6 min-w-[56px] justify-center px-2";


export const ATTACHMENT_PURPOSE_LABELS: Record<string, string> = {
  general: "其他",
  inspection_document: "巡检文档",
  support_config: "配置支持",
  site_photo: "现场照片",
  screenshot_log: "截图日志",
};

export const ATTACHMENT_FORMAT_LABELS: Record<string, string> = {
  document: "文档",
  image: "图片",
  other: "其他",
};

export const MODEL_NORMALIZATION_TOAST_POSITION = "bottom-right" as const;

export const MODEL_NORMALIZATION_JOB_POLL_MS = 2000;

export const MODEL_NORMALIZATION_JOB_TIMEOUT_MS = 90000;
