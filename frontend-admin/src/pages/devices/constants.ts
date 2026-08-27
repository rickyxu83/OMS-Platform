/**
 * Devices 页常量：导入模板规格、维保/状态标签映射、表格布局类、型号规范化任务参数。
 */
import type { MaintenanceImportItem } from "./types";
import { CircleCheck, CircleMinus, CircleSlash, Hourglass, PauseCircle, ShieldCheck, Wrench, type LucideIcon } from "lucide-react";

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

// —— 维保类型/设备状态 Badge → 图标+文字指示器（与工单/MR/客户列表同语言）——
export const MAINTENANCE_TYPE_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  pending_confirmation: { icon: Hourglass, color: "text-amber-600" },
  none: { icon: CircleMinus, color: "text-slate-400" },
  vendor: { icon: ShieldCheck, color: "text-sky-600" },
  original_manufacturer: { icon: ShieldCheck, color: "text-sky-600" },
  our: { icon: ShieldCheck, color: "text-purple-600" },
  our_maintenance: { icon: ShieldCheck, color: "text-purple-600" },
};

export const DEVICE_STATUS_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  active: { icon: CircleCheck, color: "text-emerald-600" },
  inactive: { icon: PauseCircle, color: "text-slate-400" },
  maintenance: { icon: Wrench, color: "text-amber-600" },
  scrapped: { icon: CircleSlash, color: "text-rose-500" },
};


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
