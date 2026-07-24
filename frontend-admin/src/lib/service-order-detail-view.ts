import { servicePartActionLabel } from "@/lib/service-items";

export interface WorkEntryLike {
  engineerName?: string;
  engineer_name?: string;
  engineerUsername?: string;
  engineer_username?: string;
  workContent?: string | null;
  work_content?: string | null;
}

export interface ServiceOrderPartLike {
  deviceName?: string;
  device_name?: string;
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

interface WorkContentOrderLike {
  engineers?: Array<{ realName?: string; name?: string; username?: string }>;
  report?: {
    workContent?: string | null;
    workEntries?: WorkEntryLike[];
  } | null;
}

const COLLAB_ACK_MARKER = "⁣⁤⁣";
const COMMON_WORK_LABELS = new Set(["共同内容", "共同处理", "公共内容"]);

function normalizeWorkLabel(value?: string) {
  return String(value || "").replace(/\s/g, "").trim();
}

function stripCollaborativeAckMarker(value?: string | null) {
  return String(value || "").split(COLLAB_ACK_MARKER).join("");
}

function workContentLabels(order: WorkContentOrderLike) {
  const labels = new Set([...COMMON_WORK_LABELS, "工程师"]);
  (order.engineers || []).forEach((engineer) => {
    [engineer.realName, engineer.name, engineer.username].forEach((value) => {
      const label = normalizeWorkLabel(value);
      if (label) labels.add(label);
    });
  });
  (order.report?.workEntries || []).forEach((entry) => {
    [entry.engineerName, entry.engineer_name, entry.engineerUsername, entry.engineer_username].forEach((value) => {
      const label = normalizeWorkLabel(value);
      if (label) labels.add(label);
    });
  });
  return labels;
}

function extractCommonWorkContent(value: string | null | undefined, labels: Set<string>) {
  const kept: string[] = [];
  let collecting = false;
  for (const line of stripCollaborativeAckMarker(value).split(/\r?\n/)) {
    const headingMatch = line.match(/^\s*([^:：]{1,24})\s*[:：]\s*(.*)$/);
    const label = headingMatch ? normalizeWorkLabel(headingMatch[1]) : "";
    if (headingMatch && COMMON_WORK_LABELS.has(label)) {
      collecting = true;
      if (headingMatch[2]) kept.push(headingMatch[2]);
      continue;
    }
    if (headingMatch && collecting && labels.has(label)) collecting = false;
    if (collecting) kept.push(line);
  }
  return kept.join("\n").trim();
}

function stripKnownWorkLabels(value: string | null | undefined, labels: Set<string>) {
  const lines: string[] = [];
  for (const line of stripCollaborativeAckMarker(value).split(/\r?\n/)) {
    const headingMatch = line.match(/^\s*([^:：]{1,24})\s*[:：]\s*(.*)$/);
    const label = headingMatch ? normalizeWorkLabel(headingMatch[1]) : "";
    if (headingMatch && labels.has(label)) {
      if (headingMatch[2]) lines.push(headingMatch[2]);
      continue;
    }
    lines.push(line);
  }
  return lines.join("\n").trim();
}

export function displayServiceOrderWorkContent(order: WorkContentOrderLike) {
  const labels = workContentLabels(order);
  const common = extractCommonWorkContent(order.report?.workContent, labels);
  const filled = (order.report?.workEntries || [])
    .map((entry) => stripCollaborativeAckMarker(entry.workContent || entry.work_content).trim())
    .filter(Boolean);
  if (common || filled.length) return [common, ...filled].filter(Boolean).join("\n");
  return stripKnownWorkLabels(order.report?.workContent, labels);
}

function servicePartQuantity(part: ServiceOrderPartLike) {
  const quantityText = String(part.quantity ?? "").trim();
  const numeric = Number(quantityText);
  const quantity = quantityText && Number.isFinite(numeric) ? String(numeric) : quantityText;
  return [quantity, String(part.unit || "").trim()].filter(Boolean).join("");
}

export function displayServiceOrderParts(parts?: ServiceOrderPartLike[]) {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      const details = [
        part.deviceName || part.device_name ? `设备 ${part.deviceName || part.device_name}` : "",
        part.partNo || part.part_no ? `PN ${part.partNo || part.part_no}` : "",
        servicePartQuantity(part) ? `数量 ${servicePartQuantity(part)}` : "",
        part.remark ? String(part.remark).trim() : "",
      ].filter(Boolean);
      return `${servicePartActionLabel(part.actionType || part.action_type)} ${part.partName || part.part_name || "未命名部件"}${details.length ? `（${details.join("，")}）` : ""}`;
    })
    .filter(Boolean)
    .join("\n");
}
