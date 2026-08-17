/**
 * ServiceReport 页常量：选项、徽章变体、表单皮肤、附件规格、Markdown 工具。
 */
import {
  Bold, Braces, Camera, ClipboardCheck, ClipboardPenLine, Code2, FileText,
  HardDrive, Heading2, Link, List, ListOrdered, MonitorCog, Package, Upload, Wrench,
} from "lucide-react";
import type { AttachmentPurpose, BadgeVariant, MarkdownAction, ServiceMode, ServiceModuleOption } from "./types";

export const MODE_OPTIONS: Array<{ value: ServiceMode; label: string; description: string; icon: typeof Wrench }> = [
  { value: "onsite", label: "现场", description: "客户现场服务、设备安装、技术处理与巡检", icon: Wrench },
  { value: "remote", label: "远程", description: "远程连接、故障排查与协同支持", icon: MonitorCog },
  { value: "office", label: "内勤", description: "方案准备、文档整理与内部协作", icon: ClipboardPenLine },
];

export const SERVICE_TYPE_OPTIONS = [
  { value: "repair", label: "技术处理" },
  { value: "install", label: "安装" },
  { value: "maintain", label: "调优" },
  { value: "inspect", label: "巡检" },
  { value: "training", label: "培训" },
  { value: "other", label: "其他" },
];

