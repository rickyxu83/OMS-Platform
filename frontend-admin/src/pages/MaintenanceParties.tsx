import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Building2, Loader2, Trash2, Pencil, Check, RotateCcw } from "lucide-react";
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
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/services/api";

interface Party {
  id: string | number;
  name?: string;
  phone?: string;
  contact?: string;
  partyType?: string;
  serviceScope?: string;
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
    },
    stats: {
      total: "维保方总数",
      vendor: "原厂联系人",
      partner: "合作维保方",
    },
    filters: {
      searchPlaceholder: "搜索名称、电话、服务范围...",
      typePlaceholder: "类型筛选",
      all: "全部类型",
      vendor: "原厂联系人",
      partner: "合作维保方",
    },
    list: {
      title: "维保方列表",
      loading: "加载中…",
      empty: "暂无维保方资料",
      updatedAt: "最近更新",
      contactLine: "联系人：{contact} · 电话：{phone}",
      serviceScope: "服务范围：{scope}",
      selectAllCurrent: "全选当前列表",
    },
    dialog: {
      createTitle: "新增维保方",
      editTitle: "编辑维保方",
      detailTitle: "维保方详情",
      description: "填写维保方基础信息，提交后保存到系统",
      detailDescription: "维保方基础信息、联系人与服务范围",
      name: "维保方名称 *",
      namePlaceholder: "例如 Dell EMC 原厂技术支持",
      contact: "联系人",
      contactPlaceholder: "联系人姓名",
      phone: "联系电话",
      phonePlaceholder: "支持数字、加号、括号、横线、空格，长度 7-32",
      type: "类型",
      typePlaceholder: "选择类型",
      serviceScope: "服务范围",
      serviceScopePlaceholder: "例如 服务器、存储、网络设备",
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
      our: "我方维护",
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
      save: "保存維保方",
      saveEdit: "保存修改",
      saving: "保存中…",
      delete: "刪除",
      batchDelete: "批量刪除",
      clearSelection: "清空選擇",
      close: "關閉",
    },
    stats: {
      total: "維保方總數",
      vendor: "原廠聯絡人",
      partner: "合作維保方",
    },
    filters: {
      searchPlaceholder: "搜尋名稱、電話、服務範圍...",
      typePlaceholder: "類型篩選",
      all: "全部類型",
      vendor: "原廠聯絡人",
      partner: "合作維保方",
    },
    list: {
      title: "維保方列表",
      loading: "載入中…",
      empty: "暫無維保方資料",
      updatedAt: "最近更新",
      contactLine: "聯絡人：{contact} · 電話：{phone}",
      serviceScope: "服務範圍：{scope}",
      selectAllCurrent: "全選目前列表",
    },
    dialog: {
      createTitle: "新增維保方",
      editTitle: "編輯維保方",
      detailTitle: "維保方詳情",
      description: "填寫維保方基礎資訊，提交後保存到系統",
      detailDescription: "維保方基礎資訊、聯絡人與服務範圍",
      name: "維保方名稱 *",
      namePlaceholder: "例如 Dell EMC 原廠技術支援",
      contact: "聯絡人",
      contactPlaceholder: "聯絡人姓名",
      phone: "聯絡電話",
      phonePlaceholder: "支援數字、加號、括號、橫線、空格，長度 7-32",
      type: "類型",
      typePlaceholder: "選擇類型",
      serviceScope: "服務範圍",
      serviceScopePlaceholder: "例如 伺服器、儲存、網路設備",
      remark: "備註",
      remarkPlaceholder: "補充說明",
      createdAt: "創建時間",
      updatedAt: "最近更新",
    },
    errors: {
      loadFailed: "載入失敗",
      saveFailed: "保存失敗",
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
      our: "我方維護",
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

export function MaintenanceParties() {
  const { lang } = useLanguage();
  const t = I18N[lang];
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
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
    contact: "",
    phone: "",
    partyType: "our_maintenance",
    serviceScope: "",
    remark: "",
  });

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
    const keyword = searchQuery.trim().toLowerCase();
    return parties.filter((p) => {
      if (typeFilter !== "all" && p.partyType !== typeFilter) return false;
      if (!keyword) return true;
      return [p.name, p.phone, p.contact, p.serviceScope]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [parties, searchQuery, typeFilter]);

  const stats = useMemo(() => {
    const total = parties.length;
    const vendor = parties.filter(
      (p) => p.partyType === "vendor_contact" || p.partyType === "vendor" || p.partyType === "original_manufacturer",
    ).length;
    const partner = parties.filter(
      (p) => p.partyType === "our_maintenance" || p.partyType === "partner" || p.partyType === "our",
    ).length;
    return [
      { label: t.stats.total, value: total },
      { label: t.stats.vendor, value: vendor },
      { label: t.stats.partner, value: partner },
    ];
  }, [parties, t.stats]);

  const allFilteredPartiesSelected = filtered.length > 0
    && filtered.every((party) => selectedPartyIds.includes(String(party.id)));

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

  function openCreate() {
    setEditingId(null);
    setForm({
      name: "",
      contact: "",
      phone: "",
      partyType: "our_maintenance",
      serviceScope: "",
      remark: "",
    });
    setDialogOpen(true);
  }

  function openEdit(party: Party) {
    setEditingId(party.id);
    setForm({
      name: party.name || "",
      contact: party.contact || "",
      phone: party.phone || "",
      partyType: party.partyType || "our_maintenance",
      serviceScope: party.serviceScope || "",
      remark: party.remark || "",
    });
    setDialogOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) {
      setError(t.errors.nameRequired);
      return;
    }
    if (form.phone.trim()) {
      const phoneRe = /^[0-9+()\-\s]{7,32}$/;
      if (!phoneRe.test(form.phone.trim())) {
        setError(t.errors.phoneInvalid);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        contact: isOriginalManufacturer(form.partyType) ? undefined : form.contact.trim() || undefined,
        phone: form.phone.trim() || undefined,
        partyType: form.partyType,
        serviceScope: form.serviceScope.trim() || undefined,
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
      if (detailTarget && selectedPartyIds.includes(String(detailTarget.id))) setDetailTarget(null);
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
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load(searchQuery, typeFilter)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t.actions.refresh}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            {t.actions.create}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => load(searchQuery, typeFilter)}>{t.actions.retry}</Button>
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
            <CardTitle>{t.list.title} ({filtered.length})</CardTitle>
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-y-auto pr-1">
            {loading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.list.loading}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t.list.empty}</div>
            ) : (
              <div className="space-y-3">
              {filtered.map((p) => {
                const typeLabel = t.types[p.partyType as keyof typeof t.types] || p.partyType || t.misc.unknown;
                const selected = selectedPartyIds.includes(String(p.id));
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer flex-col gap-3 rounded-lg border border-border p-4 transition-colors hover:border-primary hover:bg-accent/30 md:flex-row md:items-center md:justify-between"
                    onClick={() => setDetailTarget(p)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetailTarget(p);
                      }
                    }}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => togglePartySelection(p.id, checked)}
                          disabled={saving}
                          aria-label={`${t.list.selectAllCurrent} ${p.name || p.id}`}
                        />
                      </div>
                      <Building2 className="w-5 h-5 text-primary" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium">{p.name || t.misc.unknown}</span>
                          <Badge variant={TYPE_VARIANT[p.partyType || ""] || "secondary"}>
                            {typeLabel}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {isOriginalManufacturer(p.partyType)
                            ? `${t.dialog.phone}：${p.phone || t.misc.unknown}`
                            : `${t.dialog.contact}：${p.contact || t.misc.unknown} · ${t.dialog.phone}：${p.phone || t.misc.unknown}`}
                        </div>
                        {p.serviceScope && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {`${t.dialog.serviceScope}：${p.serviceScope}`}
                          </div>
                        )}
                      </div>
                      <div className="text-right hidden md:block">
                        <div className="text-xs text-muted-foreground">{t.list.updatedAt}</div>
                        <div className="text-sm">{formatDate(p.updatedAt)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900" onClick={() => openEdit(p)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        {t.actions.edit}
                      </Button>
                      <Button variant="ghost" size="sm" className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => deleteParty(p)} disabled={saving}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        {t.actions.delete}
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
        <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-[680px]">
          <DialogHeader className="px-6 pt-6 pr-12">
            <DialogTitle>{t.dialog.detailTitle}</DialogTitle>
            <DialogDescription>{t.dialog.detailDescription}</DialogDescription>
          </DialogHeader>
          {detailTarget ? (() => {
            const typeLabel = t.types[detailTarget.partyType as keyof typeof t.types] || detailTarget.partyType || t.misc.unknown;
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
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.contact}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.contact || t.misc.unknown}</div>
                      </div>
                      <div className="rounded-md bg-white/80 p-3 ring-1 ring-border/70">
                        <div className="text-xs text-muted-foreground">{t.dialog.phone}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900">{detailTarget.phone || t.misc.unknown}</div>
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">{t.dialog.serviceScope}</div>
                      <div className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm leading-6">
                        {detailTarget.serviceScope || t.misc.unknown}
                      </div>
                    </div>
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
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              {t.actions.close}
            </Button>
            {detailTarget ? (
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!isOriginalManufacturer(form.partyType) && (
                <div className="space-y-2">
                  <Label>{t.dialog.contact}</Label>
                  <Input
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    placeholder={t.dialog.contactPlaceholder}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t.dialog.phone}</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder={t.dialog.phonePlaceholder}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.dialog.type}</Label>
              <Select
                value={form.partyType}
                onValueChange={(v) => setForm({ ...form, partyType: v, contact: isOriginalManufacturer(v) ? "" : form.contact })}
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
            <div className="space-y-2">
              <Label>{t.dialog.serviceScope}</Label>
              <Input
                value={form.serviceScope}
                onChange={(e) => setForm({ ...form, serviceScope: e.target.value })}
                placeholder={t.dialog.serviceScopePlaceholder}
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
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? t.actions.saving : editingId ? t.actions.saveEdit : t.actions.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
