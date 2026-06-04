import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, TrendingUp, Users, Wrench, MapPin, Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Amap } from "@/components/Amap";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/services/api";

interface Summary {
  todayTotal?: number;
  monthTotal?: number;
  monthCustomers?: number;
  monthEngineerVisits?: number;
}

interface Order {
  id: string | number;
  orderNo?: string;
  displayId?: string;
  displayStatus?: string;
  displayTitle?: string;
  status: string;
  customer?: { name?: string } | string;
  deviceName?: string;
  engineerName?: string;
  serviceMode?: string;
  createdAt?: string;
}

interface CustomerPoint {
  id: string | number;
  name: string;
  longitude?: number;
  latitude?: number;
  serviceOrderCount?: number;
  orderCount?: number;
  useCount?: number;
  address?: string;
  contact?: string;
  phone?: string;
  level?: "peak" | "high" | "active" | "quiet";
}

const I18N = {
  "zh-CN": {
    title: "运营总览",
    subtitle: "系统运行状态、服务工单及客户地理分布实时监测",
    searchPlaceholder: "快速搜索工单或客户...",
    exportReport: "导出运营月报",
    stats: {
      todayTotal: "今日服务总数",
      monthTotal: "本月服务总数",
      monthCustomers: "本月客户数量",
      monthEngineerVisits: "本月工程师拜访数",
      realtime: "实时统计",
    },
    map: {
      title: "客户地理分布",
      description: "实时展示各区域客户密度及服务点位",
      suzhou: "苏州市",
      wuxi: "无锡市",
      kunshan: "昆山市",
    },
    recent: {
      title: "最近工单",
      description: "最新的服务记录",
      viewAll: "查看全部",
      loading: "加载中",
      empty: "暂无工单",
      unnamedCustomer: "—",
      serviceRecord: "服务记录",
      unnamedEngineer: "—",
    },
    errors: {
      loadFailed: "加载失败",
    },
    status: {
      draft: "草稿",
      in_progress: "进行中",
      submitted: "已结案",
      pending_confirmation: "待确认",
      cancelled: "已作废",
      completed: "已完成",
    },
  },
  "zh-TW": {
    title: "運營總覽",
    subtitle: "系統運行狀態、服務工單及客戶地理分佈即時監測",
    searchPlaceholder: "快速搜尋工單或客戶...",
    exportReport: "匯出營運月報",
    stats: {
      todayTotal: "今日服務總數",
      monthTotal: "本月服務總數",
      monthCustomers: "本月客戶數量",
      monthEngineerVisits: "本月工程師拜訪數",
      realtime: "即時統計",
    },
    map: {
      title: "客戶地理分佈",
      description: "即時展示各區域客戶密度及服務點位",
      suzhou: "蘇州市",
      wuxi: "無錫市",
      kunshan: "昆山市",
    },
    recent: {
      title: "最近工單",
      description: "最新的服務記錄",
      viewAll: "查看全部",
      loading: "載入中",
      empty: "暫無工單",
      unnamedCustomer: "—",
      serviceRecord: "服務記錄",
      unnamedEngineer: "—",
    },
    errors: {
      loadFailed: "載入失敗",
    },
    status: {
      draft: "草稿",
      in_progress: "進行中",
      submitted: "已結案",
      pending_confirmation: "待確認",
      cancelled: "已作廢",
      completed: "已完成",
    },
  },
} as const;

const STATUS_BADGE_VARIANT: Record<string, "warning" | "secondary" | "success" | "destructive" | "purple" | "info"> = {
  draft: "secondary",
  in_progress: "purple",
  submitted: "success",
  pending_confirmation: "warning",
  cancelled: "destructive",
  completed: "success",
};

function normalizeStatus(s: string, labels: Record<string, string>) {
  return labels[s] || s;
}

