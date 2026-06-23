import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Download, TrendingUp, Users, Wrench, MapPin, Search, Loader2 } from "lucide-react";
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
  customerName?: string;
  customerAddress?: string;
  contactName?: string;
  contactPhone?: string;
  deviceName?: string;
  issueDescription?: string;
  internalNote?: string;
  engineerName?: string;
  engineers?: Array<{ id?: string | number; realName?: string; name?: string; username?: string }>;
  serviceType?: string;
  serviceMode?: string;
  timesheetCategory?: string;
  timesheetSalesperson?: string;
  priority?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  submittedAt?: string;
  createdAt?: string;
  updatedAt?: string;
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

function shortCompanyName(value: unknown, fallback = "-") {
  const name = textValue(value, fallback);
  if (name === fallback) return name;
  const compact = name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/(有限责任公司|股份有限公司|集团有限公司|集团股份有限公司|有限公司|集团|公司)$/u, "")
    .trim();
  return compact || name;
}

function summaryList(items?: string[]) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function summaryThemes(items?: WorkSummaryTheme[]) {
  return Array.isArray(items) ? items.filter((item) => item.theme || item.details) : [];
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
    searchPlaceholder: "快速搜索工单或客户…",
    exportReport: "AI 运营总结",
    reportDialog: {
      title: "AI 运营总结",
      description: "选择统计日期，使用 AI 根据工单生成运营总结并显示在当前页面。",
      startDate: "开始日期",
      endDate: "结束日期",
      cancel: "取消",
      submit: "生成总结",
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
    },
    recent: {
      title: "最近工单",
      description: "最新工单",
      viewAll: "查看全部",
      loading: "正在加载",
      empty: "暂无工单",
      unnamedCustomer: "—",
      serviceRecord: "工单",
      unnamedEngineer: "—",
      previewTitle: "工单预览",
      previewLoading: "正在加载工单详情…",
      previewFailed: "工单详情加载失败",
      openFull: "查看完整工单",
      close: "关闭",
    },
    detail: {
      customerName: "客户名称",
      contactName: "联系人",
      contactPhone: "联系电话",
      customerAddress: "客户地址",
      deviceName: "设备",
      engineer: "工程师",
      planTime: "计划时间",
      createdAt: "创建时间",
      submittedAt: "结案时间",
      updatedAt: "更新时间",
      salesperson: "业务人员",
      timesheetCategory: "工时类别",
      issueDescription: "详细描述",
      internalNote: "内部备注",
      unnamedContact: "未维护联系人",
      unnamedEngineer: "未指定",
      unnamedDevice: "未指定设备",
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
    type: {
      install: "安装",
      repair: "排障",
      maintain: "保养",
      inspect: "巡检",
      training: "培训",
      remote: "远程支持",
      other: "其他",
    },
    mode: {
      onsite: "现场服务",
      remote: "远程服务",
      office: "内勤工作",
    },
    priority: {
      low: "低",
      normal: "普通",
      high: "高",
      urgent: "紧急",
    },
  },
  "zh-TW": {
    title: "運營總覽",
    subtitle: "系統運行狀態、服務工單及客戶地理分佈即時監測",
    searchPlaceholder: "快速搜尋工單或客戶…",
    exportReport: "AI 營運總結",
    reportDialog: {
      title: "AI 營運總結",
      description: "選擇統計日期，使用 AI 根據服務記錄生成營運總結並顯示在目前頁面。",
      startDate: "開始日期",
      endDate: "結束日期",
      cancel: "取消",
      submit: "生成總結",
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
    },
    recent: {
      title: "最近工單",
      description: "最新的服務記錄",
      viewAll: "查看全部",
      loading: "正在載入",
      empty: "暫無工單",
      unnamedCustomer: "—",
      serviceRecord: "服務記錄",
      unnamedEngineer: "—",
      previewTitle: "工單預覽",
      previewLoading: "正在載入工單詳情…",
      previewFailed: "工單詳情載入失敗",
      openFull: "查看完整工單",
      close: "關閉",
    },
    detail: {
      customerName: "客戶名稱",
      contactName: "聯絡人",
      contactPhone: "聯絡電話",
      customerAddress: "客戶地址",
      deviceName: "設備",
      engineer: "工程師",
      planTime: "計畫時間",
      createdAt: "建立時間",
      submittedAt: "結案時間",
      updatedAt: "更新時間",
      salesperson: "業務人員",
      timesheetCategory: "工時類別",
      issueDescription: "詳細描述",
      internalNote: "內部備註",
      unnamedContact: "未維護聯絡人",
      unnamedEngineer: "未指定",
      unnamedDevice: "未指定設備",
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
    type: {
      install: "安裝",
      repair: "排障",
      maintain: "保養",
      inspect: "巡檢",
      training: "培訓",
      remote: "遠端支援",
      other: "其他",
    },
    mode: {
      onsite: "現場服務",
      remote: "遠端服務",
      office: "內勤工作",
    },
    priority: {
      low: "低",
      normal: "普通",
      high: "高",
      urgent: "緊急",
    },
  },
} as const;

const STATUS_BADGE_VARIANT: Record<string, "draft" | "warning" | "secondary" | "success" | "destructive" | "purple" | "info"> = {
  draft: "draft",
  assigned: "warning",
  in_progress: "purple",
  submitted: "success",
  pending_confirmation: "warning",
  approved: "success",
  archived: "secondary",
  cancelled: "destructive",
  completed: "success",
};

const TYPE_BADGE_VARIANT: Record<string, "success" | "warning" | "info" | "purple" | "secondary"> = {
  install: "success",
  repair: "warning",
  maintain: "info",
  inspect: "purple",
  training: "info",
  remote: "info",
  other: "secondary",
};

const MODE_BADGE_VARIANT: Record<string, "success" | "info" | "purple" | "secondary"> = {
  onsite: "success",
  remote: "info",
  office: "purple",
};

const PRIORITY_BADGE_VARIANT: Record<string, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  normal: "secondary",
  high: "warning",
  urgent: "destructive",
};

