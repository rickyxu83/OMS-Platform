import { useEffect, useMemo, useRef, useState } from "react";
import { Search, RefreshCw, Download, AlertTriangle, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveList } from "@/components/ResponsiveList";
import { ErrorToast } from "@/components/ErrorToast";
import { HelpTooltip } from "@/components/HelpTooltip";
import { api } from "@/services/api";
import { Skeleton } from "@/components/Skeleton";
import { formatCount, formatDateTime } from "@/lib/format";
import {
  auditActionLabel,
  auditTargetLabel,
  describeAuditLog,
  formatAuditDetailLines,
} from "@/lib/audit-text";
import { useUrlParam } from "@/lib/use-url-param";
import { EmptyState } from "@/components/EmptyState";

const RISKY_AUDIT_HELP = "风险操作指可能带来数据变更或执行失败的操作：更新、删除类动作，或响应状态码为 4xx/5xx 的请求。用于快速定位误操作与异常调用。";

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
    location?: string;
    durationMs?: number;
    message?: string;
    [key: string]: unknown;
  };
}

interface UserOption {
  id: string | number;
  username?: string;
  realName?: string;
  name?: string;
  status?: string;
}

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "info" | "warning"> = {
  read: "info",
  create: "default",
  update: "warning",
  delete: "destructive",
  cancel: "destructive",
  login: "secondary",
  login_failed: "destructive",
  logout: "secondary",
  export: "secondary",
  transition: "warning",
  assign: "default",
  purchase_update: "warning",
  passkey_delete: "destructive",
};

function actorName(log: AuditLog) {
  return log.actorName || log.actorUsername || `用户 #${log.actorId ?? "-"}`;
}

function userOptionName(user: UserOption) {
  return user.realName || user.name || user.username || `用户 #${user.id}`;
}

function severityOf(log: AuditLog): "danger" | "warn" | "ok" {
  const code = Number(log.detail?.statusCode || 0);
  if (code >= 400) return "danger";
  if (["delete", "cancel", "login_failed"].includes(log.action || "")) return "danger";
  if (["update", "transition", "purchase_update"].includes(log.action || "")) return "warn";
  return "ok";
}

const SEVERITY_MARK: Record<string, { label: string; className: string }> = {
  danger: { label: "风险", className: "text-destructive" },
  warn: { label: "注意", className: "text-amber-600" },
};

const SEVERITY_ROW_CLASS: Record<string, string> = {
  danger: "bg-destructive/5",
  warn: "bg-amber-50/60",
  ok: "",
};

