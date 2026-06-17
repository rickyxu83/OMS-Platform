import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, Search, Loader2, Plus, Trash2, CheckCircle, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/services/api";

interface ServiceOrder {
  id: string | number;
  orderNo?: string;
  displayId?: string;
  displayTitle?: string;
  displayStatus?: string;
  workflowStatus?: string;
  status: string;
  customerName?: string;
  customerAddress?: string;
  contactName?: string;
  contactPhone?: string;
  deviceName?: string;
  serviceType?: string;
  serviceMode?: string;
  timesheetCategory?: string;
  timesheetSalesperson?: string;
  priority?: string;
  engineerName?: string;
  engineers?: Array<{ id?: string | number; realName?: string; name?: string; username?: string }>;
  serviceAt?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  issueDescription?: string;
  internalNote?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewComment?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface EngineerOption {
  id: string | number;
  realName?: string;
  username?: string;
}

interface CustomerOption {
  id: string | number;
  name?: string;
}

interface DeviceOption {
  id: string | number;
  name?: string;
  customerId?: string | number;
}

const I18N = {
  "zh-CN": {
    title: "工单处理",
    subtitle: "管理和查看服务工单",
    actions: {
      refresh: "刷新",
      retry: "重试",
      reset: "重置",
      export: "导出 Excel",
      exporting: "导出中…",
      saving: "保存中…",
      cancel: "取消",
    },
    filters: {
      searchPlaceholder: "搜索工单编号、客户、工程师、描述，可用空格组合...",
      statusPlaceholder: "状态筛选",
      all: "全部状态",
      allCustomers: "全部客户",
      customerPlaceholder: "客户筛选",
      startDate: "开始日期",
      endDate: "结束日期",
    },
    stats: {
      all: "全部工单",
      pending: "待确认",
      processing: "进行中",
      completed: "已结案",
    },
    list: {
      title: "工单列表",
      loading: "加载中…",
      empty: "暂无工单数据",
    },
    detail: {
      orderNo: "工单编号",
      customerName: "客户名称",
      contactName: "联系人",
      serviceType: "服务类型",
      serviceMode: "服务方式",
      currentStatus: "当前状态",
      engineer: "工程师",
      serviceTime: "服务时间",
      issueDescription: "详细描述",
      internalNote: "内部备注",
      descriptionPlaceholder: "服务描述",
      notePlaceholder: "添加内部备注...",
      unnamedEngineer: "未指定",
      unnamedContact: "未维护联系人",
    },
    errors: {
      loadFailed: "加载失败",
      saveFailed: "保存失败",
      exportFailed: "导出失败",
      exportEmpty: "当前筛选条件下暂无可导出的工单",
    },
    status: {
      draft: "草稿",
      assigned: "已派发",
      in_progress: "进行中",
      pending_confirmation: "待确认",
      submitted: "已结案",
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
  },
  "zh-TW": {
    title: "工單處理",
    subtitle: "管理和查看服務工單",
    actions: {
      refresh: "刷新",
      retry: "重試",
      reset: "重置",
      export: "匯出 Excel",
      exporting: "匯出中…",
      saving: "保存中…",
      cancel: "取消",
    },
    filters: {
      searchPlaceholder: "搜尋工單編號、客戶、工程師、描述，可用空格組合...",
      statusPlaceholder: "狀態篩選",
      all: "全部狀態",
      allCustomers: "全部客戶",
      customerPlaceholder: "客戶篩選",
      startDate: "開始日期",
      endDate: "結束日期",
    },
    stats: {
      all: "全部工單",
      pending: "待確認",
      processing: "進行中",
      completed: "已結案",
    },
    list: {
      title: "工單列表",
      loading: "載入中…",
      empty: "暫無工單資料",
    },
    detail: {
      orderNo: "工單編號",
      customerName: "客戶名稱",
      contactName: "聯絡人",
      serviceType: "服務類型",
      serviceMode: "服務方式",
      currentStatus: "當前狀態",
      engineer: "工程師",
      serviceTime: "服務時間",
      issueDescription: "詳細描述",
      internalNote: "內部備註",
      descriptionPlaceholder: "服務描述",
      notePlaceholder: "新增內部備註...",
      unnamedEngineer: "未指定",
      unnamedContact: "未維護聯絡人",
    },
    errors: {
      loadFailed: "載入失敗",
      saveFailed: "保存失敗",
      exportFailed: "匯出失敗",
      exportEmpty: "當前篩選條件下暫無可匯出的工單",
    },
    status: {
      draft: "草稿",
      assigned: "已派發",
      in_progress: "進行中",
      pending_confirmation: "待確認",
      submitted: "已結案",
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
  },
} as const;

const STATUS_BADGE_VARIANT: Record<string, "secondary" | "purple" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  assigned: "warning",
  in_progress: "purple",
  pending_confirmation: "warning",
  submitted: "success",
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

const PRIORITY_BADGE_VARIANT: Record<string, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  normal: "secondary",
  high: "warning",
  urgent: "destructive",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

const MODE_BADGE_VARIANT: Record<string, "success" | "info" | "purple" | "secondary"> = {
  onsite: "success",
  remote: "info",
  office: "purple",
};

const SERVICE_TYPE_SEARCH_ALIASES: Record<string, string> = {
  install: "安装 install",
  repair: "排障 维修 repair",
  maintain: "保养 维护 maintain",
  inspect: "巡检 巡检类 inspect",
  training: "培训 training",
  remote: "远程 远程支持 remote",
  other: "其他 other",
};

const SERVICE_MODE_SEARCH_ALIASES: Record<string, string> = {
  onsite: "现场 现场服务 onsite",
  remote: "远程 远程服务 remote",
  office: "内勤 内勤工作 office",
};

const ORDER_LIST_GRID = "xl:grid-cols-[28px_minmax(140px,1fr)_88px_minmax(140px,1.35fr)_minmax(84px,0.8fr)_112px_76px_128px]";

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function formatDateOnly(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

function cleanDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizedDateRange(startDate: string, endDate: string) {
  const start = cleanDate(startDate);
  const end = cleanDate(endDate);
  if (start && end && start > end) return { startDate: end, endDate: start };
  return { startDate: start, endDate: end };
}

function safeSheetName(value: string, fallback: string) {
  const cleaned = value.replace(/[\\/?*\[\]:]/g, " ").trim() || fallback;
  return cleaned.slice(0, 31);
}

function safeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "").slice(0, 40);
}

function displayId(order: ServiceOrder) {
  return order.orderNo || order.displayId || `SR-${order.id}`;
}

function getWorkflowStatus(order: ServiceOrder) {
  return order.workflowStatus || order.status;
}

function textValue(value?: string, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function compactText(value?: string, fallback = "-") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function splitSearchTerms(value: string) {
  return value
    .trim()
    .split(/[\s,，、]+/)
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function engineerText(order: ServiceOrder, fallback: string) {
  const names = (order.engineers || [])
    .map((engineer) => engineer.realName || engineer.name || engineer.username || "")
    .filter(Boolean);
  if (names.length) return names.join("、");
  return order.engineerName || fallback;
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return "-";
  if (start && end) return `${formatDateTime(start)} 至 ${formatDateTime(end)}`;
  return formatDateTime(start || end);
}

function DetailField({ label, value, muted = false }: { label: string; value?: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 break-words text-sm leading-6 ${muted ? "text-muted-foreground" : ""}`}>
        {textValue(value)}
      </div>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm leading-6">
        {compactText(value)}
      </div>
    </div>
  );
}

export function ServiceOrders() {
  const { lang } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = I18N[lang];
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState(searchParams.get("customerId") || "all");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("keyword") || searchParams.get("q") || "");
  // 搜索词防抖:输入框即时响应,列表与服务端请求在停顿后一起更新,避免逐字改动列表高度
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  // 请求序号守卫:慢请求的过期响应不再覆盖新结果
  const loadSeqRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createForm, setCreateForm] = useState({
    customerId: "",
    deviceId: "",
    serviceMode: "onsite",
    serviceType: "repair",
    timesheetCategory: "",
    engineerId: "none",
    plannedStartAt: "",
    plannedEndAt: "",
    priority: "normal",
    issueDescription: "",
    internalNote: "",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOrder, setConfirmOrder] = useState<ServiceOrder | null>(null);
  const [confirmForm, setConfirmForm] = useState({ engineerId: "", plannedStartAt: "", plannedEndAt: "" });
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOrder, setAssignOrder] = useState<ServiceOrder | null>(null);
  const [assignForm, setAssignForm] = useState({ engineerIds: [] as string[], plannedStartAt: "", plannedEndAt: "", note: "" });
  const [assignFiles, setAssignFiles] = useState<File[]>([]);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitionOrder, setTransitionOrder] = useState<ServiceOrder | null>(null);
  const [transitionForm, setTransitionForm] = useState({ status: "assigned", reason: "" });
  const [detailOrder, setDetailOrder] = useState<ServiceOrder | null>(null);
  const statusOptions = [
    { value: "all", label: t.filters.all },
    { value: "draft", label: t.status.draft },
    { value: "in_progress", label: t.status.in_progress },
    { value: "pending_confirmation", label: t.status.pending_confirmation },
    { value: "submitted", label: t.status.submitted },
    { value: "cancelled", label: t.status.cancelled },
  ];

  useEffect(() => {
    const keyword = searchParams.get("keyword") || searchParams.get("q") || "";
    setSearchQuery(keyword);
    setCustomerFilter(searchParams.get("customerId") || "all");
    setStartDate(searchParams.get("startDate") || "");
    setEndDate(searchParams.get("endDate") || "");
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      api.get("/customers?pageSize=200").then((data) => setCustomers(data?.items || [])).catch(() => setCustomers([])),
      api.get("/devices").then((data) => setDevices(data?.items || [])).catch(() => setDevices([])),
      api.get("/users/engineers").then((data) => setEngineers(data?.items || [])).catch(() => setEngineers([])),
    ]).catch(() => undefined);
  }, []);

  async function load() {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const range = normalizedDateRange(startDate, endDate);
      const params = new URLSearchParams({
        pageSize: "50",
        sortBy: "createdAt",
        sortDir: "desc",
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (customerFilter !== "all") params.set("customerId", customerFilter);
      if (range.startDate) params.set("startDate", range.startDate);
      if (range.endDate) params.set("endDate", range.endDate);
      if (debouncedSearch.trim()) params.set("keyword", debouncedSearch.trim());
      const data = await api.get(`/service-orders?${params.toString()}`);
      if (seq !== loadSeqRef.current) return; // 已有更新的请求,丢弃过期响应
      const items = (data?.items || []) as ServiceOrder[];
      setOrders(items);
      setTotal(Number(data?.total ?? items.length));
      setSelectedIds((ids) => ids.filter((id) => items.some((item) => String(item.id) === String(id))));
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      const msg = e instanceof Error ? e.message : t.errors.loadFailed;
      setError(msg);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, customerFilter, startDate, endDate, debouncedSearch]);

  useEffect(() => {
    const orderId = searchParams.get("orderId");
    if (!orderId) return;
    if (detailOrder && String(detailOrder.id) === orderId) return;

    const matched = orders.find((order) => String(order.id) === orderId);
    if (matched) {
      setDetailOrder(matched);
      return;
    }

    let cancelled = false;
    async function loadOrderDetail() {
      try {
        const data = await api.get(`/service-orders/${orderId}`);
        if (!cancelled) setDetailOrder((data?.item || data) as ServiceOrder);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t.errors.loadFailed);
      }
    }

    loadOrderDetail();
    return () => {
      cancelled = true;
    };
  }, [searchParams, orders, detailOrder, t.errors.loadFailed]);

  const filteredOrders = useMemo(() => {
    const terms = splitSearchTerms(debouncedSearch);
    if (!terms.length) return orders;
    return orders.filter((order) => {
      const workflowStatus = getWorkflowStatus(order);
      const searchText = [
        displayId(order),
        order.customerName,
        order.customerAddress,
        order.deviceName,
        engineerText(order, ""),
        order.issueDescription,
        order.internalNote,
        order.timesheetCategory,
        order.timesheetSalesperson,
        order.serviceType,
        t.type[order.serviceType as keyof typeof t.type],
        SERVICE_TYPE_SEARCH_ALIASES[order.serviceType || ""],
        order.serviceMode,
        t.mode[order.serviceMode as keyof typeof t.mode],
        SERVICE_MODE_SEARCH_ALIASES[order.serviceMode || ""],
        workflowStatus,
        t.status[workflowStatus as keyof typeof t.status],
      ].filter(Boolean).join(" ").toLowerCase();
      return terms.every((term) => searchText.includes(term));
    });
  }, [orders, debouncedSearch, t.mode, t.status, t.type]);

  const initialLoading = loading && orders.length === 0;
  const refreshing = loading && orders.length > 0;

  const selectedCustomerName = useMemo(() => {
    if (customerFilter === "all") return "";
    return customers.find((customer) => String(customer.id) === customerFilter)?.name || "";
  }, [customerFilter, customers]);

  const stats = useMemo(() => {
    const all = orders.length;
    const pending = orders.filter((o) => getWorkflowStatus(o) === "pending_confirmation").length;
    const processing = orders.filter((o) => getWorkflowStatus(o) === "in_progress").length;
    const submitted = orders.filter((o) => ["submitted", "approved", "archived", "completed"].includes(getWorkflowStatus(o))).length;
    return [
      { label: t.stats.all, value: all },
      { label: t.stats.pending, value: pending },
      { label: t.stats.processing, value: processing },
      { label: t.stats.completed, value: submitted },
    ];
  }, [orders, t.stats]);

  function openCreateOrder() {
    setCreateForm({
      customerId: "",
      deviceId: "",
      serviceMode: "onsite",
      serviceType: "repair",
      timesheetCategory: "",
      engineerId: "none",
      plannedStartAt: "",
      plannedEndAt: "",
      priority: "normal",
      issueDescription: "",
      internalNote: "",
    });
    setCreateFiles([]);
    setCreateOpen(true);
  }

  function applyNameFilter(value?: string) {
    const keyword = textValue(value, "").trim();
    if (!keyword) return;
    setSearchQuery(keyword);
    setSearchParams(() => {
      const range = normalizedDateRange(startDate, endDate);
      const next = new URLSearchParams();
      next.set("keyword", keyword);
      if (customerFilter !== "all") next.set("customerId", customerFilter);
      if (range.startDate) next.set("startDate", range.startDate);
      if (range.endDate) next.set("endDate", range.endDate);
      return next;
    });
  }

  function resetFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setCustomerFilter("all");
    setStartDate("");
    setEndDate("");
    setSearchParams({});
  }

  function closeDetailOrder() {
    setDetailOrder(null);
    if (!searchParams.has("orderId")) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("orderId");
      return next;
    });
  }

  function buildListParams(page: number, pageSize: number) {
    const range = normalizedDateRange(startDate, endDate);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy: "createdAt",
      sortDir: "desc",
    });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (customerFilter !== "all") params.set("customerId", customerFilter);
    if (range.startDate) params.set("startDate", range.startDate);
    if (range.endDate) params.set("endDate", range.endDate);
    if (searchQuery.trim()) params.set("keyword", searchQuery.trim());
    return params;
  }

  async function fetchExportOrders() {
    const pageSize = 100;
    let page = 1;
    let totalCount = 0;
    const allItems: ServiceOrder[] = [];
    do {
      const data = await api.get(`/service-orders?${buildListParams(page, pageSize).toString()}`);
      const items = (data?.items || []) as ServiceOrder[];
      allItems.push(...items);
      totalCount = Number(data?.total ?? allItems.length);
      if (!items.length) break;
      page += 1;
    } while (allItems.length < totalCount);
    return allItems;
  }

  async function exportOrders() {
    setExporting(true);
    setError("");
    try {
      const items = await fetchExportOrders();
      if (!items.length) {
        setError(t.errors.exportEmpty);
        return;
      }

      const [{ Workbook }, { saveAs }] = await Promise.all([
        import("exceljs"),
        import("file-saver"),
      ]);
      const workbook = new Workbook();
      workbook.creator = "Service Sheet RC";
      workbook.created = new Date();
      workbook.modified = new Date();
      const worksheet = workbook.addWorksheet(safeSheetName(selectedCustomerName || "工单导出", "工单导出"), {
        views: [{ state: "frozen", ySplit: 1 }],
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      worksheet.columns = [
        { header: "工单编号", key: "orderNo", width: 20 },
        { header: "客户名称", key: "customerName", width: 26 },
        { header: "联系人", key: "contactName", width: 14 },
        { header: "联系电话", key: "contactPhone", width: 16 },
        { header: "客户地址", key: "customerAddress", width: 30 },
        { header: "设备", key: "deviceName", width: 18 },
        { header: "服务方式", key: "serviceMode", width: 12 },
        { header: "服务类型", key: "serviceType", width: 12 },
        { header: "优先级", key: "priority", width: 10 },
        { header: "工程师", key: "engineerName", width: 18 },
        { header: "计划开始", key: "plannedStartAt", width: 18 },
        { header: "计划结束", key: "plannedEndAt", width: 18 },
        { header: "状态", key: "status", width: 12 },
        { header: "创建时间", key: "createdAt", width: 18 },
        { header: "更新时间", key: "updatedAt", width: 18 },
        { header: "问题描述", key: "issueDescription", width: 42 },
        { header: "内部备注", key: "internalNote", width: 28 },
      ];

      items.forEach((order) => {
        worksheet.addRow({
          orderNo: displayId(order),
          customerName: order.customerName || "",
          contactName: order.contactName || "",
          contactPhone: order.contactPhone || "",
          customerAddress: order.customerAddress || "",
          deviceName: order.deviceName || "",
          serviceMode: t.mode[order.serviceMode as keyof typeof t.mode] || order.serviceMode || "",
          serviceType: t.type[order.serviceType as keyof typeof t.type] || order.serviceType || order.timesheetCategory || "",
          priority: PRIORITY_LABELS[order.priority || ""] || order.priority || "",
          engineerName: engineerText(order, ""),
          plannedStartAt: formatDateTime(order.plannedStartAt),
          plannedEndAt: formatDateTime(order.plannedEndAt),
          status: order.displayStatus || t.status[getWorkflowStatus(order) as keyof typeof t.status] || getWorkflowStatus(order) || "",
          createdAt: formatDateTime(order.createdAt),
          updatedAt: formatDateTime(order.updatedAt),
          issueDescription: compactText(order.issueDescription, ""),
          internalNote: compactText(order.internalNote, ""),
        });
      });

      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, worksheet.rowCount), column: worksheet.columns.length },
      };
      worksheet.getRow(1).height = 24;
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFB7C9D6" } },
          left: { style: "thin", color: { argb: "FFB7C9D6" } },
          bottom: { style: "thin", color: { argb: "FFB7C9D6" } },
          right: { style: "thin", color: { argb: "FFB7C9D6" } },
        };
      });
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 22;
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFD9E2EC" } },
            left: { style: "thin", color: { argb: "FFD9E2EC" } },
            bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
            right: { style: "thin", color: { argb: "FFD9E2EC" } },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: [11, 12, 14, 15].includes(colNumber) ? "center" : "left",
            wrapText: [5, 16, 17].includes(colNumber),
          };
          if (rowNumber % 2 === 0) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAFC" } };
          }
        });
      });

      const range = normalizedDateRange(startDate, endDate);
      const datePart = range.startDate || range.endDate ? `${range.startDate || "不限"}-至-${range.endDate || "不限"}` : new Date().toISOString().slice(0, 10);
      const customerPart = selectedCustomerName ? `-${safeFilenamePart(selectedCustomerName)}` : "";
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `工单导出${customerPart}-${datePart}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  async function createOrder() {
    if (!createForm.customerId || !createForm.serviceType || !createForm.issueDescription.trim()) {
      setError("请选择客户、服务类型并填写问题描述");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await api.post("/service-orders", {
        customerId: Number(createForm.customerId),
        deviceId: createForm.deviceId && createForm.deviceId !== "none" ? Number(createForm.deviceId) : null,
        serviceMode: createForm.serviceMode,
        serviceType: createForm.serviceMode === "onsite" ? createForm.serviceType : "other",
        timesheetCategory: createForm.serviceMode === "onsite" ? null : createForm.timesheetCategory || "其他",
        engineerId: createForm.engineerId && createForm.engineerId !== "none" ? Number(createForm.engineerId) : undefined,
        plannedStartAt: createForm.plannedStartAt || undefined,
        plannedEndAt: createForm.plannedEndAt || undefined,
        priority: createForm.priority,
        issueDescription: createForm.issueDescription.trim(),
        internalNote: createForm.internalNote.trim() || null,
      });
      if (createFiles.length && created?.id) {
        await uploadOrderFiles(created.id, createFiles);
      }
      setCreateOpen(false);
      setCreateFiles([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建工单失败");
    } finally {
      setSaving(false);
    }
  }

  function openConfirmInspection(order: ServiceOrder) {
    setConfirmOrder(order);
    setConfirmForm({ engineerId: "", plannedStartAt: "", plannedEndAt: "" });
    setConfirmOpen(true);
  }

  async function confirmInspection() {
    if (!confirmOrder?.id || !confirmForm.engineerId) {
      setError("请选择派发工程师");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${confirmOrder.id}/confirm-inspection`, {
        engineerId: Number(confirmForm.engineerId),
        plannedStartAt: confirmForm.plannedStartAt || undefined,
        plannedEndAt: confirmForm.plannedEndAt || undefined,
      });
      setConfirmOpen(false);
      setConfirmOrder(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认巡检失败");
    } finally {
      setSaving(false);
    }
  }

  async function bulkDeleteOrders() {
    if (!selectedIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 张服务表？此操作会删除相关报告、附件和工程师关联。`)) return;
    setSaving(true);
    setError("");
    try {
      await api.post("/service-orders/bulk-delete", { ids: selectedIds });
      setSelectedIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量删除失败");
    } finally {
      setSaving(false);
    }
  }

  function openAssign(order: ServiceOrder) {
    setAssignOrder(order);
    setAssignForm({
      engineerIds: (order.engineers || [])
        .map((engineer: any) => String(engineer.id || ""))
        .filter(Boolean),
      plannedStartAt: order.plannedStartAt ? String(order.plannedStartAt).replace(" ", "T").slice(0, 16) : "",
      plannedEndAt: order.plannedEndAt ? String(order.plannedEndAt).replace(" ", "T").slice(0, 16) : "",
      note: "",
    });
    setAssignFiles([]);
    setAssignOpen(true);
  }

  function toggleAssignEngineer(engineerId: string | number, checked: boolean) {
    const id = String(engineerId);
    setAssignForm((form) => ({
      ...form,
      engineerIds: checked
        ? [...form.engineerIds, id].filter((value, index, values) => values.indexOf(value) === index)
        : form.engineerIds.filter((value) => value !== id),
    }));
  }

  async function uploadOrderFiles(orderId: string | number, files: File[]) {
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("ownerType", "service_order");
      formData.append("ownerId", String(orderId));
      await api.postForm("/files", formData);
    }
  }

  async function assignOrderToEngineer() {
    if (!assignOrder?.id || !assignForm.engineerIds.length) {
      setError("请至少选择一位派发工程师");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${assignOrder.id}/assign`, {
        primaryEngineerId: Number(assignForm.engineerIds[0]),
        engineerIds: assignForm.engineerIds.map(Number),
        plannedStartAt: assignForm.plannedStartAt || undefined,
        plannedEndAt: assignForm.plannedEndAt || undefined,
        note: assignForm.note || undefined,
      });
      if (assignFiles.length) {
        await uploadOrderFiles(assignOrder.id, assignFiles);
      }
      setAssignOpen(false);
      setAssignOrder(null);
      setAssignFiles([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "派单失败");
    } finally {
      setSaving(false);
    }
  }

  function openTransition(order: ServiceOrder) {
    setTransitionOrder(order);
    setTransitionForm({ status: getWorkflowStatus(order) === "in_progress" ? "submitted" : "in_progress", reason: "" });
    setTransitionOpen(true);
  }

  async function transitionSelectedOrder() {
    if (!transitionOrder?.id || !transitionForm.status) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${transitionOrder.id}/transition`, {
        status: transitionForm.status,
        reason: transitionForm.reason || undefined,
      });
      setTransitionOpen(false);
      setTransitionOrder(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "状态流转失败");
    } finally {
      setSaving(false);
    }
  }

  const deviceOptions = createForm.customerId
    ? devices.filter((device) => String(device.customerId) === createForm.customerId)
    : devices;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={saving}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t.actions.refresh}
          </Button>
          <Button variant="outline" onClick={exportOrders} disabled={saving || exporting || loading}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {exporting ? t.actions.exporting : t.actions.export}
          </Button>
          <Button variant="outline" onClick={bulkDeleteOrders} disabled={saving || !selectedIds.length}>
            <Trash2 className="w-4 h-4 mr-2" />
            批量删除{selectedIds.length ? ` (${selectedIds.length})` : ""}
          </Button>
          <Button onClick={openCreateOrder} disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />
            新建工单
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>{t.actions.retry}</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-bold mt-1">
                {initialLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_220px_150px_150px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t.filters.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  // 回车跳过防抖立即搜索(值未变时由 effect 去重,不会重复请求)
                  if (e.key === "Enter") setDebouncedSearch(searchQuery);
                }}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t.filters.statusPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t.filters.customerPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.filters.allCustomers}</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={String(customer.id)}>
                    {customer.name || `客户 #${customer.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label={t.filters.startDate}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              aria-label={t.filters.endDate}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={resetFilters}
            >
              {t.actions.reset}
            </Button>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            当前条件匹配 {total} 张工单；导出会包含所有匹配记录，不只当前页。
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t.list.title} ({filteredOrders.length}/{total || filteredOrders.length})
            {refreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t.list.loading} />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {initialLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.list.loading}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">{t.list.empty}</div>
          ) : (
            <div className="space-y-3">
              <div className={`hidden rounded-md bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground xl:grid ${ORDER_LIST_GRID} xl:items-center xl:gap-3`}>
                <div />
                <div>Case ID / 客户</div>
                <div>{t.detail.serviceMode}</div>
                <div>主要内容</div>
                <div>工程师</div>
                <div>服务时间</div>
                <div>状态</div>
                <div className="text-right">操作</div>
              </div>
              {filteredOrders.map((order) => {
                const statusLabel = order.displayStatus || t.status[getWorkflowStatus(order) as keyof typeof t.status] || getWorkflowStatus(order) || "-";
                const modeLabel = t.mode[order.serviceMode as keyof typeof t.mode] || order.serviceMode || "-";
                const canConfirmInspection = getWorkflowStatus(order) === "pending_confirmation" && order.serviceType === "inspect";
                const canAssign = getWorkflowStatus(order) !== "cancelled" && getWorkflowStatus(order) !== "submitted";
                return (
                  <div key={order.id} className="rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
                    <div className={`grid min-w-0 gap-3 xl:grid ${ORDER_LIST_GRID} xl:items-center`}>
                      <div>
                        <Checkbox
                          checked={selectedIds.some((id) => String(id) === String(order.id))}
                          onCheckedChange={(checked) => {
                            setSelectedIds((ids) => checked
                              ? [...ids, order.id]
                              : ids.filter((id) => String(id) !== String(order.id)));
                          }}
                        />
                      </div>

                      <div className="min-w-0">
                          <div className="font-semibold tracking-tight">{displayId(order)}</div>
                          <button
                            type="button"
                            className="block max-w-full truncate text-left text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
                            title={`按客户过滤：${textValue(order.customerName)}`}
                            onClick={() => applyNameFilter(order.customerName)}
                          >
                            {textValue(order.customerName)}
                          </button>
                        </div>

                        <div className="min-w-0">
                          <Badge variant={MODE_BADGE_VARIANT[order.serviceMode || ""] || "secondary"}>{modeLabel}</Badge>
                        </div>

                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium">{compactText(order.issueDescription)}</span>
                        </div>

                        <div className="min-w-0 text-sm">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left transition-colors hover:text-primary hover:underline disabled:cursor-default disabled:text-current disabled:no-underline"
                            title={`按工程师过滤：${engineerText(order, t.detail.unnamedEngineer)}`}
                            onClick={() => applyNameFilter(engineerText(order, ""))}
                            disabled={!engineerText(order, "")}
                          >
                            {engineerText(order, t.detail.unnamedEngineer)}
                          </button>
                        </div>

                        <div className="min-w-0 space-y-0.5 whitespace-nowrap text-xs">
                          <div>
                            <span className="text-muted-foreground">开始：</span>
                            <span>{formatDateOnly(order.plannedStartAt)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">结束：</span>
                            <span>{formatDateOnly(order.plannedEndAt)}</span>
                          </div>
                        </div>

                        <div>
                          <Badge variant={STATUS_BADGE_VARIANT[getWorkflowStatus(order)] || "secondary"}>
                            {statusLabel}
                          </Badge>
                        </div>

                        <div className="flex min-w-0 flex-wrap gap-2 xl:justify-end">
                          <Button variant="outline" size="sm" onClick={() => setDetailOrder(order)}>
                            详情
                          </Button>
                          {canConfirmInspection && (
                            <Button variant="outline" size="sm" onClick={() => openConfirmInspection(order)} disabled={saving}>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              确认巡检
                            </Button>
                          )}
                          {canAssign && (
                            <Button variant="outline" size="sm" onClick={() => openAssign(order)} disabled={saving}>
                              派单 / 改派
                            </Button>
                          )}
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailOrder)} onOpenChange={(open) => { if (!open) closeDetailOrder(); }}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>{detailOrder ? displayId(detailOrder) : "工单详情"}</DialogTitle>
            <DialogDescription>
              {detailOrder ? `${textValue(detailOrder.customerName)} · ${compactText(detailOrder.issueDescription, "")}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detailOrder && (() => {
            const statusLabel = detailOrder.displayStatus || t.status[getWorkflowStatus(detailOrder) as keyof typeof t.status] || getWorkflowStatus(detailOrder) || "-";
            const typeLabel = t.type[detailOrder.serviceType as keyof typeof t.type] || detailOrder.serviceType || "-";
            const modeLabel = t.mode[detailOrder.serviceMode as keyof typeof t.mode] || detailOrder.serviceMode || "-";
            const priorityLabel = PRIORITY_LABELS[detailOrder.priority || ""] || detailOrder.priority || "-";
            return (
              <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={STATUS_BADGE_VARIANT[getWorkflowStatus(detailOrder)] || "secondary"}>{statusLabel}</Badge>
                  <Badge variant={TYPE_BADGE_VARIANT[detailOrder.serviceType || ""] || "outline"}>{typeLabel}</Badge>
                  <Badge variant="secondary">{modeLabel}</Badge>
                  <Badge variant={PRIORITY_BADGE_VARIANT[detailOrder.priority || ""] || "secondary"}>{priorityLabel}</Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <DetailField label={t.detail.customerName} value={detailOrder.customerName} />
                  <DetailField label={t.detail.contactName} value={detailOrder.contactName || t.detail.unnamedContact} />
                  <DetailField label="联系电话" value={detailOrder.contactPhone} />
                  <DetailField label="客户地址" value={detailOrder.customerAddress} />
                  <DetailField label="设备" value={detailOrder.deviceName || "未指定设备"} />
                  <DetailField label={t.detail.engineer} value={engineerText(detailOrder, t.detail.unnamedEngineer)} />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <DetailField label="计划时间" value={formatDateRange(detailOrder.plannedStartAt, detailOrder.plannedEndAt)} />
                  <DetailField label="创建时间" value={formatDateTime(detailOrder.createdAt)} />
                  <DetailField label="结案时间" value={formatDateTime(detailOrder.submittedAt)} />
                  <DetailField label="更新时间" value={formatDateTime(detailOrder.updatedAt)} />
                  <DetailField label="业务人员" value={detailOrder.timesheetSalesperson} />
                  <DetailField label="工时类别" value={detailOrder.timesheetCategory} />
                </div>

                <DetailBlock label={t.detail.issueDescription} value={detailOrder.issueDescription} />
                <DetailBlock label={t.detail.internalNote} value={detailOrder.internalNote} />

                {(detailOrder.reviewedAt || detailOrder.reviewComment) && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">审核信息</div>
                    <div className="mt-1 text-sm leading-6">
                      {formatDateTime(detailOrder.reviewedAt)}
                      {detailOrder.reviewComment ? ` · ${compactText(detailOrder.reviewComment, "")}` : ""}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={closeDetailOrder}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>新建工单</DialogTitle>
            <DialogDescription>可先保存为草稿；选择工程师后会立即派发到对应工程师的工作台。</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label>客户 *</Label>
              <Select value={createForm.customerId} onValueChange={(v) => setCreateForm({ ...createForm, customerId: v, deviceId: "" })}>
                <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>{customer.name || `客户 #${customer.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>设备</Label>
              <Select value={createForm.deviceId} onValueChange={(v) => setCreateForm({ ...createForm, deviceId: v })}>
                <SelectTrigger><SelectValue placeholder="不指定设备" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不指定设备</SelectItem>
                  {deviceOptions.map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>{device.name || `设备 #${device.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>服务方式</Label>
              <Select value={createForm.serviceMode} onValueChange={(v) => setCreateForm({ ...createForm, serviceMode: v, deviceId: createForm.deviceId === "none" ? "" : createForm.deviceId })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onsite">现场服务</SelectItem>
                  <SelectItem value="remote">远程服务</SelectItem>
                  <SelectItem value="office">内勤工作</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{createForm.serviceMode === "onsite" ? "服务类型" : "工时类别"}</Label>
              {createForm.serviceMode === "onsite" ? (
                <Select value={createForm.serviceType} onValueChange={(v) => setCreateForm({ ...createForm, serviceType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="install">安装</SelectItem>
                    <SelectItem value="repair">排障</SelectItem>
                    <SelectItem value="maintain">保养</SelectItem>
                    <SelectItem value="inspect">巡检</SelectItem>
                    <SelectItem value="training">培训</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={createForm.timesheetCategory} onChange={(e) => setCreateForm({ ...createForm, timesheetCategory: e.target.value })} placeholder={createForm.serviceMode === "remote" ? "排障 / 调配 / 协调 / 会议 / 其他" : "方案准备 / 文档整理 / 网络会议 / 培训学习 / 其他"} />
              )}
            </div>
            <div className="space-y-2">
              <Label>优先级</Label>
              <Select value={createForm.priority} onValueChange={(v) => setCreateForm({ ...createForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">低</SelectItem>
                  <SelectItem value="normal">普通</SelectItem>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="urgent">紧急</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>派发工程师</Label>
              <Select value={createForm.engineerId} onValueChange={(v) => setCreateForm({ ...createForm, engineerId: v })}>
                <SelectTrigger><SelectValue placeholder="创建后暂不派发" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">创建后暂不派发</SelectItem>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={String(engineer.id)}>
                      {engineer.realName || engineer.username || `工程师 #${engineer.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>计划开始</Label>
              <Input type="datetime-local" value={createForm.plannedStartAt} onChange={(e) => setCreateForm({ ...createForm, plannedStartAt: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>计划结束</Label>
              <Input type="datetime-local" value={createForm.plannedEndAt} onChange={(e) => setCreateForm({ ...createForm, plannedEndAt: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>问题描述 *</Label>
              <Textarea value={createForm.issueDescription} onChange={(e) => setCreateForm({ ...createForm, issueDescription: e.target.value })} rows={3} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>内部备注</Label>
              <Textarea value={createForm.internalNote} onChange={(e) => setCreateForm({ ...createForm, internalNote: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>附件</Label>
              <Input
                type="file"
                multiple
                onChange={(event) => setCreateFiles(Array.from(event.target.files || []))}
              />
              <p className="text-xs text-muted-foreground">选择工程师后可随工单派发给工程师查看；未派发时附件会先保存到工单中。</p>
              {createFiles.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  {createFiles.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="truncate">{file.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={createOrder} disabled={saving}>{saving ? "创建中…" : "创建工单"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>确认巡检并派发</DialogTitle>
            <DialogDescription>确认后该巡检工单会变为已派发，工程师端可看到任务。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>派发工程师 *</Label>
              <Select value={confirmForm.engineerId} onValueChange={(v) => setConfirmForm({ ...confirmForm, engineerId: v })}>
                <SelectTrigger><SelectValue placeholder="选择工程师" /></SelectTrigger>
                <SelectContent>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={String(engineer.id)}>{engineer.realName || engineer.username || `工程师 #${engineer.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>计划开始</Label>
                <Input type="datetime-local" value={confirmForm.plannedStartAt} onChange={(e) => setConfirmForm({ ...confirmForm, plannedStartAt: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>计划结束</Label>
                <Input type="datetime-local" value={confirmForm.plannedEndAt} onChange={(e) => setConfirmForm({ ...confirmForm, plannedEndAt: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={confirmInspection} disabled={saving}>{saving ? "确认中…" : "确认派发"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>派单 / 改派</DialogTitle>
            <DialogDescription>选择工程师后，工单会进入已派发状态并同步到工程师端。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>工程师 *</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
                {engineers.map((engineer) => {
                  const checked = assignForm.engineerIds.includes(String(engineer.id));
                  return (
                    <label key={engineer.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleAssignEngineer(engineer.id, Boolean(value))}
                      />
                      <span>{engineer.realName || engineer.username || `工程师 #${engineer.id}`}</span>
                      {checked && assignForm.engineerIds[0] === String(engineer.id) && (
                        <Badge variant="secondary">主</Badge>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">可选择多位工程师；第一位选中的工程师作为主工程师。</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>计划开始</Label>
                <Input type="datetime-local" value={assignForm.plannedStartAt} onChange={(e) => setAssignForm({ ...assignForm, plannedStartAt: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>计划结束</Label>
                <Input type="datetime-local" value={assignForm.plannedEndAt} onChange={(e) => setAssignForm({ ...assignForm, plannedEndAt: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>派单说明</Label>
              <Textarea value={assignForm.note} onChange={(e) => setAssignForm({ ...assignForm, note: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>附件</Label>
              <Input
                type="file"
                multiple
                onChange={(event) => setAssignFiles(Array.from(event.target.files || []))}
              />
              <p className="text-xs text-muted-foreground">可上传装机设备清单、报错截图、客户资料等，工程师可在工单详情中下载查看。</p>
              {assignFiles.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  {assignFiles.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="truncate">{file.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={assignOrderToEngineer} disabled={saving}>{saving ? "派单中…" : "确认派单"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>状态流转</DialogTitle>
            <DialogDescription>后台状态变更会写入操作审计。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>目标状态</Label>
              <Select value={transitionForm.status} onValueChange={(v) => setTransitionForm({ ...transitionForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="assigned">已派发</SelectItem>
                  <SelectItem value="in_progress">进行中</SelectItem>
                  <SelectItem value="submitted">已结案</SelectItem>
                  <SelectItem value="approved">已审核</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                  <SelectItem value="cancelled">已作废</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>流转原因 / 备注</Label>
              <Textarea value={transitionForm.reason} onChange={(e) => setTransitionForm({ ...transitionForm, reason: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={transitionSelectedOrder} disabled={saving}>{saving ? "流转中…" : "确认流转"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
