import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Plus, RefreshCw, Server, Trash2, Check, Pencil, RotateCcw, Edit3, Download, Upload, MoreHorizontal, FileSpreadsheet, ChevronDown, Paperclip, Merge, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ProgressPanel, type ProgressState } from "@/components/ProgressPanel";
import { Skeleton } from "@/components/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { normalizeSearchText } from "@/lib/text-i18n";
import { orderStatusLabel, serviceTypeLabel } from "@/lib/service-items";
import { formatCount } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { ResponsiveCard, ResponsiveList } from "@/components/ResponsiveList";
import { toast } from "sonner";
import type {
  Device, DeviceRelatedAttachment, DeviceRelatedServiceOrder, DevicePartHistory, Customer, MaintenanceParty, ModelSuggestion, ModelSuggestionTarget, ExcelWorkbook, ExcelWorksheet, DeviceForm, BatchDeviceRow, ImportErrorRow, ImportModelCorrection, ImportCustomerCorrection, ImportUnmatchedCustomer, ImportSimilarCustomer, ImportCustomerConfirmation, ImportResult, MaintenanceImportColumn, MaintenanceImportItem, MaintenanceImportPreview, ModelNormalizationResult, ModelNormalizationNotice, ModelNormalizationJob, ExistingModelNormalizationItem, ExistingModelNormalizationResult, DeviceDeleteRelationOrder, DeviceDeleteRelationSchedule, DeviceDeleteRelationPart, DeviceDeleteBlockedDetails, BatchEditForm, BatchEditToggles
} from "./devices/types";
import {
  groupImportCustomerCorrections, createEmptyDeviceForm, createEmptyBatchRow, createEmptyBatchEditForm,
  createEmptyBatchEditToggles, createInitialBatchRows, batchRowHasInput, formatDate, inputDate,
  copySerialNo, canonicalMaintenanceType, maintenanceTypeHasParty, maintenancePartyMatchesType,
  resolveMaintenancePartyId, deviceDisplayName, partActionLabel,
  orderRelationLabel, attachmentFormatOf, partQuantityText,
  compactText, modelNormalizationNotice, extractModelNormalizationJob, modelNormalizationResultMessage,
  summarizeModelNormalizationJobs, showModelNormalizationNotices, existingModelIssueLabel,
  existingModelIssueBadgeClass, apiErrorDetails, deviceDeleteName, compactList,
  formatDeviceDeleteBlockedDetails, extractMaintenancePartyNames,
  loadMaintenancePartyNamesForTemplate, worksheetRangeFormula, applyImportTemplateDropdowns,
  downloadDeviceImportTemplate, deviceImportHeaderKey, findDeviceImportHeaderRow,
  downloadRemainingDeviceImportFile, exportDevicesToExcel,
} from "./devices/utils";
import { CustomerIndexSuggestions } from "@/components/CustomerIndexSuggestions";
import {
  customerName as customerLabel, customerMeta, customerMatches, customerInitial, customerSortKey,
  groupCustomersByInitial, mergeCustomers,
} from "@/lib/customer-index";
import {
  IMPORT_TEMPLATE_MAX_ROWS, IMPORT_TEMPLATE_OPTIONS_SHEET, IMPORT_TEMPLATE_MAINTENANCE_TYPES,
  MAINTENANCE_IMPORT_STATUS_LABELS, MAINTENANCE_TYPE_LABELS, MAINTENANCE_TYPE_BADGE,
  MAINTENANCE_TYPE_HELP, MAINTENANCE_TYPE_ALIASES, DEVICE_STATUS_LABELS, DEVICE_STATUS_BADGE,
  DEVICE_TABLE_GRID, DEVICE_TABLE_READONLY_GRID, DEVICE_BADGE_CLASS, DEVICE_STATUS_BADGE_CLASS,
  ATTACHMENT_PURPOSE_LABELS, ATTACHMENT_FORMAT_LABELS,
  MODEL_NORMALIZATION_TOAST_POSITION, MODEL_NORMALIZATION_JOB_POLL_MS, MODEL_NORMALIZATION_JOB_TIMEOUT_MS,
} from "./devices/constants";























































































