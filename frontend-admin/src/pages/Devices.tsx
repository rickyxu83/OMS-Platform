import { useEffect, useMemo, useState } from "react";
import { Search, Plus, RefreshCw, Server, Loader2, Trash2, Check } from "lucide-react";
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

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parties, setParties] = useState<MaintenanceParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | number | null>(null);
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

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (customerFilter !== "all") params.set("customerId", customerFilter);
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerFilter]);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return devices.filter((d) => {
      if (maintenanceFilter !== "all" && d.maintenanceType !== maintenanceFilter) return false;
      if (!keyword) return true;
      return [d.name, d.model, d.pn, d.serialNo, d.customerName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [devices, maintenanceFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const ours = filtered.filter((d) => d.maintenanceType === "our" || d.maintenanceType === "our_maintenance").length;
    const vendor = filtered.filter((d) => d.maintenanceType === "vendor" || d.maintenanceType === "original_manufacturer").length;
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
      maintenanceType: device.maintenanceType || "none",
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
        maintenanceType: form.maintenanceType,
        maintenancePartyId:
          form.maintenanceType === "none" ? null : form.maintenancePartyId || null,
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
      if (expandedDeviceId === device.id) setExpandedDeviceId(null);
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
          <Button variant="outline" onClick={load}>
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
          <Button variant="ghost" size="sm" onClick={load}>重试</Button>
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
                <SelectItem value="our">我方维护</SelectItem>
                <SelectItem value="vendor">原厂维护</SelectItem>
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
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">暂无匹配设备</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((device) => {
                const typeLabel = MAINTENANCE_TYPE_LABELS[device.maintenanceType || ""] || device.maintenanceType || "-";
                const statusLabel = DEVICE_STATUS_LABELS[device.status || ""] || device.status || "在用";
                return (
                  <div key={device.id} className="border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center p-4 hover:bg-accent/40 cursor-pointer transition-colors">
                      <Server className="w-5 h-5 text-primary mr-3" />
                      <div
                        className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4"
                        onClick={() =>
                          setExpandedDeviceId(expandedDeviceId === device.id ? null : device.id)
                        }
                      >
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
                          <Badge variant={MAINTENANCE_TYPE_BADGE[device.maintenanceType || ""] || "outline"}>
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

                    {expandedDeviceId === device.id && (
                      <div className="border-t border-border bg-muted/30 p-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-muted-foreground">客户</Label>
                            <div className="mt-1 font-medium">{device.customerName || "-"}</div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">设备名称</Label>
                            <div className="mt-1 font-medium">{device.name || "-"}</div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">设备型号</Label>
                            <div className="mt-1">{device.model || "-"}</div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">PN / SN</Label>
                            <div className="mt-1">
                              {device.pn || "-"} <span className="text-muted-foreground">/</span> {device.serialNo || "-"}
                            </div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">维护类型</Label>
                            <div className="mt-1">
                              <Badge variant={MAINTENANCE_TYPE_BADGE[device.maintenanceType || ""] || "outline"}>
                                {typeLabel}
                              </Badge>
                            </div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">维保方</Label>
                            <div className="mt-1">{device.maintenancePartyName || "-"}</div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">维护周期</Label>
                            <div className="mt-1 text-sm">
                              {formatDate(device.maintenanceStart)} 至 {formatDate(device.maintenanceEnd)}
                            </div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">位置</Label>
                            <div className="mt-1">{device.location || "-"}</div>
                          </div>
                          {device.remark && (
                            <div className="md:col-span-2">
                              <Label className="text-muted-foreground">备注</Label>
                              <div className="mt-1 text-sm whitespace-pre-wrap">{device.remark}</div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(device)}>
                            编辑设备
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteDevice(device)} disabled={saving}>
                            <Trash2 className="w-4 h-4 mr-1" />
                            删除设备
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
                    <SelectItem value="our">我方维护</SelectItem>
                    <SelectItem value="vendor">原厂维护</SelectItem>
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
              {saving ? "保存中…" : editingId ? "保存修改" : "立即创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
