import { useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useNavigate } from "react-router-dom";
import { BarChart3, TrendingUp, Users, Wrench, MapPin, Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Amap } from "@/components/Amap";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/services/api";

interface Summary {
  todayTotal?: number;
  monthTotal?: number;
  monthCustomers?: number;
  monthEngineerVisits?: number;
}

interface Order {
  id: string | number;
  orderNo?: string;
  displayId?: string;
  displayStatus?: string;
  displayTitle?: string;
  workflowStatus?: string;
  status: string;
  customer?: { name?: string } | string;
  deviceName?: string;
  engineerName?: string;
  serviceMode?: string;
  createdAt?: string;
}

interface CustomerPoint {
  id: string | number;
  name: string;
  longitude?: number;
  latitude?: number;
  serviceOrderCount?: number;
  orderCount?: number;
  useCount?: number;
  address?: string;
  contact?: string;
  phone?: string;
  level?: "peak" | "high" | "active" | "quiet";
}

interface OperationalReportItem {
  id?: string | number;
  orderNo?: string;
  customerName?: string;
  engineerName?: string;
  serviceDate?: string;
  serviceAt?: string;
  date?: string;
  weekday?: string;
  workNature?: string;
  serviceMode?: string;
  category?: string;
  productName?: string;
  workContent?: string;
  progress?: string;
  remark?: string;
  workHours?: number;
  duration?: number;
  source?: string;
}

interface WorkSummaryTheme {
  theme?: string;
  evidenceCount?: number;
  details?: string;
}

interface WorkSummaryResult {
  executiveSummary?: string;
  keyThemes?: WorkSummaryTheme[];
  customerImpact?: string[];
  riskSignals?: string[];
  followUpRecommendations?: string[];
  coverageNotes?: string;
}

interface WorkSummaryResponse {
  available?: boolean;
  reason?: string;
  provider?: string;
  summary?: WorkSummaryResult | null;
  usage?: {
    model?: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
  };
}

function textValue(value: unknown, fallback = "-") {
  const text = value == null ? "" : String(value).trim();
  return text || fallback;
}

function reportServiceDate(item: OperationalReportItem) {
  return item.date || item.serviceDate || item.serviceAt || "";
}

function reportWorkHours(item: OperationalReportItem) {
  const value = Number(item.workHours ?? item.duration ?? 1);
  return Number.isFinite(value) ? value : 0;
}

function reportSourceLabel(source?: string) {
  return source === "service_order" ? "服务记录" : source === "manual" ? "手工记录" : textValue(source);
}

