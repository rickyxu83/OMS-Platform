import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Search, Wrench, Trash2, Pencil, Check, RotateCcw, ShieldCheck, MoreHorizontal, X, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
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
import { ErrorToast } from "@/components/ErrorToast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { Skeleton } from "@/components/Skeleton";
import { matchesSearchText } from "@/lib/text-i18n";
import { useUrlParam } from "@/lib/use-url-param";
import { EmptyState } from "@/components/EmptyState";
import { ResponsiveCard, ResponsiveList } from "@/components/ResponsiveList";

interface Party {
  id: string | number;
  name?: string;
  phone?: string;
  contact?: string;
  contacts?: Array<{ name?: string; phone?: string }>;
  partyType?: string;
  officialWebsite?: string;
  remark?: string;
  updatedAt?: string;
  createdAt?: string;
  devices?: Array<{
    id: string | number;
    name?: string;
    model?: string;
    serialNo?: string;
    maintenanceType?: string;
    maintenanceEnd?: string;
    customerName?: string;
    inWarranty?: boolean;
  }>;
}

const I18N = {
  "zh-CN": {
    title: "维保方目录",
    subtitle: "管理原厂联系人和合作维保方",
    actions: {
      refresh: "刷新",
      create: "新增维保方",
      edit: "编辑",
      retry: "重试",
      reset: "重置",
      cancel: "取消",
      save: "保存维保方",
      saveEdit: "保存修改",
      saving: "保存中…",
      delete: "删除",
      batchDelete: "批量删除",
      clearSelection: "清空选择",
      close: "关闭",
      addContact: "新增联系人",
      removeContact: "删除联系人",
    },
    stats: {
      total: "维保方总数",
      vendor: "原厂联系人",
      partner: "合作维保方",
    },
    filters: {
      searchPlaceholder: "搜索名称、电话、官网地址…",
      typePlaceholder: "全部类型",
      all: "全部类型",
      vendor: "原厂联系人",
      partner: "合作维保方",
      activeHint: "已选筛选（点击取消）：",
    },
    list: {
      title: "维保方列表",
      loading: "正在加载…",
      empty: "暂无维保方资料",
      name: "名称",
      type: "类型",
      contacts: "联系人",
      phone: "电话",
      website: "官网",
      action: "操作",
      contactLine: "联系人：{contact} · 电话：{phone}",
      officialWebsite: "官网地址：{url}",
      selectAllCurrent: "全选当前列表",
      actionsMenu: "维保方操作",
    },
    dialog: {
      createTitle: "新增维保方",
      editTitle: "编辑维保方",
      detailTitle: "维保方详情",
      description: "填写维保方基础信息，提交后保存到系统",
      detailDescription: "维保方基础信息、联系人与官网地址",
      name: "维保方名称 *",
      namePlaceholder: "例如 Dell EMC 原厂技术支持",
      contact: "联系人",
      contacts: "联系人列表",
      contactPlaceholder: "联系人姓名",
      phone: "联系电话",
      phonePlaceholder: "支持数字、加号、括号、横线、空格，长度 7-32",
      type: "类型",
      typePlaceholder: "选择类型",
      officialWebsite: "官网地址",
      officialWebsitePlaceholder: "例如 https://www.example.com",
      remark: "备注",
      remarkPlaceholder: "补充说明",
      createdAt: "创建时间",
      updatedAt: "最近更新",
      partyDevices: "维保设备",
      deviceNone: "该维保方暂无维保设备",
      inWarranty: "在保",
      outOfWarranty: "脱保",
      warrantyEnd: "截止",
      warrantyNotSet: "未设置",
    },
    errors: {
      loadFailed: "加载失败",
      saveFailed: "保存失败",
      nameRequired: "请输入维保方名称",
      phoneInvalid: "联系电话格式不正确",
      deleteFailed: "删除失败",
      bulkDeleteFailed: "批量删除失败",
    },
    types: {
      vendor_contact: "原厂联系人",
      our_maintenance: "合作维保方",
      partner: "合作维保方",
      vendor: "原厂联系人",
      original_manufacturer: "原厂联系人",
      our: "我方维保",
    },
    misc: {
      unknown: "-",
    },
  },
  "zh-TW": {
    title: "維保方目錄",
    subtitle: "管理原廠聯絡人和合作維保方",
    actions: {
      refresh: "刷新",
      create: "新增維保方",
      edit: "編輯",
      retry: "重試",
      reset: "重置",
      cancel: "取消",
      save: "儲存維保方",
      saveEdit: "儲存修改",
      saving: "儲存中…",
      delete: "刪除",
      batchDelete: "批量刪除",
      clearSelection: "清空選擇",
      close: "關閉",
      addContact: "新增聯絡人",
      removeContact: "刪除聯絡人",
    },
    stats: {
      total: "維保方總數",
      vendor: "原廠聯絡人",
      partner: "合作維保方",
    },
    filters: {
      searchPlaceholder: "搜尋名稱、電話、官網地址…",
      typePlaceholder: "全部類型",
      all: "全部類型",
      vendor: "原廠聯絡人",
      partner: "合作維保方",
      activeHint: "已選篩選（點擊取消）：",
    },
    list: {
      title: "維保方列表",
      loading: "正在載入…",
      empty: "暫無維保方資料",
      name: "名稱",
      type: "類型",
      contacts: "聯絡人",
      phone: "電話",
      website: "官網",
      action: "操作",
      contactLine: "聯絡人：{contact} · 電話：{phone}",
      officialWebsite: "官網地址：{url}",
      selectAllCurrent: "全選目前列表",
      actionsMenu: "維保方操作",
    },
    dialog: {
      createTitle: "新增維保方",
      editTitle: "編輯維保方",
      detailTitle: "維保方詳情",
      description: "填寫維保方基礎資訊，提交後儲存到系統",
      detailDescription: "維保方基礎資訊、聯絡人與官網地址",
      name: "維保方名稱 *",
      namePlaceholder: "例如 Dell EMC 原廠技術支援",
      contact: "聯絡人",
      contacts: "聯絡人列表",
      contactPlaceholder: "聯絡人姓名",
      phone: "聯絡電話",
      phonePlaceholder: "支援數字、加號、括號、橫線、空格，長度 7-32",
      type: "類型",
      typePlaceholder: "選擇類型",
      officialWebsite: "官網地址",
      officialWebsitePlaceholder: "例如 https://www.example.com",
      remark: "備註",
      remarkPlaceholder: "補充說明",
      createdAt: "創建時間",
      updatedAt: "最近更新",
      partyDevices: "維保設備",
      deviceNone: "該維保方暫無維保設備",
      inWarranty: "在保",
      outOfWarranty: "脫保",
      warrantyEnd: "截止",
      warrantyNotSet: "未設置",
    },
    errors: {
      loadFailed: "載入失敗",
      saveFailed: "儲存失敗",
      nameRequired: "請輸入維保方名稱",
      phoneInvalid: "聯絡電話格式不正確",
      deleteFailed: "刪除失敗",
      bulkDeleteFailed: "批量刪除失敗",
    },
    types: {
      vendor_contact: "原廠聯絡人",
      our_maintenance: "合作維保方",
      partner: "合作維保方",
      vendor: "原廠聯絡人",
      original_manufacturer: "原廠聯絡人",
      our: "我方維保",
    },
    misc: {
      unknown: "-",
    },
  },
} as const;

