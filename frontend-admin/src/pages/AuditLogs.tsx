import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, Download, AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/services/api";

interface AuditLog {
  id: string | number;
  createdAt?: string;
  actorId?: string | number;
  actorName?: string;
  actorUsername?: string;
  action?: string;
  targetType?: string;
  resourceType?: string;
  targetId?: string | number;
  resourceId?: string | number;
  detail?: {
    statusCode?: number;
    ip?: string;
    durationMs?: number;
    message?: string;
    [key: string]: unknown;
  };
}

const ACTION_LABELS: Record<string, string> = {
  read: "查询",
  create: "新增",
  update: "修改",
  delete: "删除",
  login: "登录",
  logout: "登出",
  export: "导出",
};

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "info" | "warning"> = {
  read: "info",
  create: "default",
  update: "warning",
  delete: "destructive",
  login: "secondary",
  logout: "secondary",
  export: "secondary",
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 19);
}

function actorName(log: AuditLog) {
  return log.actorName || log.actorUsername || `用户 #${log.actorId ?? "-"}`;
}

function resourceName(log: AuditLog) {
  const rt = log.targetType || log.resourceType || "";
  const rid = log.targetId ?? log.resourceId;
  if (!rt && !rid) return "-";
  if (!rid) return rt;
  return `${rt} #${rid}`;
}

function severityOf(log: AuditLog): "danger" | "warn" | "ok" {
  const code = Number(log.detail?.statusCode || 0);
  if (code >= 400) return "danger";
  if (log.action === "delete") return "danger";
  if (log.action === "update") return "warn";
  return "ok";
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

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [riskyOnly, setRiskyOnly] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        pageSize: "50",
        sortBy: "createdAt",
        sortDir: "desc",
      });
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const data = await api.get(`/audit-logs?${params.toString()}`);
      setLogs((data?.items || []) as AuditLog[]);
      setTotal(Number(data?.total || 0));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, from, to]);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (riskyOnly && severityOf(log) === "ok") return false;
      if (!keyword) return true;
      return [actorName(log), log.action, log.targetType, log.resourceType, log.detail?.ip]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [logs, searchQuery, riskyOnly]);

  const stats = useMemo(() => {
    const loaded = logs.length;
    const warnings = logs.filter((l) => severityOf(l) !== "ok").length;
    const avgDuration = loaded
      ? Math.round(
          logs.reduce((sum, l) => sum + Number(l.detail?.durationMs || 0), 0) / loaded,
        )
      : 0;
    return [
      { label: "日志总数", value: total },
      { label: "当前页记录", value: loaded },
      { label: "风险操作", value: warnings },
      { label: "平均耗时", value: `${avgDuration}ms` },
    ];
  }, [logs, total]);

  function exportCsv() {
    if (!filtered.length) return;
    const rows: string[][] = [
      ["时间", "操作人", "操作类型", "资源", "状态码", "IP", "耗时(ms)"],
      ...filtered.map((log) => [
        formatDateTime(log.createdAt),
        actorName(log),
        ACTION_LABELS[log.action || ""] || log.action || "-",
        resourceName(log),
        String(log.detail?.statusCode ?? "-"),
        String(log.detail?.ip || "-"),
        String(log.detail?.durationMs ?? "-"),
      ]),
    ];
    downloadCsv(`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">操作审计</h1>
          <p className="text-muted-foreground mt-1">查看系统操作日志</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            导出
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>重试</Button>
        </div>
      )}

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
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="搜索操作人、描述、IP…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <SelectValue placeholder="全部动作" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部动作</SelectItem>
                  <SelectItem value="read">查询</SelectItem>
                  <SelectItem value="create">新增</SelectItem>
                  <SelectItem value="update">修改</SelectItem>
                  <SelectItem value="delete">删除</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="audit-from">开始日期</Label>
                <Input
                  id="audit-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="audit-to">结束日期</Label>
                <Input
                  id="audit-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 px-3 h-9 border border-border rounded-md">
                <Switch
                  id="risky-only"
                  checked={riskyOnly}
                  onCheckedChange={setRiskyOnly}
                />
                <Label htmlFor="risky-only" className="cursor-pointer text-sm">
                  仅看风险操作
                </Label>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setActionFilter("all");
                  setFrom("");
                  setTo("");
                  setRiskyOnly(false);
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                重置
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>审计日志 ({filtered.length})</CardTitle>
            <CardDescription>按时间倒序展示当前筛选范围内的操作记录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-y-auto pr-1">
              {loading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> 正在加载…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无审计记录</div>
              ) : (
                <div className="space-y-2">
                {filtered.map((log, idx) => {
                  const severity = severityOf(log);
                  const actionLabel = ACTION_LABELS[log.action || ""] || log.action || "-";
                  const code = Number(log.detail?.statusCode || 0);
                  return (
                    <div
                      key={log.id || `${log.createdAt}-${idx}`}
                      className={`p-4 border rounded-lg ${
                        severity === "danger"
                          ? "border-destructive/50 bg-destructive/5"
                          : severity === "warn"
                          ? "border-amber-500/50 bg-amber-50"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-xs text-muted-foreground font-mono">
                              {formatDateTime(log.createdAt)}
                            </span>
                            <span className="text-sm font-medium">{actorName(log)}</span>
                            <Badge variant={ACTION_VARIANT[log.action || ""] || "secondary"}>
                              {actionLabel}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {resourceName(log)}
                            </span>
                            {severity === "danger" && (
                              <AlertTriangle className="w-4 h-4 text-destructive" />
                            )}
                          </div>
                          {log.detail?.message && (
                            <div className="text-sm mb-1 text-foreground/80">
                              {String(log.detail.message)}
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                            <span>来源: {String(log.detail?.ip || "-")}</span>
                            <span>
                              状态:{" "}
                              {code >= 400 ? (
                                <span className="text-destructive font-medium">异常 ({code})</span>
                              ) : code > 0 ? (
                                <span className="text-emerald-600 font-medium">成功 ({code})</span>
                              ) : (
                                <span>-</span>
                              )}
                            </span>
                            <span>耗时: {Number(log.detail?.durationMs || 0)}ms</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>审计摘要</CardTitle>
            <CardDescription>当前筛选条件下的统计</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">当前页平均耗时</Label>
              <div className="text-2xl font-bold mt-1">{stats[3]?.value}</div>
            </div>
            <div>
              <Label className="text-muted-foreground">风险操作占比</Label>
              <div className="text-2xl font-bold mt-1 text-destructive">
                {logs.length
                  ? `${Math.round(
                      (logs.filter((l) => severityOf(l) !== "ok").length / logs.length) * 100,
                    )}%`
                  : "0%"}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">当前筛选动作</Label>
              <div className="mt-1">
                <Badge variant="outline">
                  {actionFilter === "all" ? "全部动作" : ACTION_LABELS[actionFilter] || actionFilter}
                </Badge>
              </div>
            </div>
            {searchQuery && (
              <div>
                <Label className="text-muted-foreground">搜索关键词</Label>
                <div className="mt-1 text-sm">{searchQuery}</div>
              </div>
            )}
            {(from || to) && (
              <div>
                <Label className="text-muted-foreground">日期范围</Label>
                <div className="mt-1 text-sm">
                  {from || "起始不限"} 至 {to || "结束不限"}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
