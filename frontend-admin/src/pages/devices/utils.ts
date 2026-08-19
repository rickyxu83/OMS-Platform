/**
 * Devices 页纯函数与导入导出逻辑层（自 4800 行单文件拆出）：
 * 表单工厂、客户辅助、维保/状态标签、型号规范化任务、删除阻塞详情、
 * 设备导入模板生成 / Excel 导入解析 / 导出。
 */
import { toast } from "sonner";
import { api } from "@/services/api";
import type {
  BatchDeviceRow, BatchEditForm, BatchEditToggles, Customer, Device, DeviceDeleteBlockedDetails,
  DeviceForm, DevicePartHistory, DeviceRelatedAttachment, ExcelWorkbook, ExcelWorksheet, ExistingModelNormalizationItem,
  ExistingModelNormalizationResult, ImportCustomerConfirmation, ImportCustomerCorrection,
  ImportErrorRow, ImportResult, ImportSimilarCustomer, ImportUnmatchedCustomer,
  MaintenanceImportColumn, MaintenanceImportItem, MaintenanceImportPreview, MaintenanceParty,
  ModelNormalizationJob, ModelNormalizationNotice, ModelNormalizationResult,
} from "./types";
import {
  ATTACHMENT_FORMAT_LABELS, ATTACHMENT_PURPOSE_LABELS,
  DEVICE_STATUS_LABELS, IMPORT_TEMPLATE_MAINTENANCE_TYPES, IMPORT_TEMPLATE_MAX_ROWS,
  IMPORT_TEMPLATE_OPTIONS_SHEET, MAINTENANCE_IMPORT_STATUS_LABELS, MAINTENANCE_TYPE_ALIASES,
  MAINTENANCE_TYPE_LABELS, MODEL_NORMALIZATION_JOB_POLL_MS, MODEL_NORMALIZATION_JOB_TIMEOUT_MS,
  MODEL_NORMALIZATION_TOAST_POSITION,
} from "./constants";

export function groupImportCustomerCorrections(items: ImportCustomerCorrection[] = []): ImportCustomerConfirmation[] {
  const grouped = new Map<string, ImportCustomerConfirmation>();
  for (const item of items) {
    const inputCustomerName = String(item.inputCustomerName || "").trim();
    const suggestedCustomerId = item.customerId === undefined || item.customerId === null ? "" : String(item.customerId);
    if (!inputCustomerName || !suggestedCustomerId) continue;
    const current = grouped.get(inputCustomerName) || {
      inputCustomerName,
      rowNumbers: [],
      suggestedCustomerId,
      suggestedCustomerName: item.customerName || `客户 #${suggestedCustomerId}`,
      matchType: item.matchType,
    };
    if (item.rowNumber && !current.rowNumbers.includes(item.rowNumber)) current.rowNumbers.push(item.rowNumber);
    grouped.set(inputCustomerName, current);
  }
  return [...grouped.values()];
}

export function createEmptyDeviceForm(overrides: Partial<DeviceForm> = {}): DeviceForm {
  return {
    customerId: "",
    name: "",
    model: "",
    pn: "",
    serialNo: "",
    mrNo: "",
    maintenanceType: "pending_confirmation",
    maintenancePartyId: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    location: "",
    status: "active",
    remark: "",
    ...overrides,
  };
}

export function createEmptyBatchRow(): BatchDeviceRow {
  return {
    name: "",
    model: "",
    serialNo: "",
    mrNo: "",
  };
}

export function createEmptyBatchEditForm(): BatchEditForm {
  return {
    maintenanceType: "pending_confirmation",
    maintenancePartyId: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    mrNo: "",
    location: "",
    remark: "",
  };
}

export function createEmptyBatchEditToggles(): BatchEditToggles {
  return {
    maintenanceType: false,
    maintenancePartyId: false,
    maintenanceStart: false,
    maintenanceEnd: false,
    mrNo: false,
    location: false,
    remark: false,
  };
}