function buildGroupSummary(items: OperationalReportItem[], keyGetter: (item: OperationalReportItem) => string) {
  const groups = new Map<string, { name: string; count: number; hours: number }>();
  for (const item of items) {
    const name = textValue(keyGetter(item), "未指定");
    const current = groups.get(name) || { name, count: 0, hours: 0 };
    current.count += 1;
    current.hours += reportWorkHours(item);
    groups.set(name, current);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.hours - a.hours || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function distinctCount(items: OperationalReportItem[], keyGetter: (item: OperationalReportItem) => string | undefined) {
  const values = new Set(items.map((item) => keyGetter(item)?.trim()).filter(Boolean));
  return values.size;
}

function reportFilename(startDate: string, endDate: string) {
  if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
    return `运营汇总-${startDate.slice(0, 7)}.xlsx`;
  }
  return `运营汇总-${startDate}至${endDate}.xlsx`;
}

function addAiSummaryWorksheet(workbook: ExcelJS.Workbook, rangeLabel: string, workSummary?: WorkSummaryResponse | null) {
  const sheet = workbook.addWorksheet("AI营运摘要", {
    views: [{ state: "frozen", ySplit: 2 }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [{ width: 20 }, { width: 88 }];
  sheet.mergeCells("A1:B1");
  sheet.getCell("A1").value = "AI 营运摘要";
  sheet.getCell("A1").font = { size: 20, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4C1D95" } };
  sheet.getRow(1).height = 32;

  const appendRow = (label: string, value: string) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true, color: { argb: "FF312E81" } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    row.getCell(2).alignment = { vertical: "top", horizontal: "left", wrapText: true };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE9D5FF" } },
        left: { style: "thin", color: { argb: "FFE9D5FF" } },
        bottom: { style: "thin", color: { argb: "FFE9D5FF" } },
        right: { style: "thin", color: { argb: "FFE9D5FF" } },
      };
    });
    row.height = Math.max(24, Math.min(120, Math.ceil(value.length / 45) * 18));
  };

  appendRow("统计范围", rangeLabel);
  if (!workSummary?.available || !workSummary.summary) {
    appendRow("生成状态", workSummary?.reason || "AI 摘要未生成");
    return;
  }

  const summary = workSummary.summary;
  appendRow("生成模型", [workSummary.provider, workSummary.usage?.model].filter(Boolean).join(" / ") || "AI");
  appendRow("总体摘要", textValue(summary.executiveSummary, "记录未体现足够的可总结内容。"));
  if (summary.keyThemes?.length) {
    appendRow("重点主题", summary.keyThemes.map((item, index) => `${index + 1}. ${item.theme || "未命名主题"}${item.evidenceCount ? `（${item.evidenceCount} 条）` : ""}：${item.details || "-"}`).join("\n"));
  }
  if (summary.customerImpact?.length) appendRow("客户影响", summary.customerImpact.map((item, index) => `${index + 1}. ${item}`).join("\n"));
  if (summary.riskSignals?.length) appendRow("风险信号", summary.riskSignals.map((item, index) => `${index + 1}. ${item}`).join("\n"));
  if (summary.followUpRecommendations?.length) appendRow("后续建议", summary.followUpRecommendations.map((item, index) => `${index + 1}. ${item}`).join("\n"));
  if (summary.coverageNotes) appendRow("覆盖说明", summary.coverageNotes);
}

async function downloadOperationalSummaryWorkbook(filename: string, rangeLabel: string, summary: Summary, items: OperationalReportItem[], workSummary?: WorkSummaryResponse | null) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Service Sheet RC";
  workbook.created = new Date();
  workbook.modified = new Date();

  const totalHours = items.reduce((sum, item) => sum + reportWorkHours(item), 0);
  const serviceRecordCount = items.filter((item) => item.source === "service_order").length;
  const manualRecordCount = items.filter((item) => item.source === "manual").length;
  const engineerCount = distinctCount(items, (item) => item.engineerName);
  const customerCount = distinctCount(items, (item) => item.customerName);

  const overview = workbook.addWorksheet("运营概览", {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  overview.columns = [
    { width: 16 }, { width: 16 }, { width: 4 },
    { width: 16 }, { width: 16 }, { width: 4 },
    { width: 18 }, { width: 18 },
  ];
  overview.properties.defaultRowHeight = 22;
  overview.mergeCells("A1:H1");
  overview.getCell("A1").value = "运营汇总报告";
  overview.getCell("A1").font = { size: 22, bold: true, color: { argb: "FFFFFFFF" } };
  overview.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
  overview.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4C1D95" } };
  overview.getRow(1).height = 34;

  overview.mergeCells("A2:H2");
  overview.getCell("A2").value = `统计范围：${rangeLabel}    生成时间：${new Date().toLocaleString("zh-CN")}`;
  overview.getCell("A2").font = { color: { argb: "FF5B6472" }, bold: true };
  overview.getCell("A2").alignment = { vertical: "middle", horizontal: "center" };
  overview.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F0FF" } };

  const kpis = [
    { label: "本次记录数", value: items.length, unit: "条" },
    { label: "总工时", value: totalHours.toFixed(1), unit: "小时" },
    { label: "服务客户数", value: customerCount, unit: "家" },
    { label: "参与工程师", value: engineerCount, unit: "人" },
    { label: "服务记录", value: serviceRecordCount, unit: "条" },
    { label: "手工记录", value: manualRecordCount, unit: "条" },
  ];
  kpis.forEach((kpi, index) => {
    const col = (index % 3) * 3 + 1;
    const row = 4 + Math.floor(index / 3) * 4;
    overview.mergeCells(row, col, row, col + 1);
    overview.mergeCells(row + 1, col, row + 2, col + 1);
    const labelCell = overview.getCell(row, col);
    const valueCell = overview.getCell(row + 1, col);
    labelCell.value = kpi.label;
    labelCell.font = { bold: true, color: { argb: "FF4B5563" } };
    labelCell.alignment = { vertical: "middle", horizontal: "center" };
    valueCell.value = `${kpi.value} ${kpi.unit}`;
    valueCell.font = { size: 18, bold: true, color: { argb: "FF4C1D95" } };
    valueCell.alignment = { vertical: "middle", horizontal: "center" };
    for (let r = row; r <= row + 2; r += 1) {
      for (let c = col; c <= col + 1; c += 1) {
        const cell = overview.getCell(r, c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? "FFF7F2FF" : "FFF0FDF4" } };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD8B4FE" } },
          left: { style: "thin", color: { argb: "FFD8B4FE" } },
          bottom: { style: "thin", color: { argb: "FFD8B4FE" } },
          right: { style: "thin", color: { argb: "FFD8B4FE" } },
        };
      }
    }
  });

  const sectionHeaderFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF6D28D9" } };
  const tableHeaderFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFEDE9FE" } };
  const applyTable = (startRow: number, title: string, headers: string[], rows: Array<Array<string | number>>) => {
    const endCol = Math.max(headers.length, 1);
    overview.mergeCells(startRow, 1, startRow, endCol);
    const titleCell = overview.getCell(startRow, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = sectionHeaderFill;
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    const headerRow = overview.getRow(startRow + 1);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: "FF312E81" } };
      cell.fill = tableHeaderFill;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    rows.forEach((rowValues, rowIndex) => {
      const row = overview.getRow(startRow + 2 + rowIndex);
      rowValues.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value;
        cell.alignment = { vertical: "middle", horizontal: index > 0 ? "right" : "left", wrapText: true };
        if (rowIndex % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF5FF" } };
        }
      });
    });
    for (let r = startRow; r <= startRow + 1 + Math.max(rows.length, 1); r += 1) {
      for (let c = 1; c <= endCol; c += 1) {
        overview.getCell(r, c).border = {
          top: { style: "thin", color: { argb: "FFE9D5FF" } },
          left: { style: "thin", color: { argb: "FFE9D5FF" } },
          bottom: { style: "thin", color: { argb: "FFE9D5FF" } },
          right: { style: "thin", color: { argb: "FFE9D5FF" } },
        };
      }
    }
    return startRow + 3 + rows.length;
  };

  const toRows = (rows: Array<{ name: string; count: number; hours: number }>, limit?: number) =>
    rows.slice(0, limit).map((row) => [row.name, row.count, Number(row.hours.toFixed(1))]);

  let rowCursor = 13;
  rowCursor = applyTable(rowCursor, "按工程师统计", ["工程师", "记录数", "工时"], toRows(buildGroupSummary(items, (item) => item.engineerName || "未指定工程师"))) + 1;
  rowCursor = applyTable(rowCursor, "客户服务 Top 10", ["客户", "记录数", "工时"], toRows(buildGroupSummary(items, (item) => item.customerName || "未指定客户"), 10)) + 1;
  rowCursor = applyTable(rowCursor, "按服务类别统计", ["类别", "记录数", "工时"], toRows(buildGroupSummary(items, (item) => item.category || "未分类"))) + 1;
  applyTable(rowCursor, "按工作性质统计", ["工作性质", "记录数", "工时"], toRows(buildGroupSummary(items, (item) => item.workNature || item.serviceMode || "未指定")));

  overview.getColumn(3).numFmt = "0.0";
  overview.headerFooter.oddHeader = `&C运营汇总报告 - ${rangeLabel}`;
  overview.headerFooter.oddFooter = "&R第 &P / &N 页";

  const detail = workbook.addWorksheet("工单明细", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  detail.columns = [
    { header: "日期", key: "date", width: 13 },
    { header: "工程师", key: "engineerName", width: 14 },
    { header: "客户名称", key: "customerName", width: 24 },
    { header: "工作性质", key: "workNature", width: 13 },
    { header: "类别", key: "category", width: 16 },
    { header: "专案/产品", key: "productName", width: 24 },
    { header: "工作内容", key: "workContent", width: 44 },
    { header: "进度", key: "progress", width: 12 },
    { header: "工时", key: "workHours", width: 10 },
    { header: "来源", key: "source", width: 12 },
    { header: "备注/工单号", key: "remark", width: 20 },
  ];

  [...items].sort((left, right) => String(reportServiceDate(left)).localeCompare(String(reportServiceDate(right))) || String(left.orderNo || left.id || "").localeCompare(String(right.orderNo || right.id || ""))).forEach((item) => {
    detail.addRow({
      date: reportServiceDate(item),
      engineerName: textValue(item.engineerName, "未指定工程师"),
      customerName: textValue(item.customerName, "未指定客户"),
      workNature: textValue(item.workNature || item.serviceMode),
      category: textValue(item.category, "未分类"),
      productName: textValue(item.productName),
      workContent: textValue(item.workContent, ""),
      progress: textValue(item.progress),
      workHours: reportWorkHours(item),
      source: reportSourceLabel(item.source),
      remark: textValue(item.remark || item.orderNo, ""),
    });
  });
  detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, detail.rowCount), column: detail.columns.length } };
  detail.getRow(1).height = 24;
  detail.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4C1D95" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  detail.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE9D5FF" } },
        left: { style: "thin", color: { argb: "FFE9D5FF" } },
        bottom: { style: "thin", color: { argb: "FFE9D5FF" } },
        right: { style: "thin", color: { argb: "FFE9D5FF" } },
      };
      cell.alignment = { vertical: "middle", horizontal: colNumber === 9 ? "right" : "left", wrapText: [3, 6, 7, 11].includes(colNumber) };
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF5FF" } };
      }
    });
  });
  detail.getColumn("date").numFmt = "yyyy-mm-dd";
  detail.getColumn("workHours").numFmt = "0.0";
  detail.headerFooter.oddHeader = `&C运营汇总明细 - ${rangeLabel}`;
  detail.headerFooter.oddFooter = "&R第 &P / &N 页";

  addAiSummaryWorksheet(workbook, rangeLabel, workSummary);

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