/** 风险/注意小标记（表格与移动端卡片共用） */
function SeverityMark({ severity }: { severity: "danger" | "warn" | "ok" }) {
  const conf = SEVERITY_MARK[severity];
  if (!conf) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${conf.className}`}>
      <AlertTriangle className="w-3.5 h-3.5" />{conf.label}
    </span>
  );
}

/** 操作徽章 + 风险标记（表格与移动端卡片共用） */
function AuditActionBadge({ log }: { log: AuditLog }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={ACTION_VARIANT[log.action || ""] || "secondary"}>
        {auditActionLabel(log.action)}
      </Badge>
      <SeverityMark severity={severityOf(log)} />
    </span>
  );
}

function auditLogKey(log: AuditLog, idx: number) {
  return log.id || `${log.createdAt}-${idx}`;
}

/** 折叠明细（无内容不渲染） */
function AuditDetailCollapse({ log }: { log: AuditLog }) {
  const detailLines = formatAuditDetailLines(log);
  if (!detailLines.length) return null;
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">
        查看明细（{detailLines.length} 项）
      </summary>
      <div className="mt-1 space-y-0.5 pl-3 border-l-2 border-border">
        {detailLines.map((line, lineIdx) => (
          <div key={lineIdx} className="break-all">{line}</div>
        ))}
      </div>
    </details>
  );
}

/** 状态码文案：4xx/5xx 异常、其余成功、无码显示 - */
function AuditStatus({ code }: { code: number }) {
  if (code >= 400) return <span className="text-destructive font-medium">异常 ({code})</span>;
  if (code > 0) return <span className="text-emerald-600 font-medium">成功 ({code})</span>;
  return <span>-</span>;
}

/** 状态码 + 耗时；vertical 用于桌面表格右侧窄列（上下两行） */
function AuditResultMeta({ log, vertical = false }: { log: AuditLog; vertical?: boolean }) {
  const code = Number(log.detail?.statusCode || 0);
  const duration = <span className="tabular-nums">{Number(log.detail?.durationMs || 0)}ms</span>;
  if (vertical) {
    return (
      <span className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
        <AuditStatus code={code} />
        {duration}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-4">
      <span>状态: <AuditStatus code={code} /></span>
      <span>耗时: {duration}</span>
    </span>
  );
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
  const [users, setUsers] = useState<UserOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actorFilter, setActorFilter] = useUrlParam("actor", "all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [riskyOnly, setRiskyOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const totalPagesRef = useRef(1);
  useEffect(() => { loadingRef.current = loading }, [loading]);
  useEffect(() => { pageRef.current = page }, [page]);
  useEffect(() => { totalPagesRef.current = Math.max(1, Math.ceil(total / pageSize)) }, [total, pageSize]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy: "createdAt",
        sortDir: "desc",
      });
      if (searchQuery.trim()) params.set("keyword", searchQuery.trim());
      if (actorFilter !== "all") params.set("actorId", actorFilter);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (riskyOnly) params.set("riskyOnly", "1");
      const data = await api.get(`/audit-logs?${params.toString()}`);
      const items = (data?.items || []) as AuditLog[];
      // 无限滚动：page>1 追加并按 id 去重,page===1 替换
      setLogs((prev) => (page > 1 ? Array.from(new Map([...prev, ...items].map((item) => [String(item.id), item])).values()) : items));
      setTotal(Number(data?.total || 0));
      const returnedPage = Number(data?.page || page);
      const returnedPageSize = Number(data?.pageSize || pageSize);
      if (Number.isFinite(returnedPage) && returnedPage > 0 && returnedPage !== page) setPage(returnedPage);
      if (Number.isFinite(returnedPageSize) && returnedPageSize > 0 && returnedPageSize !== pageSize) setPageSize(returnedPageSize);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.get("/users?status=")
      .then((data) => setUsers((data?.items || []) as UserOption[]))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      load();
    }, searchQuery.trim() ? 250 : 0);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, searchQuery, actorFilter, from, to, riskyOnly]);

  // 无限滚动：接近最近滚动祖先底部时加载下一页
  useEffect(() => {
    const onScroll = () => {
      if (loadingRef.current) return;
      if (pageRef.current >= totalPagesRef.current) return;
      const scroller = document.querySelector('.mobile-admin-content') as HTMLElement | null;
      const near = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 320
        : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 320;
      if (near) setPage((current) => Math.min(totalPagesRef.current, current + 1));
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  const filtered = logs;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total ? (page - 1) * pageSize + 1 : 0;
  const pageEnd = total ? Math.min(total, page * pageSize) : 0;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
      {
        label: "风险操作",
        value: warnings,
        onClick: () => setRiskyOnly((value) => !value),
        active: riskyOnly,
      },
      { label: "平均耗时", value: `${avgDuration}ms` },
    ];
  }, [logs, total]);

  function exportCsv() {
    if (!filtered.length) return;
    const rows: string[][] = [
      ["时间", "操作人", "操作类型", "资源", "摘要", "状态码", "IP", "归属地", "耗时(ms)"],
      ...filtered.map((log) => [
        formatDateTime(log.createdAt),
        actorName(log),
        auditActionLabel(log.action),
        auditTargetLabel(log),
        describeAuditLog(log),
        String(log.detail?.statusCode ?? "-"),
        String(log.detail?.ip || "-"),
        String(log.detail?.location || "-"),
        String(log.detail?.durationMs ?? "-"),
      ]),
    ];
    downloadCsv(`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">操作审计</h1>
          <p className="text-muted-foreground mt-1">查看系统操作日志</p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <ErrorToast message={error} />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-1 text-sm">
        {stats.map((stat, statIndex) => {
          const content = (
            <>
              {stat.label}
              <b className="font-semibold tabular-nums text-foreground">
                {loading ? (
                  <Skeleton className="inline-block h-4 w-10" />
                ) : (
                  <span className="stat-value-enter inline-block" style={{ animationDelay: `${Math.min(statIndex * 120, 480)}ms` }}>{formatCount(stat.value)}</span>
                )}
              </b>
            </>
          );
          return stat.onClick ? (
            <button
              key={stat.label}
              type="button"
              onClick={stat.onClick}
              aria-pressed={stat.active}
              className={`inline-flex cursor-pointer items-baseline gap-1.5 text-sm transition-colors ${stat.active ? "text-primary font-medium" : "text-muted-foreground hover:text-primary"}`}
            >
              {content}
            </button>
          ) : (
            <span key={stat.label} className="inline-flex items-baseline gap-1.5 text-sm text-muted-foreground">
              {content}
            </span>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索操作人、操作类型、内容、IP…（支持中文，如「派单」「工单」）"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={actorFilter}
              onValueChange={(value) => {
                setActorFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="全部人员" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部人员</SelectItem>
                {users.map((user) => (
                  <SelectItem key={String(user.id)} value={String(user.id)}>
                    {userOptionName(user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="w-[240px]">
              <DateRangePicker
                start={from}
                end={to}
                onChange={(s2, e2) => { setFrom(s2); setTo(e2); setPage(1); }}
                placeholder="开始日期 ~ 结束日期"
                ariaLabel="审计日志日期范围"
              />
            </div>
            <Button variant="outline" onClick={() => {
              setSearchQuery("");
              setActorFilter("all");
              setFrom("");
              setTo("");
              setRiskyOnly(false);
              setPage(1);
            }}>
              <RotateCcw className="w-4 h-4 mr-2" />
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>审计日志 ({total})</CardTitle>
          <CardDescription>
            按时间倒序展示当前筛选范围内的操作记录{total > 0 ? `，已加载 ${pageEnd} / ${total} 条` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            {loading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <span className="btn-loader mr-2" aria-hidden="true" /> 正在加载…
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState title="暂无审计记录" description="当前筛选条件下没有操作日志" />
              ) : (
                <ResponsiveList
                  items={filtered}
                  keyExtractor={auditLogKey}
                  renderCard={(log) => (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatDateTime(log.createdAt)}
                        </span>
                        <span className="text-sm font-medium">{actorName(log)}</span>
                        <AuditActionBadge log={log} />
                      </div>
                      <div className="text-sm text-foreground">{describeAuditLog(log)}</div>
                      {log.detail?.message && (
                        <div className="text-sm text-foreground/80">{String(log.detail.message)}</div>
                      )}
                      <AuditDetailCollapse log={log} />
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>
                          来源: {String(log.detail?.ip || "-")}
                          {log.detail?.location ? `（${String(log.detail.location)}）` : ""}
                        </span>
                        <AuditResultMeta log={log} />
                      </div>
                    </div>
                  )}
                >
                  <table className="w-full table-fixed caption-bottom text-sm">
                    <colgroup>
                      <col className="w-[150px]" />
                      <col className="w-[110px]" />
                      <col className="w-[130px]" />
                      <col />
                      <col className="w-[150px]" />
                      <col className="w-[110px]" />
                    </colgroup>
                    <TableHeader className="text-xs text-muted-foreground [&_th]:font-medium [&_th]:text-muted-foreground">
                      <TableRow>
                        <TableHead>时间</TableHead>
                        <TableHead>操作人</TableHead>
                        <TableHead>操作</TableHead>
                        <TableHead>内容</TableHead>
                        <TableHead>来源</TableHead>
                        <TableHead className="text-right">结果</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((log, idx) => {
                        const severity = severityOf(log);
                        return (
                          <TableRow
                            key={auditLogKey(log, idx)}
                            className={`list-row-enter align-top ${SEVERITY_ROW_CLASS[severity]}`}
                            style={{ animationDelay: `${Math.min(idx * 30, 400)}ms` }}
                          >
                            <TableCell className="whitespace-nowrap py-3 align-top text-xs text-muted-foreground font-mono">
                              {formatDateTime(log.createdAt)}
                            </TableCell>
                            <TableCell className="py-3 align-top text-sm font-medium">
                              <span className="block truncate">{actorName(log)}</span>
                            </TableCell>
                            <TableCell className="py-3 align-top">
                              <AuditActionBadge log={log} />
                            </TableCell>
                            <TableCell className="py-3 align-top">
                              <div className="text-sm text-foreground">{describeAuditLog(log)}</div>
                              {log.detail?.message && (
                                <div className="mt-0.5 text-sm text-foreground/80">
                                  {String(log.detail.message)}
                                </div>
                              )}
                              <AuditDetailCollapse log={log} />
                            </TableCell>
                            <TableCell className="py-3 align-top text-xs text-muted-foreground">
                              <div className="break-all">{String(log.detail?.ip || "-")}</div>
                              {log.detail?.location ? <div>{String(log.detail.location)}</div> : null}
                            </TableCell>
                            <TableCell className="py-3 align-top text-right">
                              <AuditResultMeta log={log} vertical />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </table>
                </ResponsiveList>
              )}
            </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm text-muted-foreground">
              <span>共 {total} 条 · 已加载 {pageEnd} 条</span>
              <span className="text-xs">
                {page >= totalPages ? (
                  <span className="text-emerald-600">已全部加载</span>
                ) : (
                  "向下滚动继续加载"
                )}
              </span>
            </div>
          </CardContent>
        </Card>


    </div>
  );
}