export function createInitialBatchRows(count = 3) {
  return Array.from({ length: count }, () => createEmptyBatchRow());
}

export function batchRowHasInput(row: BatchDeviceRow) {
  return Boolean(row.name.trim() || row.model.trim() || row.serialNo.trim() || row.mrNo.trim());
}

export function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

export function inputDate(value?: string) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export async function copySerialNo(serialNo?: string) {
  const value = String(serialNo || "").trim();
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    toast.success("序列号已复制");
  } catch {
    toast.error("复制失败，请手动复制序列号");
  }
}

export function canonicalMaintenanceType(value?: string) {
  const type = String(value || "pending_confirmation").trim() || "pending_confirmation";
  return MAINTENANCE_TYPE_ALIASES[type] || type;
}

export function maintenanceTypeHasParty(type?: string) {
  return ["original_manufacturer", "our_maintenance"].includes(canonicalMaintenanceType(type));
}

export function maintenancePartyMatchesType(party: MaintenanceParty, type?: string) {
  const maintenanceType = canonicalMaintenanceType(type);
  if (!maintenanceTypeHasParty(maintenanceType)) return false;
  return canonicalMaintenanceType(party.partyType) === maintenanceType;
}

export function resolveMaintenancePartyId(parties: MaintenanceParty[], type: string, currentId?: string | number | null) {
  const maintenanceType = canonicalMaintenanceType(type);
  if (!maintenanceTypeHasParty(maintenanceType) || !currentId) return "";
  return parties.some((party) => (
    String(party.id) === String(currentId)
    && maintenancePartyMatchesType(party, maintenanceType)
  )) ? String(currentId) : "";
}

export function deviceDisplayName(device?: Device | null) {
  if (!device) return "";
  return device.model || device.name || device.serialNo || `设备 #${device.id}`;
}

export function partActionLabel(value?: string) {
  if (value === "replacement") return "备件更换";
  if (value === "installation") return "硬件部件安装";
  return "部件记录";
}

export function orderRelationLabel(value?: string) {
  const labels = String(value || "")
    .split(",")
    .map((item) => {
      if (item === "service_order_device") return "主设备";
      if (item === "installation_source") return "安装来源";
      if (item === "service_part:replacement") return "备件更换";
      if (item === "service_part:installation") return "硬件部件安装";
      if (item.startsWith("service_part:")) return "部件记录";
      return "";
    })
    .filter(Boolean);
  return [...new Set(labels)].join(" / ") || "关联";
}

