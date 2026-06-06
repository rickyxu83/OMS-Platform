import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, Search, Loader2, Plus, Trash2, CheckCircle } from "lucide-react";
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
  engineers?: Array<{ realName?: string; name?: string; username?: string }>;
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
      saving: "保存中…",
      cancel: "取消",
    },
    filters: {
      searchPlaceholder: "搜索工单编号、客户、描述...",
      statusPlaceholder: "状态筛选",
      all: "全部状态",
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
      saving: "保存中…",
      cancel: "取消",
    },
    filters: {
      searchPlaceholder: "搜尋工單編號、客戶、描述...",
      statusPlaceholder: "狀態篩選",
      all: "全部狀態",
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

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
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
  const [searchQuery, setSearchQuery] = useState(searchParams.get("keyword") || searchParams.get("q") || "");
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    customerId: "",
    deviceId: "",
    serviceMode: "onsite",
    serviceType: "repair",
    timesheetCategory: "",
    priority: "normal",
    issueDescription: "",
    internalNote: "",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOrder, setConfirmOrder] = useState<ServiceOrder | null>(null);
  const [confirmForm, setConfirmForm] = useState({ engineerId: "", plannedStartAt: "", plannedEndAt: "" });
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOrder, setAssignOrder] = useState<ServiceOrder | null>(null);
  const [assignForm, setAssignForm] = useState({ primaryEngineerId: "", plannedStartAt: "", plannedEndAt: "", note: "" });
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
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      api.get("/customers?pageSize=200").then((data) => setCustomers(data?.items || [])).catch(() => setCustomers([])),
      api.get("/devices").then((data) => setDevices(data?.items || [])).catch(() => setDevices([])),
      api.get("/users/engineers").then((data) => setEngineers(data?.items || [])).catch(() => setEngineers([])),
    ]).catch(() => undefined);
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        pageSize: "50",
        sortBy: "createdAt",
        sortDir: "desc",
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const data = await api.get(`/service-orders?${params.toString()}`);
      const items = (data?.items || []) as ServiceOrder[];
      setOrders(items);
      setSelectedIds((ids) => ids.filter((id) => items.some((item) => String(item.id) === String(id))));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.loadFailed;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchQuery, t.errors.loadFailed]);

  const filteredOrders = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return orders;
    return orders.filter((order) => {
      const id = String(displayId(order)).toLowerCase();
      const customer = String(order.customerName || "").toLowerCase();
      const desc = String(order.issueDescription || "").toLowerCase();
      return id.includes(keyword) || customer.includes(keyword) || desc.includes(keyword);
    });
  }, [orders, searchQuery]);

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
      priority: "normal",
      issueDescription: "",
      internalNote: "",
    });
    setCreateOpen(true);
  }

  async function createOrder() {
    if (!createForm.customerId || !createForm.serviceType || !createForm.issueDescription.trim()) {
      setError("请选择客户、服务类型并填写问题描述");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/service-orders", {
        customerId: Number(createForm.customerId),
        deviceId: createForm.deviceId && createForm.deviceId !== "none" ? Number(createForm.deviceId) : null,
        serviceMode: createForm.serviceMode,
        serviceType: createForm.serviceMode === "onsite" ? createForm.serviceType : "other",
        timesheetCategory: createForm.serviceMode === "onsite" ? null : createForm.timesheetCategory || "其他",
        priority: createForm.priority,
        issueDescription: createForm.issueDescription.trim(),
        internalNote: createForm.internalNote.trim() || null,
      });
      setCreateOpen(false);
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
    setAssignForm({ primaryEngineerId: "", plannedStartAt: "", plannedEndAt: "", note: "" });
    setAssignOpen(true);
  }

  async function assignOrderToEngineer() {
    if (!assignOrder?.id || !assignForm.primaryEngineerId) {
      setError("请选择派发工程师");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${assignOrder.id}/assign`, {
        primaryEngineerId: Number(assignForm.primaryEngineerId),
        engineerIds: [Number(assignForm.primaryEngineerId)],
        plannedStartAt: assignForm.plannedStartAt || undefined,
        plannedEndAt: assignForm.plannedEndAt || undefined,
        note: assignForm.note || undefined,
      });
      setAssignOpen(false);
      setAssignOrder(null);
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
                {loading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t.filters.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
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
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setSearchParams({});
              }}
            >
              {t.actions.reset}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.list.title} ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.list.loading}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">{t.list.empty}</div>
          ) : (
            <div className="space-y-3">
              <div className="hidden rounded-md bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground xl:flex xl:items-center">
                <div className="w-7 shrink-0" />
                <div className="grid min-w-0 flex-1 gap-3 xl:grid-cols-[1.2fr_2fr_1.1fr_1fr_0.8fr_auto] xl:items-center">
                  <div>Case ID / 客户</div>
                  <div>主要内容</div>
                  <div>工程师</div>
                  <div>结案</div>
                  <div>状态</div>
                  <div className="text-right">操作</div>
                </div>
              </div>
              {filteredOrders.map((order) => {
                const statusLabel = order.displayStatus || t.status[getWorkflowStatus(order) as keyof typeof t.status] || getWorkflowStatus(order) || "-";
                const modeLabel = t.mode[order.serviceMode as keyof typeof t.mode] || order.serviceMode || "-";
                const canConfirmInspection = getWorkflowStatus(order) === "pending_confirmation" && order.serviceType === "inspect";
                const canAssign = getWorkflowStatus(order) !== "cancelled" && getWorkflowStatus(order) !== "submitted";
                return (
                  <div key={order.id} className="rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                      <div className="shrink-0">
                        <Checkbox
                          checked={selectedIds.some((id) => String(id) === String(order.id))}
                          onCheckedChange={(checked) => {
                            setSelectedIds((ids) => checked
                              ? [...ids, order.id]
                              : ids.filter((id) => String(id) !== String(order.id)));
                          }}
                        />
                      </div>

                      <div className="grid min-w-0 flex-1 gap-3 xl:grid-cols-[1.2fr_2fr_1.1fr_1fr_0.8fr_auto] xl:items-center">
                        <div className="min-w-0">
                          <div className="font-semibold tracking-tight">{displayId(order)}</div>
                          <div className="truncate text-sm text-muted-foreground">{textValue(order.customerName)}</div>
                        </div>

                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{compactText(order.issueDescription)}</span>
                          <Badge variant={MODE_BADGE_VARIANT[order.serviceMode || ""] || "secondary"}>{modeLabel}</Badge>
                        </div>

                        <div className="min-w-0 text-sm">
                          <span className="truncate">{engineerText(order, t.detail.unnamedEngineer)}</span>
                        </div>

                        <div className="whitespace-nowrap text-sm">
                          {formatDateTime(order.submittedAt)}
                        </div>

                        <div>
                          <Badge variant={STATUS_BADGE_VARIANT[getWorkflowStatus(order)] || "secondary"}>
                            {statusLabel}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:justify-end">
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
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailOrder)} onOpenChange={(open) => { if (!open) setDetailOrder(null); }}>
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
            <Button variant="outline" onClick={() => setDetailOrder(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>新建工单</DialogTitle>
            <DialogDescription>创建后状态为草稿；普通派单流程将在派单接口补齐后继续完善。</DialogDescription>
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
            <div className="space-y-2 md:col-span-2">
              <Label>问题描述 *</Label>
              <Textarea value={createForm.issueDescription} onChange={(e) => setCreateForm({ ...createForm, issueDescription: e.target.value })} rows={3} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>内部备注</Label>
              <Textarea value={createForm.internalNote} onChange={(e) => setCreateForm({ ...createForm, internalNote: e.target.value })} rows={2} />
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
              <Select value={assignForm.primaryEngineerId} onValueChange={(v) => setAssignForm({ ...assignForm, primaryEngineerId: v })}>
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
                <Input type="datetime-local" value={assignForm.plannedStartAt} onChange={(e) => setAssignForm({ ...assignForm, plannedStartAt: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>计划结束</Label>
                <Input type="datetime-local" value={assignForm.plannedEndAt} onChange={(e) => setAssignForm({ ...assignForm, plannedEndAt: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>派单备注</Label>
              <Textarea value={assignForm.note} onChange={(e) => setAssignForm({ ...assignForm, note: e.target.value })} rows={2} />
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
