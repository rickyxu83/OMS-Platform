import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/services/api";

interface ServiceOrder {
  id: string | number;
  orderNo?: string;
  displayId?: string;
  displayTitle?: string;
  displayStatus?: string;
  status: string;
  customerName?: string;
  contactName?: string;
  serviceType?: string;
  serviceMode?: string;
  engineerName?: string;
  serviceAt?: string;
  issueDescription?: string;
  internalNote?: string;
  createdAt?: string;
}

interface EngineerOption {
  id: string | number;
  realName?: string;
  username?: string;
}

const I18N = {
  "zh-CN": {
    title: "工单处理",
    subtitle: "管理和查看服务工单",
    actions: {
      refresh: "刷新",
      retry: "重试",
      reset: "重置",
      save: "保存工单信息",
      saving: "保存中…",
      cancel: "取消",
      collapse: "收起详情",
      expand: "查看详情",
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
      in_progress: "进行中",
      pending_confirmation: "待确认",
      submitted: "已结案",
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
      save: "保存工單信息",
      saving: "保存中…",
      cancel: "取消",
      collapse: "收起詳情",
      expand: "查看詳情",
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
      in_progress: "進行中",
      pending_confirmation: "待確認",
      submitted: "已結案",
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
  in_progress: "purple",
  pending_confirmation: "warning",
  submitted: "success",
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

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function displayId(order: ServiceOrder) {
  return order.orderNo || order.displayId || `SR-${order.id}`;
}

export function ServiceOrders() {
  const { lang } = useLanguage();
  const t = I18N[lang];
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | number | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailForm, setDetailForm] = useState({ issueDescription: "", internalNote: "" });
  const statusOptions = [
    { value: "all", label: t.filters.all },
    { value: "draft", label: t.status.draft },
    { value: "in_progress", label: t.status.in_progress },
    { value: "pending_confirmation", label: t.status.pending_confirmation },
    { value: "submitted", label: t.status.submitted },
    { value: "cancelled", label: t.status.cancelled },
  ];

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
      if (items.length && !items.some((o) => o.id === expandedOrderId)) {
        setExpandedOrderId(items[0].id);
      } else if (!items.length) {
        setExpandedOrderId(null);
      }
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
  }, [statusFilter, t.errors.loadFailed]);

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
    const pending = orders.filter((o) => o.status === "pending_confirmation").length;
    const processing = orders.filter((o) => o.status === "in_progress").length;
    const submitted = orders.filter((o) => o.status === "submitted" || o.status === "completed").length;
    return [
      { label: t.stats.all, value: all },
      { label: t.stats.pending, value: pending },
      { label: t.stats.processing, value: processing },
      { label: t.stats.completed, value: submitted },
    ];
  }, [orders, t.stats]);

  useEffect(() => {
    const current = orders.find((o) => o.id === expandedOrderId);
    if (current) {
      setDetailForm({
        issueDescription: current.issueDescription || "",
        internalNote: current.internalNote || "",
      });
    }
  }, [expandedOrderId, orders]);

  async function saveSelectedOrder() {
    const current = orders.find((o) => o.id === expandedOrderId);
    if (!current) return;
    setSaving(true);
    setError("");
    try {
      await api.put(`/service-orders/${current.id}`, {
        issueDescription: detailForm.issueDescription,
        internalNote: detailForm.internalNote,
      });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.saveFailed;
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t.actions.refresh}
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
            <div className="space-y-2">
              {filteredOrders.map((order) => {
                const isOpen = expandedOrderId === order.id;
                const statusLabel = order.displayStatus || t.status[order.status as keyof typeof t.status] || order.status || "-";
                const typeLabel = t.type[order.serviceType as keyof typeof t.type] || order.serviceType || "-";
                return (
                  <div key={order.id} className="border border-border rounded-lg overflow-hidden">
                    <div
                      className="flex items-center p-4 hover:bg-accent/40 cursor-pointer transition-colors"
                      onClick={() => setExpandedOrderId(isOpen ? null : order.id)}
                    >
                      <div className="mr-3">
                        {isOpen ? (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div>
                          <div className="font-medium">{displayId(order)}</div>
                          <div className="text-sm text-muted-foreground">{order.customerName || "-"}</div>
                        </div>
                        <div>
                          <Badge variant={TYPE_BADGE_VARIANT[order.serviceType || ""] || "outline"}>
                            {typeLabel}
                          </Badge>
                        </div>
                        <div>
                          <div className="text-sm">{order.engineerName || t.detail.unnamedEngineer}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">{formatDateTime(order.serviceAt || order.createdAt)}</div>
                        </div>
                        <div>
                          <Badge variant={STATUS_BADGE_VARIANT[order.status] || "secondary"}>
                            {statusLabel}
                          </Badge>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          {isOpen ? t.actions.collapse : t.actions.expand}
                        </div>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-border bg-muted/30 p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <Label className="text-muted-foreground">{t.detail.orderNo}</Label>
                              <div className="mt-1 font-medium">{displayId(order)}</div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">{t.detail.customerName}</Label>
                              <div className="mt-1">{order.customerName || "-"}</div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">{t.detail.contactName}</Label>
                              <div className="mt-1">{order.contactName || t.detail.unnamedContact}</div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">{t.detail.serviceType}</Label>
                              <div className="mt-1">
                                <Badge variant={TYPE_BADGE_VARIANT[order.serviceType || ""] || "outline"}>
                                  {typeLabel}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">{t.detail.serviceMode}</Label>
                              <div className="mt-1">{t.mode[order.serviceMode as keyof typeof t.mode] || order.serviceMode || "-"}</div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <Label className="text-muted-foreground">{t.detail.currentStatus}</Label>
                              <div className="mt-1">
                                <Badge variant={STATUS_BADGE_VARIANT[order.status] || "secondary"}>
                                  {statusLabel}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">{t.detail.engineer}</Label>
                              <div className="mt-1">{order.engineerName || t.detail.unnamedEngineer}</div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">{t.detail.serviceTime}</Label>
                              <div className="mt-1">{formatDateTime(order.serviceAt || order.createdAt)}</div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <Label>{t.detail.issueDescription}</Label>
                          <Textarea
                            className="mt-2"
                            value={detailForm.issueDescription}
                            onChange={(e) =>
                              setDetailForm((f) => ({ ...f, issueDescription: e.target.value }))
                            }
                            rows={3}
                            placeholder={t.detail.descriptionPlaceholder}
                          />
                        </div>

                        <div>
                          <Label>{t.detail.internalNote}</Label>
                          <Textarea
                            className="mt-2"
                            value={detailForm.internalNote}
                            onChange={(e) =>
                              setDetailForm((f) => ({ ...f, internalNote: e.target.value }))
                            }
                            rows={2}
                            placeholder={t.detail.notePlaceholder}
                          />
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button onClick={saveSelectedOrder} disabled={saving}>
                            {saving ? t.actions.saving : t.actions.save}
                          </Button>
                          <Button variant="ghost" onClick={() => setExpandedOrderId(null)}>
                            {t.actions.cancel}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