// —— 类型 Badge → 图标+文字指示器（与设备资产页一致）——
const TYPE_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  original_manufacturer: { icon: ShieldCheck, color: "text-sky-600" },
  our_maintenance: { icon: ShieldCheck, color: "text-purple-600" },
};

function indicatorSpan(icon: LucideIcon, color: string, label: string) {
  const Icon = icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      {label}
    </span>
  );
}

/** 已选筛选标签：点击取消 */
function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted/70">
      {label}<X className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

function isOriginalManufacturer(type?: string) {
  return type === "original_manufacturer" || type === "vendor_contact" || type === "vendor";
}

function canonicalPartyType(type?: string) {
  if (isOriginalManufacturer(type)) return "original_manufacturer";
  if (type === "our_maintenance" || type === "partner" || type === "our") return "our_maintenance";
  return type || "";
}

function officialWebsiteHref(value?: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function telHref(value?: string) {
  const normalized = String(value || "").trim().replace(/[\s()-]/g, "");
  return normalized ? `tel:${normalized}` : "";
}

function contactsForParty(party?: Party | null) {
  const contacts = Array.isArray(party?.contacts) ? party.contacts : [];
  if (contacts.length) {
    return contacts.map((contact) => ({
      name: contact.name || "",
      phone: contact.phone || "",
    }));
  }
  if (party?.contact || party?.phone) return [{ name: party.contact || "", phone: party.phone || "" }];
  return [];
}

function contactNamesText(contacts: Array<{ name?: string; phone?: string }>, fallback: string) {
  const names = contacts.map((contact) => contact.name).filter(Boolean);
  return names.length ? names.join("、") : fallback;
}

function contactPhones(contacts: Array<{ name?: string; phone?: string }>, fallback?: string) {
  const phones = contacts.map((contact) => contact.phone).filter(Boolean);
  return phones.length ? phones : fallback ? [fallback] : [];
}

export function MaintenanceParties() {
  const { lang } = useLanguage();
  const { hasPermission } = useAuth();
  const canCreateParties = hasPermission("maintenance-party.create");
  const canEditParties = hasPermission("maintenance-party.edit");
  const canDeleteParties = hasPermission("maintenance-party.delete");
  const canManageParties = canEditParties || canDeleteParties;
  const t = I18N[lang];
  const [searchParams, setSearchParams] = useSearchParams();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("keyword") || "");
  const [typeFilter, setTypeFilter] = useUrlParam("type", "all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Party | null>(null);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedPartyIds, setSelectedPartyIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: "",
    contacts: [{ name: "", phone: "" }],
    partyType: "our_maintenance",
    officialWebsite: "",
    remark: "",
  });

  // 深链：?partyId= 自动打开维保方详情，关闭后清理参数
  const detailFromParamRef = useRef(false);
  useEffect(() => {
    const partyId = searchParams.get("partyId");
    if (!partyId) {
      detailFromParamRef.current = false;
      if (detailTarget) setDetailTarget(null);
      return;
    }
    if (detailTarget && String(detailTarget.id) === partyId) {
      detailFromParamRef.current = true;
      return;
    }
    const matched = parties.find((party) => String(party.id) === partyId);
    if (matched) {
      setDetailTarget(matched);
      // 列表对象没有 devices,同样拉完整详情补全（防'暂无设备'误报）
      api.get(`/maintenance-parties/${partyId}`)
        .then((data) => {
          const item = (data?.item || data) as Party;
          setDetailTarget((prev) => (prev && String(prev.id) === String(partyId) ? item : prev));
        })
        .catch(() => undefined);
      return;
    }
    let cancelled = false;
    api.get(`/maintenance-parties/${partyId}`)
      .then((data) => { if (!cancelled) setDetailTarget((data?.item || data) as Party); })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, parties, detailTarget]);

  useEffect(() => {
    if (detailTarget || !detailFromParamRef.current || !searchParams.has("partyId")) return;
    detailFromParamRef.current = false;
    const next = new URLSearchParams(searchParams);
    next.delete("partyId");
    setSearchParams(next, { replace: true });
  }, [detailTarget, searchParams, setSearchParams]);

  function openPartyDetail(party: Party) {
    setDetailTarget(party);
    // 拉完整详情（含维保设备列表）：列表点开的对象没有 devices,直接展示会误报'暂无设备'
    api.get(`/maintenance-parties/${party.id}`)
      .then((data) => {
        const item = (data?.item || data) as Party;
        setDetailTarget((prev) => (prev && String(prev.id) === String(party.id) ? item : prev));
      })
      .catch(() => undefined);
    if (searchParams.get("partyId") !== String(party.id)) {
      const next = new URLSearchParams(searchParams);
      next.set("partyId", String(party.id));
      setSearchParams(next);
    }
  }

  function closePartyDetail() {
    setDetailTarget(null);
    if (searchParams.has("partyId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("partyId");
      setSearchParams(next, { replace: true });
    }
  }

  async function load(keyword = searchQuery, type = typeFilter) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (type !== "all") params.set("partyType", type);
      const data = await api.get(`/maintenance-parties${params.toString() ? `?${params.toString()}` : ""}`);
      setParties((data?.items || []) as Party[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.loadFailed;
      setError(msg);
    } finally {
      setLoadedOnce(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      load(searchQuery, typeFilter);
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
  }, [searchQuery, typeFilter, t.errors.loadFailed]);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim();
    return parties.filter((p) => {
      if (typeFilter !== "all" && canonicalPartyType(p.partyType) !== typeFilter) return false;
      if (!keyword) return true;
      return [p.name, p.phone, p.contact, p.officialWebsite, p.remark, ...contactsForParty(p).flatMap((contact) => [contact.name, contact.phone])]
        .filter(Boolean)
        .some((v) => matchesSearchText(v, keyword));
    });
  }, [parties, searchQuery, typeFilter]);

  const stats = useMemo(() => {
    const total = parties.length;
    const vendor = parties.filter((p) => canonicalPartyType(p.partyType) === "original_manufacturer").length;
    const partner = parties.filter((p) => canonicalPartyType(p.partyType) === "our_maintenance").length;
    return [
      { key: "total", label: t.stats.total, value: total },
      { key: "original_manufacturer", label: t.stats.vendor, value: vendor },
      { key: "our_maintenance", label: t.stats.partner, value: partner },
    ];
  }, [parties, t.stats]);

  /** 统计条 chip 点击：总数=清除类型过滤；类型=toggle */
  function applyStatsFilter(key: string) {
    if (key === "total") {
      setTypeFilter("all");
      return;
    }
    setTypeFilter((current: string) => (current === key ? "all" : key));
  }
  const initialLoading = loading && !loadedOnce;
  const refreshing = loading && loadedOnce;

  const allFilteredPartiesSelected = filtered.length > 0
    && filtered.every((party) => selectedPartyIds.includes(String(party.id)));

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

  function updateFormContact(index: number, field: "name" | "phone", value: string) {
    setForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) => (
        contactIndex === index ? { ...contact, [field]: value } : contact
      )),
    }));
  }

  function addFormContact() {
    setForm((current) => ({
      ...current,
      contacts: [...current.contacts, { name: "", phone: "" }],
    }));
  }

  function removeFormContact(index: number) {
    setForm((current) => {
      const contacts = current.contacts.filter((_, contactIndex) => contactIndex !== index);
      return {
        ...current,
        contacts: contacts.length ? contacts : [{ name: "", phone: "" }],
      };
    });
  }

  useEffect(() => {
    const visibleIds = new Set(filtered.map((party) => String(party.id)));
    setSelectedPartyIds((ids) => {
      const next = ids.filter((id) => visibleIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [filtered]);

  function togglePartySelection(partyId: string | number, checked: boolean | "indeterminate") {
    const id = String(partyId);
    setSelectedPartyIds((ids) => {
      if (checked === true) return ids.includes(id) ? ids : [...ids, id];
      return ids.filter((item) => item !== id);
    });
  }

  function toggleAllFilteredParties(checked: boolean | "indeterminate") {
    const ids = filtered.map((party) => String(party.id));
    setSelectedPartyIds((current) => {
      if (checked === true) return Array.from(new Set([...current, ...ids]));
      const visible = new Set(ids);
      return current.filter((id) => !visible.has(id));
    });
  }

  function filterByPartyName(event: MouseEvent, name?: string) {
    event.stopPropagation();
    const value = String(name || "").trim();
    if (!value) return;
    setSearchQuery(value);
  }

  function filterByPartyType(event: MouseEvent, partyType?: string) {
    event.stopPropagation();
    const value = canonicalPartyType(partyType);
    if (!value) return;
    setTypeFilter(value);
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      name: "",
      contacts: [{ name: "", phone: "" }],
      partyType: "our_maintenance",
      officialWebsite: "",
      remark: "",
    });
    setDialogOpen(true);
  }

  function openEdit(party: Party) {
    setEditingId(party.id);
    setForm({
      name: party.name || "",
      contacts: contactsForParty(party).length ? contactsForParty(party) : [{ name: "", phone: "" }],
      partyType: party.partyType || "our_maintenance",
      officialWebsite: party.officialWebsite || "",
      remark: party.remark || "",
    });
    setDialogOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) {
      setError(t.errors.nameRequired);
      return;
    }
    const contacts = form.contacts
      .map((contact) => ({ name: contact.name.trim(), phone: contact.phone.trim() }))
      .filter((contact) => contact.name || contact.phone);
    for (const contact of contacts) {
      const phoneRe = /^[0-9+()\-\s]{7,32}$/;
      if (contact.phone && !phoneRe.test(contact.phone)) {
        setError(t.errors.phoneInvalid);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        contacts,
        contact: contacts[0]?.name || undefined,
        phone: contacts[0]?.phone || undefined,
        partyType: form.partyType,
        officialWebsite: form.officialWebsite.trim() || undefined,
        remark: form.remark.trim() || undefined,
      };
      if (editingId) {
        await api.put(`/maintenance-parties/${editingId}`, payload);
      } else {
        await api.post("/maintenance-parties", payload);
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.saveFailed;
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function deleteParty(party: Party) {
    if (!party.id) return;
    const name = party.name || `#${party.id}`;
    if (!window.confirm(`确认删除维保方「${name}」？`)) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/maintenance-parties/${party.id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.deleteFailed);
    } finally {
      setSaving(false);
    }
  }

  async function bulkDeleteParties() {
    if (!selectedPartyIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedPartyIds.length} 个维保方？`)) return;
    setSaving(true);
    setError("");
    try {
      for (const id of selectedPartyIds) {
        await api.delete(`/maintenance-parties/${id}`);
      }
      if (detailTarget && selectedPartyIds.includes(String(detailTarget.id))) closePartyDetail();
      setSelectedPartyIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.bulkDeleteFailed);
      await load();
    } finally {
      setSaving(false);
    }
  }


  /** 移动端维保方卡片（ResponsiveList renderCard 用），字段/操作与桌面行一致 */
  function renderPartyCard(p: Party) {
    const canonical = canonicalPartyType(p.partyType);
    const typeLabel = t.types[p.partyType as keyof typeof t.types] || p.partyType || t.misc.unknown;
    const typeConf = TYPE_INDICATOR[canonical] || TYPE_INDICATOR.our_maintenance;
    const TypeIcon = typeConf.icon;
    const selected = selectedPartyIds.includes(String(p.id));
    const contacts = contactsForParty(p);
    const phones = contactPhones(contacts, p.phone);
    return (
      <ResponsiveCard
        onClick={() => openPartyDetail(p)}
        title={
          <span className="flex min-w-0 items-center gap-2">
            {canDeleteParties ? (
              <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) => togglePartySelection(p.id, checked)}
                  disabled={saving}
                  aria-label={`${t.list.selectAllCurrent} ${p.name || p.id}`}
                />
              </span>
            ) : null}
            <Wrench className="h-4 w-4 shrink-0 text-primary" />
            {p.name ? (
              <button
                type="button"
                className="min-w-0 truncate text-left hover:text-primary hover:underline"
                title={p.name}
                onClick={(event) => filterByPartyName(event, p.name)}
              >
                {p.name}
              </button>
            ) : (
              <span title={t.misc.unknown} className="truncate">{t.misc.unknown}</span>
            )}
          </span>
        }
        status={(
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors ${typeFilter === canonical ? "bg-primary/10 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:bg-accent"}`}
            title={`${t.list.type}：${typeLabel}`}
            onClick={(event) => filterByPartyType(event, p.partyType)}
          >
            <TypeIcon className={`h-3.5 w-3.5 ${typeConf.color}`} />
            {typeLabel}
          </button>
        )}
        subtitle={p.remark || undefined}
        fields={[
          { label: t.list.contacts, value: contactNamesText(contacts, t.misc.unknown) },
          { label: t.list.phone, value: phones.length ? phones.slice(0, 2).map((phone) => renderPhoneLink(phone, true)) : t.misc.unknown },
          { label: t.list.website, value: p.officialWebsite || t.misc.unknown },
        ]}
        actions={(
          <>
            {canEditParties ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:bg-transparent hover:text-sky-600"
                onClick={(event) => {
                  event.stopPropagation();
                  openEdit(p);
                }}
              >
                <Pencil className="w-4 h-4 mr-1" />
                {t.actions.edit}
              </Button>
            ) : null}
            {canDeleteParties ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:bg-transparent hover:text-rose-600"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteParty(p);
                }}
                disabled={saving}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {t.actions.delete}
              </Button>
            ) : null}
          </>
        )}
      />
    );
  }
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => load(searchQuery, typeFilter)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t.actions.refresh}
          </Button>
          {canCreateParties ? (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              {t.actions.create}
            </Button>
          ) : null}
        </div>
      </div>

      <ErrorToast message={error} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-white px-4 py-2.5 text-sm shadow-sm dark:bg-slate-900">
        {stats.map((stat, statIndex) => {
          const valueNode = initialLoading ? (
            <Skeleton className="h-5 w-8" />
          ) : (
            <span className="stat-value-enter inline-block text-base font-bold" style={{ animationDelay: `${Math.min(statIndex * 120, 480)}ms` }}>{stat.value}</span>
          );
          // 统计条 chip 可点过滤：总数=全部，类型=toggle（与设备资产页同语言）
          const isType = stat.key !== "total";
          const active = isType && typeFilter === stat.key;
          return (
            <button
              key={stat.key}
              type="button"
              onClick={() => applyStatsFilter(stat.key)}
              className={`inline-flex items-baseline gap-1.5 rounded-md px-1.5 py-0.5 transition-colors ${active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent"}`}
              title={stat.label}
              aria-pressed={isType ? active : undefined}
            >
              <span className="text-muted-foreground">{stat.label}</span>
              {valueNode}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative min-w-0 flex-1 basis-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t.filters.searchPlaceholder}
                aria-label={t.filters.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(searchQuery, typeFilter);
                }}
              />
            </div>
            <Button
              className="h-9 shrink-0 whitespace-nowrap px-2.5 sm:px-3"
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setTypeFilter("all");
              }}
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              {t.actions.reset}
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {refreshing ? <span className="btn-loader btn-loader-sm" aria-hidden="true" /> : null}
              {canDeleteParties ? (
                <>
                  {selectedPartyIds.length ? (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedPartyIds([])} disabled={saving}>
                      {t.actions.clearSelection}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={bulkDeleteParties}
                    disabled={saving || !selectedPartyIds.length}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t.actions.batchDelete}{selectedPartyIds.length ? ` (${selectedPartyIds.length})` : ""}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          {typeFilter !== "all" ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t.filters.activeHint}</span>
              <FilterChip
                label={`${t.list.type}：${typeFilter === "original_manufacturer" ? t.filters.vendor : t.filters.partner}`}
                onClear={() => setTypeFilter("all")}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-auto">
          {initialLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <span className="btn-loader mr-2" aria-hidden="true" /> {t.list.loading}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-2">
              <EmptyState
                title={t.list.empty}
                {...(canCreateParties ? { actionLabel: t.actions.create, onAction: openCreate } : {})}
              />
            </div>
          ) : (
            <ResponsiveList items={filtered} keyExtractor={(p) => p.id} renderCard={renderPartyCard}>
              <table className="w-full table-fixed caption-bottom text-sm">
                <colgroup>
                  {canDeleteParties ? <col className="w-11" /> : null}
                  <col className="w-[30%]" />
                  <col className="w-[13%]" />
                  <col className="w-[15%]" />
                  <col className="w-[17%]" />
                  <col className="w-[17%]" />
                  {canManageParties ? <col className="w-[8%]" /> : null}
                </colgroup>
                <TableHeader className="text-xs text-muted-foreground [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted/70 [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:backdrop-blur">
                  <TableRow>
                    {canDeleteParties ? (
                      <TableHead className="w-11 text-center">
                        <Checkbox
                          checked={allFilteredPartiesSelected}
                          onCheckedChange={toggleAllFilteredParties}
                          disabled={saving || filtered.length === 0}
                          aria-label={t.list.selectAllCurrent}
                        />
                      </TableHead>
                    ) : null}
                    <TableHead>{t.list.name}</TableHead>
                    <TableHead>{t.list.type}</TableHead>
                    <TableHead>{t.list.contacts}</TableHead>
                    <TableHead>{t.list.phone}</TableHead>
                    <TableHead>{t.list.website}</TableHead>
                    {canManageParties ? <TableHead>{t.list.action}</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p, rowIndex) => {
                    const canonical = canonicalPartyType(p.partyType);
                    const typeLabel = t.types[p.partyType as keyof typeof t.types] || p.partyType || t.misc.unknown;
                    const typeConf = TYPE_INDICATOR[canonical] || TYPE_INDICATOR.our_maintenance;
                    const TypeIcon = typeConf.icon;
                    const selected = selectedPartyIds.includes(String(p.id));
                    const contacts = contactsForParty(p);
                    const phones = contactPhones(contacts, p.phone);
                    return (
                      <TableRow
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        className="list-row-enter cursor-pointer"
                        style={{ animationDelay: `${Math.min(rowIndex * 40, 400)}ms` }}
                        onClick={() => openPartyDetail(p)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openPartyDetail(p);
                          }
                        }}
                      >
                        {canDeleteParties ? (
                          <TableCell className="text-center" onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => togglePartySelection(p.id, checked)}
                              disabled={saving}
                              aria-label={`${t.list.selectAllCurrent} ${p.name || p.id}`}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <Wrench className="h-4 w-4 shrink-0 text-primary" />
                            <div className="min-w-0">
                              {p.name ? (
                                <button
                                  type="button"
                                  className="block max-w-full truncate text-left text-sm font-semibold transition-colors hover:text-primary hover:underline"
                                  title={p.name}
                                  onClick={(event) => filterByPartyName(event, p.name)}
                                >
                                  {p.name}
                                </button>
                              ) : (
                                <div title={t.misc.unknown} className="truncate font-medium">{t.misc.unknown}</div>
                              )}
                              {p.remark ? (
                                <div className="mt-0.5 truncate text-xs text-muted-foreground" title={p.remark}>
                                  {p.remark}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors ${typeFilter === canonical ? "bg-primary/10 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:bg-accent"}`}
                            title={`${t.list.type}：${typeLabel}`}
                            onClick={(event) => filterByPartyType(event, p.partyType)}
                          >
                            <TypeIcon className={`h-3.5 w-3.5 ${typeConf.color}`} />
                            {typeLabel}
                          </button>
                        </TableCell>
                        <TableCell className="min-w-0">
                          <span className="block truncate text-sm" title={contactNamesText(contacts, t.misc.unknown)}>
                            {contactNamesText(contacts, t.misc.unknown)}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-0">
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {phones.length
                              ? phones.slice(0, 3).map((phone, index) => (
                                  <span key={`${phone}-${index}`} className="text-sm">
                                    {renderPhoneLink(phone, true)}
                                  </span>
                                ))
                              : <span className="text-sm text-muted-foreground">{t.misc.unknown}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-0">
                          {p.officialWebsite ? (
                            <a
                              className="block truncate text-sm text-primary hover:underline"
                              href={officialWebsiteHref(p.officialWebsite)}
                              target="_blank"
                              rel="noreferrer"
                              title={p.officialWebsite}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {p.officialWebsite}
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">{t.misc.unknown}</span>
                          )}
                        </TableCell>
                        {canManageParties ? (
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  title={t.list.actionsMenu}
                                  aria-label={t.list.actionsMenu}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canEditParties ? (
                                  <DropdownMenuItem onSelect={() => openEdit(p)}>
                                    <Pencil className="h-4 w-4" />
                                    {t.actions.edit}
                                  </DropdownMenuItem>
                                ) : null}
                                {canEditParties && canDeleteParties ? <DropdownMenuSeparator /> : null}
                                {canDeleteParties ? (
                                  <DropdownMenuItem variant="destructive" onSelect={() => deleteParty(p)} disabled={saving}>
                                    <Trash2 className="h-4 w-4" />
                                    {t.actions.delete}
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </table>
            </ResponsiveList>
          )}
        </div>
      </div>

      <Dialog open={Boolean(detailTarget)} onOpenChange={(open) => { if (!open) closePartyDetail(); }}>
        <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-[680px]">
          <DialogHeader className="px-6 pt-6 pr-12">
            <DialogTitle>{t.dialog.detailTitle}</DialogTitle>
            <DialogDescription>{t.dialog.detailDescription}</DialogDescription>
          </DialogHeader>
          {detailTarget ? (() => {
            const typeLabel = t.types[detailTarget.partyType as keyof typeof t.types] || detailTarget.partyType || t.misc.unknown;
            const contacts = contactsForParty(detailTarget);
            return (
              <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-6 pb-2">
                <div className="space-y-5 py-2">
                  <div className="rounded-lg border bg-slate-50/60 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold leading-7 text-slate-900">{detailTarget.name || t.misc.unknown}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {isOriginalManufacturer(detailTarget.partyType) ? t.filters.vendor : t.filters.partner}
                        </div>
                      </div>
                      {(() => {
                        const conf = TYPE_INDICATOR[canonicalPartyType(detailTarget.partyType)] || TYPE_INDICATOR.our_maintenance;
                        return indicatorSpan(conf.icon, conf.color, typeLabel);
                      })()}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.phone}</div>
                        <div title={contacts[0]?.phone || detailTarget.phone} className="mt-1 truncate text-sm font-semibold text-slate-900">{renderPhoneLink(contacts[0]?.phone || detailTarget.phone)}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.createdAt}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{formatDate(detailTarget.createdAt)}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.updatedAt}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{formatDate(detailTarget.updatedAt)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">{t.dialog.contacts}</div>
                    <div className="mt-3 space-y-2">
                      {contacts.length ? contacts.map((contact, index) => (
                        <div key={`${contact.name}-${index}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm leading-6">
                          <div className="font-medium text-slate-900">{contact.name || t.misc.unknown}</div>
                          <div className="text-muted-foreground">{renderPhoneLink(contact.phone)}</div>
                        </div>
                      )) : (
                        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-muted-foreground">{t.misc.unknown}</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{t.dialog.partyDevices}</div>
                      {detailTarget.devices && detailTarget.devices.length ? (
                        <span className="text-xs text-muted-foreground">
                          {detailTarget.devices.filter((d) => d.inWarranty).length} 在保 · {detailTarget.devices.filter((d) => !d.inWarranty).length} 脱保
                        </span>
                      ) : null}
                    </div>
                    {detailTarget.devices && detailTarget.devices.length ? (
                      <div className="mt-3 space-y-1.5">
                        {detailTarget.devices.map((device) => {
                          const inWarranty = Boolean(device.inWarranty);
                          return (
                            <div
                              key={String(device.id)}
                              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm leading-6 ${inWarranty ? "bg-slate-50" : "bg-slate-100 text-slate-400"}`}
                              title={`${device.customerName || ""} ${device.name || device.model || ""} · ${device.serialNo || ""}`}
                            >
                              <span className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${inWarranty ? "bg-emerald-500" : "bg-slate-400"}`} />
                              <span className={`min-w-0 flex-1 truncate ${inWarranty ? "text-slate-900" : ""}`}>
                                {device.customerName ? `${device.customerName} · ` : ""}{device.name || device.model || t.misc.unknown}
                              </span>
                              <span className="shrink-0 text-xs">
                                {device.maintenanceEnd ? `${t.dialog.warrantyEnd} ${formatDate(device.maintenanceEnd)}` : t.dialog.warrantyNotSet}
                              </span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${inWarranty ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                                {inWarranty ? t.dialog.inWarranty : t.dialog.outOfWarranty}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-muted-foreground">
                        {t.dialog.deviceNone}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {detailTarget.officialWebsite ? (
                      <div className="rounded-lg border p-4">
                        <div className="text-sm font-medium">{t.dialog.officialWebsite}</div>
                        <div className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm leading-6">
                          <a
                            className="text-primary hover:underline break-all"
                            href={officialWebsiteHref(detailTarget.officialWebsite)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {detailTarget.officialWebsite}
                          </a>
                        </div>
                      </div>
                    ) : null}
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">{t.dialog.remark}</div>
                      <div className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm leading-6">
                        {detailTarget.remark || t.misc.unknown}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : null}
          <DialogFooter className="flex-row justify-end border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={closePartyDetail}>
              {t.actions.close}
            </Button>
            {detailTarget && canEditParties ? (
              <Button onClick={() => {
                const target = detailTarget;
                closePartyDetail();
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
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingId ? t.dialog.editTitle : t.dialog.createTitle}</DialogTitle>
            <DialogDescription>{t.dialog.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t.dialog.name}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t.dialog.namePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.dialog.type}</Label>
              <Select
                value={form.partyType}
                onValueChange={(v) => setForm({
                  ...form,
                  partyType: v,
                  contacts: isOriginalManufacturer(v)
                    ? form.contacts.map((contact) => ({ ...contact, name: "" }))
                    : form.contacts,
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.dialog.typePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original_manufacturer">{t.filters.vendor}</SelectItem>
                  <SelectItem value="our_maintenance">{t.filters.partner}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>{isOriginalManufacturer(form.partyType) ? t.dialog.phone : t.dialog.contacts}</Label>
                {!isOriginalManufacturer(form.partyType) ? (
                  <Button type="button" variant="outline" size="sm" onClick={addFormContact}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t.actions.addContact}
                  </Button>
                ) : null}
              </div>
              {form.contacts.map((contact, index) => (
                <div key={index} className={`grid gap-3 rounded-lg border p-3 ${isOriginalManufacturer(form.partyType) ? "grid-cols-1" : "grid-cols-1 md:grid-cols-[1fr_1fr_auto]"}`}>
                  {!isOriginalManufacturer(form.partyType) ? (
                    <Input
                      value={contact.name}
                      onChange={(e) => updateFormContact(index, "name", e.target.value)}
                      placeholder={t.dialog.contactPlaceholder}
                    />
                  ) : null}
                  <Input
                    value={contact.phone}
                    onChange={(e) => updateFormContact(index, "phone", e.target.value)}
                    placeholder={t.dialog.phonePlaceholder}
                  />
                  {!isOriginalManufacturer(form.partyType) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => removeFormContact(index)}
                      disabled={form.contacts.length === 1}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t.actions.removeContact}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>{t.dialog.officialWebsite}</Label>
              <Input
                value={form.officialWebsite}
                onChange={(e) => setForm({ ...form, officialWebsite: e.target.value })}
                placeholder={t.dialog.officialWebsitePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.dialog.remark}</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
                placeholder={t.dialog.remarkPlaceholder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t.actions.cancel}
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? t.actions.saving : editingId ? t.actions.saveEdit : t.actions.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
