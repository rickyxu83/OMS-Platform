import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Search, Wrench, Trash2, Pencil, Check, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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

const TYPE_VARIANT: Record<string, "default" | "info" | "secondary" | "purple"> = {
  vendor_contact: "info",
  original_manufacturer: "info",
  vendor: "info",
  our_maintenance: "purple",
  partner: "purple",
  our: "purple",
};

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
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
      { label: t.stats.total, value: total },
      { label: t.stats.vendor, value: vendor },
      { label: t.stats.partner, value: partner },
    ];
  }, [parties, t.stats]);
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, statIndex) => (
          <Card key={stat.label} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-bold mt-1">
                                {initialLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span className="stat-value-enter inline-block" style={{ animationDelay: `${Math.min(statIndex * 120, 480)}ms` }}>{stat.value}</span>
                )}
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
                  if (e.key === "Enter") load(searchQuery, typeFilter);
                }}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder={t.filters.typePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.filters.all}</SelectItem>
                <SelectItem value="original_manufacturer">{t.filters.vendor}</SelectItem>
                <SelectItem value="our_maintenance">{t.filters.partner}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setTypeFilter("all");
              }}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {t.actions.reset}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>{t.list.title} ({filtered.length})</CardTitle>
              {refreshing ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="btn-loader btn-loader-sm" aria-hidden="true" />
                  {t.list.loading}
                </span>
              ) : null}
            </div>
            {canDeleteParties ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={allFilteredPartiesSelected}
                    onCheckedChange={toggleAllFilteredParties}
                    disabled={saving || filtered.length === 0}
                    aria-label={t.list.selectAllCurrent}
                  />
                  {t.list.selectAllCurrent}
                </label>
                {selectedPartyIds.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPartyIds([])} disabled={saving}>
                    {t.actions.clearSelection}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={bulkDeleteParties}
                  disabled={saving || !selectedPartyIds.length}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t.actions.batchDelete}{selectedPartyIds.length ? ` (${selectedPartyIds.length})` : ""}
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-auto rounded-md border">
            {initialLoading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <span className="btn-loader mr-2" aria-hidden="true" /> {t.list.loading}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t.list.empty}</div>
            ) : (
                <table className="w-full min-w-[1040px] table-fixed caption-bottom text-sm">
                  <colgroup>
                    {canDeleteParties ? <col className="w-11" /> : null}
                    <col className="w-[320px]" />
                    <col className="w-[128px]" />
                    <col className="w-[150px]" />
                    <col className="w-[190px]" />
                    <col />
                    {canManageParties ? <col className="w-[168px]" /> : null}
                  </colgroup>
                  <TableHeader className="text-xs text-muted-foreground [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted/70 [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:backdrop-blur">
                    <TableRow>
                      {canDeleteParties ? <TableHead className="w-11 text-center" /> : null}
                      <TableHead>{t.list.name}</TableHead>
                      <TableHead className="w-[128px] text-center">{t.list.type}</TableHead>
                      <TableHead className="text-center">{t.list.contacts}</TableHead>
                      <TableHead className="text-center">{t.list.phone}</TableHead>
                      <TableHead>{t.list.website}</TableHead>
                      {canManageParties ? <TableHead className="w-[168px] text-right pr-5">{t.list.action}</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const typeLabel = t.types[p.partyType as keyof typeof t.types] || p.partyType || t.misc.unknown;
                      const selected = selectedPartyIds.includes(String(p.id));
                      const contacts = contactsForParty(p);
                      const phones = contactPhones(contacts, p.phone);
                      return (
                        <TableRow
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer"
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
                            <TableCell onClick={(event) => event.stopPropagation()}>
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
                                    className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-primary hover:underline"
                                    title={p.name}
                                    onClick={(event) => filterByPartyName(event, p.name)}
                                  >
                                    {p.name}
                                  </button>
                                ) : (
                                  <div className="truncate font-medium">{t.misc.unknown}</div>
                                )}
                                {p.remark ? (
                                  <div className="mt-0.5 max-w-[260px] truncate text-xs text-muted-foreground" title={p.remark}>
                                    {p.remark}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <button type="button" onClick={(event) => filterByPartyType(event, p.partyType)}>
                              <Badge
                                variant={TYPE_VARIANT[p.partyType || ""] || "secondary"}
                                className={`cursor-pointer hover:ring-2 hover:ring-primary/20 ${typeFilter === canonicalPartyType(p.partyType) ? "ring-2 ring-primary/30" : ""}`}
                              >
                                {typeLabel}
                              </Badge>
                            </button>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="truncate text-sm" title={contactNamesText(contacts, t.misc.unknown)}>
                              {contactNamesText(contacts, t.misc.unknown)}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-wrap justify-center gap-x-2 gap-y-1">
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
                            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                              <div className="inline-flex gap-2">
                                {canEditParties ? (
                                  <Button variant="ghost" size="sm" className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900" onClick={() => openEdit(p)}>
                                    <Pencil className="w-4 h-4 mr-1" />
                                    {t.actions.edit}
                                  </Button>
                                ) : null}
                                {canDeleteParties ? (
                                  <Button variant="ghost" size="sm" className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => deleteParty(p)} disabled={saving}>
                                    <Trash2 className="w-4 h-4 mr-1" />
                                    {t.actions.delete}
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </table>
            )}
          </div>
        </CardContent>
      </Card>

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
                      <Badge variant={TYPE_VARIANT[detailTarget.partyType || ""] || "secondary"}>{typeLabel}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.phone}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{renderPhoneLink(contacts[0]?.phone || detailTarget.phone)}</div>
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
