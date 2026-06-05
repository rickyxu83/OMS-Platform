import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Loader2, Search, Trash2, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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

interface Schedule {
  id: string | number;
  name?: string;
  customerId?: string | number;
  customerName?: string;
  deviceId?: string | number;
  deviceName?: string;
  targetEngineerId?: string | number;
  targetEngineerName?: string;
  cadence?: string;
  nextRunAnchor?: string;
  endDate?: string;
  active?: boolean;
  remark?: string;
}

interface Customer {
  id: string | number;
  name?: string;
}

interface Device {
  id: string | number;
  name?: string;
  customerId?: string | number;
}

interface Engineer {
  id: string | number;
  realName?: string;
  username?: string;
}

const CADENCE_LABELS: Record<string, string> = {
  monthly: "每月",
  bimonthly: "每两月",
  "bi-monthly": "每两月",
  quarterly: "每季度",
  weekly: "每周",
};

const CADENCE_VARIANT: Record<string, "info" | "purple" | "success" | "secondary"> = {
  monthly: "info",
  bimonthly: "purple",
  "bi-monthly": "purple",
  quarterly: "success",
  weekly: "secondary",
};

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

function inputDate(value?: string) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export function InspectionSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [cadenceFilter, setCadenceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generationResult, setGenerationResult] = useState<{ generated?: number; skipped?: number } | null>(null);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [form, setForm] = useState({
    name: "",
    customerId: "",
    deviceId: "",
    targetEngineerId: "",
    cadence: "monthly",
    nextRunAnchor: "",
    endDate: "",
    active: true,
    remark: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.get("/inspection-schedules");
      setSchedules((data?.items || []) as Schedule[]);
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

  async function loadEngineers() {
    try {
      const data = await api.get("/users/engineers");
      setEngineers((data?.items || []) as Engineer[]);
    } catch {
      setEngineers([]);
    }
  }

  async function loadDevices() {
    try {
      const data = await api.get("/devices");
      setDevices((data?.items || []) as Device[]);
    } catch {
      setDevices([]);
    }
  }

  useEffect(() => {
    loadCustomers();
    loadEngineers();
    loadDevices();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return schedules.filter((s) => {
      if (cadenceFilter !== "all" && s.cadence !== cadenceFilter) return false;
      if (statusFilter === "active" && !s.active) return false;
      if (statusFilter === "disabled" && s.active) return false;
      if (!keyword) return true;
      return [s.name, s.customerName, s.deviceName, s.targetEngineerName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [schedules, searchQuery, cadenceFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = schedules.length;
    const enabled = schedules.filter((s) => s.active).length;
    const dueSoon = schedules.filter((s) => {
      if (!s.active || !s.nextRunAnchor) return false;
      const next = new Date(`${inputDate(s.nextRunAnchor)}T23:59:59`).getTime();
      return next <= Date.now() + 14 * 24 * 60 * 60 * 1000;
    }).length;
    return [
      { label: "计划总数", value: total },
      { label: "启用计划", value: enabled },
      { label: "14天内待生成", value: dueSoon },
    ];
  }, [schedules]);

  const deviceOptions = useMemo(() => {
    if (!form.customerId) return devices;
    return devices.filter((d) => String(d.customerId) === form.customerId);
  }, [devices, form.customerId]);

  function openCreate() {
    setEditingId(null);
    setForm({
      name: "",
      customerId: "",
      deviceId: "",
      targetEngineerId: "",
      cadence: "monthly",
      nextRunAnchor: "",
      endDate: "",
      active: true,
      remark: "",
    });
    setDialogOpen(true);
  }

  function openEdit(schedule: Schedule) {
    setEditingId(schedule.id);
    setForm({
      name: schedule.name || "",
      customerId: schedule.customerId ? String(schedule.customerId) : "",
      deviceId: schedule.deviceId ? String(schedule.deviceId) : "",
      targetEngineerId: schedule.targetEngineerId ? String(schedule.targetEngineerId) : "",
      cadence: schedule.cadence || "monthly",
      nextRunAnchor: inputDate(schedule.nextRunAnchor),
      endDate: inputDate(schedule.endDate),
      active: Boolean(schedule.active),
      remark: (schedule as { remark?: string }).remark || "",
    });
    setDialogOpen(true);
  }

  async function submit() {
    if (!form.customerId) {
      setError("请选择客户");
      return;
    }
    if (!form.targetEngineerId) {
      setError("请选择目标工程师");
      return;
    }
    if (!form.cadence) {
      setError("请选择巡检周期");
      return;
    }
    if (!form.nextRunAnchor) {
      setError("请选择下次生成日期");
      return;
    }
    if (form.endDate && form.endDate < form.nextRunAnchor) {
      setError("结束日期不能早于下次生成日期");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim() || undefined,
        customerId: form.customerId,
        deviceId: form.deviceId || null,
        targetEngineerId: form.targetEngineerId,
        cadence: form.cadence,
        nextRunAnchor: form.nextRunAnchor,
        endDate: form.endDate || null,
        active: form.active,
        remark: form.remark.trim() || undefined,
      };
      if (editingId) {
        await api.put(`/inspection-schedules/${editingId}`, payload);
      } else {
        await api.post("/inspection-schedules", payload);
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

  async function toggleActive(schedule: Schedule) {
    if (!schedule.id) return;
    setSaving(true);
    setError("");
    try {
      await api.put(`/inspection-schedules/${schedule.id}`, {
        active: !schedule.active,
      });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "更新失败";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function generateDueSchedules() {
    setSaving(true);
    setError("");
    setGenerationResult(null);
    try {
      const data = await api.post("/inspection-schedules/generate-due", {});
      setGenerationResult({ generated: data?.generated ?? 0, skipped: data?.skipped ?? 0 });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成到期巡检单失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(schedule: Schedule) {
    if (!schedule.id) return;
    const name = schedule.name || schedule.customerName || `#${schedule.id}`;
    if (!window.confirm(`确认删除巡检计划「${name}」？历史工单不会被删除。`)) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/inspection-schedules/${schedule.id}`);
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
          <h1 className="text-3xl font-semibold tracking-tight">巡检计划</h1>
          <p className="text-muted-foreground mt-1">管理周期性巡检任务</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={saving}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button variant="outline" onClick={generateDueSchedules} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            生成到期巡检单
          </Button>
          <Button onClick={openCreate} disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />
            新增计划
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>重试</Button>
        </div>
      )}

      {generationResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm">
          已生成 {generationResult.generated ?? 0} 张待确认巡检工单，跳过 {generationResult.skipped ?? 0} 项；请到工单处理页确认并派发。
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
                placeholder="搜索客户、设备、工程师..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={cadenceFilter} onValueChange={setCadenceFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="巡检周期" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部周期</SelectItem>
                <SelectItem value="monthly">每月</SelectItem>
                <SelectItem value="bimonthly">每两月</SelectItem>
                <SelectItem value="quarterly">每季度</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="启用状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="disabled">停用</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setCadenceFilter("all");
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
          <CardTitle>巡检计划列表 ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">暂无巡检计划</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => {
                const cadenceLabel = CADENCE_LABELS[s.cadence || ""] || s.cadence || "-";
                return (
                  <div
                    key={s.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border border-border rounded-lg hover:border-primary transition-colors"
                  >
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                      <div>
                        <div className="font-medium">{s.name || s.customerName || `计划 #${s.id}`}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.customerName || "-"}
                          {s.deviceName ? ` · ${s.deviceName}` : ""}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">巡检人</div>
                        <div className="text-sm font-medium">{s.targetEngineerName || "未指定"}</div>
                      </div>
                      <div>
                        <Badge variant={CADENCE_VARIANT[s.cadence || ""] || "outline"}>
                          {cadenceLabel}
                        </Badge>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">下次生成</div>
                        <div className="text-sm font-medium">{formatDate(s.nextRunAnchor)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(s.active)}
                          onCheckedChange={() => toggleActive(s)}
                          disabled={saving}
                        />
                        <span className="text-sm text-muted-foreground">
                          {s.active ? "已启用" : "已停用"}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteSchedule(s)} disabled={saving}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        删除
                      </Button>
                    </div>
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
            <DialogTitle>{editingId ? "编辑巡检计划" : "新增巡检计划"}</DialogTitle>
            <DialogDescription>
              配置客户、设备、巡检人和周期，保存后即按规则生成待确认的巡检工单
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>计划名称</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如 苏州园区月度巡检"
                />
              </div>
              <div className="space-y-2">
                <Label>客户 *</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(v) => setForm({ ...form, customerId: v, deviceId: "" })}
                >
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
                <Label>设备（可选）</Label>
                <Select
                  value={form.deviceId}
                  onValueChange={(v) => setForm({ ...form, deviceId: v })}
                  disabled={!form.customerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.customerId ? "选择设备" : "请先选择客户"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">不指定设备</SelectItem>
                    {deviceOptions.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name || `设备 #${d.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>巡检人 *</Label>
                <Select
                  value={form.targetEngineerId}
                  onValueChange={(v) => setForm({ ...form, targetEngineerId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择工程师" />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.realName || e.username || `工程师 #${e.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>巡检周期 *</Label>
                <Select value={form.cadence} onValueChange={(v) => setForm({ ...form, cadence: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择周期" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">每月</SelectItem>
                    <SelectItem value="bimonthly">每两月</SelectItem>
                    <SelectItem value="quarterly">每季度</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>下次生成日期 *</Label>
                <Input
                  type="date"
                  value={form.nextRunAnchor}
                  onChange={(e) => setForm({ ...form, nextRunAnchor: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>结束日期（可选）</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
              <div className="space-y-2 flex flex-row items-center gap-3 pt-6">
                <Switch
                  id="schedule-active"
                  checked={form.active}
                  onCheckedChange={(c) => setForm({ ...form, active: c })}
                />
                <Label htmlFor="schedule-active">启用此计划</Label>
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
              {saving ? "保存中…" : editingId ? "保存修改" : "保存计划"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
