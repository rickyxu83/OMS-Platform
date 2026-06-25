import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Plus, RefreshCw, Loader2, MapPin, Crosshair, Check, Trash2, AlertTriangle, Server, ClipboardCheck, FileText, Pencil, ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/services/api";

interface Customer {
  id: string | number;
  code?: string;
  name?: string;
  contactName?: string;
  contactPhone?: string;
  phone?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  mapProvider?: string;
  mapPoiId?: string;
  mapPoiName?: string;
  mapAddress?: string;
  level?: string;
  serviceOrderCount?: number;
  salesperson?: string;
  updatedAt?: string;
  createdAt?: string;
  contacts?: Array<{ id?: string | number; name?: string; phone?: string }>;
}

interface CustomerDevice {
  id: string | number;
  name?: string;
  model?: string;
  serialNo?: string;
  maintenanceType?: string;
  warrantyUntil?: string;
}

function customerDeviceLabel(device: CustomerDevice) {
  return device.model || device.name || device.serialNo || `#${device.id}`;
}

interface CustomerSchedule {
  id: string | number;
  deviceNames?: string[];
  targetEngineerName?: string;
  cadence?: string;
  nextRunAnchor?: string;
  active?: boolean;
}

interface CustomerOrder {
  id: string | number;
  orderNo?: string;
  displayStatus?: string;
  workflowStatus?: string;
  status?: string;
  deviceName?: string;
  serviceType?: string;
  inspectionScheduleId?: string | number | null;
  serviceAt?: string;
  createdAt?: string;
}

interface CustomerInsight {
  devices: CustomerDevice[];
  schedules: CustomerSchedule[];
  orders: CustomerOrder[];
}

interface GeoCandidate {
  id: string;
  customerId?: string | number;
  name: string;
  address?: string;
  location?: string;
  contactName?: string;
  contactPhone?: string;
  contacts?: { name: string; phone?: string }[];
  latitude?: number | null;
  longitude?: number | null;
  mapProvider?: string;
  mapPoiId?: string;
  mapPoiName?: string;
  mapAddress?: string;
  source?: "customer" | "map";
}

interface SalespersonOption {
  id: string | number;
  username?: string;
  realName?: string;
  role?: string;
}

interface CustomerForm {
  id?: string | number;
  name: string;
  code: string;
  salesperson: string;
  address: string;
  level: string;
  latitude: number | null;
  longitude: number | null;
  mapProvider: string;
  mapPoiId: string;
  mapPoiName: string;
  mapAddress: string;
  contacts: Array<{ id?: string | number; name: string; phone: string }>;
}

const EMPTY_FORM: CustomerForm = {
  name: "",
  code: "",
  salesperson: "",
  address: "",
  level: "normal",
  latitude: null,
  longitude: null,
  mapProvider: "",
  mapPoiId: "",
  mapPoiName: "",
  mapAddress: "",
  contacts: [{ name: "", phone: "" }],
};

