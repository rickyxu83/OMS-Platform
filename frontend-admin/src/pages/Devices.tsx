import { useEffect, useMemo, useState } from "react";
import { Search, Plus, RefreshCw, Server, Loader2, Trash2, Check, Pencil, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/services/api";

interface Device {
  id: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  customerId?: string | number;
  customerName?: string;
  maintenanceType?: string;
  maintenancePartyId?: string | number;
  maintenancePartyName?: string;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  status?: string;
  location?: string;
  remark?: string;
  warrantyUntil?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Customer {
  id: string | number;
  name?: string;
}

interface MaintenanceParty {
  id: string | number;
  name?: string;
  partyType?: string;
}

interface ModelSuggestion {
  canonicalModel?: string;
  partNumber?: string;
  brand?: string;
  category?: string;
}

const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  none: "无维护",
  vendor: "原厂维护",
  our: "我方维护",
  original_manufacturer: "原厂维护",
  our_maintenance: "我方维护",
};

const MAINTENANCE_TYPE_BADGE: Record<string, "default" | "secondary" | "info" | "purple"> = {
  none: "secondary",
  vendor: "info",
  our: "purple",
  original_manufacturer: "info",
  our_maintenance: "purple",
};

const MAINTENANCE_TYPE_ALIASES: Record<string, string> = {
  vendor: "original_manufacturer",
  our: "our_maintenance",
};

const DEVICE_STATUS_LABELS: Record<string, string> = {
  active: "在用",
  inactive: "停用",
  maintenance: "维护中",
  scrapped: "已报废",
};

const DEVICE_STATUS_BADGE: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
  active: "success",
  inactive: "secondary",
  maintenance: "warning",
  scrapped: "destructive",
};

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