export function attachmentFormatOf(file: DeviceRelatedAttachment): "document" | "image" | "other" {
  const mime = String(file.mimeType || "").toLowerCase();
  const name = String(file.originalName || "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic)$/.test(name)) return "image";
  if (
    mime.includes("pdf") || mime.includes("word") || mime.includes("excel") || mime.includes("spreadsheet")
    || mime.includes("presentation") || mime.startsWith("text/")
    || /\.(pdf|docx?|xlsx?|pptx?|txt|csv|md)$/.test(name)
  ) return "document";
  return "other";
}

export function partQuantityText(item: DevicePartHistory) {
  const quantity = Number(item.quantity || 0);
  const text = Number.isFinite(quantity) && quantity > 0 ? String(quantity).replace(/\.00$/, "") : "";
  return [text, item.unit].filter(Boolean).join("") || "1";
}

export function compactText(value?: string, maxLength = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function modelNormalizationNotice(payload: unknown): ModelNormalizationNotice | null {
  const data = (payload || {}) as { modelNormalization?: ModelNormalizationResult; message?: string };
  const normalization = data.modelNormalization || {};
  const action = String(normalization.action || "");
  if (!["corrected", "created", "created_corrected", "suggested_correction", "not_found"].includes(action)) return null;
  const message = String(data.message || normalization.message || "").trim()
    || (action === "corrected"
      ? `已按型号库标准纠正为 ${normalization.canonicalModel || "标准型号"}`
      : action === "created_corrected"
        ? `型号库未命中，已规范为 ${normalization.canonicalModel || "标准型号"} 并加入型号库`
        : action === "suggested_correction"
          ? `AI 建议可能是 ${normalization.canonicalModel || "标准型号"}，需人工确认后应用`
        : action === "created"
          ? "型号库未命中，已加入型号库"
          : "型号库未命中，未能在线确认，已按原型号保存");
  return { action, message };
}

export function extractModelNormalizationJob(payload: unknown): ModelNormalizationJob | null {
  const job = (payload || {}) as { modelNormalizationJob?: ModelNormalizationJob };
  if (!job.modelNormalizationJob?.id) return null;
  return job.modelNormalizationJob;
}

export function modelNormalizationResultMessage(job: ModelNormalizationJob) {
  const normalization = job.modelNormalization || {};
  const action = String(normalization.action || "");
  return String(job.message || normalization.message || "").trim()
    || (action === "corrected"
      ? `已按型号库标准纠正为 ${normalization.canonicalModel || job.canonicalModel || "标准型号"}`
      : action === "created_corrected"
        ? `型号库未命中，已规范为 ${normalization.canonicalModel || job.canonicalModel || "标准型号"} 并加入型号库`
        : action === "suggested_correction"
          ? `AI 建议可能是 ${normalization.canonicalModel || job.canonicalModel || "标准型号"}，需人工确认后应用`
        : action === "created"
          ? "型号库未命中，已加入型号库"
          : action === "not_found"
            ? "型号库未命中，未能在线确认，已按原型号保存"
            : "型号后台搜索完成");
}

export function summarizeModelNormalizationJobs(jobs: ModelNormalizationJob[]) {
  const completed = jobs.filter((job) => job.status === "completed");
  const failed = jobs.filter((job) => job.status === "failed");
  const updated = completed.filter((job) => job.updated).length;
  const catalogAdded = completed.filter((job) => ["created", "created_corrected"].includes(String(job.modelNormalization?.action || ""))).length;
  const unresolved = completed.filter((job) => job.modelNormalization?.action === "not_found").length;
  const suggested = completed.filter((job) => job.modelNormalization?.action === "suggested_correction").length;
  const parts = [`完成 ${completed.length} 个`];
  if (updated) parts.push(`纠正 ${updated} 台`);
  if (catalogAdded) parts.push(`入库 ${catalogAdded} 个`);
  if (suggested) parts.push(`待确认 ${suggested} 个`);
  if (unresolved) parts.push(`未确认 ${unresolved} 个`);
  if (failed.length) parts.push(`失败 ${failed.length} 个`);
  return `型号后台搜索完成：${parts.join("，")}`;
}

export function showModelNormalizationNotices(notices: ModelNormalizationNotice[]) {
  const seen = new Set<string>();
  const unique = notices.filter((notice) => {
    if (!notice.message || seen.has(notice.message)) return false;
    seen.add(notice.message);
    return true;
  });
  unique.slice(0, 3).forEach((notice) => {
    if (notice.action === "not_found") toast.warning(notice.message);
    else toast.info(notice.message);
  });
  if (unique.length > 3) toast.info(`另有 ${unique.length - 3} 条型号校对结果已应用`);
}

export function existingModelIssueLabel(action?: string) {
  if (action === "corrected") return "型号库纠正";
  if (action === "created_corrected") return "在线规范";
  if (action === "suggested_correction") return "AI 待确认";
  if (action === "created") return "已补入型号库";
  if (action === "not_found") return "未确认";
  return "需核对";
}

export function existingModelIssueBadgeClass(action?: string) {
  if (action === "not_found") return "border-amber-200 bg-amber-50 text-amber-800";
  if (action === "suggested_correction") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800";
  if (action === "created") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-violet-200 bg-violet-50 text-violet-800";
}

export function apiErrorDetails(error: unknown): DeviceDeleteBlockedDetails | null {
  const details = (error as { details?: unknown } | null)?.details;
  if (!details || typeof details !== "object") return null;
  return details as DeviceDeleteBlockedDetails;
}

export function deviceDeleteName(device?: DeviceDeleteBlockedDetails["device"] | Device | null) {
  if (!device) return "设备";
  return [device.model, "serialNo" in device ? device.serialNo : undefined].filter(Boolean).join(" / ")
    || device.name
    || (device.id ? `设备 #${device.id}` : "设备");
}

export function compactList(values: string[], limit = 5) {
  const filtered = values.filter(Boolean);
  if (!filtered.length) return "";
  const visible = filtered.slice(0, limit).join("、");
  return filtered.length > limit ? `${visible} 等 ${filtered.length} 项` : visible;
}

export function formatDeviceDeleteBlockedDetails(details: DeviceDeleteBlockedDetails) {
  const relations = details.relations || {};
  const lines = [
    `设备：${deviceDeleteName(details.device)}${details.device?.customerName ? `（${details.device.customerName}）` : ""}`,
  ];
  const mainOrders = compactList((relations.mainServiceOrders || []).map((item) => item.orderNo || `#${item.id}`));
  if (mainOrders) lines.push(`主设备工单：${mainOrders}`);
  const targetOrders = compactList((relations.targetServiceOrders || []).map((item) => item.orderNo || `#${item.id}`));
  if (targetOrders) lines.push(`目标设备工单：${targetOrders}`);
  const parts = compactList((relations.serviceParts || []).map((item) => (
    `${item.orderNo || `工单 #${item.orderId || "-"}`} ${item.partName || item.partNo || `部件 #${item.id}`}`
  )));
  if (parts) lines.push(`部件记录：${parts}`);
  const schedules = compactList((relations.inspectionSchedules || []).map((item) => item.name || `计划 #${item.id}`));
  if (schedules) lines.push(`巡检计划：${schedules}`);
  return lines.join("\n");
}

export function extractMaintenancePartyNames(items: unknown) {
  const names = Array.isArray(items)
    ? items
      .map((item) => String((item as MaintenanceParty | null)?.name || "").trim())
      .filter(Boolean)
    : [];
  return [...new Set(names)].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

export async function loadMaintenancePartyNamesForTemplate() {
  const data = await api.get("/maintenance-parties?limit=1000");
  return extractMaintenancePartyNames(data?.items);
}

export function worksheetRangeFormula(sheetName: string, column: string, startRow: number, endRow: number) {
  const escapedSheetName = sheetName.replace(/'/g, "''");
  return `'${escapedSheetName}'!$${column}$${startRow}:$${column}$${endRow}`;
}

export function applyImportTemplateDropdowns(
  workbook: ExcelWorkbook,
  worksheet: ExcelWorksheet,
  headerRowNumber: number,
  maintenancePartyNames: string[],
) {
  const options = workbook.addWorksheet(IMPORT_TEMPLATE_OPTIONS_SHEET);
  options.state = "veryHidden";
  options.columns = [
    { key: "maintenanceType", width: 18 },
    { key: "maintenancePartyName", width: 32 },
  ];
  options.getCell("A1").value = "维保类型";
  options.getCell("B1").value = "维保方名称";
  IMPORT_TEMPLATE_MAINTENANCE_TYPES.forEach((value, index) => {
    options.getCell(index + 2, 1).value = value;
  });
  maintenancePartyNames.forEach((value, index) => {
    options.getCell(index + 2, 2).value = value;
  });

  const firstDataRow = headerRowNumber + 1;
  const lastDataRow = headerRowNumber + IMPORT_TEMPLATE_MAX_ROWS;
  const maintenanceTypeFormula = worksheetRangeFormula(
    IMPORT_TEMPLATE_OPTIONS_SHEET,
    "A",
    2,
    IMPORT_TEMPLATE_MAINTENANCE_TYPES.length + 1,
  );
  const maintenancePartyFormula = maintenancePartyNames.length
    ? worksheetRangeFormula(IMPORT_TEMPLATE_OPTIONS_SHEET, "B", 2, maintenancePartyNames.length + 1)
    : "";

  for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber += 1) {
    worksheet.getCell(rowNumber, 6).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [maintenanceTypeFormula],
      showErrorMessage: true,
      errorTitle: "请选择维保类型",
      error: "请从下拉列表选择维保类型，或留空按待确认处理。",
    };
    if (maintenancePartyFormula) {
      worksheet.getCell(rowNumber, 7).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [maintenancePartyFormula],
        showErrorMessage: true,
        errorTitle: "请选择维保方名称",
        error: "请从下拉列表选择维保方名称，或先在系统维保方目录中维护后重新下载模板。",
      };
    }
  }
}

export async function downloadDeviceImportTemplate() {
  const maintenancePartyNames = await loadMaintenancePartyNamesForTemplate();
  const [{ Workbook }, { saveAs }] = await Promise.all([
    import("exceljs"),
    import("file-saver"),
  ]);
  const workbook = new Workbook();
  workbook.creator = "OMS Platform";
  workbook.created = new Date();
  workbook.modified = new Date();

  const headerRowNumber = 4;
  const worksheet = workbook.addWorksheet("设备导入模板", {
    views: [{ state: "frozen", ySplit: headerRowNumber }],
  });
  const requiredHeaders = new Set(["客户名称", "设备型号*", "SN*"]);
  worksheet.columns = [
    { key: "customerName", width: 24 },
    { key: "name", width: 20 },
    { key: "model", width: 24 },
    { key: "serialNo", width: 22 },
    { key: "mrNo", width: 18 },
    { key: "maintenanceType", width: 16 },
    { key: "maintenancePartyName", width: 24 },
    { key: "maintenanceStart", width: 14 },
    { key: "maintenanceEnd", width: 14 },
    { key: "location", width: 24 },
    { key: "remark", width: 28 },
  ];
  worksheet.mergeCells("A1:K1");
  worksheet.mergeCells("A2:K2");
  worksheet.mergeCells("A3:K3");
  worksheet.getCell("A1").value = "设备资产导入提示";
  worksheet.getCell("A2").value = "只需先填写客户名称、设备型号和 SN 即可导入；其他资料可留空，导入后可在系统中批量补齐或修改。";
  worksheet.getCell("A3").value = "客户建议需确认；客户不存在或资料错误的行会跳过。SN 已存在时只补充库内空字段，不覆盖已有资料。导入后会下载仅保留失败行的文件。";
  [1, 2, 3].forEach((rowNumber) => {
    const row = worksheet.getRow(rowNumber);
    row.height = rowNumber === 1 ? 26 : 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFC4B5FD" } },
        left: { style: "thin", color: { argb: "FFC4B5FD" } },
        bottom: { style: "thin", color: { argb: "FFC4B5FD" } },
        right: { style: "thin", color: { argb: "FFC4B5FD" } },
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber === 1 ? "FFDDD6FE" : "FFF5F3FF" } };
      cell.font = { bold: rowNumber === 1, color: { argb: rowNumber === 3 ? "FF7F1D1D" : "FF4C1D95" } };
    });
  });
  worksheet.getRow(headerRowNumber).values = [
    "客户名称",
    "主机名",
    "设备型号*",
    "SN*",
    "MR单",
    "维保类型",
    "维保方名称",
    "维保开始",
    "维保截止",
    "位置",
    "备注",
  ];
  worksheet.addRow({
    customerName: "示例客户有限公司",
    name: "host-01",
    model: "PowerEdge R740",
    serialNo: "SN-EXAMPLE-001",
    mrNo: "MR-001",
    maintenanceType: "我方维保",
    maintenancePartyName: "示例维保方",
    maintenanceStart: "2026-01-01",
    maintenanceEnd: "2026-12-31",
    location: "机房 A01",
    remark: "删除示例行后再导入",
  });
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: worksheet.columns.length },
  };
  worksheet.getRow(headerRowNumber).height = 24;
  worksheet.getRow(headerRowNumber).eachCell((cell) => {
    const required = requiredHeaders.has(String(cell.value || ""));
    cell.font = { bold: true, color: { argb: required ? "FF7F1D1D" : "FF4C1D95" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    if (required) {
      cell.note = String(cell.value) === "客户名称"
        ? "必填项；纠正建议需确认。客户不存在时该行会跳过，请新增客户后使用剩余设备文件重新导入。"
        : "必填项，不能为空。";
    }
  });
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9E2EC" } },
        left: { style: "thin", color: { argb: "FFD9E2EC" } },
        bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
        right: { style: "thin", color: { argb: "FFD9E2EC" } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (rowNumber > headerRowNumber) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
  });

  const help = workbook.addWorksheet("字段说明");
  help.columns = [
    { header: "字段", key: "field", width: 18 },
    { header: "是否必填", key: "required", width: 14 },
    { header: "说明", key: "description", width: 72 },
  ];
  [
    ["客户名称", "必填", "建议填写系统内标准名称；建议匹配需确认。客户不存在时只跳过对应行，不影响其他设备。"],
    ["设备型号*", "必填", "不能为空。"],
    ["SN*", "必填", "不能为空；导入文件内重复时该行失败。系统内已存在时按 SN 匹配，只补充空字段，不覆盖已有资料；所属客户不一致时拒绝更新。"],
    ["维保类型", "选填", "可填：待确认、无维保、原厂维保、我方维保；空值按待确认处理。"],
    ["维保方名称", "有维保时选填", "下拉名单来自系统维保方目录；按名称和维保类型匹配已有维保方。"],
    ["维保截止", "选填", "当前维保合同或服务责任的结束日期；到期提醒使用此字段。"],
    ["日期字段", "选填", "使用 YYYY-MM-DD 格式，例如 2026-12-31。"],
    ["填写建议", "说明", "只需先填客户名称、设备型号和 SN 即可导入；其他资料可留空，导入后再在系统中批量补齐或修改。"],
  ].forEach(([field, required, description]) => help.addRow({ field, required, description }));
  help.getRow(1).font = { bold: true, color: { argb: "FF4C1D95" } };
  help.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  applyImportTemplateDropdowns(workbook, worksheet, headerRowNumber, maintenancePartyNames);

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "设备资产导入模板.xlsx");
}