const LAST_REPORT_EXPORT_KEY = "admin:lastMonthlyReportExport";

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function getDefaultReportRange(lang: "zh-CN" | "zh-TW") {
  const now = new Date();
  const today = formatDate(now);
  let startDate = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  let hint = lang === "zh-TW" ? "首次匯出，已預設選擇本月範圍。" : "首次导出，已默认选择本月范围。";

  try {
    const raw = window.localStorage.getItem(LAST_REPORT_EXPORT_KEY);
    const previous = raw ? JSON.parse(raw) : null;
    if (previous?.endDate && parseDate(previous.endDate)) {
      const nextDate = addDays(previous.endDate, 1);
      startDate = nextDate && nextDate <= today ? nextDate : today;
      hint = lang === "zh-TW"
        ? `上次匯出至：${previous.endDate}，本次已自動從 ${startDate} 開始。`
        : `上次导出至：${previous.endDate}，本次已自动从 ${startDate} 开始。`;
    }
  } catch {
    // localStorage 不可用时使用本月默认范围。
  }

  return { startDate, endDate: today, hint };
}

function saveReportRange(startDate: string, endDate: string) {
  try {
    window.localStorage.setItem(
      LAST_REPORT_EXPORT_KEY,
      JSON.stringify({ startDate, endDate, exportedAt: new Date().toISOString() }),
    );
  } catch {
    // 忽略本地记录失败，不影响报表导出。
  }
}