export function Devices() {
  const { hasPermission } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreateDevices = hasPermission("device.create");
  const canEditDevices = hasPermission("device.edit");
  const canDeleteDevices = hasPermission("device.delete");
  const canManageDevices = canEditDevices || canDeleteDevices;
  const canSelectDevices = canManageDevices;
  const canViewOrderDetail = hasPermission("order.view");
  const relatedOrderHref = (orderId: string | number) => (
    canViewOrderDetail ? `/service-orders?orderId=${orderId}` : `/service-report?preview=${orderId}`
  );
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
  const [similarDevices, setSimilarDevices] = useState<Array<{ id: string | number; model?: string; serialNo?: string; customerName?: string; createdByName?: string }>>([]);
  const [similarDevicesLoading, setSimilarDevicesLoading] = useState(false);
  const [suspectedOpen, setSuspectedOpen] = useState(false);
  const [suspectedLoading, setSuspectedLoading] = useState(false);
  const [suspectedTotal, setSuspectedTotal] = useState(0);
  const [suspectedGroups, setSuspectedGroups] = useState<Array<{
    customerId: string | number;
    customerName: string;
    items: Array<{ id: string | number; model?: string; serialNo?: string; createdAt?: string; createdByName?: string }>;
  }>>([]);
  const [mergeConfirm, setMergeConfirm] = useState<{
    mergeId: string | number;
    preview: { keep: { id: string | number; model?: string; serialNo?: string }; merge: { id: string | number; model?: string; serialNo?: string }; counts: Record<string, number> } | null;
    loading: boolean;
  } | null>(null);
  const [attachmentFormat, setAttachmentFormat] = useState("all");
  const [attachmentKeyword, setAttachmentKeyword] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"single" | "bulk">("single");
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [maintenanceFilter, setMaintenanceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [deviceTotal, setDeviceTotal] = useState(0);
  const [deviceStats, setDeviceStats] = useState<{ total: number; ourMaintenance: number; originalManufacturer: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("keyword") || "");
  const [modelSuggestions, setModelSuggestions] = useState<ModelSuggestion[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSuggestionTarget, setModelSuggestionTarget] = useState<ModelSuggestionTarget>({ type: "form" });
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);
  const modelSearchTimerRef = useRef<number | null>(null);
  const modelSearchRequestRef = useRef(0);
  const modelNormalizationJobTimersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  const [customerInput, setCustomerInput] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchTimer, setCustomerSearchTimer] = useState<number | null>(null);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [form, setForm] = useState<DeviceForm>(() => createEmptyDeviceForm());
  const [batchRows, setBatchRows] = useState<BatchDeviceRow[]>(() => createInitialBatchRows());
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchEditForm, setBatchEditForm] = useState<BatchEditForm>(() => createEmptyBatchEditForm());
  const [batchEditToggles, setBatchEditToggles] = useState<BatchEditToggles>(() => createEmptyBatchEditToggles());
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importCustomerMappings, setImportCustomerMappings] = useState<Record<string, string>>({});
  const importCustomerConfirmations = useMemo(
    () => groupImportCustomerCorrections(importResult?.customerCorrections),
    [importResult?.customerCorrections],
  );
  const importCustomerOptions = useMemo(() => mergeCustomers(
    customers,
    importCustomerConfirmations.map((item) => ({
      id: item.suggestedCustomerId,
      name: item.suggestedCustomerName,
    })),
  ), [customers, importCustomerConfirmations]);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [maintenanceImportOpen, setMaintenanceImportOpen] = useState(false);
  const [maintenanceImportFile, setMaintenanceImportFile] = useState<File | null>(null);
  const [maintenanceImporting, setMaintenanceImporting] = useState(false);
  const [maintenanceImportPreview, setMaintenanceImportPreview] = useState<MaintenanceImportPreview | null>(null);
  const [maintenanceImportColumns, setMaintenanceImportColumns] = useState({ serialNo: "", maintenanceStart: "", maintenanceEnd: "" });
  const [maintenanceImportMappingDirty, setMaintenanceImportMappingDirty] = useState(false);
  const [maintenanceImportSelectedIds, setMaintenanceImportSelectedIds] = useState<string[]>([]);
  const maintenanceImportFileInputRef = useRef<HTMLInputElement | null>(null);
  const maintenanceImportUpdatableIds = useMemo(() => maintenanceImportPreview?.items
    .filter((item) => item.status === "updatable" && item.deviceId !== undefined)
    .map((item) => String(item.deviceId)) || [], [maintenanceImportPreview]);
  const maintenanceImportSelectedIdSet = useMemo(() => new Set(maintenanceImportSelectedIds), [maintenanceImportSelectedIds]);
  const [modelCompareOpen, setModelCompareOpen] = useState(false);
  const [modelComparing, setModelComparing] = useState(false);
  const [modelCompareProgress, setModelCompareProgress] = useState(0);
  const [normalizationProgress, setNormalizationProgress] = useState<ProgressState | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    items: Array<{ id: string | number; customerName?: string; model?: string; serialNo?: string; createdByName?: string }>;
    payloads: Record<string, unknown>[];
  } | null>(null);
  const [modelApplying, setModelApplying] = useState(false);
  const [modelCompareResult, setModelCompareResult] = useState<ExistingModelNormalizationResult | null>(null);
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
      if (maintenanceFilter !== "all") params.set("maintenanceType", maintenanceFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const data = await api.get(`/devices?${params.toString()}`);
      const items = (data?.items || []) as Device[];
      // 当前页被删空时自动回退一页
      if (!items.length && page > 1) {
        setPage((p) => Math.max(1, p - 1));
        setLoading(false);
        return;
      }
      setDevices(items);
      setDeviceTotal(Number(data?.total || 0));
      setDeviceStats(data?.stats || null);
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
      const sortLocale = encodeURIComponent(lang === "zh-TW" ? "zh-TW" : "zh-Hans-CN");
      const [customerData, recentCustomerData] = await Promise.all([
        api.get(`/customers?pageSize=200&sortLocale=${sortLocale}`),
        api.get(`/customers?mine=1&pageSize=4&sortLocale=${sortLocale}`).catch(() => ({ items: [] })),
      ]);
      const regularItems = (customerData?.items || []) as Customer[];
      const recentItems = ((recentCustomerData?.items || []) as Customer[]).slice(0, 4);
      setRecentCustomers(recentItems);
      setCustomers(mergeCustomers(regularItems, recentItems));
    } catch {
      setCustomers([]);
      setRecentCustomers([]);
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
    return () => {
      mountedRef.current = false;
      modelNormalizationJobTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      modelNormalizationJobTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    loadCustomers();
    loadParties();
    loadSuspected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      load(searchQuery);
      // 关键词写回 URL（replace 不刷历史），刷新/分享链接可恢复搜索态
      setSearchParams((prev) => {
        const keyword = searchQuery.trim();
        if ((prev.get("keyword") || "") === keyword) return prev;
        const next = new URLSearchParams(prev);
        if (keyword) next.set("keyword", keyword); else next.delete("keyword");
        return next;
      });
    }, searchQuery.trim() ? 250 : 0);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerFilter, maintenanceFilter, page, searchQuery]);

  function delayModelNormalizationJobPoll(ms: number) {
    if (!mountedRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timerId = window.setTimeout(() => {
        modelNormalizationJobTimersRef.current = modelNormalizationJobTimersRef.current.filter((id) => id !== timerId);
        resolve();
      }, ms);
      modelNormalizationJobTimersRef.current.push(timerId);
    });
  }

  async function waitForModelNormalizationJob(job: ModelNormalizationJob) {
    const jobId = String(job.id || "");
    const startedAt = Date.now();
    while (mountedRef.current && Date.now() - startedAt < MODEL_NORMALIZATION_JOB_TIMEOUT_MS) {
      try {
        const data = await api.get(`/devices/model-normalization-jobs/${encodeURIComponent(jobId)}`);
        const item = (data?.item || {}) as ModelNormalizationJob;
        if (item.status && item.status !== "pending") return item;
      } catch (e) {
        return {
          ...job,
          status: "failed",
          message: e instanceof Error ? e.message : "型号后台搜索失败",
        } as ModelNormalizationJob;
      }
      await delayModelNormalizationJobPoll(MODEL_NORMALIZATION_JOB_POLL_MS);
    }
    return {
      ...job,
      status: "failed",
      message: "型号后台搜索超时，请稍后刷新或使用型号校正",
    } as ModelNormalizationJob;
  }

  function trackModelNormalizationJobs(jobs: ModelNormalizationJob[]) {
    const uniqueJobs = [...new Map(jobs.filter((job) => job.id).map((job) => [String(job.id), job])).values()];
    if (!uniqueJobs.length) return;

    const total = uniqueJobs.length;
    const firstInput = uniqueJobs[0].inputModel || "设备型号";
    setNormalizationProgress({
      stage: "task",
      progress: 0,
      message: total > 1 ? `正在后台搜索 ${total} 个设备型号…` : `正在后台搜索型号：${firstInput}`,
    });

    let doneCount = 0;
    void (async () => {
      const results = await Promise.all(uniqueJobs.map(async (job) => {
        const result = await waitForModelNormalizationJob(job);
        doneCount += 1;
        setNormalizationProgress({
          stage: "task",
          progress: Math.min(99, Math.round((doneCount / total) * 100)),
          message: total > 1 ? `正在后台搜索型号…（${doneCount}/${total}）` : "正在后台搜索型号…",
        });
        return result;
      }));
      if (!mountedRef.current) return;
      setNormalizationProgress(null);

      const toastOptions = {
        position: MODEL_NORMALIZATION_TOAST_POSITION,
        duration: 9000,
      };

      if (results.length === 1) {
        const result = results[0];
        const action = String(result.modelNormalization?.action || "");
        const message = modelNormalizationResultMessage(result);
        if (result.status === "failed") toast.error(message, toastOptions);
        else if (["not_found", "suggested_correction"].includes(action)) toast.warning(message, toastOptions);
        else toast.success(message, toastOptions);
      } else {
        const message = summarizeModelNormalizationJobs(results);
        const failed = results.some((job) => job.status === "failed");
        const unresolved = results.some((job) => ["not_found", "suggested_correction"].includes(String(job.modelNormalization?.action || "")));
        if (failed) toast.error(message, toastOptions);
        else if (unresolved) toast.warning(message, toastOptions);
        else toast.success(message, toastOptions);
      }

      if (results.some((job) => job.updated)) {
        await load();
      }
    })();
  }

  const filtered = useMemo(() => {
    // 维保类型已由后端过滤分页；keyword/客户同后端。
    // 设备表无 status 列（状态筛选为前端残留），此处仅保留状态过滤行为。
    return devices.filter((d) => {
      const status = d.status || "active";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      return true;
    });
  }, [devices, statusFilter]);

  const stats = useMemo(() => {
    const s = deviceStats;
    return [
      { label: "设备总数", value: s?.total ?? 0 },
      { label: "我方维保", value: s?.ourMaintenance ?? 0 },
      { label: "原厂维保", value: s?.originalManufacturer ?? 0 },
    ];
  }, [deviceStats]);

  const totalPages = Math.max(1, Math.ceil(deviceTotal / pageSize));
  const initialLoading = loading && !loadedOnce;
  const refreshing = loading && loadedOnce;

  async function handleDownloadImportTemplate() {
    setError("");
    try {
      await downloadDeviceImportTemplate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "模板下载失败");
    }
  }

  async function handleExportDevices() {
    setExporting(true);
    setError("");
    try {
      // 导出与列表同一筛选口径的全部匹配（至多 200 台），不受当前分页影响
      const params = new URLSearchParams();
      if (customerFilter !== "all") params.set("customerId", customerFilter);
      if (searchQuery.trim()) params.set("keyword", searchQuery.trim());
      if (maintenanceFilter !== "all") params.set("maintenanceType", maintenanceFilter);
      params.set("page", "1");
      params.set("pageSize", "200");
      const data = await api.get(`/devices?${params.toString()}`);
      const items = (data?.items || []) as Device[];
      if (!items.length) {
        setError("当前没有可导出的设备");
        return;
      }
      await exportDevicesToExcel(items);
      toast.success(`已导出 ${items.length} 台设备`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "设备导出失败");
    } finally {
      setExporting(false);
    }
  }

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
    setPage(1);
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

  const recentCustomerIds = useMemo(() => new Set(recentCustomers.map((customer) => String(customer.id))), [recentCustomers]);
  const dialogRecentCustomers = useMemo(() => (
    recentCustomers.filter((customer) => customerMatches(customer, customerInput)).slice(0, 4)
  ), [customerInput, recentCustomers]);
  const dialogCustomerGroups = useMemo(() => {
    const grouped = groupCustomersByInitial(
      customers
        .filter((customer) => !recentCustomerIds.has(String(customer.id)))
        .filter((customer) => customerMatches(customer, customerInput)),
      lang,
    );
    if (selectedCustomer && !recentCustomerIds.has(String(selectedCustomer.id)) && !grouped.some((group) => (
      group.items.some((customer) => String(customer.id) === String(selectedCustomer.id))
    ))) {
      return groupCustomersByInitial([selectedCustomer, ...grouped.flatMap((group) => group.items)], lang);
    }
    return grouped;
  }, [customers, customerInput, lang, recentCustomerIds, selectedCustomer]);

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
    setModelSuggestionTarget({ type: "form" });
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
    setModelSuggestionTarget({ type: "form" });
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
    setModelSuggestionTarget({ type: "form" });
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
    setModelSuggestionTarget((current) => (
      current.type === "batch" && current.index === index ? { type: "form" } : current
    ));
  }

  async function openDetail(device: Device) {
    setDetailTarget(device);
    if (!device.id) return;
    setDetailLoading(true);
    setSimilarDevices([]);
    try {
      const data = await api.get(`/devices/${device.id}`);
      setDetailTarget((data?.item || device) as Device);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载设备详情失败");
    } finally {
      setDetailLoading(false);
    }
    if (device.id) {
      setSimilarDevicesLoading(true);
      try {
        const data = await api.get(`/devices/${device.id}/similar`);
        setSimilarDevices((data?.items || []) as never);
      } catch {
        setSimilarDevices([]);
      } finally {
        setSimilarDevicesLoading(false);
      }
    }
  }

  const deepLinkDeviceIdRef = useRef("");
  useEffect(() => {
    const deviceId = searchParams.get("deviceId") || "";
    if (!deviceId) {
      deepLinkDeviceIdRef.current = "";
      if (detailTarget) setDetailTarget(null);
      return;
    }
    if (deepLinkDeviceIdRef.current === deviceId) return;
    if (detailTarget && String(detailTarget.id) === deviceId) return;
    deepLinkDeviceIdRef.current = deviceId;
    void openDetail({ id: deviceId } as Device);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openDeviceDetail(device: Device) {
    void openDetail(device);
    if (searchParams.get("deviceId") !== String(device.id)) {
      const next = new URLSearchParams(searchParams);
      next.set("deviceId", String(device.id));
      setSearchParams(next);
    }
  }

  function closeDetail() {
    setDetailTarget(null);
    if (searchParams.has("deviceId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("deviceId");
      setSearchParams(next, { replace: true });
    }
  }

  /** 移动端设备卡片（ResponsiveList renderCard 用），字段/操作与桌面行一致 */
  function renderDeviceCard(device: Device) {
    const maintenanceType = canonicalMaintenanceType(device.maintenanceType);
    const typeLabel = MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "-";
    const statusLabel = DEVICE_STATUS_LABELS[device.status || ""] || device.status || "在用";
    const selected = selectedDeviceIds.includes(String(device.id));
    return (
      <ResponsiveCard
        onClick={() => openDeviceDetail(device)}
        title={
          <span className="flex min-w-0 items-center gap-2">
            {canSelectDevices ? (
              <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) => toggleDeviceSelection(device.id, checked)}
                  disabled={saving}
                  aria-label={`选择设备 ${deviceDisplayName(device)}`}
                />
              </span>
            ) : null}
            <Server className="h-4 w-4 shrink-0 text-primary" />
            {device.model ? (
              <button
                type="button"
                className="min-w-0 truncate text-left hover:text-primary hover:underline"
                title={device.model}
                onClick={(event) => filterByModel(event, device.model)}
              >
                {device.model}
              </button>
            ) : (
              <span className="truncate">-</span>
            )}
          </span>
        }
        status={(
          <button type="button" className="inline-flex" onClick={(event) => filterByStatus(event, device.status)}>
            <Badge
              variant={DEVICE_STATUS_BADGE[device.status || "active"] || "secondary"}
              className={`${DEVICE_STATUS_BADGE_CLASS} cursor-pointer hover:ring-2 hover:ring-primary/20 ${statusFilter === (device.status || "active") ? "ring-2 ring-primary/30" : ""}`}
            >
              {statusLabel}
            </Badge>
          </button>
        )}
        subtitle={device.customerName ? (
          <button
            type="button"
            className="block max-w-full truncate text-left hover:text-primary hover:underline"
            title={device.customerName}
            onClick={(event) => filterByCustomer(event, device)}
          >
            {device.customerName}
          </button>
        ) : undefined}
        fields={[
          {
            label: "SN",
            value: device.serialNo ? (
              <button
                type="button"
                className="block max-w-full truncate text-left transition-colors hover:text-primary hover:underline"
                title="点击复制序列号"
                onClick={(event) => {
                  event.stopPropagation();
                  void copySerialNo(device.serialNo);
                }}
              >
                {device.serialNo}
              </button>
            ) : "-",
          },
          { label: "MR单", value: device.mrNo || "-" },
          {
            label: "维保类型",
            value: (
              <button type="button" className="inline-flex" onClick={(event) => filterByMaintenanceType(event, maintenanceType)}>
                <Badge
                  variant={MAINTENANCE_TYPE_BADGE[maintenanceType] || "outline"}
                  className={`${DEVICE_BADGE_CLASS} cursor-pointer hover:ring-2 hover:ring-primary/20 ${maintenanceFilter === maintenanceType ? "ring-2 ring-primary/30" : ""}`}
                >
                  {typeLabel}
                </Badge>
              </button>
            ),
          },
          {
            label: "维保方 / 截止",
            value: (
              <span className="block min-w-0">
                {device.maintenancePartyName ? (
                  <button
                    type="button"
                    className="block max-w-full truncate text-left font-medium hover:text-primary hover:underline"
                    title={device.maintenancePartyName}
                    onClick={(event) => filterByMaintenanceParty(event, device.maintenancePartyName)}
                  >
                    {device.maintenancePartyName}
                  </button>
                ) : (
                  <span className="block truncate">-</span>
                )}
                <span className="block text-xs text-muted-foreground">截止 {formatDate(device.maintenanceEnd)}</span>
              </span>
            ),
          },
        ]}
        actions={canManageDevices ? (
          <>
            {canEditDevices ? (
              <Button variant="ghost" size="sm" className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900" onClick={(event) => { event.stopPropagation(); openEdit(device); }}>
                <Pencil className="w-4 h-4 mr-1" />
                编辑
              </Button>
            ) : null}
            {canDeleteDevices ? (
              <Button variant="ghost" size="sm" className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={(event) => { event.stopPropagation(); deleteDevice(device); }} disabled={saving}>
                <Trash2 className="w-4 h-4 mr-1" />
                删除
              </Button>
            ) : null}
          </>
        ) : undefined}
      />
    );
  }

  async function openAttachment(file: DeviceRelatedAttachment) {
    try {
      const blob = await api.download(`/files/${file.id}`);
      const url = URL.createObjectURL(blob);
      const mime = String(file.mimeType || blob.type || "");
      if (mime.includes("pdf") || mime.startsWith("image/")) {
        window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.originalName || `附件-${file.id}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "附件打开失败");
    }
  }

  // 创建设备（单条/批量统一入口）：L1 后端硬拦截，L2 疑似重复时弹确认框
  async function createDevices(payloads: Record<string, unknown>[], force: boolean) {
    const normalizationNotices: ModelNormalizationNotice[] = [];
    const normalizationJobs: ModelNormalizationJob[] = [];
    let createdCount = 0;
    for (const payload of payloads) {
      try {
        const data = await api.post("/devices", force ? { ...payload, force: "1" } : payload);
        const notice = modelNormalizationNotice(data);
        if (notice) normalizationNotices.push(notice);
        const job = extractModelNormalizationJob(data);
        if (job) normalizationJobs.push(job);
        createdCount += 1;
      } catch (e) {
        const warning = (e as { details?: { duplicateWarning?: Array<{ id: string | number }> } })?.details?.duplicateWarning;
        if (!force && Array.isArray(warning) && warning.length) {
          setDuplicateConfirm({ items: warning, payloads: payloads.slice(createdCount) });
          const marker = new Error("__duplicate_confirm__");
          (marker as Error & { __duplicate?: boolean }).__duplicate = true;
          throw marker;
        }
        throw e;
      }
    }
    showModelNormalizationNotices(normalizationNotices);
    trackModelNormalizationJobs(normalizationJobs);
  }

  async function loadSuspected() {
    setSuspectedLoading(true);
    try {
      const data = await api.get("/devices/suspected-duplicates");
      setSuspectedTotal(Number(data?.total || 0));
      setSuspectedGroups((data?.groups || []) as never);
    } catch {
      setSuspectedTotal(0);
      setSuspectedGroups([]);
    } finally {
      setSuspectedLoading(false);
    }
  }

  function openSuspectedDialog() {
    if (!suspectedOpen) void loadSuspected();
    setSuspectedOpen(true);
  }

  function openMergeConfirm(item: { id: string | number; model?: string; serialNo?: string }) {
    const keepId = detailTarget?.id;
    if (!keepId) return;
    setMergeConfirm({ mergeId: item.id, preview: null, loading: true });
    void api.post("/devices/merge-preview", { keepId, mergeId: item.id })
      .then((data) => setMergeConfirm((current) => current ? { ...current, preview: data, loading: false } : current))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "合并预览失败");
        setMergeConfirm(null);
      });
  }

  async function confirmMerge() {
    if (!mergeConfirm) return;
    const keepId = detailTarget?.id;
    if (!keepId) return;
    setSaving(true);
    setError("");
    try {
      const data = await api.post("/devices/merge", { keepId, mergeId: mergeConfirm.mergeId });
      toast.success(`设备 #${mergeConfirm.mergeId} 已合并到 #${keepId}`);
      setMergeConfirm(null);
      if (detailTarget) await openDetail(detailTarget);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "合并失败");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    let effectiveCustomerId = form.customerId;
    if (!effectiveCustomerId && customerInput.trim()) {
      const normalizedInput = normalizeSearchText(customerInput);
      const exact = customers.find((customer) => (
        normalizeSearchText(customerLabel(customer)) === normalizedInput
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
        maintenancePartyId: maintenanceTypeHasParty(maintenanceType) ? form.maintenancePartyId || null : null,
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

        const bulkPayloads = rows.map((row) => ({
          ...commonPayload,
          name: row.name || null,
          model: row.model,
          serialNo: row.serialNo || undefined,
          mrNo: row.mrNo || undefined,
        }));
        await createDevices(bulkPayloads, false);
        createdCount = bulkPayloads.length;
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
          await createDevices([payload], false);
          createdCount = 1;
        }
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      if ((e as Error & { __duplicate?: boolean })?.__duplicate) return;
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
        const sortLocale = encodeURIComponent(lang === "zh-TW" ? "zh-TW" : "zh-Hans-CN");
        const data = await api.get(`/customers?pageSize=50&keyword=${encodeURIComponent(keyword)}&sortLocale=${sortLocale}`);
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

  function scheduleModelSearch(value: string, target: ModelSuggestionTarget = { type: "form" }) {
    if (modelSearchTimerRef.current) window.clearTimeout(modelSearchTimerRef.current);
    const keyword = value.trim();
    const requestId = ++modelSearchRequestRef.current;
    setModelSuggestionTarget(target);
    if (keyword.length < 2) {
      setModelSuggestions([]);
      setModelLoading(false);
      setModelDropdownOpen(false);
      return;
    }
    setModelDropdownOpen(true);
    const timerId = window.setTimeout(async () => {
      setModelLoading(true);
      try {
        const data = await api.get(`/device-model-catalog/suggestions?keyword=${encodeURIComponent(keyword)}`);
        if (requestId === modelSearchRequestRef.current) {
          setModelSuggestions((data?.items || []) as ModelSuggestion[]);
        }
      } catch {
        if (requestId === modelSearchRequestRef.current) {
          setModelSuggestions([]);
        }
      } finally {
        if (requestId === modelSearchRequestRef.current) {
          setModelLoading(false);
        }
      }
    }, 250);
    modelSearchTimerRef.current = timerId;
  }

  function showModelSuggestionsFor(target: ModelSuggestionTarget, value: string) {
    setModelSuggestionTarget(target);
    if (value.trim().length >= 2) {
      if (modelSuggestions.length || modelLoading) setModelDropdownOpen(true);
      else scheduleModelSearch(value, target);
    }
  }

  function isModelSuggestionTarget(target: ModelSuggestionTarget) {
    return modelSuggestionTarget.type === target.type
      && (target.type !== "batch" || (modelSuggestionTarget.type === "batch" && modelSuggestionTarget.index === target.index));
  }

  function applyModelSuggestion(suggestion: ModelSuggestion) {
    const model = suggestion.canonicalModel || suggestion.partNumber || "";
    if (!model) return;
    if (modelSuggestionTarget.type === "batch") {
      updateBatchRow(modelSuggestionTarget.index, "model", model);
    } else {
      setForm((prev) => ({
        ...prev,
        model,
      }));
    }
    setModelSuggestions([]);
    setModelDropdownOpen(false);
  }

  function renderModelSuggestionDropdown(target: ModelSuggestionTarget) {
    if (!modelDropdownOpen || !isModelSuggestionTarget(target) || (!modelLoading && !modelSuggestions.length)) return null;
    return (
      <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md max-h-56 overflow-auto">
        {modelLoading ? (
          <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
            <span className="btn-loader" aria-hidden="true" /> 搜索型号中…
          </div>
        ) : null}
        {modelSuggestions.map((suggestion, index) => (
          <button
            key={`${suggestion.canonicalModel}-${suggestion.partNumber}-${index}`}
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyModelSuggestion(suggestion)}
          >
            <Check className="w-4 h-4 mt-0.5 text-primary" />
            <span>
              <span className="font-medium">{suggestion.canonicalModel || suggestion.partNumber}</span>
              <span className="block text-xs text-muted-foreground">
                {[suggestion.brand, suggestion.partNumber, suggestion.category].filter(Boolean).join(" · ") || "标准型号"}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  async function deleteDevice(device: Device) {
    if (!device.id) return;
    const label = deviceDisplayName(device);
    if (!window.confirm(`确认删除设备「${label}」？有关联数据的设备会提示原因，可再选择强制删除。`)) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/devices/${device.id}`);
      if (detailTarget && String(detailTarget.id) === String(device.id)) closeDetail();
      await load();
      toast.success(`已删除设备「${label}」`);
    } catch (e) {
      const details = apiErrorDetails(e);
      const message = e instanceof Error ? e.message : "删除失败";
      if (details?.code === "DEVICE_DELETE_BLOCKED" && details.canForceDelete) {
        const reason = formatDeviceDeleteBlockedDetails(details);
        setError(`${message}\n${reason}`);
        const confirmed = window.confirm(`${message}\n\n${reason}\n\n是否强制删除该设备？强制删除会解除设备与上述工单、部件记录、巡检计划的关联，但不会删除工单或客户。`);
        if (confirmed) {
          try {
            await api.delete(`/devices/${device.id}?force=1`);
            if (detailTarget && String(detailTarget.id) === String(device.id)) closeDetail();
            await load();
            setError("");
            toast.success(`已强制删除设备「${label}」`);
          } catch (forceError) {
            setError(forceError instanceof Error ? forceError.message : "强制删除失败");
          }
        }
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function bulkDeleteDevices() {
    if (!selectedDeviceIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedDeviceIds.length} 台设备？有关联数据的设备会提示原因，可再选择强制删除。`)) return;
    setSaving(true);
    setError("");
    try {
      const failed: Array<{ id: string; message: string; details?: DeviceDeleteBlockedDetails | null }> = [];
      let deletedCount = 0;
      for (const id of selectedDeviceIds) {
        try {
          await api.delete(`/devices/${id}`);
          deletedCount += 1;
        } catch (error) {
          failed.push({
            id,
            message: error instanceof Error ? error.message : "删除失败",
            details: apiErrorDetails(error),
          });
        }
      }

      if (!failed.length) {
        if (detailTarget && selectedDeviceIds.includes(String(detailTarget.id))) closeDetail();
        setSelectedDeviceIds([]);
        await load();
        toast.success(`已删除 ${deletedCount} 台设备`);
        return;
      }

      const blocked = failed.filter((item) => item.details?.code === "DEVICE_DELETE_BLOCKED" && item.details.canForceDelete);
      const nonForceFailures = failed.filter((item) => !blocked.includes(item));
      const reason = blocked
        .map((item, index) => `${index + 1}. ${formatDeviceDeleteBlockedDetails(item.details as DeviceDeleteBlockedDetails)}`)
        .join("\n\n");
      const summary = [
        deletedCount ? `已删除 ${deletedCount} 台设备。` : "",
        nonForceFailures.length ? `有 ${nonForceFailures.length} 台删除失败：${nonForceFailures.map((item) => item.message).join("；")}` : "",
        blocked.length ? `有 ${blocked.length} 台设备存在关联数据：\n${reason}` : "",
      ].filter(Boolean).join("\n\n");
      setError(summary);

      if (blocked.length) {
        const confirmed = window.confirm(`${summary}\n\n是否强制删除这些有关联数据的设备？强制删除会解除设备与上述工单、部件记录、巡检计划的关联，但不会删除工单或客户。`);
        if (confirmed) {
          let forcedCount = 0;
          const forceFailures: Array<{ id: string; message: string }> = [];
          for (const item of blocked) {
            try {
              await api.delete(`/devices/${item.id}?force=1`);
              forcedCount += 1;
            } catch (error) {
              forceFailures.push({
                id: item.id,
                message: error instanceof Error ? error.message : `设备 #${item.id} 强制删除失败`,
              });
            }
          }
          if (detailTarget && selectedDeviceIds.includes(String(detailTarget.id))) closeDetail();
          if (forceFailures.length) {
            setError(`已强制删除 ${forcedCount} 台设备，${forceFailures.length} 台失败：${forceFailures.map((item) => item.message).join("；")}`);
          } else {
            setError("");
            toast.success(`已删除 ${deletedCount} 台，强制删除 ${forcedCount} 台`);
          }
          const remainingIds = new Set([
            ...nonForceFailures.map((item) => item.id),
            ...forceFailures.map((item) => item.id),
          ]);
          setSelectedDeviceIds((ids) => ids.filter((id) => remainingIds.has(id)));
        } else {
          setSelectedDeviceIds((ids) => ids.filter((id) => failed.some((item) => item.id === id)));
        }
      } else {
        setSelectedDeviceIds((ids) => ids.filter((id) => failed.some((item) => item.id === id)));
      }
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

  function openImportDialog() {
    setError("");
    setImportFile(null);
    setImportResult(null);
    setImportCustomerMappings({});
    if (importFileInputRef.current) importFileInputRef.current.value = "";
    setImportOpen(true);
  }

  async function submitImport(mode: "check" | "confirm" | "skip" = "check") {
    if (!importFile) {
      setError("请选择要导入的 Excel 文件");
      return;
    }
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      if (Object.keys(importCustomerMappings).length) {
        formData.append("customerMappings", JSON.stringify(importCustomerMappings));
      }
      if (mode === "confirm") {
        formData.append("confirmImportCorrections", "1");
        formData.append("confirmModelCorrections", "1");
      }
      if (mode === "skip") {
        formData.append("skipModelCorrections", "1");
      }
      const data = await api.postForm("/devices/import", formData);
      const result: ImportResult = {
        created: Number(data?.created || 0),
        updated: Number(data?.updated || 0),
        unchanged: Number(data?.unchanged || 0),
        failed: Number(data?.failed || 0),
        errors: Array.isArray(data?.errors) ? data.errors : [],
        requiresImportConfirmation: Boolean(data?.requiresImportConfirmation),
        requiresModelConfirmation: Boolean(data?.requiresModelConfirmation),
        customerCorrections: Array.isArray(data?.customerCorrections) ? data.customerCorrections : [],
        similarCustomers: Array.isArray(data?.similarCustomers) ? data.similarCustomers : [],
        unmatchedCustomers: Array.isArray(data?.unmatchedCustomers) ? data.unmatchedCustomers : [],
        modelCorrections: Array.isArray(data?.modelCorrections) ? data.modelCorrections : [],
      };
      const importFinished = !result.requiresImportConfirmation && !result.requiresModelConfirmation;
      if (importFinished && result.errors.length) {
        try {
          result.remainingFileName = await downloadRemainingDeviceImportFile(importFile, result.errors);
        } catch (downloadError) {
          toast.error(downloadError instanceof Error
            ? `设备已完成导入，但剩余设备文件生成失败：${downloadError.message}`
            : "设备已完成导入，但剩余设备文件生成失败");
        }
      }
      setImportResult(result);
      const suggestedMappings = Object.fromEntries([
        ...groupImportCustomerCorrections(result.customerCorrections)
          .map((item) => [item.inputCustomerName, item.suggestedCustomerId] as const),
        ...(result.similarCustomers || [])
          .filter((item) => item.candidates.length === 1)
          .map((item) => [item.inputCustomerName, String(item.candidates[0].id)] as const),
      ]);
      if (Object.keys(suggestedMappings).length) {
        setImportCustomerMappings((current) => ({ ...suggestedMappings, ...current }));
      }
      if (importFinished) {
        await load();
        const processed = result.created + result.updated + result.unchanged;
        if (processed && result.failed) {
          toast.warning(`新增 ${result.created} 台、补充 ${result.updated} 台、无需更新 ${result.unchanged} 台，另有 ${result.failed} 行未导入${result.remainingFileName ? "，已下载剩余设备文件" : ""}`);
        } else if (processed) {
          toast.success(`处理完成：新增 ${result.created} 台、补充 ${result.updated} 台、无需更新 ${result.unchanged} 台`);
        } else if (result.failed) {
          toast.error(`没有设备处理成功，共 ${result.failed} 行需要修正`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  function openMaintenanceImportDialog() {
    setError("");
    setMaintenanceImportFile(null);
    setMaintenanceImportPreview(null);
    setMaintenanceImportColumns({ serialNo: "", maintenanceStart: "", maintenanceEnd: "" });
    setMaintenanceImportMappingDirty(false);
    setMaintenanceImportSelectedIds([]);
    if (maintenanceImportFileInputRef.current) maintenanceImportFileInputRef.current.value = "";
    setMaintenanceImportOpen(true);
  }

  function maintenanceImportFormData(includeColumns: boolean, selectedDeviceIds?: string[]) {
    if (!maintenanceImportFile) return null;
    const formData = new FormData();
    formData.append("file", maintenanceImportFile);
    if (includeColumns) {
      formData.append("serialNoColumn", maintenanceImportColumns.serialNo);
      formData.append("maintenanceStartColumn", maintenanceImportColumns.maintenanceStart);
      formData.append("maintenanceEndColumn", maintenanceImportColumns.maintenanceEnd);
    }
    if (selectedDeviceIds) formData.append("selectedDeviceIds", JSON.stringify(selectedDeviceIds));
    return formData;
  }

  async function previewMaintenanceImport(includeColumns = false) {
    const formData = maintenanceImportFormData(includeColumns);
    if (!formData) {
      setError("请选择要导入的 Excel 文件");
      return;
    }
    setMaintenanceImporting(true);
    setError("");
    try {
      const data = await api.postForm("/devices/maintenance-import/preview", formData) as MaintenanceImportPreview;
      setMaintenanceImportPreview(data);
      setMaintenanceImportColumns({
        serialNo: String(data.columns.serialNo),
        maintenanceStart: String(data.columns.maintenanceStart),
        maintenanceEnd: String(data.columns.maintenanceEnd),
      });
      setMaintenanceImportMappingDirty(false);
      setMaintenanceImportSelectedIds(data.items
        .filter((item) => item.status === "updatable" && item.deviceId !== undefined)
        .map((item) => String(item.deviceId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "维保文件识别失败");
    } finally {
      setMaintenanceImporting(false);
    }
  }

  async function applyMaintenanceImport() {
    const formData = maintenanceImportFormData(true, maintenanceImportSelectedIds);
    if (!formData || !maintenanceImportPreview) return;
    setMaintenanceImporting(true);
    setError("");
    try {
      const data = await api.postForm("/devices/maintenance-import/apply", formData);
      const updated = Number(data?.updated || 0);
      toast.success(`已更新 ${updated} 台设备的原厂维保日期`);
      setMaintenanceImportOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "维保日期更新失败");
    } finally {
      setMaintenanceImporting(false);
    }
  }

  function modelCompareTargetIds() {
    const source = selectedDeviceIds.length
      ? selectedDeviceIds
      : filtered.map((device) => String(device.id)).filter(Boolean);
    return [...new Set(source)].slice(0, 200);
  }

  function normalizeModelCompareResult(data: unknown): ExistingModelNormalizationResult {
    const payload = (data || {}) as Partial<ExistingModelNormalizationResult>;
    return {
      scanned: Number(payload.scanned || 0),
      matched: Number(payload.matched || 0),
      issueCount: Number(payload.issueCount || 0),
      correctableCount: Number(payload.correctableCount || 0),
      unresolvedCount: Number(payload.unresolvedCount || 0),
      catalogCreatedCount: Number(payload.catalogCreatedCount || 0),
      items: Array.isArray(payload.items) ? payload.items : [],
    };
  }

  async function compareExistingDeviceModels() {
    const ids = modelCompareTargetIds();
    if (!ids.length) {
      setError("当前列表没有可比对的设备");
      return;
    }
    setModelComparing(true);
    setModelCompareProgress(0);
    setError("");
    try {
      const result: ExistingModelNormalizationResult = {
        scanned: 0,
        matched: 0,
        issueCount: 0,
        correctableCount: 0,
        unresolvedCount: 0,
        catalogCreatedCount: 0,
        items: [],
      };
      const chunkSize = 10;
      for (let start = 0; start < ids.length; start += chunkSize) {
        const chunk = ids.slice(start, start + chunkSize);
        const data = await api.post("/devices/model-normalizations/preview", { ids: chunk });
        const part = normalizeModelCompareResult(data);
        result.scanned += part.scanned;
        result.matched += part.matched;
        result.issueCount += part.issueCount;
        result.correctableCount += part.correctableCount;
        result.unresolvedCount += part.unresolvedCount;
        result.catalogCreatedCount += part.catalogCreatedCount;
        result.items.push(...part.items);
        setModelCompareProgress(Math.min(99, Math.round(((start + chunk.length) / ids.length) * 100)));
      }
      setModelCompareProgress(100);
      setModelCompareResult(result);
      setModelCompareOpen(true);
      if (!result.items.length) toast.success("当前设备型号均已匹配型号库");
    } catch (e) {
      setError(e instanceof Error ? e.message : "型号校正失败");
    } finally {
      setModelComparing(false);
    }
  }

  async function applyExistingModelNormalizations() {
    const ids = (modelCompareResult?.items || [])
      .filter((item) => item.canApply)
      .map((item) => String(item.id))
      .filter(Boolean);
    if (!ids.length) return;
    setModelApplying(true);
    setError("");
    try {
      const data = await api.post("/devices/model-normalizations/apply", { ids });
      const updated = Number((data as { updated?: number })?.updated || 0);
      toast.success(`已纠正 ${updated} 台设备型号`);
      setModelCompareOpen(false);
      setModelCompareResult(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "型号纠正失败");
    } finally {
      setModelApplying(false);
    }
  }

  async function submitBatchEdit() {
    const fields: Record<string, unknown> = {};
    if (batchEditToggles.maintenanceType) {
      fields.maintenanceType = canonicalMaintenanceType(batchEditForm.maintenanceType);
      if (maintenanceTypeHasParty(String(fields.maintenanceType || "")) && batchEditToggles.maintenancePartyId) {
        fields.maintenancePartyId = batchEditForm.maintenancePartyId || null;
      }
    } else if (batchEditToggles.maintenancePartyId) {
      fields.maintenancePartyId = batchEditForm.maintenancePartyId || null;
    }
    if (batchEditToggles.maintenanceStart) fields.maintenanceStart = batchEditForm.maintenanceStart || null;
    if (batchEditToggles.maintenanceEnd) fields.maintenanceEnd = batchEditForm.maintenanceEnd || null;
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
      {normalizationProgress ? (
        <div className="fixed right-4 top-4 z-[60] w-80 sm:right-6 sm:top-6">
          <ProgressPanel progress={normalizationProgress} title="型号后台搜索" />
        </div>
      ) : null}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">设备资产</h1>
          <p className="text-muted-foreground mt-1">管理客户设备和维保信息</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:flex-nowrap">
          <Button className="shrink-0 whitespace-nowrap" variant="outline" onClick={() => load(searchQuery)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          {canCreateDevices || canEditDevices ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="shrink-0 whitespace-nowrap" variant="outline" disabled={importing || maintenanceImporting}>
                  {importing || maintenanceImporting ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Upload className="w-4 h-4 mr-2" />}
                  批量导入
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {canCreateDevices ? (
                  <>
                    <DropdownMenuItem onSelect={handleDownloadImportTemplate}>
                      <Download className="w-4 h-4 mr-2" />
                      下载导入模板
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openImportDialog}>
                      <Upload className="w-4 h-4 mr-2" />
                      上传已填模板
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openBulkCreate}>
                      <Plus className="w-4 h-4 mr-2" />
                      页面批量新增
                    </DropdownMenuItem>
                  </>
                ) : null}
                {canEditDevices ? (
                  <DropdownMenuItem onSelect={openMaintenanceImportDialog}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    导入原厂维保日期
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Button
            className="shrink-0 whitespace-nowrap"
            variant="outline"
            onClick={handleExportDevices}
            disabled={exporting || loading || !filtered.length}
          >
            {exporting ? <span className="btn-loader mr-2" aria-hidden="true" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            批量导出
          </Button>
          {canEditDevices ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="shrink-0 whitespace-nowrap" variant="outline" disabled={loading}>
                  {modelComparing ? <span className="btn-loader mr-2" aria-hidden="true" /> : <MoreHorizontal className="w-4 h-4 mr-2" />}
                  {modelComparing ? `校正 ${modelCompareProgress}%` : "其他"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={compareExistingDeviceModels} disabled={modelComparing || loading || !filtered.length}>
                  {modelComparing ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Search className="w-4 h-4 mr-2" />}
                  {modelComparing ? `型号校正 ${modelCompareProgress}%` : "型号校正"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canCreateDevices ? (
            <Button className="shrink-0 whitespace-nowrap" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              新增设备
            </Button>
          ) : null}
        </div>
      </div>

      <ErrorToast message={error} />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, statIndex) => (
          <Card key={stat.label} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-bold mt-1">
                                {initialLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span className="stat-value-enter inline-block" style={{ animationDelay: `${Math.min(statIndex * 120, 480)}ms` }}>{formatCount(stat.value)}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        <Card
          className="cursor-pointer overflow-hidden border-none shadow-sm ring-1 ring-amber-200 transition-shadow hover:ring-amber-400"
          onClick={openSuspectedDialog}
        >
          <CardContent className="pt-6">
            <div className="text-sm text-amber-600">疑似重复设备</div>
            <div className="text-2xl font-bold mt-1 text-amber-600">
              {suspectedLoading && !suspectedOpen ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <span className="stat-value-enter inline-block" style={{ animationDelay: "480ms" }}>{formatCount(suspectedTotal)} 组</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索设备名称、型号、序列号、MR单…"
                aria-label="搜索设备名称、型号、序列号、MR单"
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
            <Select value={maintenanceFilter} onValueChange={(value) => { setPage(1); setMaintenanceFilter(value); }}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="维保类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="pending_confirmation">待确认</SelectItem>
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
                setPage(1);
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
              <CardTitle>设备列表（共 {deviceTotal} 台）</CardTitle>
              {refreshing ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="btn-loader btn-loader-sm" aria-hidden="true" />
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
              <div className="p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-6 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title="未找到匹配设备" description="可调整搜索关键词或筛选条件" />
            ) : (
              <ResponsiveList items={filtered} keyExtractor={(device) => device.id} renderCard={renderDeviceCard}>
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
                {filtered.map((device, rowIndex) => {
                  const maintenanceType = canonicalMaintenanceType(device.maintenanceType);
                  const typeLabel = MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "-";
                  const statusLabel = DEVICE_STATUS_LABELS[device.status || ""] || device.status || "在用";
                  const selected = selectedDeviceIds.includes(String(device.id));
                  return (
                    <div
                      key={device.id}
                      role="button"
                      tabIndex={0}
                      className={`list-row-enter grid cursor-pointer grid-cols-1 gap-3 border-b p-4 transition-colors last:border-b-0 hover:bg-accent/30 md:grid ${deviceTableGrid} md:items-center md:gap-4`}
                      style={{ animationDelay: `${Math.min(rowIndex * 30, 400)}ms` }}
                      onClick={() => openDeviceDetail(device)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDeviceDetail(device);
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
                        {device.serialNo ? (
                          <button
                            type="button"
                            className="block max-w-full truncate text-left text-sm transition-colors hover:text-primary hover:underline"
                            title="点击复制序列号"
                            onClick={(event) => {
                              event.stopPropagation();
                              void copySerialNo(device.serialNo);
                            }}
                          >
                            {device.serialNo}
                          </button>
                        ) : (
                          <div className="truncate text-sm">-</div>
                        )}
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
              </ResponsiveList>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
              <div className="text-sm text-muted-foreground">
                共 {deviceTotal} 台设备 · 第 {page}/{totalPages} 页
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page <= 1 || loading}>
                  第一页
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
                  上一页
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
                  下一页
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={page >= totalPages || loading}>
                  最后一页
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailTarget)} onOpenChange={(open) => { if (!open) closeDetail(); }}>
        <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-[760px]">
          <DialogHeader className="px-6 pt-6 pr-12">
            <DialogTitle>设备详情</DialogTitle>
            <DialogDescription>设备基础信息、客户归属、维保状态与部件历史</DialogDescription>
          </DialogHeader>
          {detailTarget ? (() => {
            const maintenanceType = canonicalMaintenanceType(detailTarget.maintenanceType);
            const typeLabel = MAINTENANCE_TYPE_LABELS[maintenanceType] || maintenanceType || "-";
            const statusLabel = DEVICE_STATUS_LABELS[detailTarget.status || ""] || detailTarget.status || "在用";
            const relatedServiceOrders = Array.isArray(detailTarget.relatedServiceOrders) ? detailTarget.relatedServiceOrders : [];
            const partHistory = Array.isArray(detailTarget.partHistory) ? detailTarget.partHistory : [];
            const attachmentKeywordNormalized = attachmentKeyword.trim().toLowerCase();
            const attachmentGroups = relatedServiceOrders
              .map((order) => ({
                order,
                attachments: (Array.isArray(order.attachments) ? order.attachments : []).filter((file) => {
                  if (attachmentFormat !== "all" && attachmentFormatOf(file) !== attachmentFormat) return false;
                  if (attachmentKeywordNormalized && !`${file.originalName || ""} ${order.orderNo || ""}`.toLowerCase().includes(attachmentKeywordNormalized)) return false;
                  return true;
                }),
              }))
              .filter((group) => group.attachments.length > 0);
            const attachmentTotal = attachmentGroups.reduce((sum, group) => sum + group.attachments.length, 0);
            const hasAnyAttachments = relatedServiceOrders.some((order) => (order.attachments || []).length > 0);
            const renderAttachmentGroup = (group: { order: DeviceRelatedServiceOrder; attachments: DeviceRelatedAttachment[] }, expanded: boolean) => {
              const { order, attachments } = group;
              const isInstallation = String(order.relationType || "").includes("installation_source");
              const header = (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900">{order.orderNo || `工单 #${order.id}`}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {serviceTypeLabel(order.serviceType)}{order.serviceAt || order.createdAt ? ` · ${formatDate(order.serviceAt || order.createdAt)}` : ""}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {isInstallation ? <Badge variant="outline">安装</Badge> : null}
                    <Badge variant="secondary">{attachments.length}</Badge>
                  </span>
                </div>
              );
              const list = (
                <div className="mt-2 space-y-1">
                  {attachments.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-primary/5"
                      onClick={(event) => {
                        event.stopPropagation();
                        void openAttachment(file);
                      }}
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-primary hover:underline">{file.originalName || `附件 #${file.id}`}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{ATTACHMENT_PURPOSE_LABELS[file.purpose || "general"] || "其他"}</span>
                    </button>
                  ))}
                </div>
              );
              if (expanded) {
                return <div key={`attachment-${order.id}`} className="rounded-md border bg-slate-50/60 p-3">{header}{list}</div>;
              }
              return (
                <details key={`attachment-${order.id}`} className="rounded-md border bg-slate-50/60 p-3">
                  <summary className="cursor-pointer list-none">{header}</summary>
                  {list}
                </details>
              );
            };
            return (
              <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-6 pb-2">
                <div className="space-y-5 py-2">
                  {detailLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
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
                        {detailTarget.serialNo ? (
                          <button
                            type="button"
                            className="mt-1 block max-w-full truncate text-left text-sm font-semibold text-slate-900 transition-colors hover:text-primary hover:underline"
                            title="点击复制序列号"
                            onClick={() => void copySerialNo(detailTarget.serialNo)}
                          >
                            {detailTarget.serialNo}
                          </button>
                        ) : (
                          <div className="mt-1 text-sm font-semibold text-slate-900">-</div>
                        )}
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">MR单</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.mrNo || "-"}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">维保方</div>
                        {detailTarget.maintenancePartyId ? (
                          <button
                            type="button"
                            className="mt-1 block max-w-full truncate text-sm font-semibold text-primary hover:underline"
                            title="点击查看维保方详情"
                            onClick={() => navigate(`/maintenance-parties?partyId=${detailTarget.maintenancePartyId}`)}
                          >
                            {detailTarget.maintenancePartyName || "-"}
                          </button>
                        ) : (
                          <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.maintenancePartyName || "-"}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">资产信息</div>
                      <div className="mt-3 grid gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">客户</div>
                          {detailTarget.customerId ? (
                            <button
                              type="button"
                              className="mt-1 text-left text-primary hover:underline"
                              title="点击查看客户详情"
                              onClick={() => navigate(`/customers?customerId=${detailTarget.customerId}`)}
                            >
                              {detailTarget.customerName || "-"}
                            </button>
                          ) : (
                            <div className="mt-1">{detailTarget.customerName || "-"}</div>
                          )}
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
                          <div className="text-xs text-muted-foreground">创建人</div>
                          <div className="mt-1">{detailTarget.createdByName || "-"}</div>
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
                          {detailTarget.maintenancePartyId ? (
                            <button
                              type="button"
                              className="mt-1 text-left text-primary hover:underline"
                              title="点击查看维保方详情"
                              onClick={() => navigate(`/maintenance-parties?partyId=${detailTarget.maintenancePartyId}`)}
                            >
                              {detailTarget.maintenancePartyName || "-"}
                            </button>
                          ) : (
                            <div className="mt-1">{detailTarget.maintenancePartyName || "-"}</div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">维保周期</div>
                          <div className="mt-1">
                            {formatDate(detailTarget.maintenanceStart)} 至 {formatDate(detailTarget.maintenanceEnd)}
                          </div>
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
                        <div className="text-sm font-medium">相关附件</div>
                        <div className="mt-1 text-xs text-muted-foreground">来自关联工单的文件，按时间倒序，最新一组默认展开，安装来源工单带标记</div>
                      </div>
                      <Badge variant="secondary">{attachmentTotal} 个</Badge>
                    </div>
                    {hasAnyAttachments ? (
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Select value={attachmentFormat} onValueChange={setAttachmentFormat}>
                            <SelectTrigger className="h-8 w-full sm:w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">全部格式</SelectItem>
                              <SelectItem value="document">文档</SelectItem>
                              <SelectItem value="image">图片</SelectItem>
                              <SelectItem value="other">其他</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            className="h-8 sm:max-w-[220px]"
                            placeholder="搜索文件名 / 工单号"
                            value={attachmentKeyword}
                            onChange={(event) => setAttachmentKeyword(event.target.value)}
                          />
                        </div>
                        {attachmentGroups.map((group, index) => renderAttachmentGroup(group, index === 0))}
                        {!attachmentGroups.length ? (
                          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">没有匹配的附件</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                        暂无相关附件
                      </div>
                    )}
                  </div>

                  <details className="rounded-lg border p-4">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">关联工单</div>
                          <div className="mt-1 text-xs text-muted-foreground">引用这台设备的服务单、安装来源和部件记录</div>
                        </div>
                        <Badge variant="secondary">{relatedServiceOrders.length} 张</Badge>
                      </div>
                    </summary>
                    {relatedServiceOrders.length ? (
                      <div className="mt-3 grid gap-3">
                        {relatedServiceOrders.map((order) => (
                          <div
                            key={`${order.id}-${order.relationType || "order"}`}
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer rounded-md border bg-slate-50/60 p-3 transition-colors hover:bg-primary/5 hover:ring-1 hover:ring-primary/40"
                            title="点击查看工单详情"
                            onClick={() => navigate(relatedOrderHref(order.id))}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                navigate(relatedOrderHref(order.id));
                              }
                            }}
                          >
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={order.status === "cancelled" ? "destructive" : "secondary"}>
                                    {orderStatusLabel(order.status)}
                                  </Badge>
                                  <Badge variant="outline">{orderRelationLabel(order.relationType)}</Badge>
                                  <span className="font-medium text-primary">{order.orderNo || `工单 #${order.id}`}</span>
                                </div>
                                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                                  {serviceTypeLabel(order.serviceType)}
                                  {order.serviceAt || order.createdAt ? ` · ${formatDate(order.serviceAt || order.createdAt)}` : ""}
                                  {order.engineerName ? ` · ${order.engineerName}` : ""}
                                </div>
                                {order.issueDescription ? (
                                  <div className="mt-2 rounded bg-white/80 px-3 py-2 text-sm leading-6 text-slate-700">
                                    {compactText(order.issueDescription)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                        暂无关联工单
                      </div>
                    )}
                  </details>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">疑似重复设备</div>
                        <div className="mt-1 text-xs text-muted-foreground">同客户下 SN 或型号相似的设备（基于归一化与编辑距离）</div>
                      </div>
                      {similarDevices.length ? <Badge variant="warning">{similarDevices.length} 台</Badge> : <Badge variant="outline">无</Badge>}
                    </div>
                    {similarDevicesLoading ? (
                      <div className="mt-3 space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : similarDevices.length ? (
                      <div className="mt-3 grid gap-2">
                        {similarDevices.map((item) => (
                          <div key={String(item.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm">
                            <span className="font-medium">设备 #{item.id}</span>
                            <span className="text-muted-foreground">
                              {item.model || "-"} · {item.serialNo || "-"}
                              {item.createdByName ? ` · ${item.createdByName}` : ""}
                            </span>
                            {canManageDevices ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => openMergeConfirm(item)}
                              >
                                <Merge className="w-3.5 h-3.5 mr-1" />
                                合并到本设备
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">硬件部件安装与备件更换记录</div>
                        <div className="mt-1 text-xs text-muted-foreground">来自服务记录中关联到这台设备的硬件部件安装、备件更换记录</div>
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
                                  <span className="font-medium text-slate-900">{item.partName || "未命名部件"}</span>
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
                        暂无硬件部件安装或备件更换记录
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })() : null}
          <DialogFooter className="flex-row justify-end border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={closeDetail}>
              关闭
            </Button>
            {detailTarget && canEditDevices ? (
              <Button onClick={() => {
                const target = detailTarget;
                closeDetail();
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
            setModelSuggestions([]);
            setModelSuggestionTarget({ type: "form" });
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
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 whitespace-pre-line">
              {error}
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" ref={modelDropdownRef}>
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
                      if (!selectedCustomer || normalizeSearchText(value) !== normalizeSearchText(customerLabel(selectedCustomer))) {
                        setForm((prev) => ({ ...prev, customerId: "" }));
                      }
                      scheduleCustomerSearch(value);
                    }}
                    placeholder="输入客户名称关键词搜索"
                  />
                  <CustomerIndexSuggestions
                    idPrefix="device-customer-letter"
                    open={customerDropdownOpen}
                    searching={customerSearchLoading}
                    recentCustomers={dialogRecentCustomers}
                    groups={dialogCustomerGroups}
                    selectedCustomerId={form.customerId}
                    onSelect={applyCustomer}
                  />
                </div>
              </div>
              {!editingId && createMode === "bulk" ? (
                <div className="space-y-2 relative md:col-span-2">
                  <Label>默认设备型号</Label>
                  <Input
                    value={form.model}
                    onFocus={() => showModelSuggestionsFor({ type: "form" }, form.model)}
                    onChange={(e) => {
                      setForm({ ...form, model: e.target.value });
                      scheduleModelSearch(e.target.value, { type: "form" });
                    }}
                    placeholder="同型号设备可在这里填一次，每行也可单独覆盖"
                  />
                  {renderModelSuggestionDropdown({ type: "form" })}
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
                  <div className="space-y-2 relative">
                    <Label>设备型号 *</Label>
                    <Input
                      value={form.model}
                      onFocus={() => showModelSuggestionsFor({ type: "form" }, form.model)}
                      onChange={(e) => {
                        setForm({ ...form, model: e.target.value });
                        scheduleModelSearch(e.target.value, { type: "form" });
                      }}
                      placeholder="例如 PowerEdge R740"
                    />
                    {renderModelSuggestionDropdown({ type: "form" })}
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
                    <SelectItem value="pending_confirmation">待确认</SelectItem>
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
                  disabled={!maintenanceTypeHasParty(form.maintenanceType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={maintenanceTypeHasParty(form.maintenanceType) ? "选择维保方" : MAINTENANCE_TYPE_LABELS[canonicalMaintenanceType(form.maintenanceType)]} />
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
                          <div className="relative">
                            <Input
                              value={row.model}
                              onFocus={() => showModelSuggestionsFor({ type: "batch", index }, row.model)}
                              onChange={(e) => {
                                updateBatchRow(index, "model", e.target.value);
                                scheduleModelSearch(e.target.value, { type: "batch", index });
                              }}
                              placeholder="型号，空则用默认型号"
                            />
                            {renderModelSuggestionDropdown({ type: "batch", index })}
                          </div>
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
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "保存中…" : editingId ? "保存修改" : createMode === "bulk" ? "批量保存" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modelCompareOpen}
        onOpenChange={(open) => {
          if (modelApplying) return;
          setModelCompareOpen(open);
          if (!open) setError("");
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>设备型号校正</DialogTitle>
            <DialogDescription>
              {selectedDeviceIds.length ? `已选择 ${selectedDeviceIds.length} 台设备` : `当前列表 ${filtered.length} 台设备`}
            </DialogDescription>
          </DialogHeader>
          {modelCompareResult ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-md border bg-slate-50 px-3 py-2">
                  <div className="text-xs text-muted-foreground">已比对</div>
                  <div className="mt-1 text-xl font-semibold">{modelCompareResult.scanned}</div>
                </div>
                <div className="rounded-md border bg-emerald-50 px-3 py-2">
                  <div className="text-xs text-emerald-700">已匹配</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-800">{modelCompareResult.matched}</div>
                </div>
                <div className="rounded-md border bg-violet-50 px-3 py-2">
                  <div className="text-xs text-violet-700">可纠正</div>
                  <div className="mt-1 text-xl font-semibold text-violet-800">{modelCompareResult.correctableCount}</div>
                </div>
                <div className="rounded-md border bg-amber-50 px-3 py-2">
                  <div className="text-xs text-amber-700">未确认</div>
                  <div className="mt-1 text-xl font-semibold text-amber-800">{modelCompareResult.unresolvedCount}</div>
                </div>
              </div>

              {modelCompareResult.items.length ? (
                <div className="rounded-md border">
                  <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                    发现 {modelCompareResult.items.length} 台设备型号需要核对
                  </div>
                  <div className="max-h-[420px] overflow-auto divide-y">
                    {modelCompareResult.items.map((item) => (
                      <div key={String(item.id)} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[132px_minmax(180px,0.9fr)_minmax(220px,1fr)_minmax(220px,1fr)] md:items-center">
                        <Badge variant="outline" className={existingModelIssueBadgeClass(item.action)}>
                          {existingModelIssueLabel(item.action)}
                        </Badge>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900" title={item.name || item.customerName || ""}>
                            {item.name || item.customerName || `设备 #${item.id}`}
                          </div>
                          <div className="truncate text-xs text-muted-foreground" title={item.serialNo || ""}>
                            SN：{item.serialNo || "-"}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">当前型号</div>
                          <div className="truncate" title={item.inputModel || ""}>{item.inputModel || "-"}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">建议型号</div>
                          <div className="truncate font-medium text-violet-900" title={item.canonicalModel || ""}>
                            {item.canonicalModel || "-"}
                          </div>
                          {item.message ? <div className="truncate text-xs text-muted-foreground" title={item.message}>{item.message}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  未发现需要纠正的设备型号
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModelCompareOpen(false)} disabled={modelApplying}>
              关闭
            </Button>
            <Button
              onClick={applyExistingModelNormalizations}
              disabled={modelApplying || !modelCompareResult?.correctableCount}
            >
              {modelApplying ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Check className="w-4 h-4 mr-2" />}
              {modelApplying ? "纠正中…" : `应用纠正${modelCompareResult?.correctableCount ? ` (${modelCompareResult.correctableCount})` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={maintenanceImportOpen}
        onOpenChange={(open) => {
          setMaintenanceImportOpen(open);
          if (!open) {
            setError("");
            setMaintenanceImportFile(null);
            setMaintenanceImportPreview(null);
            setMaintenanceImportColumns({ serialNo: "", maintenanceStart: "", maintenanceEnd: "" });
            setMaintenanceImportMappingDirty(false);
            setMaintenanceImportSelectedIds([]);
            if (maintenanceImportFileInputRef.current) maintenanceImportFileInputRef.current.value = "";
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[920px]">
          <DialogHeader>
            <DialogTitle>导入原厂维保日期</DialogTitle>
            <DialogDescription>
              系统根据已有设备序列号反推 SN 列，再根据日期内容和前后关系识别服务开始、截止列。上传只生成预览，确认后才更新。
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 whitespace-pre-line">
              {error}
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>厂商 Excel 文件 *</Label>
              <Input
                ref={maintenanceImportFileInputRef}
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={maintenanceImporting}
                onChange={(event) => {
                  setMaintenanceImportFile(event.target.files?.[0] || null);
                  setMaintenanceImportPreview(null);
                  setMaintenanceImportColumns({ serialNo: "", maintenanceStart: "", maintenanceEnd: "" });
                  setMaintenanceImportMappingDirty(false);
                  setMaintenanceImportSelectedIds([]);
                }}
              />
              <div className="text-xs text-muted-foreground">支持旧版 .xls 和新版 .xlsx；只更新系统中已存在的 SN，单次最多 1000 台，文件不超过 5MB。</div>
            </div>

            {maintenanceImportPreview ? (
              <>
                <div className={`rounded-md border px-3 py-2 text-sm ${maintenanceImportPreview.requiresColumnConfirmation ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                  工作表“{maintenanceImportPreview.sheetName}”：SN 命中 {maintenanceImportPreview.detected.serialNoMatches} 行；
                  日期完整 {maintenanceImportPreview.detected.dateCompleteRows} 行，其中 {Math.round(maintenanceImportPreview.detected.dateOrderRatio * 100)}% 满足开始不晚于截止。
                  {maintenanceImportPreview.requiresColumnConfirmation ? " 检测到相近候选，请核对下方列并重新分析。" : " 自动识别结果可用于更新。"}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {([
                    ["serialNo", "序列号列"],
                    ["maintenanceStart", "服务开始列"],
                    ["maintenanceEnd", "服务截止列"],
                  ] as const).map(([field, label]) => (
                    <div className="space-y-1.5" key={field}>
                      <Label>{label}</Label>
                      <Select
                        value={maintenanceImportColumns[field]}
                        onValueChange={(value) => {
                          setMaintenanceImportColumns((current) => ({ ...current, [field]: value }));
                          setMaintenanceImportMappingDirty(true);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder={`选择${label}`} /></SelectTrigger>
                        <SelectContent>
                          {maintenanceImportPreview.columnOptions.map((column) => (
                            <SelectItem key={`${field}-${column.index}`} value={String(column.index)}>{column.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
                  {[
                    ["总行数", maintenanceImportPreview.summary.total, "bg-slate-50 text-slate-800"],
                    ["可更新", maintenanceImportPreview.summary.updatable, "bg-emerald-50 text-emerald-800"],
                    ["无变化", maintenanceImportPreview.summary.unchanged, "bg-sky-50 text-sky-800"],
                    ["未找到", maintenanceImportPreview.summary.notFound, "bg-amber-50 text-amber-800"],
                    ["类型冲突", maintenanceImportPreview.summary.conflicts, "bg-violet-50 text-violet-800"],
                    ["已忽略", maintenanceImportPreview.summary.ignored, "bg-slate-50 text-slate-700"],
                    ["数据异常", maintenanceImportPreview.summary.invalid, "bg-red-50 text-red-800"],
                  ].map(([label, value, color]) => (
                    <div key={String(label)} className={`rounded-md border px-3 py-2 ${color}`}>
                      <div className="text-xs">{label}</div>
                      <div className="mt-1 text-lg font-semibold">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={maintenanceImportUpdatableIds.length > 0 && maintenanceImportSelectedIds.length === maintenanceImportUpdatableIds.length
                          ? true
                          : maintenanceImportSelectedIds.length > 0 ? "indeterminate" : false}
                        disabled={!maintenanceImportUpdatableIds.length}
                        onCheckedChange={(checked) => setMaintenanceImportSelectedIds(checked === true ? maintenanceImportUpdatableIds : [])}
                      />
                      <span className="font-medium">识别明细</span>
                    </div>
                    <span className="text-xs text-muted-foreground">已选择 {maintenanceImportSelectedIds.length} / {maintenanceImportUpdatableIds.length} 台可更新设备</span>
                  </div>
                  <div className="max-h-72 overflow-auto divide-y">
                    {maintenanceImportPreview.items.map((item, index) => (
                      <div key={`${item.rowNumber}-${item.serialNo || ""}-${index}`} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[32px_64px_120px_minmax(140px,1fr)_270px_90px] md:items-center">
                        <Checkbox
                          checked={item.deviceId !== undefined && maintenanceImportSelectedIdSet.has(String(item.deviceId))}
                          disabled={item.status !== "updatable" || item.deviceId === undefined}
                          onCheckedChange={(checked) => {
                            if (item.deviceId === undefined) return;
                            const id = String(item.deviceId);
                            setMaintenanceImportSelectedIds((current) => checked === true
                              ? [...new Set([...current, id])]
                              : current.filter((selectedId) => selectedId !== id));
                          }}
                        />
                        <span>第 {item.rowNumber} 行</span>
                        <span className="truncate font-medium" title={item.serialNo || ""}>{item.serialNo || "-"}</span>
                        <span className="truncate text-muted-foreground" title={[item.customerName, item.model].filter(Boolean).join(" / ")}>{[item.customerName, item.model].filter(Boolean).join(" / ") || "-"}</span>
                        <span className="text-xs text-muted-foreground">
                          原 {item.currentMaintenanceStart || "-"} → {item.currentMaintenanceEnd || "-"}<br />
                          新 {item.maintenanceStart || "-"} → {item.maintenanceEnd || "-"}
                        </span>
                        <span className={item.status === "updatable" ? "text-emerald-700" : item.status === "unchanged" ? "text-sky-700" : "text-amber-700"} title={item.message || ""}>
                          {MAINTENANCE_IMPORT_STATUS_LABELS[item.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                  同一 SN 存在多个服务期时，自动采用截止日期最晚的记录；截止日期相同则采用开始日期较晚的记录。确认后仅更新已勾选的“可更新”设备，并将其标记为原厂维保；我方维保、无维保、较早服务期、异常行及未勾选设备不会被覆盖。
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaintenanceImportOpen(false)} disabled={maintenanceImporting}>关闭</Button>
            {maintenanceImportPreview ? (
              <Button variant="outline" onClick={() => previewMaintenanceImport(true)} disabled={maintenanceImporting || !maintenanceImportFile}>
                {maintenanceImporting ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Search className="w-4 h-4 mr-2" />}
                {maintenanceImportMappingDirty || maintenanceImportPreview.requiresColumnConfirmation ? "按所选列重新分析" : "重新分析"}
              </Button>
            ) : null}
            {maintenanceImportPreview ? (
              <Button
                onClick={applyMaintenanceImport}
                disabled={maintenanceImporting || maintenanceImportMappingDirty || maintenanceImportPreview.requiresColumnConfirmation || !maintenanceImportSelectedIds.length}
              >
                {maintenanceImporting ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Check className="w-4 h-4 mr-2" />}
                确认更新 ({maintenanceImportSelectedIds.length})
              </Button>
            ) : (
              <Button onClick={() => previewMaintenanceImport(false)} disabled={maintenanceImporting || !maintenanceImportFile}>
                {maintenanceImporting ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Search className="w-4 h-4 mr-2" />}
                自动识别并预览
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            setError("");
            setImportFile(null);
            setImportResult(null);
            setImportCustomerMappings({});
            if (importFileInputRef.current) importFileInputRef.current.value = "";
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[780px]">
          <DialogHeader>
            <DialogTitle>导入设备资产</DialogTitle>
            <DialogDescription>
              上传按模板填写的 .xlsx 文件；可处理设备正常导入，失败行会保留到新的剩余设备文件。
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 whitespace-pre-line">
              {error}
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-slate-50/70 p-3 text-sm leading-6 text-muted-foreground">
              只需先填写客户名称、设备型号和 SN 即可导入；其他资料可留空，导入后可在系统中批量补齐或修改。
              客户名称建议填写系统内标准名称；系统会识别简称、设备说明和已确认的历史主体合并关系。
              系统建议会默认选中，客户不存在或未确认的行会跳过。SN 已存在时会补充维保日期等空字段，但不会覆盖已有资料；所属客户不同则拒绝更新。
            </div>
            <div className="space-y-2">
              <Label>Excel 文件 *</Label>
              <Input
                ref={importFileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={importing}
                onChange={(event) => {
                  setImportResult(null);
                  setImportCustomerMappings({});
                  setImportFile(event.target.files?.[0] || null);
                }}
              />
              <div className="text-xs text-muted-foreground">单次最多 1000 行，文件不超过 5MB。</div>
            </div>
            {importResult ? (
              <div className="space-y-3">
                {importResult.requiresImportConfirmation || importResult.requiresModelConfirmation ? (
                  <>
                    {importResult.unmatchedCustomers?.length ? (
                      <div className="rounded-md border border-red-300 bg-red-50/80">
                        <div className="border-b border-red-200 px-3 py-2 text-sm font-medium text-red-950">
                          有 {importResult.unmatchedCustomers.length} 个客户在系统中不存在
                        </div>
                        <div className="max-h-56 divide-y divide-red-100 overflow-auto">
                          {importResult.unmatchedCustomers.map((item) => (
                            <div key={item.inputCustomerName} className="grid gap-1 px-3 py-2.5 text-sm md:grid-cols-[minmax(180px,1fr)_auto] md:items-center">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-900" title={item.inputCustomerName}>{item.inputCustomerName}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  Excel 第 {item.rowNumbers.join("、")} 行，共 {item.rowNumbers.length} 台
                                </div>
                              </div>
                              <span className="text-xs font-medium text-red-700">客户不存在，请先添加客户</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-red-200 px-3 py-2 text-xs leading-5 text-red-900">
                          这些行会跳过，其他设备仍可导入。请先到“客户管理”添加客户，再使用导入后下载的剩余设备文件重试。
                        </div>
                      </div>
                    ) : null}
                    {importResult.similarCustomers?.length ? (
                      <div className="rounded-md border border-amber-300 bg-amber-50/80">
                        <div className="border-b border-amber-200 px-3 py-2 text-sm font-medium text-amber-950">
                          发现 {importResult.similarCustomers.length} 个相似客户名称，请人工确认
                        </div>
                        <div className="max-h-72 divide-y divide-amber-100 overflow-auto">
                          {importResult.similarCustomers.map((item) => (
                            <div key={item.inputCustomerName} className="grid gap-2 px-3 py-2.5 text-sm md:grid-cols-[minmax(190px,1fr)_minmax(240px,1.15fr)] md:items-center">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-900" title={item.inputCustomerName}>{item.inputCustomerName}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  Excel 第 {item.rowNumbers.join("、")} 行，共 {item.rowNumbers.length} 台
                                </div>
                              </div>
                              <Select
                                value={importCustomerMappings[item.inputCustomerName] || undefined}
                                onValueChange={(customerId) => setImportCustomerMappings((current) => ({
                                  ...current,
                                  [item.inputCustomerName]: customerId,
                                }))}
                              >
                                <SelectTrigger size="sm" className="bg-white text-xs">
                                  <SelectValue placeholder="选择相似的系统客户" />
                                </SelectTrigger>
                                <SelectContent className="max-h-56 w-[min(360px,calc(100vw-32px))]">
                                  {item.candidates.map((customer) => (
                                    <SelectItem className="py-1 text-xs" key={String(customer.id)} value={String(customer.id)}>
                                      {customer.name || `客户 #${customer.id}`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-amber-200 px-3 py-2 text-xs leading-5 text-amber-950">
                          地区、分支机构或简称存在差异，因此系统不会自动绑定。未选择的行会跳过，不影响其他设备导入。
                        </div>
                      </div>
                    ) : null}
                    {importCustomerConfirmations.length ? (
                      <div className="rounded-md border border-sky-200 bg-sky-50/80">
                        <div className="border-b border-sky-200 px-3 py-2 text-sm font-medium text-sky-900">
                          请确认 {importCustomerConfirmations.length} 个客户名称纠正建议
                        </div>
                        <div className="max-h-72 divide-y divide-sky-100 overflow-auto">
                          {importCustomerConfirmations.map((item) => (
                            <div key={item.inputCustomerName} className="grid gap-2 px-3 py-2.5 text-sm md:grid-cols-[minmax(190px,1fr)_minmax(240px,1.15fr)] md:items-center">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-900" title={item.inputCustomerName}>{item.inputCustomerName}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  Excel 第 {item.rowNumbers.join("、")} 行，共 {item.rowNumbers.length} 台
                                  {item.matchType ? ` · ${item.matchType}` : ""}
                                </div>
                              </div>
                              <Select
                                value={importCustomerMappings[item.inputCustomerName] || item.suggestedCustomerId}
                                onValueChange={(customerId) => setImportCustomerMappings((current) => ({
                                  ...current,
                                  [item.inputCustomerName]: customerId,
                                }))}
                              >
                                <SelectTrigger size="sm" className="bg-white text-xs">
                                  <SelectValue placeholder="确认系统客户" />
                                </SelectTrigger>
                                <SelectContent className="max-h-56 w-[min(360px,calc(100vw-32px))]">
                                  {importCustomerOptions.map((customer) => (
                                    <SelectItem className="py-1 text-xs" key={String(customer.id)} value={String(customer.id)}>
                                      {customer.name || `客户 #${customer.id}`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                        <div className="px-3 py-2 text-xs text-sky-900">
                          已默认选中系统建议客户，可打开紧凑下拉菜单改选其他现有客户。确认后才会绑定；历史主体合并不会静默执行。
                        </div>
                      </div>
                    ) : null}
                    {importResult.modelCorrections?.length ? (
                      <div className="rounded-md border border-violet-200 bg-violet-50/80">
                        <div className="border-b border-violet-200 px-3 py-2 text-sm font-medium text-violet-900">
                          发现 {importResult.modelCorrections.length} 行设备型号可自动纠正
                        </div>
                        <div className="max-h-64 overflow-auto divide-y divide-violet-100">
                          {importResult.modelCorrections.map((item, index) => (
                            <div key={`${item.rowNumber}-${item.sn || ""}-${index}`} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[88px_minmax(160px,0.85fr)_minmax(240px,1.4fr)] md:items-center">
                              <span className="font-medium text-slate-900">第 {item.rowNumber} 行</span>
                              <span className="truncate text-muted-foreground" title={item.inputModel || ""}>原型号：{item.inputModel || "-"}</span>
                              <span className="truncate text-violet-900" title={item.canonicalModel || ""}>标准型号：{item.canonicalModel || "-"}</span>
                            </div>
                          ))}
                        </div>
                        <div className="px-3 py-2 text-xs text-violet-900">
                          确认后，以上行会按标准型号写入；未列出的行保持 Excel 原值。
                        </div>
                      </div>
                    ) : null}
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      请核对系统建议。后端会重新解析并逐行导入；客户不存在、相似客户未选择或其他校验失败时，只跳过对应设备。
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-md border bg-emerald-50 px-3 py-2">
                        <div className="text-xs text-emerald-700">新增设备</div>
                        <div className="mt-1 text-xl font-semibold text-emerald-800">{importResult.created}</div>
                      </div>
                      <div className="rounded-md border bg-sky-50 px-3 py-2">
                        <div className="text-xs text-sky-700">补充更新</div>
                        <div className="mt-1 text-xl font-semibold text-sky-800">{importResult.updated}</div>
                      </div>
                      <div className="rounded-md border bg-slate-50 px-3 py-2">
                        <div className="text-xs text-slate-600">无需更新</div>
                        <div className="mt-1 text-xl font-semibold text-slate-800">{importResult.unchanged}</div>
                      </div>
                      <div className="rounded-md border bg-red-50 px-3 py-2">
                        <div className="text-xs text-red-700">未导入行数</div>
                        <div className="mt-1 text-xl font-semibold text-red-800">{importResult.failed}</div>
                      </div>
                    </div>
                    {importResult.remainingFileName ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                        已下载 <span className="font-medium">{importResult.remainingFileName}</span>。文件已删除新增、补充更新和无需更新的设备，仅保留未导入行并附带失败原因。
                      </div>
                    ) : null}
                  </div>
                )}
                {importResult.errors.length ? (
                  <div className="rounded-md border">
                    <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">失败明细</div>
                    <div className="max-h-64 overflow-auto divide-y">
                      {importResult.errors.map((item, index) => (
                        <div key={`${item.rowNumber}-${item.sn || ""}-${index}`} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[88px_1fr_1.4fr] md:items-center">
                          <span className="font-medium text-slate-900">第 {item.rowNumber} 行</span>
                          <span className="truncate text-muted-foreground" title={item.sn || ""}>SN：{item.sn || "-"}</span>
                          <span className="text-red-600">{item.message || "导入失败"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              关闭
            </Button>
            {(importResult?.requiresImportConfirmation || importResult?.requiresModelConfirmation)
              && !importResult?.customerCorrections?.length
              && !importResult?.similarCustomers?.length
              && !importResult?.unmatchedCustomers?.length ? (
              <Button variant="outline" onClick={() => submitImport("skip")} disabled={importing || !importFile}>
                保留原型号导入
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={async () => {
                setError("");
                try {
                  await downloadDeviceImportTemplate();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "模板下载失败");
                }
              }}
              disabled={importing}
            >
              <Download className="w-4 h-4 mr-2" />
              下载模板
            </Button>
            <Button
              onClick={() => submitImport((importResult?.requiresImportConfirmation || importResult?.requiresModelConfirmation) ? "confirm" : "check")}
              disabled={importing || !importFile}
            >
              {importing ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Upload className="w-4 h-4 mr-2" />}
              {importing ? "导入中…" : (importResult?.requiresImportConfirmation || importResult?.requiresModelConfirmation) ? "确认并导入可处理设备" : "开始导入"}
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
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 whitespace-pre-line">
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
                    <SelectItem value="pending_confirmation">待确认</SelectItem>
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
                  disabled={!batchEditToggles.maintenancePartyId || !maintenanceTypeHasParty(batchEditForm.maintenanceType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={maintenanceTypeHasParty(batchEditForm.maintenanceType) ? "选择维保方" : MAINTENANCE_TYPE_LABELS[canonicalMaintenanceType(batchEditForm.maintenanceType)]} />
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
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "保存中…" : "批量保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(duplicateConfirm)} onOpenChange={(open) => { if (!open) setDuplicateConfirm(null); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>检测到疑似重复设备</DialogTitle>
            <DialogDescription>
              系统发现同客户下存在 SN 或型号相似的设备，请核对后确认是否仍要创建。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[40vh] space-y-2 overflow-y-auto py-2">
            {(duplicateConfirm?.items || []).map((item) => (
              <div key={String(item.id)} className="rounded-lg border bg-amber-50/50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">设备 #{item.id}</span>
                  {item.customerName ? <span className="text-xs text-muted-foreground">{item.customerName}</span> : null}
                </div>
                <div className="mt-1 text-muted-foreground">
                  型号：{item.model || "-"} · S/N：{item.serialNo || "-"}
                  {item.createdByName ? ` · 创建人：${item.createdByName}` : ""}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateConfirm(null)}>
              取消
            </Button>
            <Button
              onClick={async () => {
                const pending = duplicateConfirm;
                setDuplicateConfirm(null);
                if (!pending) return;
                setSaving(true);
                try {
                  await createDevices(pending.payloads, true);
                  setDialogOpen(false);
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "保存失败");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Check className="w-4 h-4 mr-2" />
              仍要创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(mergeConfirm)} onOpenChange={(open) => { if (!open && !saving) setMergeConfirm(null); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>合并设备（手动确认）</DialogTitle>
            <DialogDescription>
              将待合并设备的关联记录迁移到保留设备后删除，<b>此操作不可撤销</b>，请核对无误后手动确认。
            </DialogDescription>
          </DialogHeader>
          {mergeConfirm?.loading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : mergeConfirm?.preview ? (
            <div className="space-y-3 py-2">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
                  <div className="text-xs font-medium text-emerald-700">保留设备</div>
                  <div className="mt-1 font-medium">#{mergeConfirm.preview.keep.id}</div>
                  <div className="text-muted-foreground">
                    {mergeConfirm.preview.keep.model || "-"} · {mergeConfirm.preview.keep.serialNo || "-"}
                  </div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
                  <div className="text-xs font-medium text-amber-700">待合并（将删除）</div>
                  <div className="mt-1 font-medium">#{mergeConfirm.preview.merge.id}</div>
                  <div className="text-muted-foreground">
                    {mergeConfirm.preview.merge.model || "-"} · {mergeConfirm.preview.merge.serialNo || "-"}
                  </div>
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <TriangleAlert className="h-4 w-4 text-amber-600" />
                  将迁移到保留设备：
                </div>
                <div className="mt-1 grid gap-1 text-muted-foreground">
                  {Object.entries(mergeConfirm.preview.counts || {}).map(([key, value]) => (
                    <span key={key}>
                      {({ mainServiceOrders: "工单", targetServiceOrders: "工单关联", inspectionSchedules: "巡检计划", serviceParts: "备件记录" } as Record<string, string>)[key] || key}：{value} 条
                    </span>
                  ))}
                  {!Object.values(mergeConfirm.preview.counts || {}).some((v) => v > 0) ? "（无关联记录）" : null}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeConfirm(null)} disabled={saving}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmMerge}
              disabled={saving || !mergeConfirm?.preview}
            >
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Merge className="w-4 h-4 mr-2" />}
              确认合并
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suspectedOpen} onOpenChange={setSuspectedOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>疑似重复设备（{formatCount(suspectedTotal)} 组）</DialogTitle>
            <DialogDescription>
              按同客户 + SN/型号相似自动聚合，点击设备可查看详情并在详情内手动合并。
            </DialogDescription>
          </DialogHeader>
          {suspectedLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : suspectedGroups.length ? (
            <div className="space-y-4 py-2">
              {suspectedGroups.map((group, index) => (
                <div key={`${group.customerId}-${index}`} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium">{group.customerName || `客户 #${group.customerId}`}</span>
                    <Badge variant="warning">{group.items.length} 台</Badge>
                  </div>
                  <div className="grid gap-2">
                    {group.items.map((item) => (
                      <div key={String(item.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                        <span className="font-medium">#{item.id}</span>
                        <span className="min-w-0 flex-1 text-muted-foreground">
                          {item.model || "-"} · {item.serialNo || "-"}
                          {item.createdByName ? ` · ${item.createdByName}` : ""}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSuspectedOpen(false);
                            const device = { id: item.id, model: item.model, serialNo: item.serialNo } as Device;
                            openDetail(device);
                          }}
                        >
                          查看详情
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">未发现疑似重复设备</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspectedOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
