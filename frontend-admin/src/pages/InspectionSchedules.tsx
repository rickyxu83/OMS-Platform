import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Loader2, Search, Trash2, Play, Pencil, Check, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAuth } from "@/contexts/AuthContext";

const INSPECTION_SCHEDULE_MANAGE_ROLES = new Set(["admin", "assistant", "dispatcher", "operations_director", "engineering_supervisor"]);

interface Schedule {
  id: string | number;
  name?: string;
  customerId?: string | number;
  customerName?: string;
  deviceIds?: number[];
  deviceNames?: string[];
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
  model?: string;
  serialNo?: string;
  customerId?: string | number;
}

function deviceLabel(device: Device) {
  return device.model || device.name || device.serialNo || `设备 #${device.id}`;
}

interface Engineer {
  id: string | number;
  realName?: string;
  username?: string;
}

interface FloatingDropdownBox {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
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
  const { user } = useAuth();
  const canManageSchedules = INSPECTION_SCHEDULE_MANAGE_ROLES.has(String(user?.role || ""));
  const [searchParams, setSearchParams] = useSearchParams();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("keyword") || "");
  const [customerFilter, setCustomerFilter] = useState(searchParams.get("customerId") || "all");
  const [cadenceFilter, setCadenceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Schedule | null>(null);
  const [generationResult, setGenerationResult] = useState<{ generated?: number; skipped?: number } | null>(null);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOptionsOpen, setCustomerOptionsOpen] = useState(false);
  const [engineerSearch, setEngineerSearch] = useState("");
  const [engineerOptionsOpen, setEngineerOptionsOpen] = useState(false);
  const [customerDropdownBox, setCustomerDropdownBox] = useState<FloatingDropdownBox | null>(null);
  const [engineerDropdownBox, setEngineerDropdownBox] = useState<FloatingDropdownBox | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const engineerInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: "",
    customerId: "",
    deviceIds: [] as number[],
    targetEngineerIds: [] as string[],
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

  useEffect(() => {
    setSearchQuery(searchParams.get("keyword") || "");
    setCustomerFilter(searchParams.get("customerId") || "all");
  }, [searchParams]);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return schedules.filter((s) => {
      if (customerFilter !== "all" && String(s.customerId) !== customerFilter) return false;
      if (cadenceFilter !== "all" && s.cadence !== cadenceFilter) return false;
      if (statusFilter === "active" && !s.active) return false;
      if (statusFilter === "disabled" && s.active) return false;
      if (!keyword) return true;
      const searchText = [s.name, s.customerName, s.targetEngineerName, ...(s.deviceNames || [])].filter(Boolean).join(" ");
      return searchText.toLowerCase().includes(keyword);
    });
  }, [schedules, searchQuery, customerFilter, cadenceFilter, statusFilter]);

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

  const allFilteredSchedulesSelected = filtered.length > 0
    && filtered.every((schedule) => selectedScheduleIds.includes(String(schedule.id)));

  useEffect(() => {
    const visibleIds = new Set(filtered.map((schedule) => String(schedule.id)));
    setSelectedScheduleIds((ids) => {
      const next = ids.filter((id) => visibleIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [filtered]);

  function toggleScheduleSelection(scheduleId: string | number, checked: boolean | "indeterminate") {
    const id = String(scheduleId);
    setSelectedScheduleIds((ids) => {
      if (checked === true) return ids.includes(id) ? ids : [...ids, id];
      return ids.filter((item) => item !== id);
    });
  }

  function toggleAllFilteredSchedules(checked: boolean | "indeterminate") {
    const ids = filtered.map((schedule) => String(schedule.id));
    setSelectedScheduleIds((current) => {
      if (checked === true) return Array.from(new Set([...current, ...ids]));
      const visible = new Set(ids);
      return current.filter((id) => !visible.has(id));
    });
  }

  const customerDevices = useMemo(() => {
    if (!form.customerId) return devices;
    return devices.filter((d) => String(d.customerId) === form.customerId);
  }, [devices, form.customerId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === form.customerId) || null,
    [customers, form.customerId],
  );

  const filteredCustomerOptions = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    if (!keyword) return customers.slice(0, 80);
    return customers
      .filter((customer) => {
        const text = [customer.name, customer.id].filter(Boolean).join(" ").toLowerCase();
        return text.includes(keyword);
      })
      .slice(0, 80);
  }, [customers, customerSearch]);

  const filteredEngineerOptions = useMemo(() => {
    const keyword = engineerSearch.trim().toLowerCase();
    if (!keyword) return engineers.slice(0, 80);
    return engineers
      .filter((engineer) => {
        const text = [engineer.realName, engineer.username, engineer.id].filter(Boolean).join(" ").toLowerCase();
        return text.includes(keyword);
      })
      .slice(0, 80);
  }, [engineers, engineerSearch]);

  const selectedEngineers = useMemo(
    () => form.targetEngineerIds
      .map((id) => engineers.find((engineer) => String(engineer.id) === id))
      .filter(Boolean) as Engineer[],
    [engineers, form.targetEngineerIds],
  );

  const selectedEngineerSummary = selectedEngineers
    .map((engineer) => engineer.realName || engineer.username || `工程师 #${engineer.id}`)
    .slice(0, 3)
    .join("、");

  const selectedDeviceCount = form.deviceIds.length;
  const selectedEngineerCount = form.targetEngineerIds.length;

  function measureDropdown(input: HTMLInputElement | null): FloatingDropdownBox | null {
    const dialogContent = dialogContentRef.current;
    if (!input || !dialogContent || typeof window === "undefined") return null;
    const rect = input.getBoundingClientRect();
    const dialogRect = dialogContent.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const available = Math.max(120, (openAbove ? spaceAbove : spaceBelow) - gap);
    const maxHeight = Math.min(260, available);
    return {
      top: openAbove ? rect.top - dialogRect.top - maxHeight - gap : rect.bottom - dialogRect.top + gap,
      left: rect.left - dialogRect.left,
      width: rect.width,
      maxHeight,
    };
  }

  function updateCustomerDropdownBox() {
    setCustomerDropdownBox(measureDropdown(customerInputRef.current));
  }

  function updateEngineerDropdownBox() {
    setEngineerDropdownBox(measureDropdown(engineerInputRef.current));
  }

  useEffect(() => {
    if (!customerOptionsOpen) return;
    updateCustomerDropdownBox();
    const handleViewportChange = () => updateCustomerDropdownBox();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [customerOptionsOpen, customerSearch, filteredCustomerOptions.length]);

  useEffect(() => {
    if (!engineerOptionsOpen) return;
    updateEngineerDropdownBox();
    const handleViewportChange = () => updateEngineerDropdownBox();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [engineerOptionsOpen, engineerSearch, filteredEngineerOptions.length]);

  function toggleDevice(deviceId: number) {
    setForm((prev) => ({
      ...prev,
      deviceIds: prev.deviceIds.includes(deviceId)
        ? prev.deviceIds.filter((id) => id !== deviceId)
        : [...prev.deviceIds, deviceId],
    }));
  }

  function selectAllCustomerDevices() {
    setForm((prev) => ({
      ...prev,
      deviceIds: customerDevices.map((d) => Number(d.id)),
    }));
  }

  function clearSelectedDevices() {
    setForm((prev) => ({
      ...prev,
      deviceIds: [],
    }));
  }

  function openCreate() {
    setEditingId(null);
    setCustomerSearch("");
    setCustomerOptionsOpen(false);
    setEngineerSearch("");
    setEngineerOptionsOpen(false);
    setForm({
      name: "",
      customerId: "",
      deviceIds: [],
      targetEngineerIds: [],
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
    setCustomerSearch(schedule.customerName || "");
    setCustomerOptionsOpen(false);
    setEngineerSearch("");
    setEngineerOptionsOpen(false);
    setForm({
      name: schedule.name || "",
      customerId: schedule.customerId ? String(schedule.customerId) : "",
      deviceIds: schedule.deviceIds || [],
      targetEngineerIds: schedule.targetEngineerId ? [String(schedule.targetEngineerId)] : [],
      cadence: schedule.cadence || "monthly",
      nextRunAnchor: inputDate(schedule.nextRunAnchor),
      endDate: inputDate(schedule.endDate),
      active: Boolean(schedule.active),
      remark: (schedule as { remark?: string }).remark || "",
    });
    setDialogOpen(true);
  }

  function updateCustomer(customerId: string) {
    setForm((prev) => ({ ...prev, customerId, deviceIds: [] }));
    const customer = customers.find((c) => String(c.id) === customerId);
    setCustomerSearch(customer?.name || "");
    setCustomerOptionsOpen(false);
  }

  function updateCustomerSearch(value: string) {
    setCustomerSearch(value);
    setCustomerOptionsOpen(true);
    updateCustomerDropdownBox();
    if (selectedCustomer && value !== (selectedCustomer.name || `客户 #${selectedCustomer.id}`)) {
      setForm((prev) => ({ ...prev, customerId: "", deviceIds: [] }));
    }
  }

  function toggleEngineer(engineerId: string) {
    setEngineerSearch("");
    setEngineerOptionsOpen(true);
    updateEngineerDropdownBox();
    setForm((prev) => ({
      ...prev,
      targetEngineerIds: prev.targetEngineerIds.includes(engineerId)
        ? prev.targetEngineerIds.filter((id) => id !== engineerId)
        : [...prev.targetEngineerIds, engineerId],
    }));
  }

  async function submit() {
    if (!form.customerId) {
      setError("请选择客户");
      return;
    }
    if (form.targetEngineerIds.length === 0) {
      setError("请选择巡检工程师");
      return;
    }
    if (form.deviceIds.length === 0) {
      setError("请至少选择一台设备");
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
        deviceIds: form.deviceIds,
        targetEngineerId: form.targetEngineerIds[0],
        targetEngineerIds: form.targetEngineerIds,
        cadence: form.cadence,
        nextRunAnchor: form.nextRunAnchor,
        endDate: form.endDate || null,
        active: form.active,
        remark: form.remark.trim() || undefined,
      };
      if (editingId) {
        await api.put(`/inspection-schedules/${editingId}`, payload);
      } else if (form.targetEngineerIds.length > 1) {
        await api.post("/inspection-schedules/bulk", {
          name: form.name.trim() || undefined,
          customerId: form.customerId,
          assignments: form.targetEngineerIds.flatMap((targetEngineerId) =>
            form.deviceIds.map((deviceId) => ({ deviceId, targetEngineerId })),
          ),
          cadence: form.cadence,
          nextRunAnchor: form.nextRunAnchor,
          endDate: form.endDate || null,
          active: form.active,
        });
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

  const customerOptionsDropdown = dialogOpen && customerOptionsOpen && customerDropdownBox
    ? (
      <div
        className="absolute z-[80] overflow-y-auto rounded-md border border-border bg-background p-1 shadow-xl"
        style={{
          top: customerDropdownBox.top,
          left: customerDropdownBox.left,
          width: customerDropdownBox.width,
          maxHeight: customerDropdownBox.maxHeight,
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        {filteredCustomerOptions.length ? (
          filteredCustomerOptions.map((c) => {
            const customerId = String(c.id);
            const selected = form.customerId === customerId;
            return (
              <button
                key={c.id}
                type="button"
                className={`flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors ${
                  selected ? "bg-primary/10 text-primary" : "hover:bg-accent"
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  updateCustomer(customerId);
                }}
              >
                <span className="min-w-0 truncate">{c.name || `客户 #${c.id}`}</span>
                {selected && <Badge variant="outline">已选</Badge>}
              </button>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">未找到匹配客户</div>
        )}
      </div>
    )
    : null;

  const engineerOptionsDropdown = dialogOpen && engineerOptionsOpen && engineerDropdownBox
    ? (
      <div
        className="absolute z-[80] space-y-1.5 overflow-y-auto rounded-md border border-border bg-background p-3 shadow-xl"
        style={{
          top: engineerDropdownBox.top,
          left: engineerDropdownBox.left,
          width: engineerDropdownBox.width,
          maxHeight: engineerDropdownBox.maxHeight,
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        {filteredEngineerOptions.length ? (
          filteredEngineerOptions.map((e) => {
            const engineerId = String(e.id);
            const checked = form.targetEngineerIds.includes(engineerId);
            return (
              <div
                key={e.id}
                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                onMouseDown={(event) => {
                  event.preventDefault();
                  toggleEngineer(engineerId);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleEngineer(engineerId);
                  }
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                  checked
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={checked}
                  readOnly
                  tabIndex={-1}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {e.realName || e.username || `工程师 #${e.id}`}
                  </div>
                  {e.username && e.realName && (
                    <div className="text-xs text-muted-foreground">{e.username}</div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">未找到匹配工程师</div>
        )}
      </div>
    )
    : null;

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

  async function bulkDeleteSchedules() {
    if (!selectedScheduleIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedScheduleIds.length} 个巡检计划？历史工单不会被删除。`)) return;
    setSaving(true);
    setError("");
    try {
      for (const id of selectedScheduleIds) {
        await api.delete(`/inspection-schedules/${id}`);
      }
      if (detailTarget && selectedScheduleIds.includes(String(detailTarget.id))) setDetailTarget(null);
      setSelectedScheduleIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量删除失败");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">巡检计划</h1>
          <p className="text-muted-foreground mt-1">管理周期性巡检任务</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={saving}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          {canManageSchedules ? (
            <>
              <Button variant="outline" onClick={generateDueSchedules} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                生成到期巡检单
              </Button>
              <Button onClick={openCreate} disabled={saving}>
                <Plus className="w-4 h-4 mr-2" />
                新增计划
              </Button>
            </>
          ) : null}
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
                placeholder="搜索客户、设备、工程师…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="全部客户" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部客户</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={String(customer.id)}>
                    {customer.name || `客户 #${customer.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={cadenceFilter} onValueChange={setCadenceFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="巡检周期" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部周期</SelectItem>
                <SelectItem value="monthly">每月</SelectItem>
                <SelectItem value="bi-monthly">每两月</SelectItem>
                <SelectItem value="quarterly">每季度</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="全部状态" />
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
                setCustomerFilter("all");
                setCadenceFilter("all");
                setStatusFilter("all");
                setSearchParams({});
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>巡检计划列表 ({filtered.length})</CardTitle>
            {canManageSchedules ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={allFilteredSchedulesSelected}
                    onCheckedChange={toggleAllFilteredSchedules}
                    disabled={saving || filtered.length === 0}
                    aria-label="全选当前巡检计划列表"
                  />
                  全选当前列表
                </label>
                {selectedScheduleIds.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedScheduleIds([])} disabled={saving}>
                    清空选择
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={bulkDeleteSchedules}
                  disabled={saving || !selectedScheduleIds.length}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  批量删除{selectedScheduleIds.length ? ` (${selectedScheduleIds.length})` : ""}
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-y-auto pr-1">
            {loading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 正在加载…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无巡检计划</div>
            ) : (
              <div className="space-y-3">
              {filtered.map((s) => {
                const cadenceLabel = CADENCE_LABELS[s.cadence || ""] || s.cadence || "-";
                const planName = String(s.name || "").trim();
                const customerName = String(s.customerName || "").trim();
                const title = planName || customerName || `计划 #${s.id}`;
                const deviceNames = s.deviceNames || [];
                const selected = selectedScheduleIds.includes(String(s.id));
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    className="grid cursor-pointer grid-cols-1 gap-4 rounded-lg border border-border p-4 transition-colors hover:border-primary hover:bg-accent/30 lg:grid-cols-[24px_minmax(280px,1.8fr)_120px_96px_150px_132px_168px] lg:items-center"
                    onClick={() => setDetailTarget(s)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetailTarget(s);
                      }
                    }}
                  >
                    {canManageSchedules ? (
                      <div onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => toggleScheduleSelection(s.id, checked)}
                          disabled={saving}
                          aria-label={`选择巡检计划 ${title}`}
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <div className="text-base font-semibold leading-6 text-slate-900">
                        {title}
                      </div>
                      {deviceNames.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="max-w-[220px] truncate text-xs">
                            {deviceNames[0]}
                          </Badge>
                          {deviceNames.length > 1 && (
                            <span className="text-xs font-medium text-muted-foreground">+{deviceNames.length - 1}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">巡检人</div>
                      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{s.targetEngineerName || "未指定"}</div>
                    </div>
                    <div className="flex items-center">
                      <Badge variant={CADENCE_VARIANT[s.cadence || ""] || "outline"}>
                        {cadenceLabel}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">下次生成</div>
                      <div className="mt-1 whitespace-nowrap text-sm font-semibold text-slate-900">{formatDate(s.nextRunAnchor)}</div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                      {canManageSchedules ? (
                        <Switch
                          checked={Boolean(s.active)}
                          onCheckedChange={() => toggleActive(s)}
                          disabled={saving}
                        />
                      ) : null}
                      <span className="whitespace-nowrap text-sm text-muted-foreground">
                        {s.active ? "已启用" : "已停用"}
                      </span>
                    </div>
                    {canManageSchedules ? (
                      <div className="flex items-center gap-2 lg:justify-end" onClick={(event) => event.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                          onClick={() => {
                            openEdit(s);
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                          onClick={() => {
                            deleteSchedule(s);
                          }}
                          disabled={saving}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          删除
                        </Button>
                      </div>
                    ) : null}
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
            <DialogTitle>巡检计划详情</DialogTitle>
            <DialogDescription>计划基本信息、巡检设备与执行节奏</DialogDescription>
          </DialogHeader>
          {detailTarget ? (() => {
            const cadenceLabel = CADENCE_LABELS[detailTarget.cadence || ""] || detailTarget.cadence || "-";
            const deviceNames = detailTarget.deviceNames || [];
            return (
              <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-6 pb-2">
                <div className="space-y-5 py-2">
                  <div className="rounded-lg border bg-slate-50/60 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold leading-7 text-slate-900">
                          {detailTarget.name || detailTarget.customerName || `计划 #${detailTarget.id}`}
                        </div>
                      </div>
                      <Badge variant={detailTarget.active ? "success" : "secondary"}>
                        {detailTarget.active ? "已启用" : "已停用"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">巡检工程师</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.targetEngineerName || "未指定"}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">巡检周期</div>
                        <div className="mt-1"><Badge variant={CADENCE_VARIANT[detailTarget.cadence || ""] || "outline"}>{cadenceLabel}</Badge></div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">下次生成</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{formatDate(detailTarget.nextRunAnchor)}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">设备数量</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{deviceNames.length || detailTarget.deviceIds?.length || 0}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">巡检设备</div>
                      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {deviceNames.length ? deviceNames.map((name, index) => (
                          <div key={`${name}-${index}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm font-medium">
                            {name || `设备 #${detailTarget.deviceIds?.[index] || index + 1}`}
                          </div>
                        )) : (
                          <div className="text-sm text-muted-foreground">暂无设备</div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">计划信息</div>
                      <div className="mt-3 grid gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">结束日期</div>
                          <div className="mt-1">{formatDate(detailTarget.endDate)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">备注</div>
                          <div className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2">{detailTarget.remark || "-"}</div>
                        </div>
                      </div>
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
            {detailTarget && canManageSchedules ? (
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setCustomerOptionsOpen(false);
            setEngineerOptionsOpen(false);
          }
        }}
      >
        <DialogContent ref={dialogContentRef} className="sm:max-w-[640px] max-h-[85vh] overflow-visible">
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑巡检计划" : "新增巡检计划"}</DialogTitle>
            <DialogDescription>
              选择客户、指派工程师，并勾选需要巡检的设备
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(85vh-9rem)] space-y-4 overflow-y-auto py-2 pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>计划名称</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如 苏州园区月度巡检"
                />
              </div>
              <div
                className="relative space-y-2"
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget as Node | null;
                  if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                  setCustomerOptionsOpen(false);
                }}
              >
                <Label>客户 *</Label>
                <Input
                  ref={customerInputRef}
                  value={customerSearch}
                  onChange={(event) => updateCustomerSearch(event.target.value)}
                  onFocus={() => {
                    updateCustomerDropdownBox();
                    setCustomerOptionsOpen(true);
                  }}
                  placeholder="输入客户名称或选择客户"
                />
                {selectedCustomer && (
                  <div className="text-xs text-muted-foreground">
                    已选：{selectedCustomer.name || `客户 #${selectedCustomer.id}`}
                  </div>
                )}
              </div>
              <div
                className="relative space-y-2"
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget as Node | null;
                  if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                  setEngineerOptionsOpen(false);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <Label>巡检工程师 *</Label>
                  <span className="text-xs text-muted-foreground">已选 {selectedEngineerCount} 人</span>
                </div>
                <Input
                  ref={engineerInputRef}
                  value={engineerSearch}
                  onChange={(event) => {
                    setEngineerSearch(event.target.value);
                    updateEngineerDropdownBox();
                    setEngineerOptionsOpen(true);
                  }}
                  onFocus={() => {
                    updateEngineerDropdownBox();
                    setEngineerOptionsOpen(true);
                  }}
                  placeholder={selectedEngineerCount ? "继续输入筛选工程师" : "输入工程师姓名或选择工程师"}
                />
                {selectedEngineerCount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    已选：{selectedEngineerSummary}{selectedEngineerCount > 3 ? ` +${selectedEngineerCount - 3}` : ""}
                  </div>
                )}
              </div>
              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>巡检设备（至少选一台）</Label>
                  {form.customerId && customerDevices.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>已选 {selectedDeviceCount} 台</span>
                      <Button type="button" variant="ghost" size="sm" onClick={selectAllCustomerDevices}>
                        全选
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={clearSelectedDevices}>
                        清空
                      </Button>
                    </div>
                  )}
                </div>
                {!form.customerId ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    请先选择客户
                  </div>
                ) : customerDevices.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    该客户暂无设备档案
                  </div>
                ) : (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-border p-3">
                    {customerDevices.map((d) => {
                      const deviceId = Number(d.id);
                      const checked = form.deviceIds.includes(deviceId);
                      return (
                        <div
                          key={d.id}
                          role="checkbox"
                          aria-checked={checked}
                          tabIndex={0}
                          onClick={() => toggleDevice(deviceId)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleDevice(deviceId);
                            }
                          }}
                          className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                            checked
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={checked}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => toggleDevice(deviceId)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-sm font-medium">{deviceLabel(d)}</div>
                            <div className="text-xs text-muted-foreground">设备 #{d.id}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>巡检周期 *</Label>
                <Select value={form.cadence} onValueChange={(v) => setForm({ ...form, cadence: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择周期" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">每月</SelectItem>
                    <SelectItem value="bi-monthly">每两月</SelectItem>
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
          {customerOptionsDropdown}
          {engineerOptionsDropdown}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "保存中…" : editingId ? "保存修改" : "保存计划"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