export function deviceImportHeaderKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s*＊]/g, "");
}

export function findDeviceImportHeaderRow(worksheet: any) {
  for (let rowNumber = 1; rowNumber <= Math.min(20, worksheet.rowCount); rowNumber += 1) {
    const keys = new Set<string>();
    worksheet.getRow(rowNumber).eachCell((cell: any) => keys.add(deviceImportHeaderKey(cell.text || cell.value)));
    const hasCustomer = [...keys].some((key) => ["客户名称", "客户名", "客户"].includes(key));
    const hasModel = [...keys].some((key) => ["设备型号", "型号", "model"].includes(key));
    const hasSerial = [...keys].some((key) => ["sn", "序列号", "设备序列号", "serialno"].includes(key));
    if (hasCustomer && hasModel && hasSerial) return rowNumber;
  }
  return 0;
}

export async function downloadRemainingDeviceImportFile(file: File, errors: ImportErrorRow[]) {
  const failedByRow = new Map<number, string[]>();
  for (const error of errors) {
    const rowNumber = Number(error.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber <= 0) continue;
    const messages = failedByRow.get(rowNumber) || [];
    const message = String(error.message || "导入失败").trim();
    if (message && !messages.includes(message)) messages.push(message);
    failedByRow.set(rowNumber, messages);
  }
  if (!failedByRow.size) return "";

  const [{ Workbook }, { saveAs }] = await Promise.all([
    import("exceljs"),
    import("file-saver"),
  ]);
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.getWorksheet("设备导入模板") || workbook.worksheets[0];
  if (!worksheet) return "";
  const headerRowNumber = findDeviceImportHeaderRow(worksheet);
  if (!headerRowNumber) return "";

  let failureColumn = 0;
  worksheet.getRow(headerRowNumber).eachCell((cell: any, columnNumber: number) => {
    if (deviceImportHeaderKey(cell.text || cell.value) === "导入失败原因") failureColumn = columnNumber;
  });
  if (!failureColumn) failureColumn = Math.max(worksheet.columnCount, 1) + 1;
  const failureHeader = worksheet.getCell(headerRowNumber, failureColumn);
  failureHeader.value = "导入失败原因";
  failureHeader.font = { bold: true, color: { argb: "FF991B1B" } };
  failureHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
  failureHeader.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  worksheet.getColumn(failureColumn).width = 42;

  for (const [rowNumber, messages] of failedByRow) {
    if (rowNumber <= headerRowNumber || rowNumber > worksheet.rowCount) continue;
    const cell = worksheet.getCell(rowNumber, failureColumn);
    cell.value = messages.join("；");
    cell.font = { color: { argb: "FFB91C1C" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  }

  for (let rowNumber = worksheet.rowCount; rowNumber > headerRowNumber; rowNumber -= 1) {
    if (!failedByRow.has(rowNumber)) worksheet.spliceRows(rowNumber, 1);
  }
  if (worksheet.getCell("A3")) {
    worksheet.getCell("A3").value = "本文件仅保留上次未导入的设备。请根据“导入失败原因”修正客户或其他资料后重新导入。";
  }
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: failureColumn },
  };
  workbook.modified = new Date();

  const buffer = await workbook.xlsx.writeBuffer();
  const baseName = file.name.replace(/\.xlsx$/i, "") || "设备资产导入模板";
  const fileName = `${baseName}-未导入设备.xlsx`;
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
  return fileName;
}