const I18N = {
  "zh-CN": {
    title: "客户档案",
    subtitle: "管理客户信息、联系方式及资产概况",
    actions: {
      refresh: "刷新",
      create: "新增客户",
      edit: "编辑",
      saveEdit: "保存修改",
      retry: "重试",
      cancel: "取消",
      clear: "清除",
      locateAddress: "按地址定位",
      addContact: "新增联系人",
      removeContact: "删除联系人",
      delete: "删除",
      batchDelete: "批量删除",
      forceDelete: "强制删除",
      deleting: "删除中…",
      saveNow: "保存",
      saving: "保存中…",
      clearSelection: "清空选择",
      close: "关闭",
      merge: "合并客户",
      merging: "合并中…",
    },
    stats: {
      total: "客户总数",
      key: "重点客户",
      serviceCount: "累计服务次数",
    },
    list: {
      title: "客户列表",
      searchPlaceholder: "搜索名称、地址、联系人…",
      loading: "正在加载…",
      empty: "未找到相关客户数据",
      code: "编码",
      name: "客户名称",
      contact: "联系人",
      phone: "联系电话",
      level: "等级",
      address: "地址",
      salesperson: "业务",
      action: "操作",
      selectAllCurrent: "全选当前列表",
    },
    dialog: {
      title: "新增客户",
      editTitle: "编辑客户",
      description: "填写客户基础信息，提交后保存到系统",
      editDescription: "修改客户信息，可通过地图搜索更新坐标",
      name: "客户名称 *",
      code: "客户编码（留空自动生成）",
      salesperson: "对应销售",
      contact: "联系人",
      phone: "联系电话",
      address: "客户地址",
      namePlaceholder: "请输入企业全称",
      codePlaceholder: "例如 SZGY-001（可留空）",
      salespersonPlaceholder: "请选择对应销售",
      contactPlaceholder: "联系人姓名",
      phonePlaceholder: "手机号或座机",
      addressPlaceholder: "详细至街道门牌号",
      coordinateLabel: "坐标与地图匹配",
      coordinatePlaceholder: "输入客户名称后自动搜索地图候选",
      level: "客户等级",
      locate: "定位查找",
      contacts: "联系人列表",
      contactName: "联系人姓名",
      contactPhone: "联系人电话",
      badgeSystem: "系统",
      badgeMap: "地图",
      selectedCoordinate: "已选坐标",
      deleteTitle: "删除客户",
      deleteDescription: "删除客户前请确认关联数据。管理端删除会强制清理该客户下的设备、工单、巡检计划和联系人，操作不可恢复。",
      deleteSafeDescription: "删除客户前请确认关联数据。只能删除没有关联设备、工单或巡检计划的客户。",
      deleteWarning: "强制删除会一并删除关联设备、工单和巡检计划，请确认已经备份或不再需要这些数据。",
      deleteSafeWarning: "有关联数据的客户不会被删除，请先处理关联设备、工单或巡检计划。",
      deleteServiceCount: "当前客户已有 {count} 条工单记录。",
      deleteNoServiceCount: "系统会再次检查是否有关联设备或工单。",
      deleteSuccess: "已删除客户：{name}",
      deleteForceSuccess: "已删除客户：{name}（同时清理 {deviceCount} 台设备、{serviceOrderCount} 张工单）",
      bulkDeleteConfirm: "确认强制删除选中的 {count} 个客户？会一并删除关联设备、工单、巡检计划和联系人，操作不可恢复。",
      bulkDeleteSafeConfirm: "确认删除选中的 {count} 个客户？只有没有关联数据的客户可以删除。",
      bulkDeleteSuccess: "已删除 {count} 个客户（同时清理 {deviceCount} 台设备、{serviceOrderCount} 张工单）",
      bulkDeleteSafeSuccess: "已删除 {count} 个客户",
      mergeTitle: "合并客户",
      mergeDescription: "选择一个客户作为保留档案，另一个客户的设备、工单、巡检计划和联系人会转入保留客户，来源客户会被删除。",
      mergeKeepCustomer: "保留客户",
      mergeSourceCustomer: "并入后删除",
      mergeWarning: "合并不可撤销，请确认保留客户是资料更完整的一方。",
      mergeNeedTwo: "请先勾选 2 个客户再合并。",
      mergeSuccess: "已合并客户：{source} → {target}",
      mergeConfirm: "确认合并",
      contactRenameConfirm: "联系人姓名已变更。保存后，该客户相关工单中的联系人姓名会一起更新（当前约 {count} 张工单）。请确认没有改错。",
      detailTitle: "客户详情",
      detailDescription: "客户基础信息、联系人、业务归属与地图坐标",
      serviceOrderCount: "服务次数",
      createdAt: "创建时间",
      updatedAt: "更新时间",
      noContacts: "暂无联系人",
      noCoordinate: "暂无坐标",
      assetOverview: "客户概况",
      deviceList: "设备清单",
      inspectionPlan: "巡检计划",
      inspectionStatus: "巡检状态",
      inspectionIncluded: "已纳入巡检",
      inspectionDisabled: "巡检未启用",
      inspectionNotIncluded: "未纳入巡检",
      lastInspection: "最近巡检",
      nextInspection: "下次巡检",
      currentInspectionStatus: "当前状态",
      plannedInspection: "计划中",
      coveredDevices: "覆盖设备",
      enabledInspectionPlans: "启用计划",
      noInspectionRecord: "暂无巡检记录",
      noActiveInspection: "暂无启用计划",
      viewInspectionPlans: "查看巡检计划",
      recentOrders: "最近工单",
      deviceCount: "设备数量",
      activeInspection: "启用巡检",
      recentInspection: "巡检工单",
      loadingInsight: "正在加载客户资产与巡检状态…",
      noDevices: "暂无设备档案",
      noInspection: "暂无巡检计划",
      noRecentOrders: "暂无最近工单",
      nextRun: "下次生成",
      targetEngineer: "巡检人",
      inspectionDevices: "巡检设备",
      orderDevice: "设备",
    },
    errors: {
      loadFailed: "加载失败",
      createFailed: "新增失败",
      deleteFailed: "删除失败",
      bulkDeleteFailed: "批量删除失败",
      mergeFailed: "合并失败",
      nameRequired: "请输入客户名称",
      geoSearchFailed: "搜索失败",
    },
    levels: {
      key: "重点客户",
      normal: "普通客户",
      potential: "潜在客户",
      vip: "VIP 客户",
    },
    geo: {
      hasCoordinate: "已有坐标：{lat}, {lng}",
      noCoordinate: "未填写坐标，可通过下方搜索或定位补全",
      foundCandidates: "找到 {count} 个候选，点击可带入客户信息",
      noCandidates: "未找到候选，可手动填写或换个关键词",
      searching: "正在搜索\"{keyword}\"…",
      selected: "已选：{name}（来源：{source}）",
      sourceCustomer: "系统客户",
      sourceMap: "地图",
      locateFallback: "无法获取定位，先按关键词搜索",
      locating: "正在获取定位并查找附近公司…",
      addressRequired: "请先填写详细地址",
      addressSearching: "正在按地址查找坐标：{keyword}",
      addressLocated: "已根据地址补全坐标：{lat}, {lng}",
      addressLocateFailed: "未能解析该地址坐标，请补充省市区或更详细门牌号",
      searchCompanyKeyword: "公司",
    },
    misc: {
      unknown: "-",
    },
  },
  "zh-TW": {
    title: "客戶檔案",
    subtitle: "管理客戶資訊、聯絡方式及資產概況",
    actions: {
      refresh: "刷新",
      create: "新增客戶",
      edit: "編輯",
      saveEdit: "儲存修改",
      retry: "重試",
      cancel: "取消",
      clear: "清除",
      locateAddress: "按地址定位",
      addContact: "新增聯絡人",
      removeContact: "刪除聯絡人",
      delete: "刪除",
      batchDelete: "批量刪除",
      forceDelete: "強制刪除",
      deleting: "刪除中…",
      saveNow: "儲存",
      saving: "儲存中…",
      clearSelection: "清空選擇",
      close: "關閉",
      merge: "合併客戶",
      merging: "合併中…",
    },
    stats: {
      total: "客戶總數",
      key: "重點客戶",
      serviceCount: "累計服務次數",
    },
    list: {
      title: "客戶列表",
      searchPlaceholder: "搜尋名稱、地址、聯絡人…",
      loading: "正在載入…",
      empty: "未找到相關客戶資料",
      code: "編碼",
      name: "客戶名稱",
      contact: "聯絡人",
      phone: "聯絡電話",
      level: "等級",
      address: "地址",
      salesperson: "業務",
      action: "操作",
      selectAllCurrent: "全選目前列表",
    },
    dialog: {
      title: "新增客戶",
      editTitle: "編輯客戶",
      description: "填寫客戶基礎資訊，提交後儲存到系統",
      editDescription: "修改客戶資訊，可透過地圖搜尋更新座標",
      name: "客戶名稱 *",
      code: "客戶編碼（留空自動生成）",
      salesperson: "對應銷售",
      contact: "聯絡人",
      phone: "聯絡電話",
      address: "客戶地址",
      namePlaceholder: "請輸入企業全稱",
      codePlaceholder: "例如 SZGY-001（可留空）",
      salespersonPlaceholder: "請選擇對應銷售",
      contactPlaceholder: "聯絡人姓名",
      phonePlaceholder: "手機號或市話",
      addressPlaceholder: "詳細至街道路牌號",
      coordinateLabel: "座標與地圖匹配",
      coordinatePlaceholder: "輸入客戶名稱後自動搜尋地圖候選",
      level: "客戶等級",
      locate: "定位查找",
      contacts: "聯絡人列表",
      contactName: "聯絡人姓名",
      contactPhone: "聯絡人電話",
      badgeSystem: "系統",
      badgeMap: "地圖",
      selectedCoordinate: "已選座標",
      deleteTitle: "刪除客戶",
      deleteDescription: "刪除客戶前請確認關聯資料。管理端刪除會強制清理該客戶下的設備、工單、巡檢計畫和聯絡人，操作不可恢復。",
      deleteSafeDescription: "刪除客戶前請確認關聯資料。只能刪除沒有關聯設備、工單或巡檢計畫的客戶。",
      deleteWarning: "強制刪除會一併刪除關聯設備、工單和巡檢計畫，請確認已經備份或不再需要這些資料。",
      deleteSafeWarning: "有關聯資料的客戶不會被刪除，請先處理關聯設備、工單或巡檢計畫。",
      deleteServiceCount: "目前客戶已有 {count} 條工單記錄。",
      deleteNoServiceCount: "系統會再次檢查是否有關聯設備或工單。",
      deleteSuccess: "已刪除客戶：{name}",
      deleteForceSuccess: "已刪除客戶：{name}（同時清理 {deviceCount} 台設備、{serviceOrderCount} 張工單）",
      bulkDeleteConfirm: "確認強制刪除選中的 {count} 個客戶？會一併刪除關聯設備、工單、巡檢計畫和聯絡人，操作不可恢復。",
      bulkDeleteSafeConfirm: "確認刪除選中的 {count} 個客戶？只有沒有關聯資料的客戶可以刪除。",
      bulkDeleteSuccess: "已刪除 {count} 個客戶（同時清理 {deviceCount} 台設備、{serviceOrderCount} 張工單）",
      bulkDeleteSafeSuccess: "已刪除 {count} 個客戶",
      mergeTitle: "合併客戶",
      mergeDescription: "選擇一個客戶作為保留檔案，另一個客戶的設備、工單、巡檢計畫和聯絡人會轉入保留客戶，來源客戶會被刪除。",
      mergeKeepCustomer: "保留客戶",
      mergeSourceCustomer: "併入後刪除",
      mergeWarning: "合併不可復原，請確認保留客戶是資料更完整的一方。",
      mergeNeedTwo: "請先勾選 2 個客戶再合併。",
      mergeSuccess: "已合併客戶：{source} → {target}",
      mergeConfirm: "確認合併",
      contactRenameConfirm: "聯絡人姓名已變更。儲存後，該客戶相關工單中的聯絡人姓名會一起更新（目前約 {count} 張工單）。請確認沒有改錯。",
      detailTitle: "客戶詳情",
      detailDescription: "客戶基礎資訊、聯絡人、業務歸屬與地圖座標",
      serviceOrderCount: "服務次數",
      createdAt: "建立時間",
      updatedAt: "更新時間",
      noContacts: "暫無聯絡人",
      noCoordinate: "暫無座標",
      assetOverview: "客戶概況",
      deviceList: "設備清單",
      inspectionPlan: "巡檢計畫",
      inspectionStatus: "巡檢狀態",
      inspectionIncluded: "已納入巡檢",
      inspectionDisabled: "巡檢未啟用",
      inspectionNotIncluded: "未納入巡檢",
      lastInspection: "最近巡檢",
      nextInspection: "下次巡檢",
      currentInspectionStatus: "目前狀態",
      plannedInspection: "計畫中",
      coveredDevices: "覆蓋設備",
      enabledInspectionPlans: "啟用計畫",
      noInspectionRecord: "暫無巡檢記錄",
      noActiveInspection: "暫無啟用計畫",
      viewInspectionPlans: "查看巡檢計畫",
      recentOrders: "最近工單",
      deviceCount: "設備數量",
      activeInspection: "啟用巡檢",
      recentInspection: "巡檢工單",
      loadingInsight: "正在載入客戶資產與巡檢狀態…",
      noDevices: "暫無設備檔案",
      noInspection: "暫無巡檢計畫",
      noRecentOrders: "暫無最近工單",
      nextRun: "下次生成",
      targetEngineer: "巡檢人",
      inspectionDevices: "巡檢設備",
      orderDevice: "設備",
    },
    errors: {
      loadFailed: "載入失敗",
      createFailed: "新增失敗",
      deleteFailed: "刪除失敗",
      bulkDeleteFailed: "批量刪除失敗",
      mergeFailed: "合併失敗",
      nameRequired: "請輸入客戶名稱",
      geoSearchFailed: "搜尋失敗",
    },
    levels: {
      key: "重點客戶",
      normal: "普通客戶",
      potential: "潛在客戶",
      vip: "VIP 客戶",
    },
    geo: {
      hasCoordinate: "已有座標：{lat}, {lng}",
      noCoordinate: "未填寫座標，可透過下方搜尋或定位補全",
      foundCandidates: "找到 {count} 個候選，點擊可帶入客戶資訊",
      noCandidates: "未找到候選，可手動填寫或更換關鍵字",
      searching: "正在搜尋\"{keyword}\"…",
      selected: "已選：{name}（來源：{source}）",
      sourceCustomer: "系統客戶",
      sourceMap: "地圖",
      locateFallback: "無法取得定位，先按關鍵字搜尋",
      locating: "正在取得定位並查找附近公司…",
      addressRequired: "請先填寫詳細地址",
      addressSearching: "正在按地址查找座標：{keyword}",
      addressLocated: "已根據地址補全座標：{lat}, {lng}",
      addressLocateFailed: "未能解析該地址座標，請補充省市區或更詳細門牌號",
      searchCompanyKeyword: "公司",
    },
    misc: {
      unknown: "-",
    },
  },
} as const;