const I18N = {
  "zh-CN": {
    title: "运营总览",
    subtitle: "系统运行状态、服务工单及客户地理分布实时监测",
    searchPlaceholder: "快速搜索工单或客户...",
    exportReport: "导出运营汇总",
    reportDialog: {
      title: "导出运营汇总",
      description: "选择运营汇总统计日期，导出包含指标概览、分类统计和工单明细的 Excel 报表。",
      startDate: "开始日期",
      endDate: "结束日期",
      cancel: "取消",
      submit: "导出报表",
      invalidRange: "开始日期不能晚于结束日期",
    },
    stats: {
      todayTotal: "今日服务总数",
      monthTotal: "本月服务总数",
      monthCustomers: "本月客户数量",
      monthEngineerVisits: "本月工程师拜访数",
      realtime: "实时统计",
    },
    map: {
      title: "客户地理分布",
      description: "实时展示各区域客户密度及服务点位",
      suzhou: "苏州市",
      wuxi: "无锡市",
      kunshan: "昆山市",
    },
    recent: {
      title: "最近工单",
      description: "最新的服务记录",
      viewAll: "查看全部",
      loading: "加载中",
      empty: "暂无工单",
      unnamedCustomer: "—",
      serviceRecord: "服务记录",
      unnamedEngineer: "—",
    },
    errors: {
      loadFailed: "加载失败",
    },
    status: {
      draft: "草稿",
      assigned: "已派发",
      in_progress: "进行中",
      submitted: "已结案",
      pending_confirmation: "待确认",
      approved: "已审核",
      archived: "已归档",
      cancelled: "已作废",
      completed: "已完成",
    },
  },
  "zh-TW": {
    title: "運營總覽",
    subtitle: "系統運行狀態、服務工單及客戶地理分佈即時監測",
    searchPlaceholder: "快速搜尋工單或客戶...",
    exportReport: "匯出營運彙總",
    reportDialog: {
      title: "匯出營運彙總",
      description: "選擇營運彙總統計日期，匯出包含指標概覽、分類統計和工單明細的 Excel 報表。",
      startDate: "開始日期",
      endDate: "結束日期",
      cancel: "取消",
      submit: "匯出報表",
      invalidRange: "開始日期不能晚於結束日期",
    },
    stats: {
      todayTotal: "今日服務總數",
      monthTotal: "本月服務總數",
      monthCustomers: "本月客戶數量",
      monthEngineerVisits: "本月工程師拜訪數",
      realtime: "即時統計",
    },
    map: {
      title: "客戶地理分佈",
      description: "即時展示各區域客戶密度及服務點位",
      suzhou: "蘇州市",
      wuxi: "無錫市",
      kunshan: "昆山市",
    },
    recent: {
      title: "最近工單",
      description: "最新的服務記錄",
      viewAll: "查看全部",
      loading: "載入中",
      empty: "暫無工單",
      unnamedCustomer: "—",
      serviceRecord: "服務記錄",
      unnamedEngineer: "—",
    },
    errors: {
      loadFailed: "載入失敗",
    },
    status: {
      draft: "草稿",
      assigned: "已派發",
      in_progress: "進行中",
      submitted: "已結案",
      pending_confirmation: "待確認",
      approved: "已審核",
      archived: "已歸檔",
      cancelled: "已作廢",
      completed: "已完成",
    },
  },
} as const;