export async function exportDevicesToExcel(devices: Device[]) {
  const [{ Workbook }, { saveAs }] = await Promise.all([
    import("exceljs"),
    import("file-saver"),
  ]);
  const workbook = new Workbook();
  workbook.creator = "OMS Platform";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("设备资产");
  worksheet.columns = [
    { header: "客户名称", key: "customerName", width: 24 },
    { header: "主机名", key: "name", width: 20 },
    { header: "设备型号", key: "model", width: 24 },
    { header: "PN", key: "pn", width: 18 },
    { header: "SN", key: "serialNo", width: 22 },
    { header: "MR单", key: "mrNo", width: 18 },
    { header: "维保类型", key: "maintenanceType", width: 16 },
    { header: "维保方名称", key: "maintenancePartyName", width: 24 },
    { header: "维保开始", key: "maintenanceStart", width: 14 },
    { header: "维保截止", key: "maintenanceEnd", width: 14 },
    { header: "位置", key: "location", width: 24 },
    { header: "状态", key: "status", width: 12 },
    { header: "备注", key: "remark", width: 30 },
  ];

  devices.forEach((device) => {
    const maintenanceType = canonicalMaintenanceType(device.maintenanceType);
    const status = device.status || "active";
    worksheet.addRow({
      customerName: device.customerName || "",
      name: device.name || "",
      model: device.model || "",
      pn: device.pn || "",
      serialNo: device.serialNo || "",
      mrNo: device.mrNo || "",
      maintenanceType: MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "",
      maintenancePartyName: device.maintenancePartyName || "",
      maintenanceStart: inputDate(device.maintenanceStart),
      maintenanceEnd: inputDate(device.maintenanceEnd),
      location: device.location || "",
      status: DEVICE_STATUS_LABELS[status] || status || "",
      remark: device.remark || "",
    });
  });

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columns.length },
  };
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF334155" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "middle", wrapText: rowNumber === 1 };
    });
  });

  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("");
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `设备资产-${timestamp}.xlsx`);
}