export function Dashboard() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = I18N[lang];
  const [summary, setSummary] = useState<Summary>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [mapPoints, setMapPoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [stats, orderRes, customerRes] = await Promise.all([
          api.get("/service-orders/stats/overview"),
          api.get("/service-orders?pageSize=20&sortBy=createdAt&sortDir=desc"),
          api.get("/customers?pageSize=200").catch(() => null),
        ]);
        if (cancelled) return;
        setSummary(stats?.summary || {});
        const items = (stats?.recent || orderRes?.items || []) as Order[];
        setOrders(items);
        const rawCustomers = customerRes?.items || customerRes?.data?.items || customerRes?.data || [];
        setMapPoints(
          (Array.isArray(rawCustomers) ? rawCustomers : [])
            .map((c: any) => ({
              id: c.id,
              name: c.name || c.customerName || "未命名",
              lng: Number(c.longitude ?? c.lng ?? c.lon),
              lat: Number(c.latitude ?? c.lat),
              annualServices: c.annualServices ?? c.serviceOrderCount ?? c.orderCount ?? c.useCount ?? 0,
              address: c.address,
              contact: c.contactPerson || c.contact,
              phone: c.contactPhone || c.phone,
            }))
            .filter((p: any) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && p.lng !== 0 && p.lat !== 0)
        );
      } catch (e: any) {
        if (!cancelled) setError(e?.message || t.errors.loadFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [t.errors.loadFailed]);

  const stats = [
    { title: t.stats.todayTotal, value: summary.todayTotal ?? 0, icon: Wrench, color: "text-purple-600", bg: "bg-purple-50" },
    { title: t.stats.monthTotal, value: summary.monthTotal ?? 0, icon: BarChart3, color: "text-blue-600", bg: "bg-blue-50" },
    { title: t.stats.monthCustomers, value: summary.monthCustomers ?? 0, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: t.stats.monthEngineerVisits, value: summary.monthEngineerVisits ?? 0, icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
  ];

  const recentOrders = orders.slice(0, 5).map((o) => ({
    id: o.orderNo || `TK-${o.id}`,
    customer: typeof o.customer === "string" ? o.customer : o.customer?.name || o.deviceName || t.recent.unnamedCustomer,
    status: o.status,
    statusLabel: normalizeStatus(o.status, t.status),
    title: o.displayTitle || o.deviceName || t.recent.serviceRecord,
    engineer: o.engineerName || t.recent.unnamedEngineer,
    date: o.createdAt ? o.createdAt.split(" ")[0] : "",
  }));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9 w-64 bg-card" placeholder={t.searchPlaceholder} />
          </div>
          <Button>{t.exportReport}</Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">
                    {loading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : stat.value}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{t.stats.realtime}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t.map.title}</CardTitle>
              <CardDescription>{t.map.description}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="cursor-pointer">{t.map.suzhou}</Badge>
              <Badge variant="outline" className="cursor-pointer">{t.map.wuxi}</Badge>
              <Badge variant="outline" className="cursor-pointer">{t.map.kunshan}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px] p-0">
            <Amap
              center={{ lng: 120.71518, lat: 31.31962, name: "苏州办事处" }}
              points={mapPoints}
              zoom={9}
              height={420}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t.recent.title}</CardTitle>
              <CardDescription>{t.recent.description}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/service-orders")}>
              {t.recent.viewAll}
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.recent.loading}
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t.recent.empty}</div>
            ) : (
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="group relative flex items-start gap-4 p-3 -mx-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate("/service-orders")}
                  >
                    <div className={`mt-1 w-2 h-2 rounded-full ${
                      order.status === "in_progress" ? "bg-primary" : "bg-muted-foreground/30"
                    }`} />
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tracking-tight truncate">{order.id}</span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{order.date}</span>
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-1">{order.customer}</div>
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <Badge variant={STATUS_BADGE_VARIANT[order.status] || "secondary"} className="text-[10px] h-5 py-0 px-2 font-normal">
                          {order.statusLabel}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium">{order.engineer}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