export const RESULT_OPTIONS = [
  { value: "resolved", label: "已完成" },
  { value: "unresolved", label: "未完成" },
  { value: "follow_up_required", label: "需后续跟进" },
];
export const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  draft: "draft",
  assigned: "warning",
  in_progress: "purple",
  pending_confirmation: "warning",
  awaiting_customer_signature: "warning",
  submitted: "success",
  approved: "success",
  archived: "secondary",
  cancelled: "destructive",
  completed: "success",
  rejected: "destructive",
};
export const TYPE_BADGE_VARIANT: Record<string, BadgeVariant> = {
  install: "success",
  repair: "warning",
  maintain: "info",
  inspect: "purple",
  training: "info",
  remote: "info",
  other: "secondary",
};
export const MODE_BADGE_VARIANT: Record<string, BadgeVariant> = {
  onsite: "success",
  remote: "info",
  office: "purple",
};
export const PRIORITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "normal", label: "普通" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];
export const ONSITE_SERVICE_MODULE_OPTIONS: ServiceModuleOption[] = [
  { value: "repair", label: "技术处理", description: "故障排查、配置修改、调整优化等。", descriptionItems: ["目标设备", "配置/日志文件"], icon: Wrench },
  { value: "install", label: "安装", description: "记录新设备或硬件部件的安装交付信息", descriptionItems: ["新设备安装", "硬件部件安装"], icon: HardDrive },
  { value: "inspect", label: "巡检", description: "记录巡检结果，并上传巡检文档与现场照片", descriptionItems: ["巡检文档", "现场照片"], icon: ClipboardCheck },
  { value: "replacement", label: "备件更换", description: "记录故障备件拆下、换上及相关明细", descriptionItems: ["换下备件", "换上备件"], icon: Package },
];
export const REMOTE_SERVICE_MODULE_OPTIONS: ServiceModuleOption[] = [
  { value: "repair", label: "远程技术支持", description: "记录远程连接、故障定位、配置调整与支持过程", descriptionItems: ["目标系统", "截图/日志"], icon: MonitorCog },
  { value: "replacement", label: "备件更换远程协助", description: "记录远程确认的备件更换过程", descriptionItems: ["备件明细", "截图/日志"], icon: Package },
];
export const OFFICE_SERVICE_MODULE_OPTIONS: ServiceModuleOption[] = [
  { value: "office_materials", label: "方案与资料", description: "制作方案、配置文档、操作说明与交付资料", descriptionItems: ["关联设备", "上传文档"], icon: FileText },
];
export const PART_ACTION_OPTIONS = [
  { value: "replacement", label: "备件更换" },
  { value: "installation", label: "硬件部件安装" },
  { value: "general", label: "部件记录" },
];
export const ATTACHMENT_PURPOSES: Record<AttachmentPurpose, { label: string; icon: typeof Upload }> = {
  support_config: { label: "配置与支持文件", icon: FileText },
  site_photo: { label: "现场照片", icon: Camera },
  screenshot_log: { label: "截图/日志文件", icon: Upload },
  inspection_document: { label: "巡检文档", icon: ClipboardCheck },
  office_document: { label: "方案与资料附件", icon: FileText },
};
export const REPORT_ORDER_LIST_WIDTH = "lg:min-w-[1180px]";
export const REPORT_ORDER_LIST_GRID = "lg:grid-cols-[minmax(180px,1fr)_minmax(150px,0.8fr)_minmax(220px,1.2fr)_minmax(120px,0.7fr)_160px_90px_176px]";
export const REPORT_ORDER_HEADER_CLASS = "hidden w-full rounded-md border border-border/70 bg-muted/70 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur lg:grid lg:items-center lg:gap-3";
export const REPORT_ORDER_STICKY_HEADER_CLASS = `${REPORT_ORDER_HEADER_CLASS} sticky top-0 z-10`;
export const FORM_SKIN = [
  "[&_[data-slot=input]]:h-[42px]",
  "[&_[data-slot=input]]:rounded-lg",
  "[&_[data-slot=input]]:border-border",
  "[&_[data-slot=input]]:bg-input-background",
  "[&_[data-slot=input]]:text-[16px]",
  "sm:[&_[data-slot=input]]:text-[13px]",
  "[&_[data-slot=input]]:shadow-none",
  "[&_[data-slot=input]]:hover:border-primary/40",
  "[&_[data-slot=input]]:hover:bg-input-background",
  "[&_[data-slot=input]]:focus-visible:border-primary",
  "[&_[data-slot=input]]:focus-visible:bg-background",
  "[&_[data-slot=input]]:focus-visible:ring-primary/20",
  "[&_[data-slot=select-trigger]]:h-[42px]",
  "[&_[data-slot=select-trigger]]:rounded-lg",
  "[&_[data-slot=select-trigger]]:border-border",
  "[&_[data-slot=select-trigger]]:bg-input-background",
  "[&_[data-slot=select-trigger]]:text-[16px]",
  "sm:[&_[data-slot=select-trigger]]:text-[13px]",
  "[&_[data-slot=select-trigger]]:shadow-none",
  "[&_[data-slot=select-trigger]]:hover:border-primary/40",
  "[&_[data-slot=select-trigger]]:hover:bg-input-background",
  "[&_[data-slot=select-trigger]]:focus-visible:border-primary",
  "[&_[data-slot=select-trigger]]:focus-visible:bg-background",
  "[&_[data-slot=select-trigger]]:focus-visible:ring-primary/20",
  "[&_[data-slot=button]]:min-h-[42px]",
  "[&_[data-slot=button]]:rounded-lg",
  "[&_[data-slot=button][aria-label]]:min-w-[42px]",
  "[&_[data-slot=textarea]]:rounded-lg",
  "[&_[data-slot=textarea]]:border-border",
  "[&_[data-slot=textarea]]:bg-input-background",
  "[&_[data-slot=textarea]]:text-[16px]",
  "sm:[&_[data-slot=textarea]]:text-[13px]",
  "[&_[data-slot=textarea]]:shadow-none",
  "[&_[data-slot=textarea]]:hover:border-primary/40",
  "[&_[data-slot=textarea]]:hover:bg-input-background",
  "[&_[data-slot=textarea]]:focus-visible:border-primary",
  "[&_[data-slot=textarea]]:focus-visible:bg-background",
  "[&_[data-slot=textarea]]:focus-visible:ring-primary/20",
].join(" ");
export const INSPECTION_DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.log,.cfg,.conf,.ini,.json,.xml,.yaml,.yml,.jpg,.jpeg,.png,.webp,.heic,.heif,.zip";
export const INSPECTION_DOCUMENT_EXTENSIONS = new Set(INSPECTION_DOCUMENT_ACCEPT.split(","));
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const COMPRESSIBLE_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const COMPRESSIBLE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const IMAGE_COMPRESSION_MAX_EDGE = 1920;
export const IMAGE_COMPRESSION_QUALITY = 0.8;

export const CUSTOMER_INDEX_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

export const MARKDOWN_TOOLS = [
  { action: "heading", label: "标题", icon: Heading2 },
  { action: "bold", label: "加粗", icon: Bold },
  { action: "bullet", label: "项目列表", icon: List },
  { action: "numbered", label: "编号列表", icon: ListOrdered },
  { action: "inlineCode", label: "行内代码", icon: Code2 },
  { action: "codeBlock", label: "代码块", icon: Braces },
  { action: "link", label: "链接", icon: Link },
] as const;
