import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Plus, RefreshCw, Loader2, MapPin, Crosshair, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  levelText?: string;
  serviceOrderCount?: number;
  salesperson?: string;
  updatedAt?: string;
  createdAt?: string;
  contacts?: Array<{ id?: string | number; name?: string; phone?: string }>;
}

interface GeoCandidate {
  id: string;
  customerId?: string | number;
  name: string;
  address?: string;
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
      addContact: "新增联系人",
      removeContact: "删除联系人",
      saveNow: "立即创建",
      saving: "保存中…",
    },
    stats: {
      total: "客户总数",
      key: "重点客户",
      serviceCount: "累计服务次数",
    },
    list: {
      title: "客户列表",
      searchPlaceholder: "搜索名称、地址、联系人...",
      loading: "加载中…",
      empty: "未找到相关客户数据",
      code: "编码",
      name: "客户名称",
      contact: "联系人",
      phone: "联系电话",
      level: "等级",
      address: "地址",
      salesperson: "业务",
      action: "操作",
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
    },
    errors: {
      loadFailed: "加载失败",
      createFailed: "新增失败",
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
      saveEdit: "保存修改",
      retry: "重試",
      cancel: "取消",
      clear: "清除",
      addContact: "新增聯絡人",
      removeContact: "刪除聯絡人",
      saveNow: "立即建立",
      saving: "保存中…",
    },
    stats: {
      total: "客戶總數",
      key: "重點客戶",
      serviceCount: "累計服務次數",
    },
    list: {
      title: "客戶列表",
      searchPlaceholder: "搜尋名稱、地址、聯絡人...",
      loading: "載入中…",
      empty: "未找到相關客戶資料",
      code: "編碼",
      name: "客戶名稱",
      contact: "聯絡人",
      phone: "聯絡電話",
      level: "等級",
      address: "地址",
      salesperson: "業務",
      action: "操作",
    },
    dialog: {
      title: "新增客戶",
      editTitle: "編輯客戶",
      description: "填寫客戶基礎資訊，提交後保存到系統",
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
    },
    errors: {
      loadFailed: "載入失敗",
      createFailed: "新增失敗",
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
      searchCompanyKeyword: "公司",
    },
    misc: {
      unknown: "-",
    },
  },
} as const;

const LEVEL_VARIANT: Record<string, "default" | "secondary" | "purple" | "warning" | "info"> = {
  key: "purple",
  vip: "warning",
  normal: "secondary",
  potential: "info",
};