const LEVEL_VARIANT: Record<string, "default" | "secondary" | "purple" | "warning" | "info" | "success"> = {
  key: "purple",
  vip: "warning",
  normal: "success",
  potential: "info",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  pending_confirmation: "待确认",
  assigned: "已派发",
  in_progress: "进行中",
  submitted: "已结案",
  approved: "已审核",
  archived: "已归档",
  cancelled: "已作废",
  completed: "已完成",
  rejected: "已退回",
};

const ORDER_STATUS_VARIANT: Record<string, "default" | "draft" | "secondary" | "purple" | "warning" | "info" | "success" | "destructive" | "outline"> = {
  pending_confirmation: "warning",
  assigned: "info",
  draft: "draft",
  in_progress: "purple",
  submitted: "success",
  approved: "success",
  archived: "secondary",
  cancelled: "destructive",
};

const CADENCE_LABELS: Record<string, string> = {
  monthly: "每月",
  bimonthly: "每两月",
  "bi-monthly": "每两月",
  quarterly: "每季度",
  weekly: "每周",
};

const CUSTOMER_DELETE_ROLES = new Set([
  "admin",
  "assistant",
  "dispatcher",
  "operations_director",
  "engineering_supervisor",
  "sales_supervisor",
  "sales",
]);
const CUSTOMER_FORCE_DELETE_ROLES = new Set([
  "admin",
  "dispatcher",
  "operations_director",
  "engineering_supervisor",
  "sales_supervisor",
  "sales",
]);
const CUSTOMER_MERGE_ROLES = new Set([
  "admin",
  "assistant",
  "dispatcher",
  "operations_director",
  "sales_supervisor",
  "sales",
]);

