import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Search, Plus, RefreshCw, Server, Loader2, Trash2, Check, Pencil, RotateCcw, Edit3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { ErrorToast } from "@/components/ErrorToast";
import { HelpTooltip } from "@/components/HelpTooltip";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

interface Device {
  id: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  mrNo?: string;
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
  partHistory?: DevicePartHistory[];
}

interface DevicePartHistory {
  id: string | number;
  serviceOrderId?: string | number;
  orderNo?: string;
  serviceMode?: string;
  serviceType?: string;
  actionType?: string;
  partName?: string;
  partNo?: string;
  quantity?: string | number;
  unit?: string;
  remark?: string;
  issueDescription?: string;
  workContent?: string;
  engineerName?: string;
  serviceAt?: string;
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

interface DeviceForm {
  customerId: string;
  name: string;
  model: string;
  pn: string;
  serialNo: string;
  mrNo: string;
  maintenanceType: string;
  maintenancePartyId: string;
  maintenanceStart: string;
  maintenanceEnd: string;
  location: string;
  status: string;
  remark: string;
}

interface BatchDeviceRow {
  name: string;
  model: string;
  serialNo: string;
  mrNo: string;
}

const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  none: "无维保",
  vendor: "原厂维保",
  our: "我方维保",
  original_manufacturer: "原厂维保",
  our_maintenance: "我方维保",
};

const MAINTENANCE_TYPE_BADGE: Record<string, "default" | "secondary" | "info" | "purple"> = {
  none: "secondary",
  vendor: "info",
  our: "purple",
  original_manufacturer: "info",
  our_maintenance: "purple",
};

const MAINTENANCE_TYPE_HELP = "维保类型用于区分设备当前由谁负责保障：无维保表示暂不纳入维保；我方维保表示由本公司负责服务和巡检；原厂维保表示主要由原厂或指定维保方负责。";

const MAINTENANCE_TYPE_ALIASES: Record<string, string> = {
  vendor: "original_manufacturer",
  our: "our_maintenance",
};

const DEVICE_STATUS_LABELS: Record<string, string> = {
  active: "在用",
  inactive: "停用",
  maintenance: "维保中",
  scrapped: "已报废",
};

const DEVICE_STATUS_BADGE: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
  active: "success",
  inactive: "secondary",
  maintenance: "warning",
  scrapped: "destructive",
};

const DEVICE_TABLE_GRID = "md:grid-cols-[32px_28px_minmax(220px,1.2fr)_minmax(190px,1fr)_92px_118px_minmax(180px,0.95fr)_86px_156px]";
const DEVICE_TABLE_READONLY_GRID = "md:grid-cols-[28px_minmax(240px,1.2fr)_minmax(200px,1fr)_92px_118px_minmax(200px,1fr)_86px]";
const DEVICE_BADGE_CLASS = "inline-flex h-6 min-w-[74px] justify-center px-2";
const DEVICE_STATUS_BADGE_CLASS = "inline-flex h-6 min-w-[56px] justify-center px-2";

function createEmptyDeviceForm(overrides: Partial<DeviceForm> = {}): DeviceForm {
  return {
    customerId: "",
    name: "",
    model: "",
    pn: "",
    serialNo: "",
    mrNo: "",
    maintenanceType: "none",
    maintenancePartyId: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    location: "",
    status: "active",
    remark: "",
    ...overrides,
  };
}

function createEmptyBatchRow(): BatchDeviceRow {
  return {
    name: "",
    model: "",
    serialNo: "",
    mrNo: "",
  };
}

interface BatchEditForm {
  maintenanceType: string;
  maintenancePartyId: string;
  maintenanceStart: string;
  maintenanceEnd: string;
  warrantyUntil: string;
  mrNo: string;
  location: string;
  remark: string;
}

interface BatchEditToggles {
  maintenanceType: boolean;
  maintenancePartyId: boolean;
  maintenanceStart: boolean;
  maintenanceEnd: boolean;
  warrantyUntil: boolean;
  mrNo: boolean;
  location: boolean;
  remark: boolean;
}

function createEmptyBatchEditForm(): BatchEditForm {
  return {
    maintenanceType: "none",
    maintenancePartyId: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    warrantyUntil: "",
    mrNo: "",
    location: "",
    remark: "",
  };
}

function createEmptyBatchEditToggles(): BatchEditToggles {
  return {
    maintenanceType: false,
    maintenancePartyId: false,
    maintenanceStart: false,
    maintenanceEnd: false,
    warrantyUntil: false,
    mrNo: false,
    location: false,
    remark: false,
  };
}

function createInitialBatchRows(count = 3) {
  return Array.from({ length: count }, () => createEmptyBatchRow());
}

function batchRowHasInput(row: BatchDeviceRow) {
  return Boolean(row.name.trim() || row.model.trim() || row.serialNo.trim() || row.mrNo.trim());
}

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

function maintenancePartyMatchesType(party: MaintenanceParty, type?: string) {
  const maintenanceType = canonicalMaintenanceType(type);
  if (maintenanceType === "none") return false;
  return canonicalMaintenanceType(party.partyType) === maintenanceType;
}

function resolveMaintenancePartyId(parties: MaintenanceParty[], type: string, currentId?: string | number | null) {
  const maintenanceType = canonicalMaintenanceType(type);
  if (maintenanceType === "none" || !currentId) return "";
  return parties.some((party) => (
    String(party.id) === String(currentId)
    && maintenancePartyMatchesType(party, maintenanceType)
  )) ? String(currentId) : "";
}

