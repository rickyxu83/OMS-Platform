import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, TrendingUp, Users, Wrench, Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Amap } from "@/components/Amap";
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

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  in_progress: "进行中",
  submitted: "已结案",
  pending_confirmation: "待确认",
  cancelled: "已作废",
  completed: "已完成",
};

const STATUS_BADGE_VARIANT: Record<string, "warning" | "secondary" | "success" | "destructive" | "purple" | "info"> = {
  draft: "secondary",
  in_progress: "purple",
  submitted: "success",
  pending_confirmation: "warning",
  cancelled: "destructive",
  completed: "success",
};

function normalizeStatus(s: string) {
  return STATUS_LABELS[s] || s;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [stats, orderRes] = await Promise.all([
          api.get("/service-orders/stats/overview"),
          api.get("/service-orders?pageSize=20&sortBy=createdAt&sortDir=desc"),
        ]);
        if (cancelled) return;
        setSummary(stats?.summary || {});
        const items = (stats?.recent || orderRes?.items || []) as Order[];
        setOrders(items);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const stats = [
    { title: "今日服务总数", value: summary.todayTotal ?? 0, icon: Wrench, color: "text-purple-600", bg: "bg-purple-50" },
    { title: "本月服务总数", value: summary.monthTotal ?? 0, icon: BarChart3, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "本月客户数量", value: summary.monthCustomers ?? 0, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "本月工程师拜访数", value: summary.monthEngineerVisits ?? 0, icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
  ];

  const recentOrders = orders.slice(0, 5).map((o) => ({
    id: o.orderNo || `TK-${o.id}`,
    customer: typeof o.customer === "string" ? o.customer : o.customer?.name || o.deviceName || "—",
    status: o.status,
    statusLabel: o.displayStatus || normalizeStatus(o.status),
    title: o.displayTitle || o.deviceName || "服务记录",
    engineer: o.engineerName || "—",
    date: o.createdAt ? o.createdAt.split(" ")[0] : "",
  }));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">运营总览</h1>
          <p className="text-muted-foreground mt-1">系统运行状态、服务工单及客户地理分布实时监测</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9 w-64 bg-card" placeholder="快速搜索工单或客户..." />
          </div>
          <Button>导出运营月报</Button>
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
                <p className="text-xs text-muted-foreground mt-2">实时统计</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>客户地理分布</CardTitle>
              <CardDescription>实时展示各区域客户密度及服务点位</CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="cursor-pointer">苏州市</Badge>
              <Badge variant="outline" className="cursor-pointer">无锡市</Badge>
              <Badge variant="outline" className="cursor-pointer">昆山市</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px]">
            <div className="relative w-full h-full rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
              <div className="absolute inset-0 opacity-20">
                <svg width="100%" height="100%" viewBox="0 0 800 500" preserveAspectRatio="none">
                  <path d="M50,100 Q150,50 250,100 T450,100 T650,50 T750,150 L750,450 L50,450 Z" fill="#6366f1" />
                  <path d="M0,200 Q100,250 200,200 T400,250 T600,200 T800,300" stroke="#cbd5e1" fill="none" strokeWidth="2" />
                  <path d="M200,0 L200,500 M400,0 L400,500 M600,0 L600,500" stroke="#cbd5e1" strokeWidth="0.5" />
                </svg>
              </div>
              <div className="absolute top-4 right-4 flex flex-col gap-2">
                <div className="p-2 bg-white rounded shadow-sm border border-border flex flex-col gap-2">
                  <Button variant="ghost" size="icon" className="w-8 h-8">+</Button>
                  <div className="h-px bg-border" />
                  <Button variant="ghost" size="icon" className="w-8 h-8">-</Button>
                </div>
                <Button variant="secondary" size="icon" className="bg-white shadow-sm border border-border w-10 h-10">
                  <MapPin className="w-5 h-5 text-primary" />
                </Button>
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-muted-foreground">
                  <MapPin className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">客户地理分布图</p>
                  <p className="text-xs">集成高德地图展示</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>最近工单</CardTitle>
              <CardDescription>最新的服务记录</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/service-orders")}>
              查看全部
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">暂无工单</div>
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
