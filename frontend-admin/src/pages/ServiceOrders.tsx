import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  in_progress: "进行中",
  pending_confirmation: "待确认",
  submitted: "已结案",
  cancelled: "已作废",
  completed: "已完成",
};

const STATUS_BADGE_VARIANT: Record<string, "secondary" | "purple" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  in_progress: "purple",
  pending_confirmation: "warning",
  submitted: "success",
  cancelled: "destructive",
  completed: "success",
};

const TYPE_LABELS: Record<string, string> = {
  install: "安装",
  repair: "排障",
  maintain: "保养",
  inspect: "巡检",
  training: "培训",
  remote: "远程支持",
  other: "其他",
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

const MODE_LABELS: Record<string, string> = {
  onsite: "现场服务",
  remote: "远程服务",
  office: "内勤工作",
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "in_progress", label: "进行中" },
  { value: "pending_confirmation", label: "待确认" },
  { value: "submitted", label: "已结案" },
  { value: "cancelled", label: "已作废" },
];

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function displayId(order: ServiceOrder) {
  return order.orderNo || order.displayId || `SR-${order.id}`;
}

export function ServiceOrders() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | number | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailForm, setDetailForm] = useState({ issueDescription: "", internalNote: "" });

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
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

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
      { label: "全部工单", value: all },
      { label: "待确认", value: pending },
      { label: "进行中", value: processing },
      { label: "已结案", value: submitted },
    ];
  }, [orders]);

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
      const msg = e instanceof Error ? e.message : "保存失败";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">工单处理</h1>
          <p className="text-muted-foreground mt-1">管理和查看服务工单</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>重试</Button>
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
                placeholder="搜索工单编号、客户、描述..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
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
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>工单列表 ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">暂无工单数据</div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map((order) => {
                const isOpen = expandedOrderId === order.id;
                const statusLabel = order.displayStatus || STATUS_LABELS[order.status] || order.status || "-";
                const typeLabel = TYPE_LABELS[order.serviceType || ""] || order.serviceType || "-";
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
                          <div className="text-sm">{order.engineerName || "未指定"}</div>
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
                          {isOpen ? "收起详情" : "查看详情"}
                        </div>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-border bg-muted/30 p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <Label className="text-muted-foreground">工单编号</Label>
                              <div className="mt-1 font-medium">{displayId(order)}</div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">客户名称</Label>
                              <div className="mt-1">{order.customerName || "-"}</div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">联系人</Label>
                              <div className="mt-1">{order.contactName || "未维护联系人"}</div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">服务类型</Label>
                              <div className="mt-1">
                                <Badge variant={TYPE_BADGE_VARIANT[order.serviceType || ""] || "outline"}>
                                  {typeLabel}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">服务方式</Label>
                              <div className="mt-1">{MODE_LABELS[order.serviceMode || ""] || order.serviceMode || "-"}</div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <Label className="text-muted-foreground">当前状态</Label>
                              <div className="mt-1">
                                <Badge variant={STATUS_BADGE_VARIANT[order.status] || "secondary"}>
                                  {statusLabel}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">工程师</Label>
                              <div className="mt-1">{order.engineerName || "未指定"}</div>
                            </div>
                            <div>
                              <Label className="text-muted-foreground">服务时间</Label>
                              <div className="mt-1">{formatDateTime(order.serviceAt || order.createdAt)}</div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <Label>详细描述</Label>
                          <Textarea
                            className="mt-2"
                            value={detailForm.issueDescription}
                            onChange={(e) =>
                              setDetailForm((f) => ({ ...f, issueDescription: e.target.value }))
                            }
                            rows={3}
                            placeholder="服务描述"
                          />
                        </div>

                        <div>
                          <Label>内部备注</Label>
                          <Textarea
                            className="mt-2"
                            value={detailForm.internalNote}
                            onChange={(e) =>
                              setDetailForm((f) => ({ ...f, internalNote: e.target.value }))
                            }
                            rows={2}
                            placeholder="添加内部备注..."
                          />
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button onClick={saveSelectedOrder} disabled={saving}>
                            {saving ? "保存中…" : "保存工单信息"}
                          </Button>
                          <Button variant="ghost" onClick={() => setExpandedOrderId(null)}>
                            取消
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