function customerLabel(customer?: Customer | null) {
  if (!customer) return "";
  return customer.name || `客户 #${customer.id}`;
}

function normalizeCustomerSearchText(value?: string | number) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function deviceDisplayName(device?: Device | null) {
  if (!device) return "";
  return device.model || device.name || device.serialNo || `设备 #${device.id}`;
}

function partActionLabel(value?: string) {
  if (value === "replacement") return "配件更换";
  if (value === "installation") return "配件安装";
  return "配件记录";
}

function serviceTypeLabel(value?: string) {
  const labels: Record<string, string> = {
    install: "现场安装",
    repair: "故障处理",
    maintain: "保养维护",
    inspect: "例行巡检",
    training: "现场培训",
    other: "其他事项",
  };
  return labels[value || ""] || value || "服务记录";
}

function partQuantityText(item: DevicePartHistory) {
  const quantity = Number(item.quantity || 0);
  const text = Number.isFinite(quantity) && quantity > 0 ? String(quantity).replace(/\.00$/, "") : "";
  return [text, item.unit].filter(Boolean).join("") || "1";
}

function compactText(value?: string, maxLength = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function mergeCustomers(current: Customer[], incoming: Customer[]) {
  const merged = new Map<string, Customer>();
  [...current, ...incoming].forEach((customer) => {
    if (!customer?.id) return;
    const key = String(customer.id);
    const existing = merged.get(key);
    merged.set(key, { ...existing, ...customer });
  });
  return [...merged.values()];
}

export function Devices() {
  const { hasPermission } = useAuth();
  const canCreateDevices = hasPermission("device.create");
  const canEditDevices = hasPermission("device.edit");
  const canDeleteDevices = hasPermission("device.delete");
  const canManageDevices = canEditDevices || canDeleteDevices;
  const canSelectDevices = canManageDevices;
  const deviceTableGrid = canManageDevices ? DEVICE_TABLE_GRID : DEVICE_TABLE_READONLY_GRID;
  const deviceTableMinWidth = canManageDevices ? "min-w-[1262px]" : "min-w-[1092px]";
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parties, setParties] = useState<MaintenanceParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Device | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"single" | "bulk">("single");
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [maintenanceFilter, setMaintenanceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modelSuggestions, setModelSuggestions] = useState<ModelSuggestion[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelTimer, setModelTimer] = useState<number | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);
  const [customerInput, setCustomerInput] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchTimer, setCustomerSearchTimer] = useState<number | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [form, setForm] = useState<DeviceForm>(() => createEmptyDeviceForm());
  const [batchRows, setBatchRows] = useState<BatchDeviceRow[]>(() => createInitialBatchRows());
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchEditForm, setBatchEditForm] = useState<BatchEditForm>(() => createEmptyBatchEditForm());
  const [batchEditToggles, setBatchEditToggles] = useState<BatchEditToggles>(() => createEmptyBatchEditToggles());
  const filteredMaintenanceParties = useMemo(
    () => parties.filter((party) => maintenancePartyMatchesType(party, form.maintenanceType)),
    [parties, form.maintenanceType],
  );
  const filteredBatchEditMaintenanceParties = useMemo(
    () => parties.filter((party) => maintenancePartyMatchesType(party, batchEditForm.maintenanceType)),
    [parties, batchEditForm.maintenanceType],
  );

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
      setLoadedOnce(true);
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
      const status = d.status || "active";
      if (maintenanceFilter !== "all" && maintenanceType !== maintenanceFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!keyword) return true;
      return [d.name, d.model, d.pn, d.serialNo, d.mrNo, d.customerName, d.maintenancePartyName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [devices, maintenanceFilter, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const ours = filtered.filter((d) => canonicalMaintenanceType(d.maintenanceType) === "our_maintenance").length;
    const vendor = filtered.filter((d) => canonicalMaintenanceType(d.maintenanceType) === "original_manufacturer").length;
    return [
      { label: "设备总数", value: total },
      { label: "我方维保", value: ours },
      { label: "原厂维保", value: vendor },
    ];
  }, [filtered]);
  const initialLoading = loading && !loadedOnce;
  const refreshing = loading && loadedOnce;

  const allFilteredDevicesSelected = filtered.length > 0
    && filtered.every((device) => selectedDeviceIds.includes(String(device.id)));

  useEffect(() => {
    const visibleIds = new Set(filtered.map((device) => String(device.id)));
    setSelectedDeviceIds((ids) => {
      const next = ids.filter((id) => visibleIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [filtered]);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && modelDropdownRef.current?.contains(target)) return;
      setModelDropdownOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [modelDropdownOpen]);

  function toggleDeviceSelection(deviceId: string | number, checked: boolean | "indeterminate") {
    const id = String(deviceId);
    setSelectedDeviceIds((ids) => {
      if (checked === true) return ids.includes(id) ? ids : [...ids, id];
      return ids.filter((item) => item !== id);
    });
  }

  function toggleAllFilteredDevices(checked: boolean | "indeterminate") {
    const ids = filtered.map((device) => String(device.id));
    setSelectedDeviceIds((current) => {
      if (checked === true) return Array.from(new Set([...current, ...ids]));
      const visible = new Set(ids);
      return current.filter((id) => !visible.has(id));
    });
  }

  function filterByModel(event: MouseEvent, model?: string) {
    event.stopPropagation();
    const value = String(model || "").trim();
    if (!value) return;
    setSearchQuery(value);
  }

  function filterByCustomer(event: MouseEvent, device: Device) {
    event.stopPropagation();
    const customerId = device.customerId ? String(device.customerId) : "";
    const customerName = String(device.customerName || "").trim();
    if (customerId) {
      setCustomerFilter(customerId);
      return;
    }
    if (customerName) setSearchQuery(customerName);
  }

  function filterByMaintenanceParty(event: MouseEvent, partyName?: string) {
    event.stopPropagation();
    const value = String(partyName || "").trim();
    if (!value) return;
    setSearchQuery(value);
  }

  function filterByMaintenanceType(event: MouseEvent, maintenanceType?: string) {
    event.stopPropagation();
    const value = canonicalMaintenanceType(maintenanceType);
    if (!value) return;
    setMaintenanceFilter(value);
  }

  function filterByStatus(event: MouseEvent, status?: string) {
    event.stopPropagation();
    setStatusFilter(status || "active");
  }

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(form.customerId)) || null,
    [customers, form.customerId],
  );

  const dialogCustomerOptions = useMemo(() => {
    const keyword = normalizeCustomerSearchText(customerInput);
    const selectedId = form.customerId ? String(form.customerId) : "";
    const matches = customers
      .filter((customer) => {
        if (!keyword) return true;
        return normalizeCustomerSearchText(`${customerLabel(customer)} ${customer.id}`).includes(keyword);
      })
      .sort((left, right) => {
        if (selectedId && String(left.id) === selectedId) return -1;
        if (selectedId && String(right.id) === selectedId) return 1;
        const leftLabel = normalizeCustomerSearchText(customerLabel(left));
        const rightLabel = normalizeCustomerSearchText(customerLabel(right));
        const leftStarts = keyword && leftLabel.startsWith(keyword) ? 0 : 1;
        const rightStarts = keyword && rightLabel.startsWith(keyword) ? 0 : 1;
        if (leftStarts !== rightStarts) return leftStarts - rightStarts;
        return customerLabel(left).localeCompare(customerLabel(right), "zh-Hans-CN");
      })
      .slice(0, 60);

    if (selectedCustomer && !matches.some((customer) => String(customer.id) === String(selectedCustomer.id))) {
      return [selectedCustomer, ...matches].slice(0, 60);
    }
    return matches;
  }, [customers, customerInput, form.customerId, selectedCustomer]);

  function selectedCustomerLabel(customerId: string | number | undefined, fallback?: string) {
    if (!customerId) return "";
    const customer = customers.find((item) => String(item.id) === String(customerId));
    return customerLabel(customer) || fallback || `客户 #${customerId}`;
  }

  function openCreate() {
    setError("");
    setCreateMode("single");
    setEditingId(null);
    const defaultCustomerId = customerFilter !== "all" ? customerFilter : "";
    setForm(createEmptyDeviceForm({ customerId: defaultCustomerId }));
    setCustomerInput(selectedCustomerLabel(defaultCustomerId));
    setCustomerDropdownOpen(false);
    setModelSuggestions([]);
    setDialogOpen(true);
  }

  function openBulkCreate() {
    setError("");
    setCreateMode("bulk");
    setEditingId(null);
    const defaultCustomerId = customerFilter !== "all" ? customerFilter : "";
    setForm(createEmptyDeviceForm({ customerId: defaultCustomerId }));
    setBatchRows(createInitialBatchRows());
    setCustomerInput(selectedCustomerLabel(defaultCustomerId));
    setCustomerDropdownOpen(false);
    setModelSuggestions([]);
    setDialogOpen(true);
  }

  function openEdit(device: Device) {
    setError("");
    setCreateMode("single");
    setEditingId(device.id);
    const maintenanceType = canonicalMaintenanceType(device.maintenanceType);
    setForm({
      customerId: device.customerId ? String(device.customerId) : "",
      name: device.name || "",
      model: device.model || "",
      pn: device.pn || "",
      serialNo: device.serialNo || "",
      mrNo: device.mrNo || "",
      maintenanceType,
      maintenancePartyId: resolveMaintenancePartyId(parties, maintenanceType, device.maintenancePartyId),
      maintenanceStart: inputDate(device.maintenanceStart),
      maintenanceEnd: inputDate(device.maintenanceEnd),
      location: device.location || "",
      status: device.status || "active",
      remark: device.remark || "",
    });
    setCustomerInput(selectedCustomerLabel(device.customerId, device.customerName));
    setCustomerDropdownOpen(false);
    setModelSuggestions([]);
    setDialogOpen(true);
  }

  function updateBatchRow(index: number, field: keyof BatchDeviceRow, value: string) {
    setBatchRows((rows) => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  }

  function addBatchRow() {
    setBatchRows((rows) => [...rows, createEmptyBatchRow()]);
  }

  function removeBatchRow(index: number) {
    setBatchRows((rows) => {
      const next = rows.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [createEmptyBatchRow()];
    });
  }

  async function openDetail(device: Device) {
    setDetailTarget(device);
    if (!device.id) return;
    setDetailLoading(true);
    try {
      const data = await api.get(`/devices/${device.id}`);
      setDetailTarget((data?.item || device) as Device);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载设备详情失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function submit() {
    let effectiveCustomerId = form.customerId;
    if (!effectiveCustomerId && customerInput.trim()) {
      const normalizedInput = normalizeCustomerSearchText(customerInput);
      const exact = customers.find((customer) => (
        normalizeCustomerSearchText(customerLabel(customer)) === normalizedInput
        || String(customer.id) === customerInput.trim()
      ));
      if (exact) effectiveCustomerId = String(exact.id);
    }

    if (!effectiveCustomerId) {
      setError("请选择客户");
      setCustomerDropdownOpen(true);
      return;
    }
    setSaving(true);
    setError("");
    let createdCount = 0;
    try {
      const maintenanceType = canonicalMaintenanceType(form.maintenanceType);
      const commonPayload: Record<string, unknown> = {
        customerId: effectiveCustomerId,
        maintenanceType,
        maintenancePartyId: maintenanceType === "none" ? null : form.maintenancePartyId || null,
        maintenanceStart: form.maintenanceStart || undefined,
        maintenanceEnd: form.maintenanceEnd || undefined,
        location: form.location.trim() || undefined,
        status: form.status,
        remark: form.remark.trim() || undefined,
      };

      if (!editingId && createMode === "bulk") {
        const defaultModel = form.model.trim();
        const rows = batchRows
          .map((row, index) => ({
            index,
            name: row.name.trim(),
            model: row.model.trim() || defaultModel,
            serialNo: row.serialNo.trim(),
            mrNo: row.mrNo.trim(),
            hasInput: batchRowHasInput(row),
          }))
          .filter((row) => row.hasInput);

        if (!rows.length) {
          setError("请至少填写一台设备");
          return;
        }
        const missingModel = rows.find((row) => !row.model);
        if (missingModel) {
          setError(`第 ${missingModel.index + 1} 行缺少设备型号，请填写该行型号或上方默认型号`);
          return;
        }
        const missingSerialNo = rows.find((row) => !row.serialNo);
        if (missingSerialNo) {
          setError(`第 ${missingSerialNo.index + 1} 行缺少 S/N 序列号`);
          return;
        }

        for (const row of rows) {
          await api.post("/devices", {
            ...commonPayload,
            name: row.name || null,
            model: row.model,
            serialNo: row.serialNo || undefined,
            mrNo: row.mrNo || undefined,
          });
          createdCount += 1;
        }
      } else {
        if (!form.model.trim()) {
          setError("请输入设备型号");
          return;
        }
        if (!form.serialNo.trim()) {
          setError("请输入 S/N 序列号");
          return;
        }
        const payload: Record<string, unknown> = {
          ...commonPayload,
          name: form.name.trim() || null,
          model: form.model.trim(),
          pn: form.pn.trim() || undefined,
          serialNo: form.serialNo.trim() || undefined,
          mrNo: form.mrNo.trim() || undefined,
        };
        if (editingId) {
          await api.put(`/devices/${editingId}`, payload);
        } else {
          await api.post("/devices", payload);
        }
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      setError(createdCount ? `已新增 ${createdCount} 台设备，后续保存失败：${msg}` : msg);
      if (createdCount) await load();
    } finally {
      setSaving(false);
    }
  }

  function scheduleCustomerSearch(value: string) {
    if (customerSearchTimer) window.clearTimeout(customerSearchTimer);
    const keyword = value.trim();
    if (!keyword) {
      setCustomerSearchLoading(false);
      return;
    }
    const timerId = window.setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const data = await api.get(`/customers?pageSize=50&keyword=${encodeURIComponent(keyword)}`);
        setCustomers((prev) => mergeCustomers(prev, (data?.items || []) as Customer[]));
      } catch {
        // Keep local matches usable when remote customer search is unavailable.
      } finally {
        setCustomerSearchLoading(false);
      }
    }, 220);
    setCustomerSearchTimer(timerId);
  }

  function applyCustomer(customer: Customer) {
    setForm((prev) => ({ ...prev, customerId: String(customer.id) }));
    setCustomerInput(customerLabel(customer));
    setCustomerDropdownOpen(false);
  }

  function scheduleModelSearch(value: string) {
    if (modelTimer) window.clearTimeout(modelTimer);
    const keyword = value.trim();
    if (keyword.length < 2) {
      setModelSuggestions([]);
      setModelDropdownOpen(false);
      return;
    }
    setModelDropdownOpen(true);
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
    }));
    setModelSuggestions([]);
    setModelDropdownOpen(false);
  }

  async function deleteDevice(device: Device) {
    if (!device.id) return;
    const label = deviceDisplayName(device);
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

  async function bulkDeleteDevices() {
    if (!selectedDeviceIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedDeviceIds.length} 台设备？已有工单或巡检计划引用的设备不能删除，失败项会保留。`)) return;
    setSaving(true);
    setError("");
    try {
      for (const id of selectedDeviceIds) {
        await api.delete(`/devices/${id}`);
      }
      if (detailTarget && selectedDeviceIds.includes(String(detailTarget.id))) setDetailTarget(null);
      setSelectedDeviceIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量删除失败");
      await load();
    } finally {
      setSaving(false);
    }
  }

  function openBatchEdit() {
    setError("");
    setBatchEditForm(createEmptyBatchEditForm());
    setBatchEditToggles(createEmptyBatchEditToggles());
    setBatchEditOpen(true);
  }

  async function submitBatchEdit() {
    const fields: Record<string, unknown> = {};
    if (batchEditToggles.maintenanceType) {
      fields.maintenanceType = canonicalMaintenanceType(batchEditForm.maintenanceType);
      if (fields.maintenanceType !== "none" && batchEditToggles.maintenancePartyId) {
        fields.maintenancePartyId = batchEditForm.maintenancePartyId || null;
      }
    } else if (batchEditToggles.maintenancePartyId) {
      fields.maintenancePartyId = batchEditForm.maintenancePartyId || null;
    }
    if (batchEditToggles.maintenanceStart) fields.maintenanceStart = batchEditForm.maintenanceStart || null;
    if (batchEditToggles.maintenanceEnd) fields.maintenanceEnd = batchEditForm.maintenanceEnd || null;
    if (batchEditToggles.warrantyUntil) fields.warrantyUntil = batchEditForm.warrantyUntil || null;
    if (batchEditToggles.mrNo) fields.mrNo = batchEditForm.mrNo.trim() || null;
    if (batchEditToggles.location) fields.location = batchEditForm.location.trim() || null;
    if (batchEditToggles.remark) fields.remark = batchEditForm.remark.trim() || null;

    if (Object.keys(fields).length === 0) {
      setError("请至少勾选一个要修改的字段");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.put("/devices/batch", { ids: selectedDeviceIds, fields });
      setBatchEditOpen(false);
      setSelectedDeviceIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量编辑失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">设备资产</h1>
          <p className="text-muted-foreground mt-1">管理客户设备和维保信息</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => load(searchQuery)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          {canCreateDevices ? (
            <>
              <Button variant="outline" onClick={openBulkCreate}>
                <Plus className="w-4 h-4 mr-2" />
                批量新增
              </Button>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                新增设备
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <ErrorToast message={error} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索设备名称、型号、序列号、MR单…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(searchQuery);
                }}
              />
            </div>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="全部客户" />
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
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="维保类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="our_maintenance">我方维保</SelectItem>
                <SelectItem value="original_manufacturer">原厂维保</SelectItem>
                <SelectItem value="none">无维保</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[130px]">
                <SelectValue placeholder="设备状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">{DEVICE_STATUS_LABELS.active}</SelectItem>
                <SelectItem value="maintenance">{DEVICE_STATUS_LABELS.maintenance}</SelectItem>
                <SelectItem value="inactive">{DEVICE_STATUS_LABELS.inactive}</SelectItem>
                <SelectItem value="scrapped">{DEVICE_STATUS_LABELS.scrapped}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setCustomerFilter("all");
                setMaintenanceFilter("all");
                setStatusFilter("all");
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
            <div className="flex items-center gap-2">
              <CardTitle>设备列表 ({filtered.length})</CardTitle>
              {refreshing ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在更新
                </span>
              ) : null}
            </div>
            {canManageDevices ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={allFilteredDevicesSelected}
                    onCheckedChange={toggleAllFilteredDevices}
                    disabled={saving || filtered.length === 0}
                    aria-label="全选当前设备列表"
                  />
                  全选当前列表
                </label>
                {selectedDeviceIds.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDeviceIds([])} disabled={saving}>
                    清空选择
                  </Button>
                ) : null}
                {canEditDevices ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openBatchEdit}
                    disabled={saving || !selectedDeviceIds.length}
                  >
                    <Edit3 className="w-4 h-4 mr-2" />
                    批量编辑{selectedDeviceIds.length ? ` (${selectedDeviceIds.length})` : ""}
                  </Button>
                ) : null}
                {canDeleteDevices ? (
                  <Button
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    onClick={bulkDeleteDevices}
                    disabled={saving || !selectedDeviceIds.length}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    批量删除{selectedDeviceIds.length ? ` (${selectedDeviceIds.length})` : ""}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-auto rounded-md border">
            {initialLoading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 正在加载…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">未找到匹配设备</div>
            ) : (
              <div className={deviceTableMinWidth}>
                <div className={`sticky top-0 z-10 hidden border-b bg-muted/70 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur md:grid ${deviceTableGrid} md:items-center md:gap-4`}>
                  {canSelectDevices ? <div aria-hidden="true" /> : null}
                  <div aria-hidden="true" />
                  <div className="min-w-0 text-left">型号 / 客户</div>
                  <div className="min-w-0 text-left">SN</div>
                  <div className="text-left">MR单</div>
                  <div className="text-center">维保类型</div>
                  <div className="min-w-0 text-left">维保方 / 截止</div>
                  <div className="text-center">状态</div>
                  {canManageDevices ? <div className="text-center">操作</div> : null}
                </div>
                {filtered.map((device) => {
                  const maintenanceType = canonicalMaintenanceType(device.maintenanceType);
                  const typeLabel = MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "-";
                  const statusLabel = DEVICE_STATUS_LABELS[device.status || ""] || device.status || "在用";
                  const selected = selectedDeviceIds.includes(String(device.id));
                  return (
                    <div
                      key={device.id}
                      role="button"
                      tabIndex={0}
                      className={`grid cursor-pointer grid-cols-1 gap-3 border-b p-4 transition-colors last:border-b-0 hover:bg-accent/30 md:grid ${deviceTableGrid} md:items-center md:gap-4`}
                      onClick={() => openDetail(device)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDetail(device);
                        }
                      }}
                    >
                      {canSelectDevices ? (
                        <div className="flex items-center md:justify-center" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => toggleDeviceSelection(device.id, checked)}
                            disabled={saving}
                            aria-label={`选择设备 ${deviceDisplayName(device)}`}
                          />
                        </div>
                      ) : null}
                      <Server className="hidden h-5 w-5 text-primary md:block" />
                      <div className="min-w-0">
                        {device.model ? (
                          <button
                            type="button"
                            className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-primary hover:underline"
                            title={device.model}
                            onClick={(event) => filterByModel(event, device.model)}
                          >
                            {device.model}
                          </button>
                        ) : (
                          <div className="truncate font-medium">-</div>
                        )}
                        {device.customerName ? (
                          <button
                            type="button"
                            className="block max-w-full truncate text-left text-sm text-muted-foreground hover:text-primary hover:underline"
                            title={device.customerName}
                            onClick={(event) => filterByCustomer(event, device)}
                          >
                            {device.customerName}
                          </button>
                        ) : (
                          <div className="truncate text-sm text-muted-foreground">-</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground md:hidden">SN</div>
                        <div className="truncate text-sm" title={device.serialNo || "-"}>{device.serialNo || "-"}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground md:hidden">MR单</div>
                        <div className="truncate text-sm" title={device.mrNo || "-"}>{device.mrNo || "-"}</div>
                      </div>
                      <div className="flex md:justify-center">
                        <button type="button" className="inline-flex" onClick={(event) => filterByMaintenanceType(event, maintenanceType)}>
                          <Badge
                            variant={MAINTENANCE_TYPE_BADGE[maintenanceType] || "outline"}
                            className={`${DEVICE_BADGE_CLASS} cursor-pointer hover:ring-2 hover:ring-primary/20 ${maintenanceFilter === maintenanceType ? "ring-2 ring-primary/30" : ""}`}
                          >
                            {typeLabel}
                          </Badge>
                        </button>
                      </div>
                      <div className="min-w-0">
                        {device.maintenancePartyName ? (
                          <button
                            type="button"
                            className="block max-w-full truncate text-left text-sm font-medium text-slate-900 hover:text-primary hover:underline"
                            title={device.maintenancePartyName}
                            onClick={(event) => filterByMaintenanceParty(event, device.maintenancePartyName)}
                          >
                            {device.maintenancePartyName}
                          </button>
                        ) : (
                          <div className="truncate text-sm">-</div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          截止 {formatDate(device.maintenanceEnd)}
                        </div>
                      </div>
                      <div className="flex md:justify-center">
                        <button type="button" className="inline-flex" onClick={(event) => filterByStatus(event, device.status)}>
                          <Badge
                            variant={DEVICE_STATUS_BADGE[device.status || "active"] || "secondary"}
                            className={`${DEVICE_STATUS_BADGE_CLASS} cursor-pointer hover:ring-2 hover:ring-primary/20 ${statusFilter === (device.status || "active") ? "ring-2 ring-primary/30" : ""}`}
                          >
                            {statusLabel}
                          </Badge>
                        </button>
                      </div>
                      {canManageDevices ? (
                        <div className="flex gap-2 md:justify-end" onClick={(event) => event.stopPropagation()}>
                          {canEditDevices ? (
                            <Button variant="ghost" size="sm" className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900" onClick={() => openEdit(device)}>
                              <Pencil className="w-4 h-4 mr-1" />
                              编辑
                            </Button>
                          ) : null}
                          {canDeleteDevices ? (
                            <Button variant="ghost" size="sm" className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => deleteDevice(device)} disabled={saving}>
                              <Trash2 className="w-4 h-4 mr-1" />
                              删除
                            </Button>
                          ) : null}
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
            <DialogTitle>设备详情</DialogTitle>
            <DialogDescription>设备基础信息、客户归属、维保状态与配件历史</DialogDescription>
          </DialogHeader>
          {detailTarget ? (() => {
            const maintenanceType = canonicalMaintenanceType(detailTarget.maintenanceType);
            const typeLabel = MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "-";
            const statusLabel = DEVICE_STATUS_LABELS[detailTarget.status || ""] || detailTarget.status || "在用";
            const partHistory = Array.isArray(detailTarget.partHistory) ? detailTarget.partHistory : [];
            return (
              <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-6 pb-2">
                <div className="space-y-5 py-2">
                  {detailLoading ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在加载完整设备详情…
                    </div>
                  ) : null}

                  <div className="rounded-lg border bg-slate-50/60 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold leading-7 text-slate-900">
                          {detailTarget.model || "-"}
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
                        <div className="text-xs text-muted-foreground">SN</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.serialNo || "-"}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">MR单</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.mrNo || "-"}</div>
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
                          <div className="text-xs text-muted-foreground">主机名</div>
                          <div className="mt-1">{detailTarget.name || "-"}</div>
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
                          <div className="text-xs text-muted-foreground">维保类型</div>
                          <div className="mt-1"><Badge variant={MAINTENANCE_TYPE_BADGE[maintenanceType] || "outline"}>{typeLabel}</Badge></div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">维保方</div>
                          <div className="mt-1">{detailTarget.maintenancePartyName || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">维保周期</div>
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

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">安装与更换记录</div>
                        <div className="mt-1 text-xs text-muted-foreground">来自工程师服务记录中关联到这台设备的配件安装、配件更换记录</div>
                      </div>
                      <Badge variant="secondary">{partHistory.length} 条</Badge>
                    </div>
                    {partHistory.length ? (
                      <div className="mt-3 grid gap-3">
                        {partHistory.map((item) => (
                          <div key={item.id} className="rounded-md border bg-slate-50/60 p-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={item.actionType === "replacement" ? "warning" : item.actionType === "installation" ? "success" : "secondary"}>
                                    {partActionLabel(item.actionType)}
                                  </Badge>
                                  <span className="font-medium text-slate-900">{item.partName || "未命名配件"}</span>
                                </div>
                                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                                  {formatDate(item.serviceAt || item.createdAt)}
                                  {item.orderNo ? ` · ${item.orderNo}` : ""}
                                  {item.engineerName ? ` · ${item.engineerName}` : ""}
                                </div>
                                <div className="text-sm leading-6 text-muted-foreground">
                                  {serviceTypeLabel(item.serviceType)}
                                  {item.partNo ? ` · PN ${item.partNo}` : ""}
                                  {item.quantity ? ` · 数量 ${partQuantityText(item)}` : ""}
                                </div>
                                {item.remark || item.issueDescription || item.workContent ? (
                                  <div className="mt-2 rounded bg-white/80 px-3 py-2 text-sm leading-6 text-slate-700">
                                    {compactText(item.remark || item.issueDescription || item.workContent)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                        暂无配件安装或更换记录
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })() : null}
          <DialogFooter className="flex-row justify-end border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              关闭
            </Button>
            {detailTarget && canEditDevices ? (
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
            setError("");
            setModelDropdownOpen(false);
          }
        }}
      >
        <DialogContent
          className={`max-h-[85vh] overflow-y-auto ${!editingId && createMode === "bulk" ? "sm:max-w-[980px]" : "sm:max-w-[640px]"}`}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑设备" : createMode === "bulk" ? "批量新增设备" : "新增设备"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "更新设备信息"
                : createMode === "bulk"
                  ? "公共信息填一次，每行保存为一台设备"
                  : "填写设备信息后提交保存"}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>客户 *</Label>
                <div className="relative">
                  <Input
                    value={customerInput}
                    onFocus={() => setCustomerDropdownOpen(true)}
                    onBlur={() => window.setTimeout(() => setCustomerDropdownOpen(false), 120)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomerInput(value);
                      setCustomerDropdownOpen(true);
                      if (!selectedCustomer || normalizeCustomerSearchText(value) !== normalizeCustomerSearchText(customerLabel(selectedCustomer))) {
                        setForm((prev) => ({ ...prev, customerId: "" }));
                      }
                      scheduleCustomerSearch(value);
                    }}
                    placeholder="输入客户名称关键词搜索"
                  />
                  {customerDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md max-h-64 overflow-auto">
                      {customerSearchLoading ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> 搜索客户中…
                        </div>
                      ) : null}
                      {dialogCustomerOptions.map((customer) => {
                        const selected = String(customer.id) === String(form.customerId);
                        return (
                          <button
                            key={customer.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => applyCustomer(customer)}
                          >
                            <Check className={`w-4 h-4 ${selected ? "text-primary" : "text-transparent"}`} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{customerLabel(customer)}</span>
                              <span className="block text-xs text-muted-foreground">客户 #{customer.id}</span>
                            </span>
                          </button>
                        );
                      })}
                      {!customerSearchLoading && !dialogCustomerOptions.length ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          未找到匹配客户，请调整关键词
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
              {!editingId && createMode === "bulk" ? (
                <div className="space-y-2 relative md:col-span-2" ref={modelDropdownRef}>
                  <Label>默认设备型号</Label>
                  <Input
                    value={form.model}
                    onFocus={() => {
                      if (modelSuggestions.length || modelLoading) setModelDropdownOpen(true);
                    }}
                    onChange={(e) => {
                      setForm({ ...form, model: e.target.value });
                      scheduleModelSearch(e.target.value);
                    }}
                    placeholder="同型号设备可在这里填一次，每行也可单独覆盖"
                  />
                  {modelDropdownOpen && (modelLoading || modelSuggestions.length > 0) && (
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
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>主机名</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="例如 sz5eap01；多个值用 ; 隔开，可不填"
                    />
                  </div>
                  <div className="space-y-2 relative" ref={modelDropdownRef}>
                    <Label>设备型号 *</Label>
                    <Input
                      value={form.model}
                      onFocus={() => {
                        if (modelSuggestions.length || modelLoading) setModelDropdownOpen(true);
                      }}
                      onChange={(e) => {
                        setForm({ ...form, model: e.target.value });
                        scheduleModelSearch(e.target.value);
                      }}
                      placeholder="例如 PowerEdge R740"
                    />
                    {modelDropdownOpen && (modelLoading || modelSuggestions.length > 0) && (
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
                    <Label>序列号 SN *</Label>
                    <Input
                      value={form.serialNo}
                      onChange={(e) => setForm({ ...form, serialNo: e.target.value })}
                      placeholder="序列号；多个值用 ; 隔开"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>MR单</Label>
                    <Input
                      value={form.mrNo}
                      onChange={(e) => setForm({ ...form, mrNo: e.target.value })}
                      placeholder="MR单号，可不填"
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>维保类型</Label>
                  <HelpTooltip label={MAINTENANCE_TYPE_HELP} />
                </div>
                <Select
                  value={form.maintenanceType}
                  onValueChange={(v) => setForm((prev) => ({
                    ...prev,
                    maintenanceType: v,
                    maintenancePartyId: resolveMaintenancePartyId(parties, v, prev.maintenancePartyId),
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择维保类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无维保</SelectItem>
                    <SelectItem value="our_maintenance">我方维保</SelectItem>
                    <SelectItem value="original_manufacturer">原厂维保</SelectItem>
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
                    <SelectValue placeholder={form.maintenanceType === "none" ? "无维保" : "选择维保方"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredMaintenanceParties.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name || `维保方 #${p.id}`}
                      </SelectItem>
                    ))}
                    {!filteredMaintenanceParties.length ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">当前类型暂无可选维保方</div>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>维保开始</Label>
                <Input
                  type="date"
                  value={form.maintenanceStart}
                  onChange={(e) => setForm({ ...form, maintenanceStart: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>维保截止</Label>
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
                    <SelectItem value="maintenance">维保中</SelectItem>
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
              {!editingId && createMode === "bulk" ? (
                <div className="space-y-3 md:col-span-2">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Label>设备明细 *</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        每行一台设备；空行会自动忽略，行内型号为空时使用上方默认型号，S/N 每行必填。
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addBatchRow} disabled={saving}>
                      <Plus className="mr-2 h-4 w-4" />
                      添加一行
                    </Button>
                  </div>
                  <div className="rounded-md border">
                    <div className="hidden grid-cols-[1fr_1.2fr_1fr_1fr_44px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
                      <span>主机名</span>
                      <span>型号</span>
                      <span>SN *</span>
                      <span>MR单</span>
                      <span />
                    </div>
                    <div className="divide-y">
                      {batchRows.map((row, index) => (
                        <div key={index} className="grid grid-cols-1 gap-2 p-3 md:grid-cols-[1fr_1.2fr_1fr_1fr_44px]">
                          <Input
                            value={row.name}
                            onChange={(e) => updateBatchRow(index, "name", e.target.value)}
                            placeholder={`第 ${index + 1} 台主机名；多个值用 ; 隔开`}
                          />
                          <Input
                            value={row.model}
                            onChange={(e) => updateBatchRow(index, "model", e.target.value)}
                            placeholder="型号，空则用默认型号"
                          />
                          <Input
                            value={row.serialNo}
                            onChange={(e) => updateBatchRow(index, "serialNo", e.target.value)}
                            placeholder="SN 必填；多个值用 ; 隔开"
                          />
                          <Input
                            value={row.mrNo}
                            onChange={(e) => updateBatchRow(index, "mrNo", e.target.value)}
                            placeholder="MR单，可不填"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="justify-self-start text-red-600 hover:text-red-700 md:justify-self-center"
                            onClick={() => removeBatchRow(index)}
                            disabled={saving}
                            aria-label={`删除第 ${index + 1} 行`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "保存中…" : editingId ? "保存修改" : createMode === "bulk" ? "批量保存" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      
      <Dialog
        open={batchEditOpen}
        onOpenChange={(open) => {
          setBatchEditOpen(open);
          if (!open) setError("");
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>批量编辑设备 ({selectedDeviceIds.length} 台)</DialogTitle>
            <DialogDescription>
              勾选要修改的字段，只更新勾选的字段，未勾选的保持不变
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.maintenanceType}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, maintenanceType: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label>维保类型</Label>
                  <HelpTooltip label={MAINTENANCE_TYPE_HELP} />
                </div>
                <Select
                  value={batchEditForm.maintenanceType}
                  onValueChange={(v) => setBatchEditForm((f) => ({
                    ...f,
                    maintenanceType: v,
                    maintenancePartyId: resolveMaintenancePartyId(parties, v, f.maintenancePartyId),
                  }))}
                  disabled={!batchEditToggles.maintenanceType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择维保类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无维保</SelectItem>
                    <SelectItem value="our_maintenance">我方维保</SelectItem>
                    <SelectItem value="original_manufacturer">原厂维保</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.maintenancePartyId}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, maintenancePartyId: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>维保方</Label>
                <Select
                  value={batchEditForm.maintenancePartyId}
                  onValueChange={(v) => setBatchEditForm((f) => ({ ...f, maintenancePartyId: v }))}
                  disabled={!batchEditToggles.maintenancePartyId || batchEditForm.maintenanceType === "none"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={batchEditForm.maintenanceType === "none" ? "无维保" : "选择维保方"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBatchEditMaintenanceParties.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name || `维保方 #${p.id}`}
                      </SelectItem>
                    ))}
                    {!filteredBatchEditMaintenanceParties.length ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">当前类型暂无可选维保方</div>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.maintenanceStart}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, maintenanceStart: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>维保开始日期</Label>
                <Input
                  type="date"
                  value={batchEditForm.maintenanceStart}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, maintenanceStart: e.target.value }))}
                  disabled={!batchEditToggles.maintenanceStart}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.maintenanceEnd}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, maintenanceEnd: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>维保截止日期</Label>
                <Input
                  type="date"
                  value={batchEditForm.maintenanceEnd}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, maintenanceEnd: e.target.value }))}
                  disabled={!batchEditToggles.maintenanceEnd}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.warrantyUntil}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, warrantyUntil: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>质保截止日期</Label>
                <Input
                  type="date"
                  value={batchEditForm.warrantyUntil}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, warrantyUntil: e.target.value }))}
                  disabled={!batchEditToggles.warrantyUntil}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.mrNo}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, mrNo: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>MR单</Label>
                <Input
                  value={batchEditForm.mrNo}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, mrNo: e.target.value }))}
                  disabled={!batchEditToggles.mrNo}
                  placeholder="MR单号，可留空清除"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.location}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, location: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>安装位置</Label>
                <Input
                  value={batchEditForm.location}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, location: e.target.value }))}
                  disabled={!batchEditToggles.location}
                  placeholder="安装位置"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={batchEditToggles.remark}
                onCheckedChange={(v) => setBatchEditToggles((t) => ({ ...t, remark: v === true }))}
              />
              <div className="flex-1 space-y-1.5">
                <Label>备注</Label>
                <Textarea
                  value={batchEditForm.remark}
                  onChange={(e) => setBatchEditForm((f) => ({ ...f, remark: e.target.value }))}
                  disabled={!batchEditToggles.remark}
                  rows={2}
                  placeholder="补充说明"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchEditOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submitBatchEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "保存中…" : "批量保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
