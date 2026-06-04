import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/services/api";

interface TimesheetItem {
  id?: string | number;
  orderNo?: string;
  customerName?: string;
  engineerName?: string;
  serviceDate?: string;
  serviceAt?: string;
  workHours?: number;
  duration?: number;
  category?: string;
  source?: string;
}

interface EngineerOption {
  id: string | number;
  realName?: string;
  username?: string;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function formatHours(value?: number) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}h`;
}

function toCsv(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function defaultMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const last = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

export function Timesheets() {
  const defaults = useMemo(() => defaultMonthRange(), []);
  const [startDate, setStartDate] = useState(defaults.first);
  const [endDate, setEndDate] = useState(defaults.last);
  const [engineerId, setEngineerId] = useState("all");
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [items, setItems] = useState<TimesheetItem[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        engineerId,
      });
      const data = await api.get(`/service-orders/timesheet/monthly?${params.toString()}`);
      const list = (data?.items || []) as TimesheetItem[];
      setItems(list);
      setLabel(data?.label || `${startDate} 至 ${endDate}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadEngineers() {
    try {
      const data = await api.get("/users/engineers");
      setEngineers((data?.items || []) as EngineerOption[]);
    } catch {
      setEngineers([]);
    }
  }

  useEffect(() => {
    loadEngineers();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, engineerId]);

  const stats = useMemo(() => {
    const total = items.length;
    const totalHours = items.reduce((sum, item) => sum + Number(item.workHours || item.duration || 0), 0);
    const service = items.filter((i) => i.source === "service_order").length;
    const manual = items.filter((i) => i.source === "manual").length;
    return [
      { label: "已加载记录", value: total },
      { label: "服务记录", value: service },
      { label: "手工记录", value: manual },
      { label: "总工时", value: `${totalHours.toFixed(1)}h` },
    ];
  }, [items]);

  function exportCsv() {
    if (!items.length) return;
    const rows: string[][] = [
      ["工单编号", "客户", "工程师", "服务日期", "工时(h)", "来源"],
      ...items.map((item) => [
        item.orderNo || String(item.id || "-"),
        item.customerName || "-",
        item.engineerName || "-",
        formatDate(item.serviceDate || item.serviceAt),
        String(item.workHours ?? item.duration ?? 0),
        item.source || "-",
      ]),
    ];
    downloadCsv(`timesheet-${startDate}-to-${endDate}.csv`, toCsv(rows));
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">月报导出</h1>
          <p className="text-muted-foreground mt-1">导出指定月份的工时数据</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button onClick={exportCsv} disabled={loading || items.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            导出 CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>重试</Button>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">开始日期</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">结束日期</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 flex-1 min-w-[180px]">
              <Label>工程师</Label>
              <Select value={engineerId} onValueChange={setEngineerId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择工程师" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部工程师</SelectItem>
                  {engineers.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.realName || e.username || `工程师 #${e.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>工时列表 {label && <span className="text-muted-foreground font-normal text-sm ml-2">({label})</span>}</CardTitle>
            <CardDescription>按工单维度展示当前月份工时记录</CardDescription>
          </div>
          <Badge variant="secondary">{items.length} 条</Badge>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">暂无工时数据</div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>工单</TableHead>
                    <TableHead>客户</TableHead>
                    <TableHead>工程师</TableHead>
                    <TableHead>服务日期</TableHead>
                    <TableHead className="text-right">工时</TableHead>
                    <TableHead>来源</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={item.id || `${item.orderNo}-${idx}`}>
                      <TableCell className="font-medium">{item.orderNo || `记录 #${idx + 1}`}</TableCell>
                      <TableCell>{item.customerName || "-"}</TableCell>
                      <TableCell>{item.engineerName || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(item.serviceDate || item.serviceAt)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-primary">
                        {formatHours(item.workHours ?? item.duration)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.source === "service_order" ? "info" : "secondary"}>
                          {item.source === "service_order" ? "服务记录" : item.source === "manual" ? "手工记录" : item.source || "-"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