function normalizeStatus(s: string, labels: Record<string, string>) {
  return labels[s] || s;
}

function getWorkflowStatus(order: Order) {
  return order.workflowStatus || order.status;
}

function displayOrderId(order: Order) {
  return order.orderNo || order.displayId || `SR-${order.id}`;
}

function compactText(value?: string, fallback = "-") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return "-";
  if (start && end) return `${formatDateTime(start)} 至 ${formatDateTime(end)}`;
  return formatDateTime(start || end);
}

function engineerText(order: Order, fallback: string) {
  const names = (order.engineers || [])
    .map((engineer) => engineer.realName || engineer.name || engineer.username || "")
    .filter(Boolean);
  if (names.length) return names.join("、");
  return order.engineerName || fallback;
}

function PreviewField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm leading-6">{textValue(value)}</div>
    </div>
  );
}

function PreviewBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm leading-6">
        {compactText(value)}
      </div>
    </div>
  );
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
  const [workSummary, setWorkSummary] = useState<WorkSummaryResponse | null>(null);
  const [workSummaryRange, setWorkSummaryRange] = useState("");
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportHint, setReportHint] = useState("");
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

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

  const recentOrders = orders.slice(0, 7).map((o) => {
    const status = getWorkflowStatus(o);
    const customerName = typeof o.customer === "string" ? o.customer : o.customer?.name || o.customerName;
    return {
      key: String(o.id),
      source: o,
      id: displayOrderId(o),
      customer: shortCompanyName(customerName, t.recent.unnamedCustomer),
      status,
      statusLabel: normalizeStatus(status, t.status),
      title: o.issueDescription || o.displayTitle || o.deviceName || t.recent.serviceRecord,
      engineer: o.engineerName || t.recent.unnamedEngineer,
      date: o.createdAt ? o.createdAt.split(" ")[0] : "",
    };
  });

  function submitSearch() {
    const keyword = searchQuery.trim();
    if (!keyword) return;
    navigate(`/service-orders?keyword=${encodeURIComponent(keyword)}`);
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
      const rangeLabel = data?.label || `${reportStartDate} 至 ${reportEndDate}`;
      setWorkSummary((data?.workSummary || null) as WorkSummaryResponse | null);
      setWorkSummaryRange(rangeLabel);
      saveReportRange(reportStartDate, reportEndDate);
      setReportDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.loadFailed);
    } finally {
      setExporting(false);
    }
  }

  async function openOrderPreview(order: Order) {
    if (!order?.id) return;
    setPreviewOrder(order);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const data = await api.get(`/service-orders/${order.id}`);
      setPreviewOrder((data?.item || data) as Order);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : t.recent.previewFailed);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closeOrderPreview() {
    setPreviewOrder(null);
    setPreviewError("");
    setPreviewLoading(false);
  }

  function openFullOrder() {
    if (!previewOrder?.id) return;
    const keyword = (
      previewOrder.orderNo
      || previewOrder.displayId
      || previewOrder.customerName
      || previewOrder.issueDescription
      || String(previewOrder.id)
    );
    closeOrderPreview();
    navigate(`/service-orders?keyword=${encodeURIComponent(keyword)}`);
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
          <div className="relative min-w-0 flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="w-full bg-card pl-9 md:w-64"
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
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
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

      {workSummary && (
        <Card className="border-purple-100 bg-purple-50/40">
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>{lang === "zh-TW" ? "AI 營運總結" : "AI 运营总结"}</CardTitle>
                <CardDescription>
                  {workSummaryRange || "—"}
                  {workSummary.available && (workSummary.provider || workSummary.usage?.model)
                    ? ` · ${[workSummary.provider, workSummary.usage?.model].filter(Boolean).join(" / ")}`
                    : ""}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={openReportDialog} disabled={exporting}>
                {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                重新生成
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            {!workSummary.available || !workSummary.summary ? (
              <div className="rounded-lg border bg-background px-4 py-3 text-muted-foreground">
                {workSummary.reason || (lang === "zh-TW" ? "AI 營運總結暫不可用" : "AI 运营总结暂不可用")}
              </div>
            ) : (
              <>
                <p className="rounded-lg border bg-background px-4 py-3 leading-7">
                  {textValue(workSummary.summary.executiveSummary, lang === "zh-TW" ? "記錄未體現足夠的可總結內容。" : "记录未体现足够的可总结内容。")}
                </p>
                {summaryThemes(workSummary.summary.keyThemes).length > 0 && (
                  <div>
                    <div className="mb-2 font-medium">{lang === "zh-TW" ? "重點主題" : "重点主题"}</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {summaryThemes(workSummary.summary.keyThemes).map((item, index) => (
                        <div key={`${item.theme}-${index}`} className="rounded-lg border bg-background p-3">
                          <div className="font-medium">{item.theme || (lang === "zh-TW" ? "未命名主題" : "未命名主题")}</div>
                          <div className="mt-1 text-muted-foreground leading-6">
                            {item.evidenceCount ? `${item.evidenceCount} ${lang === "zh-TW" ? "條相關記錄" : "条相关记录"}：` : ""}{item.details || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {summaryList(workSummary.summary.customerImpact).length > 0 && (
                  <div>
                    <div className="mb-2 font-medium">{lang === "zh-TW" ? "客戶影響" : "客户影响"}</div>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {summaryList(workSummary.summary.customerImpact).map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {summaryList(workSummary.summary.riskSignals).length > 0 && (
                  <div>
                    <div className="mb-2 font-medium">{lang === "zh-TW" ? "風險信號" : "风险信号"}</div>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {summaryList(workSummary.summary.riskSignals).map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {summaryList(workSummary.summary.followUpRecommendations).length > 0 && (
                  <div>
                    <div className="mb-2 font-medium">{lang === "zh-TW" ? "後續建議" : "后续建议"}</div>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {summaryList(workSummary.summary.followUpRecommendations).map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {workSummary.summary.coverageNotes && (
                  <div className="text-xs text-muted-foreground">{workSummary.summary.coverageNotes}</div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="mb-4 px-1">
            <h2 className="text-xl font-semibold">{t.map.title}</h2>
            <p className="text-sm text-muted-foreground">{t.map.description}</p>
          </div>
          <Amap
            center={{ lng: 120.71518, lat: 31.31962, name: "苏州办事处" }}
            points={mapPoints}
            zoom={8}
            height={420}
          />
        </section>

        <Card className="lg:col-span-2 lg:mt-16 lg:h-[420px]">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t.recent.title}</CardTitle>
              <CardDescription>{t.recent.description}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/service-orders")}>
              <ArrowRight className="w-4 h-4 mr-1" />
              {t.recent.viewAll}
            </Button>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.recent.loading}
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t.recent.empty}</div>
            ) : (
              <div className="space-y-1.5">
                {recentOrders.map((order) => (
                  <div
                    key={order.key}
                    role="button"
                    tabIndex={0}
                    className="group relative flex items-center gap-3 -mx-3 rounded-xl px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => openOrderPreview(order.source)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openOrderPreview(order.source);
                      }
                    }}
                  >
                    <div className={`h-2 w-2 shrink-0 rounded-full ${
                      order.status === "in_progress" ? "bg-primary" : "bg-muted-foreground/30"
                    }`} />
                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,8rem)_minmax(0,12rem)_5.5rem_2.5rem_4rem] items-center gap-3 xl:grid-cols-[minmax(0,9rem)_minmax(0,14rem)_5.5rem_2.5rem_4rem]">
                      <span className="min-w-0 truncate text-sm font-semibold" title={order.customer}>{order.customer}</span>
                      <span className="min-w-0 truncate text-sm text-muted-foreground" title={order.title}>{order.title}</span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{order.date}</span>
                      <span className="shrink-0 whitespace-nowrap text-xs font-medium">{order.engineer}</span>
                      <Badge variant={STATUS_BADGE_VARIANT[order.status] || "secondary"} className="h-5 w-16 shrink-0 justify-center whitespace-nowrap px-2 py-0 text-xs font-normal">
                        {order.statusLabel}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(previewOrder)} onOpenChange={(open) => { if (!open) closeOrderPreview(); }}>
        <DialogContent
          className="flex h-[min(92vh,720px)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 sm:max-w-[760px]"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="px-6 pt-6 pr-12">
            <DialogTitle>{previewOrder ? displayOrderId(previewOrder) : t.recent.previewTitle}</DialogTitle>
            <DialogDescription>
              {previewOrder ? `${textValue(previewOrder.customerName)} · ${compactText(previewOrder.issueDescription, "")}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
            {previewLoading ? (
              <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
                {t.recent.previewLoading}
              </div>
            ) : null}
            {previewError ? (
              <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {previewError}
              </div>
            ) : null}
            {previewOrder ? (() => {
              const status = getWorkflowStatus(previewOrder);
              const statusLabel = previewOrder.displayStatus || normalizeStatus(status, t.status);
              const typeLabel = t.type[previewOrder.serviceType as keyof typeof t.type] || previewOrder.serviceType || "-";
              const modeLabel = t.mode[previewOrder.serviceMode as keyof typeof t.mode] || previewOrder.serviceMode || "-";
              const priorityLabel = t.priority[previewOrder.priority as keyof typeof t.priority] || previewOrder.priority || "-";
              return (
                <div className="space-y-5 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={STATUS_BADGE_VARIANT[status] || "secondary"}>{statusLabel}</Badge>
                    <Badge variant={TYPE_BADGE_VARIANT[previewOrder.serviceType || ""] || "outline"}>{typeLabel}</Badge>
                    <Badge variant={MODE_BADGE_VARIANT[previewOrder.serviceMode || ""] || "secondary"}>{modeLabel}</Badge>
                    <Badge variant={PRIORITY_BADGE_VARIANT[previewOrder.priority || ""] || "secondary"}>{priorityLabel}</Badge>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <PreviewField label={t.detail.customerName} value={previewOrder.customerName} />
                    <PreviewField label={t.detail.contactName} value={previewOrder.contactName || t.detail.unnamedContact} />
                    <PreviewField label={t.detail.contactPhone} value={previewOrder.contactPhone} />
                    <PreviewField label={t.detail.customerAddress} value={previewOrder.customerAddress} />
                    <PreviewField label={t.detail.deviceName} value={previewOrder.deviceName || t.detail.unnamedDevice} />
                    <PreviewField label={t.detail.engineer} value={engineerText(previewOrder, t.detail.unnamedEngineer)} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <PreviewField label={t.detail.planTime} value={formatDateRange(previewOrder.plannedStartAt, previewOrder.plannedEndAt)} />
                    <PreviewField label={t.detail.createdAt} value={formatDateTime(previewOrder.createdAt)} />
                    <PreviewField label={t.detail.submittedAt} value={formatDateTime(previewOrder.submittedAt)} />
                    <PreviewField label={t.detail.updatedAt} value={formatDateTime(previewOrder.updatedAt)} />
                    <PreviewField label={t.detail.salesperson} value={previewOrder.timesheetSalesperson} />
                    <PreviewField label={t.detail.timesheetCategory} value={previewOrder.timesheetCategory} />
                  </div>

                  <PreviewBlock label={t.detail.issueDescription} value={previewOrder.issueDescription} />
                  <PreviewBlock label={t.detail.internalNote} value={previewOrder.internalNote} />
                </div>
              );
            })() : null}
          </div>
          <DialogFooter className="flex-row justify-end border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={closeOrderPreview}>
              {t.recent.close}
            </Button>
            <Button onClick={openFullOrder} disabled={!previewOrder?.id}>
              <ArrowRight className="w-4 h-4 mr-2" />
              {t.recent.openFull}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {t.reportDialog.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