function levelOf(c: Customer): string {
  if (c.level) return c.level;
  const count = Number(c.serviceOrderCount || 0);
  if (count >= 20) return "key";
  if (count >= 5) return "normal";
  return "potential";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

function normalizeCoordinate(value?: number | string | null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

export function Customers() {
  const { lang } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = I18N[lang];
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("keyword") || searchParams.get("city") || "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);

  const [candidates, setCandidates] = useState<GeoCandidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [locationHint, setLocationHint] = useState("");
  const [locating, setLocating] = useState(false);
  const [searchTimer, setSearchTimer] = useState<number | null>(null);

  const primaryContact = form.contacts[0] || { name: "", phone: "" };
  const salespersonOptions = useMemo(() => {
    const options = salespeople
      .map((user) => (user.realName || user.username || "").trim())
      .filter(Boolean);
    if (form.salesperson.trim() && !options.includes(form.salesperson.trim())) {
      options.unshift(form.salesperson.trim());
    }
    return options;
  }, [form.salesperson, salespeople]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        pageSize: "100",
        sortBy: "name",
        sortDir: "asc",
      });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const data = await api.get(`/customers?${params.toString()}`);
      setCustomers((data?.items || []) as Customer[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.errors.loadFailed;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.errors.loadFailed]);

  useEffect(() => {
    api.get("/users/salespeople")
      .then((data) => setSalespeople((data?.items || []) as SalespersonOption[]))
      .catch(() => setSalespeople([]));
  }, []);

  useEffect(() => {
    const keyword = searchParams.get("keyword") || searchParams.get("city") || "";
    setSearchQuery(keyword);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return customers;
    return customers.filter((c) => {
      return [c.name, c.code, c.contactName, c.contactPhone, c.address, c.salesperson]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [customers, searchQuery]);

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

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCandidates([]);
    setShowCandidates(false);
    setLocationHint("");
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
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

  function scheduleGeoSearch(value: string) {
    if (searchTimer) window.clearTimeout(searchTimer);
    const keyword = value.trim();
    if (!keyword) {
      setCandidates([]);
      setShowCandidates(false);
      setLocationHint("");
      return;
    }
    setLocationHint(interpolate(t.geo.searching, { keyword }));
    const timerId = window.setTimeout(() => {
      searchGeo({}, { keyword }).catch(() => undefined);
    }, 300);
    setSearchTimer(timerId);
  }

  function applyCandidate(company: GeoCandidate) {
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
        latitude: company.latitude ?? prev.latitude ?? null,
        longitude: company.longitude ?? prev.longitude ?? null,
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

  async function submit() {
    if (!form.name.trim()) {
      setError(t.errors.nameRequired);
      return;
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
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        mapProvider: form.mapProvider || undefined,
        mapPoiId: form.mapPoiId || undefined,
        mapPoiName: form.mapPoiName || undefined,
        mapAddress: form.mapAddress || undefined,
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
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
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
          <Button variant="ghost" size="sm" onClick={load}>{t.actions.retry}</Button>
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
        <CardHeader className="pb-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle>{t.list.title}</CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t.list.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">{t.list.code}</TableHead>
                  <TableHead>{t.list.name}</TableHead>
                  <TableHead>{t.list.contact}</TableHead>
                  <TableHead>{t.list.phone}</TableHead>
                  <TableHead>{t.list.level}</TableHead>
                  <TableHead>{t.list.address}</TableHead>
                  <TableHead className="w-[80px] text-right">{t.list.action}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> {t.list.loading}
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      {t.list.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c) => {
                    const lv = levelOf(c);
                    const lvLabel = c.levelText || t.levels[lv as keyof typeof t.levels] || t.levels.normal;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.code || t.misc.unknown}</TableCell>
                        <TableCell>
                          <div className="font-medium">{c.name || t.misc.unknown}</div>
                          {c.salesperson && (
                            <div className="text-xs text-muted-foreground">{t.list.salesperson}：{c.salesperson}</div>
                          )}
                          {c.latitude && c.longitude ? (
                            <div className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {Number(c.latitude).toFixed(4)}, {Number(c.longitude).toFixed(4)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{c.contactName || t.misc.unknown}</TableCell>
                        <TableCell>{c.contactPhone || c.phone || t.misc.unknown}</TableCell>
                        <TableCell>
                          <Badge variant={LEVEL_VARIANT[lv] || "secondary"}>{lvLabel}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[300px] truncate">
                          {c.address || t.misc.unknown}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                            {t.actions.edit}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId != null ? t.dialog.editTitle : t.dialog.title}</DialogTitle>
            <DialogDescription>
              {editingId != null ? t.dialog.editDescription : t.dialog.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cust-name">{t.dialog.name}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="cust-name"
                    className="pl-9"
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      scheduleGeoSearch(e.target.value);
                    }}
                    onFocus={() => { if (candidates.length) setShowCandidates(true); }}
                    placeholder={t.dialog.namePlaceholder}
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={locateNearMe}
                  disabled={locating}
                  className="shrink-0"
                >
                  {locating ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Crosshair className="w-4 h-4 mr-1" />
                  )}
                  {t.dialog.locate}
                </Button>
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
                            <Badge variant="secondary" className="text-[10px] h-4 px-1">{t.dialog.badgeSystem}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">{t.dialog.badgeMap}</Badge>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <select
                  id="cust-salesperson"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.salesperson}
                  onChange={(e) => setForm({ ...form, salesperson: e.target.value })}
                >
                  <option value="">{t.dialog.salespersonPlaceholder}</option>
                  {salespersonOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-level">{t.dialog.level}</Label>
                <select
                  id="cust-level"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                >
                  <option value="normal">{t.levels.normal}</option>
                  <option value="key">{t.levels.key}</option>
                  <option value="vip">{t.levels.vip}</option>
                  <option value="potential">{t.levels.potential}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-contact">{t.dialog.contact}</Label>
                <Input
                  id="cust-contact"
                  value={primaryContact.name}
                  onChange={(e) => updateContact(0, "name", e.target.value)}
                  placeholder={t.dialog.contactName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-phone">{t.dialog.phone}</Label>
                <Input
                  id="cust-phone"
                  value={primaryContact.phone}
                  onChange={(e) => updateContact(0, "phone", e.target.value)}
                  placeholder={t.dialog.contactPhone}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="cust-address">{t.dialog.address}</Label>
                <Input
                  id="cust-address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value, mapAddress: e.target.value })}
                  placeholder={t.dialog.addressPlaceholder}
                />
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
                  <div className="font-mono text-[11px] text-slate-500">
                    {Number(form.latitude).toFixed(6)}, {Number(form.longitude).toFixed(6)}
                    {form.mapPoiId ? ` · POI ${form.mapPoiId}` : ""}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm({
                      ...form,
                      latitude: null,
                      longitude: null,
                      mapProvider: "",
                      mapPoiId: "",
                      mapPoiName: "",
                      mapAddress: "",
                    })
                  }
                >
                  {t.actions.clear}
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t.actions.cancel}
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? t.actions.saving : editingId != null ? t.actions.saveEdit : t.actions.saveNow}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
