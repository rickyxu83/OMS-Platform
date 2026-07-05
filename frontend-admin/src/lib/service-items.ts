export interface ServicePartLike {
  deviceId?: string | number;
  device_id?: string | number;
  actionType?: string;
  action_type?: string;
  partName?: string;
  part_name?: string;
  partNo?: string;
  part_no?: string;
  quantity?: string | number;
  unit?: string;
  remark?: string;
}

export interface ServiceItemSource {
  serviceMode?: string;
  serviceType?: string;
  timesheetCategory?: string;
  serviceModules?: string[];
  parts?: ServicePartLike[];
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  install: "安装",
  repair: "技术处理",
  maintain: "调优",
  inspect: "巡检",
  training: "培训",
  remote: "远程支持",
  other: "其他",
};

const REMOTE_CATEGORY_LABELS: Record<string, string> = {
  排障: "远程排障",
  调配: "远程调配",
  协调: "远程协调",
  会议: "远程会议",
  培训: "远程培训",
  其他: "远程其他",
};

const ONSITE_MODULE_LABELS: Record<string, string> = {
  repair: "技术处理",
  install: "安装",
  inspect: "巡检",
  replacement: "备件更换",
};

const REMOTE_MODULE_LABELS: Record<string, string> = {
  repair: "远程技术支持",
  replacement: "备件更换远程协助",
};

export function serviceTypeLabel(value?: string) {
  return SERVICE_TYPE_LABELS[String(value || "").trim()] || String(value || "").trim() || "";
}

export function remoteCategoryLabel(value?: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("远程")) return text;
  return REMOTE_CATEGORY_LABELS[text] || text;
}

export function servicePartActionLabel(value?: string) {
  if (value === "replacement") return "备件更换";
  if (value === "installation") return "硬件部件安装";
  return "部件记录";
}

function partActionType(part: ServicePartLike) {
  return String(part.actionType || part.action_type || "").trim();
}

function partHasContent(part: ServicePartLike) {
  // Quantity/unit/default action alone should not turn an empty row into a service item.
  return Boolean(
    String(part.partName || part.part_name || "").trim()
      || String(part.partNo || part.part_no || "").trim()
      || String(part.remark || "").trim(),
  );
}

export function serviceItemLabels(item: ServiceItemSource) {
  const mode = String(item.serviceMode || "onsite").trim();
  const labels: string[] = [];
  const modules = Array.isArray(item.serviceModules) ? item.serviceModules : [];
  const moduleLabels = modules
    .map((module) => mode === "remote" ? REMOTE_MODULE_LABELS[String(module)] : ONSITE_MODULE_LABELS[String(module)])
    .filter(Boolean);

  if (mode !== "office" && moduleLabels.length) {
    labels.push(...moduleLabels);
  } else if (mode === "office") {
    labels.push(String(item.timesheetCategory || "").trim() || "内勤");
  } else if (mode === "remote") {
    labels.push(remoteCategoryLabel(item.timesheetCategory) || "远程");
  } else {
    labels.push(serviceTypeLabel(item.serviceType) || "现场");
  }

  const parts = Array.isArray(item.parts) ? item.parts.filter(partHasContent) : [];
  const hasReplacement = parts.some((part) => partActionType(part) === "replacement");
  const hasInstallation = parts.some((part) => partActionType(part) === "installation");
  const hasGeneral = parts.some((part) => !["replacement", "installation"].includes(partActionType(part)));

  if (hasReplacement) labels.push("备件更换");
  if (hasInstallation) labels.push("硬件部件安装");
  if (hasGeneral) labels.push("部件记录");

  return [...new Set(labels.filter(Boolean))];
}

export function serviceItemsLabel(item: ServiceItemSource, fallback = "-") {
  const labels = serviceItemLabels(item);
  return labels.length ? labels.join(" + ") : fallback;
}

export function serviceItemsSearchText(item: ServiceItemSource) {
  return serviceItemLabels(item).join(" ");
}