function inputDate(value?: string) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function canonicalMaintenanceType(value?: string) {
  const type = String(value || "none").trim() || "none";
  return MAINTENANCE_TYPE_ALIASES[type] || type;
}

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parties, setParties] = useState<MaintenanceParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Device | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [maintenanceFilter, setMaintenanceFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modelSuggestions, setModelSuggestions] = useState<ModelSuggestion[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelTimer, setModelTimer] = useState<number | null>(null);
  const [form, setForm] = useState({
    customerId: "",
    name: "",
    model: "",
    pn: "",
    serialNo: "",
    maintenanceType: "none",
    maintenancePartyId: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    location: "",
    status: "active",
    remark: "",
  });

  async function load(keyword = searchQuery) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (customerFilter !== "all") params.set("customerId", customerFilter);
      if (keyword.trim()) params.set("keyword", keyword.trim());
      const data = await api.get(`/devices${params.toString() ? `?${params}` : ""}`);
      setDevices((data?.items || []) as Device[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomers() {
    try {
      const data = await api.get("/customers?pageSize=200");
      setCustomers((data?.items || []) as Customer[]);
    } catch {
      setCustomers([]);
    }
  }

  async function loadParties() {
    try {
      const data = await api.get("/maintenance-parties");
      setParties((data?.items || []) as MaintenanceParty[]);
    } catch {
      setParties([]);
    }
  }

  useEffect(() => {
    loadCustomers();
    loadParties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      load(searchQuery);
    }, searchQuery.trim() ? 250 : 0);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerFilter, searchQuery]);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return devices.filter((d) => {
      const maintenanceType = canonicalMaintenanceType(d.maintenanceType);
      if (maintenanceFilter !== "all" && maintenanceType !== maintenanceFilter) return false;
      if (!keyword) return true;
      return [d.name, d.model, d.pn, d.serialNo, d.customerName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [devices, maintenanceFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const ours = filtered.filter((d) => canonicalMaintenanceType(d.maintenanceType) === "our_maintenance").length;
    const vendor = filtered.filter((d) => canonicalMaintenanceType(d.maintenanceType) === "original_manufacturer").length;
    return [
      { label: "设备总数", value: total },
      { label: "我方维护", value: ours },
      { label: "原厂维护", value: vendor },
    ];
  }, [filtered]);

  function openCreate() {
    setEditingId(null);
    setForm({
      customerId: customerFilter !== "all" ? customerFilter : "",
      name: "",
      model: "",
      pn: "",
      serialNo: "",
      maintenanceType: "none",
      maintenancePartyId: "",
      maintenanceStart: "",
      maintenanceEnd: "",
      location: "",
      status: "active",
      remark: "",
    });
    setModelSuggestions([]);
    setDialogOpen(true);
  }

  function openEdit(device: Device) {
    setEditingId(device.id);
    setForm({
      customerId: device.customerId ? String(device.customerId) : "",
      name: device.name || "",
      model: device.model || "",
      pn: device.pn || "",
      serialNo: device.serialNo || "",
      maintenanceType: canonicalMaintenanceType(device.maintenanceType),
      maintenancePartyId: device.maintenancePartyId ? String(device.maintenancePartyId) : "",
      maintenanceStart: inputDate(device.maintenanceStart),
      maintenanceEnd: inputDate(device.maintenanceEnd),
      location: device.location || "",
      status: device.status || "active",
      remark: device.remark || "",
    });
    setModelSuggestions([]);
    setDialogOpen(true);
  }

  async function submit() {
    if (!form.customerId) {
      setError("请选择客户");
      return;
    }
    if (!form.name.trim()) {
      setError("请输入设备名称");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        customerId: form.customerId,
        name: form.name.trim(),
        model: form.model.trim() || undefined,
        pn: form.pn.trim() || undefined,
        serialNo: form.serialNo.trim() || undefined,
        maintenanceType: canonicalMaintenanceType(form.maintenanceType),
        maintenancePartyId:
          canonicalMaintenanceType(form.maintenanceType) === "none" ? null : form.maintenancePartyId || null,
        maintenanceStart: form.maintenanceStart || undefined,
        maintenanceEnd: form.maintenanceEnd || undefined,
        location: form.location.trim() || undefined,
        status: form.status,
        remark: form.remark.trim() || undefined,
      };
      if (editingId) {
        await api.put(`/devices/${editingId}`, payload);
      } else {
        await api.post("/devices", payload);
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  function scheduleModelSearch(value: string) {
    if (modelTimer) window.clearTimeout(modelTimer);
    const keyword = value.trim();
    if (keyword.length < 2) {
      setModelSuggestions([]);
      return;
    }
    const timerId = window.setTimeout(async () => {
      setModelLoading(true);
      try {
        const data = await api.get(`/device-model-catalog/suggestions?keyword=${encodeURIComponent(keyword)}`);
        setModelSuggestions((data?.items || []) as ModelSuggestion[]);
      } catch {
        setModelSuggestions([]);
      } finally {
        setModelLoading(false);
      }
    }, 250);
    setModelTimer(timerId);
  }

  function applyModelSuggestion(suggestion: ModelSuggestion) {
    setForm((prev) => ({
      ...prev,
      model: suggestion.canonicalModel || prev.model,
      pn: suggestion.partNumber || prev.pn,
    }));
    setModelSuggestions([]);
  }

  async function deleteDevice(device: Device) {
    if (!device.id) return;
    const label = device.name || device.model || `#${device.id}`;
    if (!window.confirm(`确认删除设备「${label}」？已有工单或巡检计划引用的设备不能删除。`)) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/devices/${device.id}`);
      if (detailTarget && String(detailTarget.id) === String(device.id)) setDetailTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">设备资产</h1>
          <p className="text-muted-foreground mt-1">管理客户设备和维护信息</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load(searchQuery)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            新增设备
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => load(searchQuery)}>重试</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                placeholder="搜索设备名称、型号、序列号..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(searchQuery);
                }}
              />
            </div>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="选择客户" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部客户</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name || `客户 #${c.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={maintenanceFilter} onValueChange={setMaintenanceFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="维护类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="our_maintenance">我方维护</SelectItem>
                <SelectItem value="original_manufacturer">原厂维护</SelectItem>
                <SelectItem value="none">无维护</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setCustomerFilter("all");
                setMaintenanceFilter("all");
              }}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>设备列表 ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-y-auto pr-1">
            {loading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无匹配设备</div>
            ) : (
              <div className="space-y-2">
              {filtered.map((device) => {
                const maintenanceType = canonicalMaintenanceType(device.maintenanceType);
                const typeLabel = MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "-";
                const statusLabel = DEVICE_STATUS_LABELS[device.status || ""] || device.status || "在用";
                return (
                  <div
                    key={device.id}
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer flex-col gap-3 rounded-lg border border-border p-4 transition-colors hover:border-primary hover:bg-accent/30 md:flex-row md:items-center md:justify-between"
                    onClick={() => setDetailTarget(device)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetailTarget(device);
                      }
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <Server className="w-5 h-5 text-primary mr-3" />
                      <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-6">
                        <div>
                          <div className="font-medium">{device.name || device.model || `设备 #${device.id}`}</div>
                          <div className="text-sm text-muted-foreground">{device.customerName || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">型号</div>
                          <div className="text-sm">{device.model || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">PN / SN</div>
                          <div className="text-sm">
                            {device.pn || "-"} <span className="text-muted-foreground">/</span> {device.serialNo || "-"}
                          </div>
                        </div>
                        <div>
                          <Badge variant={MAINTENANCE_TYPE_BADGE[maintenanceType] || "outline"}>
                            {typeLabel}
                          </Badge>
                        </div>
                        <div>
                          <div className="text-sm">{device.maintenancePartyName || "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            截止 {formatDate(device.maintenanceEnd)}
                          </div>
                        </div>
                        <div>
                          <Badge variant={DEVICE_STATUS_BADGE[device.status || "active"] || "secondary"}>
                            {statusLabel}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 md:justify-end" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900" onClick={() => openEdit(device)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => deleteDevice(device)} disabled={saving}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        删除
                      </Button>
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailTarget)} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-[760px]">
          <DialogHeader className="px-6 pt-6 pr-12">
            <DialogTitle>设备详情</DialogTitle>
            <DialogDescription>设备基础信息、客户归属与维保状态</DialogDescription>
          </DialogHeader>
          {detailTarget ? (() => {
            const maintenanceType = canonicalMaintenanceType(detailTarget.maintenanceType);
            const typeLabel = MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "-";
            const statusLabel = DEVICE_STATUS_LABELS[detailTarget.status || ""] || detailTarget.status || "在用";
            return (
              <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-6 pb-2">
                <div className="space-y-5 py-2">
                  <div className="rounded-lg border bg-slate-50/60 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold leading-7 text-slate-900">
                          {detailTarget.name || detailTarget.model || `设备 #${detailTarget.id}`}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{detailTarget.customerName || "-"}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={DEVICE_STATUS_BADGE[detailTarget.status || "active"] || "secondary"}>{statusLabel}</Badge>
                        <Badge variant={MAINTENANCE_TYPE_BADGE[maintenanceType] || "outline"}>{typeLabel}</Badge>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">型号</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.model || "-"}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">PN</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.pn || "-"}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">SN</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.serialNo || "-"}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">维保方</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.maintenancePartyName || "-"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">资产信息</div>
                      <div className="mt-3 grid gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">客户</div>
                          <div className="mt-1">{detailTarget.customerName || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">安装位置</div>
                          <div className="mt-1">{detailTarget.location || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">创建时间</div>
                          <div className="mt-1">{formatDate(detailTarget.createdAt)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">最近更新</div>
                          <div className="mt-1">{formatDate(detailTarget.updatedAt)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">维保信息</div>
                      <div className="mt-3 grid gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">维护类型</div>
                          <div className="mt-1"><Badge variant={MAINTENANCE_TYPE_BADGE[maintenanceType] || "outline"}>{typeLabel}</Badge></div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">维保方</div>
                          <div className="mt-1">{detailTarget.maintenancePartyName || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">维护周期</div>
                          <div className="mt-1">
                            {formatDate(detailTarget.maintenanceStart)} 至 {formatDate(detailTarget.maintenanceEnd)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">质保截止</div>
                          <div className="mt-1">{formatDate(detailTarget.warrantyUntil)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">备注</div>
                    <div className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm leading-6">
                      {detailTarget.remark || "-"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : null}
          <DialogFooter className="flex-row justify-end border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              关闭
            </Button>
            {detailTarget ? (
              <Button onClick={() => {
                const target = detailTarget;
                setDetailTarget(null);
                openEdit(target);
              }}>
                <Pencil className="w-4 h-4 mr-2" />
                编辑
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑设备" : "新增设备"}</DialogTitle>
            <DialogDescription>
              {editingId ? "更新设备信息" : "填写设备信息后提交保存"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>客户 *</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择客户" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name || `客户 #${c.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>设备名称 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如 精密空调-01"
                />
              </div>
              <div className="space-y-2 relative">
                <Label>设备型号</Label>
                <Input
                  value={form.model}
                  onChange={(e) => {
                    setForm({ ...form, model: e.target.value });
                    scheduleModelSearch(e.target.value);
                  }}
                  placeholder="例如 PowerEdge R740"
                />
                {(modelLoading || modelSuggestions.length > 0) && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md max-h-56 overflow-auto">
                    {modelLoading ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> 搜索型号中…
                      </div>
                    ) : modelSuggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.canonicalModel}-${suggestion.partNumber}-${index}`}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2"
                        onClick={() => applyModelSuggestion(suggestion)}
                      >
                        <Check className="w-4 h-4 mt-0.5 text-primary" />
                        <span>
                          <span className="font-medium">{suggestion.canonicalModel}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[suggestion.brand, suggestion.partNumber, suggestion.category].filter(Boolean).join(" · ") || "标准型号"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>部件号 PN</Label>
                <Input
                  value={form.pn}
                  onChange={(e) => setForm({ ...form, pn: e.target.value })}
                  placeholder="部件号"
                />
              </div>
              <div className="space-y-2">
                <Label>序列号 SN</Label>
                <Input
                  value={form.serialNo}
                  onChange={(e) => setForm({ ...form, serialNo: e.target.value })}
                  placeholder="序列号"
                />
              </div>
              <div className="space-y-2">
                <Label>维护类型</Label>
                <Select
                  value={form.maintenanceType}
                  onValueChange={(v) => setForm({ ...form, maintenanceType: v, maintenancePartyId: v === "none" ? "" : form.maintenancePartyId })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择维护类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无维护</SelectItem>
                    <SelectItem value="our_maintenance">我方维护</SelectItem>
                    <SelectItem value="original_manufacturer">原厂维护</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>维保方</Label>
                <Select
                  value={form.maintenancePartyId}
                  onValueChange={(v) => setForm({ ...form, maintenancePartyId: v })}
                  disabled={form.maintenanceType === "none"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.maintenanceType === "none" ? "无维护" : "选择维保方"} />
                  </SelectTrigger>
                  <SelectContent>
                    {parties.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name || `维保方 #${p.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>维护开始</Label>
                <Input
                  type="date"
                  value={form.maintenanceStart}
                  onChange={(e) => setForm({ ...form, maintenanceStart: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>维护截止</Label>
                <Input
                  type="date"
                  value={form.maintenanceEnd}
                  onChange={(e) => setForm({ ...form, maintenanceEnd: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>位置</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="安装位置"
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">在用</SelectItem>
                    <SelectItem value="inactive">停用</SelectItem>
                    <SelectItem value="maintenance">维护中</SelectItem>
                    <SelectItem value="scrapped">已报废</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>备注</Label>
                <Textarea
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                  rows={2}
                  placeholder="补充说明"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "保存中…" : editingId ? "保存修改" : "立即创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