const STATUS_BADGE_VARIANT: Record<string, "warning" | "secondary" | "success" | "destructive" | "purple" | "info"> = {
  draft: "secondary",
  assigned: "warning",
  in_progress: "purple",
  submitted: "success",
  pending_confirmation: "warning",
  approved: "success",
  archived: "secondary",
  cancelled: "destructive",
  completed: "success",
};

function normalizeStatus(s: string, labels: Record<string, string>) {
  return labels[s] || s;
}

function getWorkflowStatus(order: Order) {
  return order.workflowStatus || order.status;
}

export function Dashboard() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = I18N[lang];
  const [summary, setSummary] = useState<Summary>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [mapPoints, setMapPoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportHint, setReportHint] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [stats, orderRes, customerRes] = await Promise.all([
          api.get("/service-orders/stats/overview"),
          api.get("/service-orders?pageSize=20&sortBy=createdAt&sortDir=desc"),
          api.get("/customers?pageSize=200").catch(() => null),
        ]);
        if (cancelled) return;
        setSummary(stats?.summary || {});
        const items = (stats?.recent || orderRes?.items || []) as Order[];
        setOrders(items);
        const rawCustomers = customerRes?.items || customerRes?.data?.items || customerRes?.data || [];
        setMapPoints(
          (Array.isArray(rawCustomers) ? rawCustomers : [])
            .map((c: any) => ({
              id: c.id,
              name: c.name || c.customerName || "未命名",
              lng: Number(c.longitude ?? c.lng ?? c.lon),
              lat: Number(c.latitude ?? c.lat),
              annualServices: c.annualServices ?? c.serviceOrderCount ?? c.orderCount ?? c.useCount ?? 0,
              address: c.address,
              contact: c.contactPerson || c.contact,
              phone: c.contactPhone || c.phone,
            }))
            .filter((p: any) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && p.lng !== 0 && p.lat !== 0)
        );
      } catch (e: any) {
        if (!cancelled) setError(e?.message || t.errors.loadFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [t.errors.loadFailed]);

  const stats = [
    { title: t.stats.todayTotal, value: summary.todayTotal ?? 0, icon: Wrench, color: "text-purple-600", bg: "bg-purple-50" },
    { title: t.stats.monthTotal, value: summary.monthTotal ?? 0, icon: BarChart3, color: "text-blue-600", bg: "bg-blue-50" },
    { title: t.stats.monthCustomers, value: summary.monthCustomers ?? 0, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: t.stats.monthEngineerVisits, value: summary.monthEngineerVisits ?? 0, icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
  ];

  const recentOrders = orders.slice(0, 5).map((o) => {
    const status = getWorkflowStatus(o);
    return {
      id: o.orderNo || `TK-${o.id}`,
      customer: typeof o.customer === "string" ? o.customer : o.customer?.name || o.deviceName || t.recent.unnamedCustomer,
      status,
      statusLabel: normalizeStatus(status, t.status),
      title: o.displayTitle || o.deviceName || t.recent.serviceRecord,
      engineer: o.engineerName || t.recent.unnamedEngineer,
      date: o.createdAt ? o.createdAt.split(" ")[0] : "",
    };
  });

  function submitSearch() {
    const keyword = searchQuery.trim();
    if (!keyword) return;
    navigate(`/service-orders?keyword=${encodeURIComponent(keyword)}`);
  }

  function navigateCity(city: string) {
    navigate(`/customers?keyword=${encodeURIComponent(city)}`);
  }

  function openReportDialog() {
    const range = getDefaultReportRange(lang);
    setReportStartDate(range.startDate);
    setReportEndDate(range.endDate);
    setReportHint(range.hint);
    setError("");
    setReportDialogOpen(true);
  }

  async function exportMonthlyReport() {
    if (exporting) return;
    if (!reportStartDate || !reportEndDate) return;
    if (reportStartDate > reportEndDate) {
      setError(t.reportDialog.invalidRange);
      return;
    }
    setExporting(true);
    setError("");
    try {
      const data = await api.get(`/service-orders/timesheet/monthly?startDate=${reportStartDate}&endDate=${reportEndDate}&engineerId=all&includeWorkSummary=1`);
      const rows = (data?.items || []) as OperationalReportItem[];
      const rangeLabel = data?.label || `${reportStartDate} 至 ${reportEndDate}`;
      await downloadOperationalSummaryWorkbook(reportFilename(reportStartDate, reportEndDate), rangeLabel, summary, rows, data?.workSummary || null);
      saveReportRange(reportStartDate, reportEndDate);
      setReportDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.loadFailed);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 w-64 bg-card"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
            />
          </div>
          <Button variant="outline" onClick={submitSearch} disabled={!searchQuery.trim()}>
            <Search className="w-4 h-4 mr-2" />
            搜索
          </Button>
          <Button onClick={openReportDialog} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {t.exportReport}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">
                    {loading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : stat.value}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{t.stats.realtime}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t.map.title}</CardTitle>
              <CardDescription>{t.map.description}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="cursor-pointer" onClick={() => navigateCity(t.map.suzhou)}>{t.map.suzhou}</Badge>
              <Badge variant="outline" className="cursor-pointer" onClick={() => navigateCity(t.map.wuxi)}>{t.map.wuxi}</Badge>
              <Badge variant="outline" className="cursor-pointer" onClick={() => navigateCity(t.map.kunshan)}>{t.map.kunshan}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px] p-0">
            <Amap
              center={{ lng: 120.71518, lat: 31.31962, name: "苏州办事处" }}
              points={mapPoints}
              zoom={9}
              height={420}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t.recent.title}</CardTitle>
              <CardDescription>{t.recent.description}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/service-orders")}>
              {t.recent.viewAll}
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.recent.loading}
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t.recent.empty}</div>
            ) : (
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="group relative flex items-start gap-4 p-3 -mx-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate("/service-orders")}
                  >
                    <div className={`mt-1 w-2 h-2 rounded-full ${
                      order.status === "in_progress" ? "bg-primary" : "bg-muted-foreground/30"
                    }`} />
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tracking-tight truncate">{order.id}</span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{order.date}</span>
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-1">{order.customer}</div>
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <Badge variant={STATUS_BADGE_VARIANT[order.status] || "secondary"} className="text-[10px] h-5 py-0 px-2 font-normal">
                          {order.statusLabel}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium">{order.engineer}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.reportDialog.title}</DialogTitle>
            <DialogDescription>{t.reportDialog.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {reportHint && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {reportHint}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                <span>{t.reportDialog.startDate}</span>
                <Input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{t.reportDialog.endDate}</span>
                <Input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)} disabled={exporting}>
              {t.reportDialog.cancel}
            </Button>
            <Button onClick={exportMonthlyReport} disabled={exporting || !reportStartDate || !reportEndDate}>
              {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t.reportDialog.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