function levelOf(c: Customer): string {
  return c.level || "normal";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

function telHref(value?: string) {
  const normalized = String(value || "").trim().replace(/[\s()-]/g, "");
  return normalized ? `tel:${normalized}` : "";
}

function normalizeCoordinate(value?: number | string | null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function candidateCoordinates(candidate: GeoCandidate) {
  const directLatitude = normalizeCoordinate(candidate.latitude);
  const directLongitude = normalizeCoordinate(candidate.longitude);
  if (directLatitude != null && directLongitude != null) {
    return { latitude: directLatitude, longitude: directLongitude };
  }

  const [longitudeText, latitudeText] = String(candidate.location || "").split(",");
  const latitude = normalizeCoordinate(latitudeText);
  const longitude = normalizeCoordinate(longitudeText);
  return latitude != null && longitude != null ? { latitude, longitude } : null;
}

function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

function orderStatus(order: CustomerOrder) {
  return order.workflowStatus || order.status || "";
}

function orderStatusLabel(order: CustomerOrder) {
  const status = orderStatus(order);
  return order.displayStatus || ORDER_STATUS_LABELS[status] || status || "-";
}

export function Customers() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = I18N[lang];
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("keyword") || searchParams.get("city") || "");
  const [levelFilter, setLevelFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [detailTarget, setDetailTarget] = useState<Customer | null>(null);
  const [detailInsight, setDetailInsight] = useState<CustomerInsight | null>(null);
  const [detailInsightLoading, setDetailInsightLoading] = useState(false);
  const [detailInsightError, setDetailInsightError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);

  const [candidates, setCandidates] = useState<GeoCandidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [locationHint, setLocationHint] = useState("");
  const [locating, setLocating] = useState(false);
  const [addressLocating, setAddressLocating] = useState(false);
  const customerCandidateRef = useRef<HTMLDivElement | null>(null);
  const userRole = String(user?.role || "");
  const canManageCustomer = CUSTOMER_DELETE_ROLES.has(userRole);
  const canDeleteCustomer = canManageCustomer;
  const canForceDeleteCustomer = CUSTOMER_FORCE_DELETE_ROLES.has(userRole);
  const canMergeCustomer = CUSTOMER_MERGE_ROLES.has(userRole);
  const currentSalespersonName = String(user?.realName || user?.real_name || user?.name || user?.username || "").trim();

  const primaryContact = form.contacts[0] || { name: "", phone: "" };
  const salespersonOptions = useMemo(() => {
    const options = userRole === "sales"
      ? [currentSalespersonName].filter(Boolean)
      : salespeople
          .map((user) => (user.realName || user.username || "").trim())
          .filter(Boolean);
    if (form.salesperson.trim() && !options.includes(form.salesperson.trim())) {
      options.unshift(form.salesperson.trim());
    }
    return options;
  }, [currentSalespersonName, form.salesperson, salespeople, userRole]);

  async function load(keyword = searchQuery) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        pageSize: "200",
        sortBy: "name",
        sortDir: "asc",
      });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      const data = await api.get(`/customers?${params.toString()}`);
      setCustomers((data?.items || []) as Customer[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.loadFailed;
      setError(msg);
    } finally {
      setLoadedOnce(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    api.get("/users/salespeople")
      .then((data) => setSalespeople((data?.items || []) as SalespersonOption[]))
      .catch(() => setSalespeople([]));
  }, []);

  useEffect(() => {
    const keyword = searchParams.get("keyword") || searchParams.get("city") || "";
    setSearchQuery(keyword);
  }, [searchParams]);

  useEffect(() => {
    if (!dialogOpen || !showCandidates) return undefined;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (customerCandidateRef.current?.contains(target)) return;
      setShowCandidates(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [dialogOpen, showCandidates]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      load(searchQuery);
    }, searchQuery.trim() ? 250 : 0);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, t.errors.loadFailed]);

  useEffect(() => {
    if (!detailTarget?.id) {
      setDetailInsight(null);
      setDetailInsightError("");
      setDetailInsightLoading(false);
      return;
    }

    let cancelled = false;
    const customerId = detailTarget.id;
    async function loadDetailInsight() {
      setDetailInsightLoading(true);
      setDetailInsightError("");
      try {
        const [deviceData, scheduleData, orderData] = await Promise.all([
          api.get(`/customers/${customerId}/devices`),
          api.get(`/inspection-schedules?customerId=${customerId}&pageSize=100`),
          api.get(`/service-orders?customerId=${customerId}&pageSize=20&sortBy=createdAt&sortDir=desc`),
        ]);
        if (cancelled) return;
        setDetailInsight({
          devices: (deviceData?.items || []) as CustomerDevice[],
          schedules: (scheduleData?.items || []) as CustomerSchedule[],
          orders: (orderData?.items || []) as CustomerOrder[],
        });
      } catch (e) {
        if (cancelled) return;
        setDetailInsight(null);
        setDetailInsightError(e instanceof Error ? e.message : t.errors.loadFailed);
      } finally {
        if (!cancelled) setDetailInsightLoading(false);
      }
    }

    loadDetailInsight();
    return () => {
      cancelled = true;
    };
  }, [detailTarget?.id, t.errors.loadFailed]);

  const filtered = useMemo(
    () => (levelFilter === "all" ? customers : customers.filter((customer) => levelOf(customer) === levelFilter)),
    [customers, levelFilter],
  );

  const allFilteredCustomersSelected = canDeleteCustomer
    && filtered.length > 0
    && filtered.every((customer) => selectedCustomerIds.includes(String(customer.id)));

  const selectedCustomers = useMemo(
    () => selectedCustomerIds
      .map((id) => customers.find((customer) => String(customer.id) === id))
      .filter((customer): customer is Customer => Boolean(customer)),
    [customers, selectedCustomerIds],
  );

  const mergeTarget = selectedCustomers.find((customer) => String(customer.id) === mergeTargetId) || null;
  const mergeSource = mergeTarget
    ? selectedCustomers.find((customer) => String(customer.id) !== String(mergeTarget.id)) || null
    : null;

  function hasContactRename() {
    if (editingId == null) return false;
    const editingCustomer = customers.find((customer) => String(customer.id) === String(editingId));
    if (!editingCustomer) return false;
    const originalContacts = editingCustomer.contacts?.length
      ? editingCustomer.contacts
      : [{ name: editingCustomer.contactName || "", phone: editingCustomer.contactPhone || editingCustomer.phone || "" }];
    const originalById = new Map(
      originalContacts
        .filter((contact) => contact.id != null)
        .map((contact) => [String(contact.id), String(contact.name || "").trim()]),
    );

    return form.contacts.some((contact, index) => {
      const nextName = contact.name.trim();
      if (!nextName) return false;
      if (contact.id != null) {
        const previousName = originalById.get(String(contact.id));
        return previousName != null && previousName !== nextName;
      }
      const previous = originalContacts[index];
      return previous?.id == null && String(previous?.name || "").trim() !== nextName;
    });
  }

  function renderPhoneLink(phone?: string, stopPropagation = false) {
    const href = telHref(phone);
    if (!href) return t.misc.unknown;
    return (
      <a
        className="text-primary hover:underline"
        href={href}
        onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
      >
        {phone}
      </a>
    );
  }

  useEffect(() => {
    if (!canDeleteCustomer) {
      setSelectedCustomerIds([]);
      return;
    }
    const visibleIds = new Set(filtered.map((customer) => String(customer.id)));
    setSelectedCustomerIds((ids) => {
      const next = ids.filter((id) => visibleIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [filtered, canDeleteCustomer]);

  const stats = useMemo(() => {
    const total = customers.length;
    const key = customers.filter((c) => levelOf(c) === "key" || levelOf(c) === "vip").length;
    const serviceCount = customers.reduce((sum, c) => sum + Number(c.serviceOrderCount || 0), 0);
    return [
      { label: t.stats.total, value: total },
      { label: t.stats.key, value: key },
      { label: t.stats.serviceCount, value: serviceCount },
    ];
  }, [customers, t.stats]);
  const initialLoading = loading && !loadedOnce;
  const refreshing = loading && loadedOnce;

  const levelFilterLabel = levelFilter === "all"
    ? ""
    : t.levels[levelFilter as keyof typeof t.levels] || levelFilter;

  function toggleLevelFilter(level: string) {
    setLevelFilter((current) => (current === level ? "all" : level));
  }

  function toggleCustomerSelection(customerId: string | number, checked: boolean | "indeterminate") {
    const id = String(customerId);
    setSelectedCustomerIds((ids) => {
      if (checked === true) return ids.includes(id) ? ids : [...ids, id];
      return ids.filter((item) => item !== id);
    });
  }

  function toggleAllFilteredCustomers(checked: boolean | "indeterminate") {
    const ids = filtered.map((customer) => String(customer.id));
    setSelectedCustomerIds((current) => {
      if (checked === true) return Array.from(new Set([...current, ...ids]));
      const visible = new Set(ids);
      return current.filter((id) => !visible.has(id));
    });
  }

  function openCreate() {
    setSuccessMessage("");
    setDeleteError("");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCandidates([]);
    setShowCandidates(false);
    setLocationHint("");
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setSuccessMessage("");
    setDeleteError("");
    const latitude = normalizeCoordinate(c.latitude)
    const longitude = normalizeCoordinate(c.longitude)
    const contacts = c.contacts?.length
      ? c.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name || "",
          phone: contact.phone || "",
        }))
      : [{ name: c.contactName || "", phone: c.contactPhone || c.phone || "" }]
    setEditingId(c.id);
    setForm({
      id: c.id,
      name: c.name || "",
      code: c.code || "",
      salesperson: c.salesperson || "",
      address: c.address || "",
      level: c.level || "normal",
      latitude,
      longitude,
      mapProvider: c.mapProvider || "",
      mapPoiId: c.mapPoiId || "",
      mapPoiName: c.mapPoiName || "",
      mapAddress: c.mapAddress || "",
      contacts,
    });
    setCandidates([]);
    setShowCandidates(false);
    setLocationHint(
      latitude != null && longitude != null
        ? interpolate(t.geo.hasCoordinate, { lat: latitude.toFixed(5), lng: longitude.toFixed(5) })
        : t.geo.noCoordinate,
    );
    setDialogOpen(true);
  }

  function clearMapSelection() {
    setForm((prev) => ({
      ...prev,
      latitude: null,
      longitude: null,
      mapProvider: "",
      mapPoiId: "",
      mapPoiName: "",
      mapAddress: "",
    }));
    setCandidates([]);
    setShowCandidates(false);
    setLocationHint(t.geo.noCoordinate);
  }

  function updateCustomerName(value: string) {
    setForm((prev) => ({
      ...prev,
      name: value,
      mapPoiId: "",
      mapPoiName: "",
    }));
    setCandidates([]);
    setShowCandidates(false);
    setLocationHint(value.trim() ? t.geo.noCoordinate : "");
  }

  function updateCustomerAddress(value: string) {
    setForm((prev) => ({
      ...prev,
      address: value,
      latitude: null,
      longitude: null,
      mapProvider: "",
      mapPoiId: "",
      mapPoiName: "",
      mapAddress: value,
    }));
    setCandidates([]);
    setShowCandidates(false);
    setLocationHint(value.trim() ? t.geo.noCoordinate : "");
  }

  async function searchGeo(
    coords: { latitude?: number; longitude?: number } = {},
    options: { keyword?: string; nearbyOnly?: boolean } = {},
  ) {
    const params = new URLSearchParams();
    const keyword = (options.keyword ?? form.name ?? "").trim();
    if (keyword) params.set("keyword", keyword);
    if (coords.latitude && coords.longitude) {
      params.set("latitude", String(coords.latitude));
      params.set("longitude", String(coords.longitude));
    }
    setGeoLoading(true);
    try {
      const data = await api.get(`/geo/companies?${params.toString()}`);
      let items: GeoCandidate[] = (data?.items || []) as GeoCandidate[];
      if (options.nearbyOnly) items = items.filter((it) => it.source !== "customer");
      setCandidates(items);
      setShowCandidates(true);
      setLocationHint(
        items.length
          ? interpolate(t.geo.foundCandidates, { count: items.length })
          : t.geo.noCandidates,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.geoSearchFailed;
      setLocationHint(msg);
      setCandidates([]);
    } finally {
      setGeoLoading(false);
    }
  }

  function applyCandidate(company: GeoCandidate) {
    const coordinates = candidateCoordinates(company);
    setForm((prev) => {
      const currentContacts = prev.contacts.length ? [...prev.contacts] : [{ name: "", phone: "" }]
      if (company.contactName || company.contactPhone) {
        currentContacts[0] = {
          ...currentContacts[0],
          name: company.contactName || currentContacts[0].name,
          phone: company.contactPhone || currentContacts[0].phone,
        }
      }

      return {
        ...prev,
        name: company.name || prev.name,
        address: company.address || prev.address,
        mapAddress: company.mapAddress || company.address || prev.mapAddress,
        latitude: coordinates?.latitude ?? prev.latitude ?? null,
        longitude: coordinates?.longitude ?? prev.longitude ?? null,
        mapProvider:
          company.mapProvider || (company.source === "map" ? "amap" : prev.mapProvider || ""),
        mapPoiId: company.mapPoiId || (company.source === "map" ? company.id : prev.mapPoiId || ""),
        mapPoiName: company.mapPoiName || company.name || prev.mapPoiName,
        contacts: currentContacts,
      };
    });
    setLocationHint(interpolate(t.geo.selected, {
      name: company.name,
      source: company.source === "customer" ? t.geo.sourceCustomer : t.geo.sourceMap,
    }));
    setShowCandidates(false);
  }

  function locateByAddress() {
    const keyword = form.address.trim();
    if (!keyword) {
      setLocationHint(t.geo.addressRequired);
      return;
    }
    setAddressLocating(true);
    setCandidates([]);
    setShowCandidates(false);
    setLocationHint(interpolate(t.geo.addressSearching, { keyword }));
    api.get(`/geo/geocode?address=${encodeURIComponent(keyword)}`)
      .then((data) => {
        const item = data?.item;
        if (!item?.latitude || !item?.longitude) {
          setLocationHint(t.geo.addressLocateFailed);
          return;
        }
        setForm((prev) => ({
          ...prev,
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          mapProvider: item.mapProvider || "amap",
          mapPoiId: item.mapPoiId || "",
          mapPoiName: item.mapPoiName || item.mapAddress || prev.address,
          mapAddress: item.mapAddress || prev.address,
        }));
        setLocationHint(interpolate(t.geo.addressLocated, {
          lat: Number(item.latitude).toFixed(5),
          lng: Number(item.longitude).toFixed(5),
        }));
      })
      .catch((e) => {
        setLocationHint(e instanceof Error ? e.message : t.errors.geoSearchFailed);
      })
      .finally(() => setAddressLocating(false));
  }

  function locateNearMe() {
    if (locating) return;
    setLocating(true);
    const keyword = form.name.trim();
    if (keyword) {
      setLocationHint(interpolate(t.geo.searching, { keyword }));
      searchGeo()
        .catch(() => undefined)
        .finally(() => setLocating(false));
      return;
    }
    const fallback = () => {
      setLocationHint(t.geo.locateFallback);
      searchGeo({}, { keyword: t.geo.searchCompanyKeyword }).catch(() => undefined);
    };
    if (!navigator.geolocation) {
      fallback();
      setLocating(false);
      return;
    }
    setLocationHint(t.geo.locating);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        searchGeo(
          { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
          { keyword: "", nearbyOnly: true },
        )
          .catch(() => undefined)
          .finally(() => setLocating(false));
      },
      () => {
        fallback();
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    );
  }

  function updateContact(index: number, field: "name" | "phone", value: string) {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact, contactIndex) => (
        contactIndex === index ? { ...contact, [field]: value } : contact
      )),
    }));
  }

  function addContact() {
    setForm((prev) => ({
      ...prev,
      contacts: [...prev.contacts, { name: "", phone: "" }],
    }));
  }

  function removeContact(index: number) {
    setForm((prev) => {
      const nextContacts = prev.contacts.filter((_, contactIndex) => contactIndex !== index)
      return {
        ...prev,
        contacts: nextContacts.length ? nextContacts : [{ name: "", phone: "" }],
      };
    });
  }

  function openDelete(c: Customer) {
    setError("");
    setSuccessMessage("");
    setDeleteError("");
    setDeleteTarget(c);
  }

  function openMergeDialog() {
    setError("");
    setSuccessMessage("");
    setMergeError("");
    if (selectedCustomers.length !== 2) {
      setError(t.dialog.mergeNeedTwo);
      return;
    }
    const defaultTarget = [...selectedCustomers].sort((left, right) => (
      String(right.name || "").length - String(left.name || "").length
    ))[0] || selectedCustomers[0];
    setMergeTargetId(String(defaultTarget.id));
    setMergeDialogOpen(true);
  }

  function closeMergeDialog() {
    if (merging) return;
    setMergeDialogOpen(false);
    setMergeError("");
  }

  async function confirmMerge() {
    if (!mergeTarget || !mergeSource) return;
    const targetName = mergeTarget.name || `客户 #${mergeTarget.id}`;
    const sourceName = mergeSource.name || `客户 #${mergeSource.id}`;
    setMerging(true);
    setError("");
    setSuccessMessage("");
    setMergeError("");
    try {
      await api.post(`/customers/${mergeTarget.id}/merge`, { sourceCustomerId: mergeSource.id });
      setMergeDialogOpen(false);
      setSelectedCustomerIds([]);
      if (
        detailTarget
        && (String(detailTarget.id) === String(mergeSource.id) || String(detailTarget.id) === String(mergeTarget.id))
      ) {
        setDetailTarget(null);
      }
      await load();
      setSuccessMessage(interpolate(t.dialog.mergeSuccess, { source: sourceName, target: targetName }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.mergeFailed;
      setMergeError(msg);
      setError(msg);
    } finally {
      setMerging(false);
    }
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteError("");
    setDeleteTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const customerName = deleteTarget.name || t.misc.unknown;
    setDeleting(true);
    setError("");
    setSuccessMessage("");
    setDeleteError("");
    try {
      const data = await api.delete(`/customers/${deleteTarget.id}${canForceDeleteCustomer ? "?force=1" : ""}`);
      setDeleteTarget(null);
      await load();
      const message = data?.forced
        ? interpolate(t.dialog.deleteForceSuccess, {
            name: customerName,
            deviceCount: Number(data.deviceCount || 0),
            serviceOrderCount: Number(data.serviceOrderCount || 0),
          })
        : interpolate(t.dialog.deleteSuccess, { name: customerName });
      setSuccessMessage(message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.deleteFailed;
      setDeleteError(msg);
      setError(msg);
    } finally {
      setDeleting(false);
    }
  }

  async function confirmBulkDelete() {
    if (!selectedCustomerIds.length || !canDeleteCustomer) return;
    const confirmMessage = interpolate(
      canForceDeleteCustomer ? t.dialog.bulkDeleteConfirm : t.dialog.bulkDeleteSafeConfirm,
      { count: selectedCustomerIds.length },
    );
    if (!window.confirm(confirmMessage)) return;
    setDeleting(true);
    setError("");
    setSuccessMessage("");
    setDeleteError("");
    try {
      let deletedCount = 0;
      let deviceCount = 0;
      let serviceOrderCount = 0;
      for (const id of selectedCustomerIds) {
        const data = await api.delete(`/customers/${id}${canForceDeleteCustomer ? "?force=1" : ""}`);
        deletedCount += 1;
        deviceCount += Number(data?.deviceCount || 0);
        serviceOrderCount += Number(data?.serviceOrderCount || 0);
      }
      if (detailTarget && selectedCustomerIds.includes(String(detailTarget.id))) setDetailTarget(null);
      setSelectedCustomerIds([]);
      await load();
      setSuccessMessage(canForceDeleteCustomer
        ? interpolate(t.dialog.bulkDeleteSuccess, {
            count: deletedCount,
            deviceCount,
            serviceOrderCount,
          })
        : interpolate(t.dialog.bulkDeleteSafeSuccess, { count: deletedCount }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.bulkDeleteFailed;
      setDeleteError(msg);
      setError(msg);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  async function submit() {
    if (!form.name.trim()) {
      setError(t.errors.nameRequired);
      return;
    }
    if (hasContactRename()) {
      const editingCustomer = customers.find((customer) => String(customer.id) === String(editingId));
      const count = Number(editingCustomer?.serviceOrderCount || 0);
      const confirmMessage = interpolate(t.dialog.contactRenameConfirm, { count });
      if (!window.confirm(confirmMessage)) return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        salesperson: form.salesperson.trim() || undefined,
        contactName: primaryContact.name.trim() || undefined,
        contactPhone: primaryContact.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        latitude: form.latitude,
        longitude: form.longitude,
        mapProvider: form.mapProvider || null,
        mapPoiId: form.mapPoiId || null,
        mapPoiName: form.mapPoiName || null,
        mapAddress: form.mapAddress || null,
        level: form.level,
        contacts: form.contacts
          .map((contact) => ({
            ...(contact.id ? { id: contact.id } : {}),
            name: contact.name.trim(),
            phone: contact.phone.trim() || undefined,
          }))
          .filter((contact) => contact.name),
      };
      if (editingId != null) {
        await api.put(`/customers/${editingId}`, payload);
      } else {
        await api.post("/customers", payload);
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.createFailed;
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => load(searchQuery)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t.actions.refresh}
          </Button>
          {canManageCustomer ? (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              {t.actions.create}
            </Button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => load(searchQuery)}>{t.actions.retry}</Button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>{successMessage}</span>
        </div>
      )}

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
        <CardHeader className="pb-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <CardTitle>{t.list.title}</CardTitle>
                {refreshing ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t.list.loading}
                  </span>
                ) : null}
              </div>
              {levelFilterLabel ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setLevelFilter("all")}
                >
                  {levelFilterLabel}
                  <span className="text-muted-foreground">×</span>
                </Button>
              ) : null}
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t.list.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(searchQuery);
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {canDeleteCustomer ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-slate-50/70 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={allFilteredCustomersSelected}
                  onCheckedChange={toggleAllFilteredCustomers}
                  disabled={deleting || filtered.length === 0}
                  aria-label={t.list.selectAllCurrent}
                />
                {t.list.selectAllCurrent}
              </label>
              <div className="flex flex-wrap items-center gap-2">
	                {selectedCustomerIds.length ? (
	                  <Button variant="ghost" size="sm" onClick={() => setSelectedCustomerIds([])} disabled={deleting || merging}>
	                    {t.actions.clearSelection}
	                  </Button>
	                ) : null}
	                {canMergeCustomer ? (
	                  <Button
	                    variant="outline"
	                    size="sm"
	                    onClick={openMergeDialog}
	                    disabled={deleting || merging || selectedCustomerIds.length !== 2}
	                  >
	                    {merging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-2" />}
	                    {merging ? t.actions.merging : `${t.actions.merge}${selectedCustomerIds.length ? ` (${selectedCustomerIds.length})` : ""}`}
	                  </Button>
	                ) : null}
	                <Button
	                  variant="ghost"
	                  className="text-red-600 hover:text-red-700"
	                  onClick={confirmBulkDelete}
	                  disabled={deleting || merging || !selectedCustomerIds.length}
	                >
                  {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  {deleting ? t.actions.deleting : `${t.actions.batchDelete}${selectedCustomerIds.length ? ` (${selectedCustomerIds.length})` : ""}`}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-y-auto pr-1">
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  {canDeleteCustomer ? <TableHead className="w-10" /> : null}
                  <TableHead>{t.list.name}</TableHead>
                  <TableHead>{t.list.contact}</TableHead>
                  <TableHead>{t.list.phone}</TableHead>
                  <TableHead>{t.list.level}</TableHead>
                  <TableHead>{t.list.address}</TableHead>
                  <TableHead className="w-[160px] text-right">{t.list.action}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialLoading ? (
                  <TableRow>
                    <TableCell colSpan={canDeleteCustomer ? 7 : 6} className="text-center py-10 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> {t.list.loading}
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canDeleteCustomer ? 7 : 6} className="text-center py-10 text-muted-foreground">
                      {t.list.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c) => {
                    const lv = levelOf(c);
                    const lvLabel = t.levels[lv as keyof typeof t.levels] || t.levels.normal;
                    const selected = selectedCustomerIds.includes(String(c.id));
                    return (
                      <TableRow
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer"
                        onClick={() => setDetailTarget(c)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setDetailTarget(c);
                          }
                        }}
                      >
                        {canDeleteCustomer ? (
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => toggleCustomerSelection(c.id, checked)}
                              disabled={deleting}
                              aria-label={`选择客户 ${c.name || c.id}`}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <div className="font-medium">{c.name || t.misc.unknown}</div>
                          {c.salesperson && (
                            <div className="text-xs text-muted-foreground">{t.list.salesperson}：{c.salesperson}</div>
                          )}
                          {c.latitude && c.longitude ? (
                            <div className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {Number(c.latitude).toFixed(4)}, {Number(c.longitude).toFixed(4)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{c.contactName || t.misc.unknown}</TableCell>
                        <TableCell>{renderPhoneLink(c.contactPhone || c.phone, true)}</TableCell>
                        <TableCell>
                          <Badge
                            role="button"
                            tabIndex={0}
                            variant={LEVEL_VARIANT[lv] || "secondary"}
                            className={`cursor-pointer ${levelFilter === lv ? "ring-2 ring-primary/30" : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleLevelFilter(lv);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleLevelFilter(lv);
                              }
                            }}
                          >
                            {lvLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[300px] truncate">
                          {c.address || t.misc.unknown}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canManageCustomer ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEdit(c);
                                }}
                              >
                                <Pencil className="w-4 h-4 mr-1" />
                                {t.actions.edit}
                              </Button>
                            ) : null}
                            {canDeleteCustomer ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDelete(c);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                                {t.actions.delete}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={mergeDialogOpen} onOpenChange={(open) => { if (!open) closeMergeDialog(); }}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>{t.dialog.mergeTitle}</DialogTitle>
            <DialogDescription>{t.dialog.mergeDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {mergeError ? (
              <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                {mergeError}
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {selectedCustomers.map((customer) => {
                const selected = String(customer.id) === mergeTargetId;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-primary/50 hover:bg-accent/30"
                    }`}
                    onClick={() => setMergeTargetId(String(customer.id))}
                    disabled={merging}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{customer.name || t.misc.unknown}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{customer.code || `客户 #${customer.id}`}</div>
                      </div>
                      {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                      <div>{t.list.salesperson}：{customer.salesperson || t.misc.unknown}</div>
                      <div>{t.dialog.serviceOrderCount}：{Number(customer.serviceOrderCount || 0)}</div>
                      <div className="truncate">{t.list.address}：{customer.address || t.misc.unknown}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {mergeTarget && mergeSource ? (
              <div className="rounded-lg border bg-slate-50/80 p-4 text-sm">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{t.dialog.mergeSourceCustomer}</div>
                    <div className="mt-1 truncate font-semibold text-slate-900">{mergeSource.name || t.misc.unknown}</div>
                  </div>
                  <ArrowRightLeft className="hidden h-4 w-4 text-muted-foreground md:block" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{t.dialog.mergeKeepCustomer}</div>
                    <div className="mt-1 truncate font-semibold text-slate-900">{mergeTarget.name || t.misc.unknown}</div>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex items-start gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t.dialog.mergeWarning}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeMergeDialog} disabled={merging}>
              {t.actions.cancel}
            </Button>
            <Button onClick={confirmMerge} disabled={merging || !mergeTarget || !mergeSource}>
              {merging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
              {merging ? t.actions.merging : t.dialog.mergeConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailTarget)} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-[960px] lg:max-w-[1000px]">
          <DialogHeader className="px-6 pt-6 pr-12">
            <DialogTitle>{t.dialog.detailTitle}</DialogTitle>
            <DialogDescription>{t.dialog.detailDescription}</DialogDescription>
          </DialogHeader>
          {detailTarget ? (() => {
            const lv = levelOf(detailTarget);
            const lvLabel = t.levels[lv as keyof typeof t.levels] || t.levels.normal;
            const contacts = detailTarget.contacts?.length
              ? detailTarget.contacts
              : [{ name: detailTarget.contactName || "", phone: detailTarget.contactPhone || detailTarget.phone || "" }]
            const devices = detailInsight?.devices || [];
            const schedules = detailInsight?.schedules || [];
            const orders = detailInsight?.orders || [];
            const activeSchedules = schedules.filter((schedule) => schedule.active);
            const inspectionOrders = orders.filter((order) => order.inspectionScheduleId);
            const nextSchedule = activeSchedules
              .filter((schedule) => schedule.nextRunAnchor)
              .sort((a, b) => new Date(a.nextRunAnchor || "").getTime() - new Date(b.nextRunAnchor || "").getTime())[0] || activeSchedules[0];
            const latestInspectionOrder = inspectionOrders[0];
            const activeDeviceNames = activeSchedules.flatMap((schedule) => schedule.deviceNames || []);
            const coveredDeviceCount = new Set(activeDeviceNames.filter(Boolean).map((name) => String(name))).size;
            const inspectionOverallLabel = activeSchedules.length
              ? t.dialog.inspectionIncluded
              : schedules.length
                ? t.dialog.inspectionDisabled
                : t.dialog.inspectionNotIncluded;
            const inspectionOverallVariant: "success" | "warning" | "secondary" = activeSchedules.length
              ? "success"
              : schedules.length
                ? "warning"
                : "secondary";
            const currentInspectionStatus = latestInspectionOrder
              ? orderStatusLabel(latestInspectionOrder)
              : activeSchedules.length
                ? t.dialog.plannedInspection
                : t.dialog.noActiveInspection;
            const currentInspectionVariant = latestInspectionOrder
              ? ORDER_STATUS_VARIANT[orderStatus(latestInspectionOrder)] || "secondary"
              : activeSchedules.length
                ? "info"
                : "secondary";
            const inspectionPlanHref = `/inspection-schedules?customerId=${encodeURIComponent(String(detailTarget.id))}&keyword=${encodeURIComponent(detailTarget.name || "")}`;
            const serviceOrderHref = (order: CustomerOrder) => {
              const params = new URLSearchParams({
                customerId: String(detailTarget.id),
                orderId: String(order.id),
              });
              if (order.orderNo) params.set("keyword", order.orderNo);
              return `/service-orders?${params.toString()}`;
            };
            return (
              <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-6 pb-2">
                <div className="space-y-5 py-2">
                  <div className="rounded-lg border bg-slate-50/60 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold leading-7 text-slate-900">{detailTarget.name || t.misc.unknown}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{detailTarget.code || t.misc.unknown}</div>
                      </div>
                      <Badge variant={LEVEL_VARIANT[lv] || "secondary"} className="w-fit">{lvLabel}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.list.salesperson}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.salesperson || t.misc.unknown}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.serviceOrderCount}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{Number(detailTarget.serviceOrderCount || 0)}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.deviceCount}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {detailInsightLoading ? <Loader2 className="inline-block h-3.5 w-3.5 animate-spin" /> : devices.length}
                        </div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.activeInspection}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {detailInsightLoading ? <Loader2 className="inline-block h-3.5 w-3.5 animate-spin" /> : activeSchedules.length}
                        </div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.updatedAt}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{formatDate(detailTarget.updatedAt || detailTarget.createdAt)}</div>
                      </div>
                    </div>
                  </div>

                  {detailInsightLoading ? (
                    <div className="rounded-lg border bg-slate-50 p-3 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
                      {t.dialog.loadingInsight}
                    </div>
                  ) : null}

                  {detailInsightError ? (
                    <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                      {detailInsightError}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-lg border p-4">
                          <div className="text-sm font-medium">{t.dialog.contacts}</div>
                          <div className="mt-3 space-y-2">
                            {contacts.some((contact) => contact.name || contact.phone) ? contacts.map((contact, index) => (
                              <div key={contact.id ?? `detail-contact-${index}`} className="rounded-md bg-slate-50 px-3 py-2">
                                <div className="text-sm font-medium">{contact.name || t.misc.unknown}</div>
                                <div className="text-xs text-muted-foreground">{renderPhoneLink(contact.phone)}</div>
                              </div>
                            )) : (
                              <div className="text-sm text-muted-foreground">{t.dialog.noContacts}</div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="text-sm font-medium">{t.dialog.address}</div>
                          <div className="mt-3 text-sm leading-6 text-slate-700">{detailTarget.address || t.misc.unknown}</div>
                          <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                            {detailTarget.latitude != null && detailTarget.longitude != null ? (
                              <div className="flex items-start gap-2">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                <div className="min-w-0">
                                  <div className="break-words">{detailTarget.mapPoiName || t.dialog.selectedCoordinate}</div>
                                  <div className="mt-1 font-mono">
                                    {Number(detailTarget.latitude).toFixed(6)}, {Number(detailTarget.longitude).toFixed(6)}
                                  </div>
                                </div>
                              </div>
                            ) : t.dialog.noCoordinate}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                        <div className="rounded-lg border p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Server className="h-4 w-4 text-muted-foreground" />
                              {t.dialog.deviceList}
                            </div>
                            {devices.length ? <Badge variant="secondary">{devices.length}</Badge> : null}
                          </div>
                          <div className="mt-3 space-y-2">
                            {devices.length ? devices.slice(0, 8).map((device) => (
                              <div key={device.id} className="rounded-md bg-slate-50 px-3 py-2">
                                <div className="truncate text-sm font-medium">{customerDeviceLabel(device)}</div>
                                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {[device.model, device.serialNo].filter(Boolean).join(" · ") || t.misc.unknown}
                                </div>
                              </div>
                            )) : (
                              <div className="text-sm text-muted-foreground">{t.dialog.noDevices}</div>
                            )}
                            {devices.length > 8 ? (
                              <div className="text-xs text-muted-foreground">+{devices.length - 8}</div>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                              {t.dialog.inspectionStatus}
                            </div>
                            <Badge variant={inspectionOverallVariant}>{inspectionOverallLabel}</Badge>
                          </div>
                          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-md bg-slate-50 px-3 py-2.5">
                              <div className="text-xs text-muted-foreground">{t.dialog.lastInspection}</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {latestInspectionOrder ? formatDate(latestInspectionOrder.serviceAt || latestInspectionOrder.createdAt) : t.dialog.noInspectionRecord}
                              </div>
                              {latestInspectionOrder ? (
                                <Badge className="mt-2" variant={ORDER_STATUS_VARIANT[orderStatus(latestInspectionOrder)] || "secondary"}>
                                  {orderStatusLabel(latestInspectionOrder)}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="rounded-md bg-slate-50 px-3 py-2.5">
                              <div className="text-xs text-muted-foreground">{t.dialog.nextInspection}</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {nextSchedule ? formatDate(nextSchedule.nextRunAnchor) : t.dialog.noActiveInspection}
                              </div>
                              {nextSchedule ? (
                                <div className="mt-1 truncate text-xs text-muted-foreground">
                                  {[CADENCE_LABELS[nextSchedule.cadence || ""] || nextSchedule.cadence, nextSchedule.targetEngineerName].filter(Boolean).join(" · ") || t.misc.unknown}
                                </div>
                              ) : null}
                            </div>
                            <div className="rounded-md bg-slate-50 px-3 py-2.5">
                              <div className="text-xs text-muted-foreground">{t.dialog.currentInspectionStatus}</div>
                              <Badge className="mt-2" variant={currentInspectionVariant}>
                                {currentInspectionStatus}
                              </Badge>
                            </div>
                            <div className="rounded-md bg-slate-50 px-3 py-2.5">
                              <div className="text-xs text-muted-foreground">{t.dialog.coveredDevices}</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {devices.length ? `${coveredDeviceCount}/${devices.length} 台` : coveredDeviceCount ? `${coveredDeviceCount} 台` : t.misc.unknown}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {activeSchedules.length} / {schedules.length} {t.dialog.enabledInspectionPlans}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 flex justify-end">
                            <Button asChild variant="outline" size="sm">
                              <Link to={inspectionPlanHref}>
                                <ClipboardCheck className="h-4 w-4" />
                                {t.dialog.viewInspectionPlans}
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 rounded-lg border p-4 text-sm md:grid-cols-2">
                        <div>
                          <div className="text-xs text-muted-foreground">{t.dialog.createdAt}</div>
                          <div className="mt-1">{formatDate(detailTarget.createdAt)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">{t.dialog.updatedAt}</div>
                          <div className="mt-1">{formatDate(detailTarget.updatedAt)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 lg:sticky lg:top-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {t.dialog.recentOrders}
                        </div>
                        {orders.length ? <Badge variant="secondary">{orders.length}</Badge> : null}
                      </div>
                      <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
                        {orders.length ? orders.slice(0, 6).map((order) => {
                          const status = orderStatus(order);
                          return (
                            <Link
                              key={order.id}
                              to={serviceOrderHref(order)}
                              className="block rounded-md bg-slate-50 px-3 py-2.5 transition-colors hover:bg-slate-100 hover:ring-1 hover:ring-primary/20"
                            >
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                                <div className="break-all text-sm font-semibold leading-5 text-slate-900 hover:text-primary">{order.orderNo || `#${order.id}`}</div>
                                <Badge variant={ORDER_STATUS_VARIANT[status] || "secondary"}>
                                  {orderStatusLabel(order)}
                                </Badge>
                              </div>
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                <div>{t.dialog.orderDevice}：{order.deviceName || t.misc.unknown}</div>
                                <div>
                                  {formatDate(order.serviceAt || order.createdAt)}
                                  {order.inspectionScheduleId ? ` · ${t.dialog.recentInspection}` : ""}
                                </div>
                              </div>
                            </Link>
                          );
                        }) : (
                          <div className="text-sm text-muted-foreground">{t.dialog.noRecentOrders}</div>
                        )}
                        {inspectionOrders.length ? (
                          <div className="text-xs text-muted-foreground">
                            {t.dialog.recentInspection}：{inspectionOrders.map(orderStatusLabel).slice(0, 3).join("、")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })() : null}
          <DialogFooter className="flex-row justify-end border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              {t.actions.close}
            </Button>
            {detailTarget && canManageCustomer ? (
              <Button onClick={() => {
                const target = detailTarget;
                setDetailTarget(null);
                openEdit(target);
              }}>
                <Pencil className="w-4 h-4 mr-2" />
                {t.actions.edit}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId != null ? t.dialog.editTitle : t.dialog.title}</DialogTitle>
            <DialogDescription>
              {editingId != null ? t.dialog.editDescription : t.dialog.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div ref={customerCandidateRef} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cust-name">{t.dialog.name}</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="cust-name"
                      className="pl-9"
                      value={form.name}
                      onChange={(e) => updateCustomerName(e.target.value)}
                      placeholder={t.dialog.namePlaceholder}
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={locateNearMe}
                    disabled={locating}
                    className="w-full shrink-0 sm:w-auto"
                  >
                    {locating ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Crosshair className="w-4 h-4 mr-1" />
                    )}
                    {t.dialog.locate}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cust-address">{t.dialog.address}</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <Input
                      id="cust-address"
                      value={form.address}
                      onChange={(e) => updateCustomerAddress(e.target.value)}
                      placeholder={t.dialog.addressPlaceholder}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={locateByAddress}
                    disabled={addressLocating}
                    className="w-full shrink-0 sm:w-auto"
                  >
                    {addressLocating ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <MapPin className="w-4 h-4 mr-1" />
                    )}
                    {t.actions.locateAddress}
                  </Button>
                </div>
              </div>

              {showCandidates && candidates.length > 0 ? (
                <div className="border rounded-lg bg-white shadow-sm max-h-[200px] overflow-y-auto">
                  {candidates.map((c) => (
                    <button
                      type="button"
                      key={`${c.source}-${c.id}`}
                      onClick={() => applyCandidate(c)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0 flex items-start gap-2"
                    >
                      <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate flex items-center gap-2">
                          {c.name}
                          {c.source === "customer" ? (
                            <Badge variant="secondary" className="text-xs h-4 px-1">{t.dialog.badgeSystem}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs h-4 px-1">{t.dialog.badgeMap}</Badge>
                          )}
                        </div>
                        {c.address ? (
                          <div className="text-xs text-muted-foreground truncate">{c.address}</div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              {locationHint ? (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {geoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {locationHint}
                </div>
              ) : null}
              {form.latitude != null && form.longitude != null ? (
                <div className="rounded-lg border bg-slate-50/50 p-3 flex items-start gap-3">
                  <Check className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0 text-xs space-y-1">
                    <div className="font-medium text-slate-700">
                      {form.mapPoiName || t.dialog.selectedCoordinate}
                    </div>
                    <div className="text-muted-foreground">
                      {form.mapAddress || form.address}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {Number(form.latitude).toFixed(6)}, {Number(form.longitude).toFixed(6)}
                      {form.mapPoiId ? ` · POI ${form.mapPoiId}` : ""}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={clearMapSelection}
                  >
                    {t.actions.clear}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="cust-code">{t.dialog.code}</Label>
                <Input
                  id="cust-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder={t.dialog.codePlaceholder}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-salesperson">{t.dialog.salesperson}</Label>
                <Select
                  value={form.salesperson || "__none"}
                  onValueChange={(value) => setForm({ ...form, salesperson: value === "__none" ? "" : value })}
                >
                  <SelectTrigger id="cust-salesperson">
                    <SelectValue placeholder={t.dialog.salespersonPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t.dialog.salespersonPlaceholder}</SelectItem>
                  {salespersonOptions.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-level">{t.dialog.level}</Label>
                <Select value={form.level} onValueChange={(value) => setForm({ ...form, level: value })}>
                  <SelectTrigger id="cust-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">{t.levels.normal}</SelectItem>
                    <SelectItem value="key">{t.levels.key}</SelectItem>
                    <SelectItem value="vip">{t.levels.vip}</SelectItem>
                    <SelectItem value="potential">{t.levels.potential}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>{t.dialog.contacts}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addContact}>
                  <Plus className="w-4 h-4 mr-1" />
                  {t.actions.addContact}
                </Button>
              </div>
              <div className="space-y-3">
                {form.contacts.map((contact, index) => (
                  <div key={contact.id ?? `contact-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end rounded-lg border p-3">
                    <div className="space-y-2">
                      <Label>{t.dialog.contactName}</Label>
                      <Input
                        value={contact.name}
                        onChange={(e) => updateContact(index, "name", e.target.value)}
                        placeholder={t.dialog.contactPlaceholder}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.dialog.contactPhone}</Label>
                      <Input
                        value={contact.phone}
                        onChange={(e) => updateContact(index, "phone", e.target.value)}
                        placeholder={t.dialog.phonePlaceholder}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeContact(index)}
                      disabled={form.contacts.length === 1}
                    >
                      {t.actions.removeContact}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t.actions.cancel}
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? t.actions.saving : editingId != null ? t.actions.saveEdit : t.actions.saveNow}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) closeDelete(); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              {t.dialog.deleteTitle}
            </DialogTitle>
            <DialogDescription>{canForceDeleteCustomer ? t.dialog.deleteDescription : t.dialog.deleteSafeDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-700">
              {canForceDeleteCustomer ? t.dialog.deleteWarning : t.dialog.deleteSafeWarning}
            </div>
            <div className="rounded-lg border bg-slate-50 p-3 text-slate-700">
              <div className="font-medium text-slate-900">{deleteTarget?.name || t.misc.unknown}</div>
              <div className="mt-1 text-muted-foreground">
                {Number(deleteTarget?.serviceOrderCount || 0) > 0
                  ? interpolate(t.dialog.deleteServiceCount, { count: Number(deleteTarget?.serviceOrderCount || 0) })
                  : t.dialog.deleteNoServiceCount}
              </div>
            </div>
            {deleteError ? (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-600">
                {deleteError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDelete} disabled={deleting}>
              {t.actions.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting || !canDeleteCustomer}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleting ? t.actions.deleting : canForceDeleteCustomer ? t.actions.forceDelete : t.actions.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
