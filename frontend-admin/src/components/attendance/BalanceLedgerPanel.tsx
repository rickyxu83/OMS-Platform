import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { ResponsiveCard, ResponsiveList } from "@/components/ResponsiveList";
import { formatDate, formatDateTime } from "@/lib/format";
import { annualBalanceDays, days, hours, LEAVE_TYPE_LABELS, type EmployeeProfile } from "@/pages/attendance-shared";

/** 后端 GET /attendance/me/balance-ledger 返回的单条流水（特休按天、调休按小时） */
export interface BalanceLedgerRequest {
  id: number | string;
  requestType?: string | null;
  leaveType?: string | null;
  overtimeResult?: string | null;
  hours?: number;
  startAt?: string | null;
  endAt?: string | null;
  status?: string | null;
}

export interface BalanceLedgerItem {
  id: number | string;
  balanceType: string; // annual_leave=特休（天） | comp_time=调休（小时）
  action: string; // earn=加班入账 | use=使用扣减 | void=作废冲回 | adjust=行政调整
  delta: number;
  balanceAfter: number;
  note?: string;
  createdAt?: string | null;
  createdByName?: string;
  request?: BalanceLedgerRequest | null;
}

const BALANCE_TYPE_LABELS: Record<string, string> = {
  annual_leave: "特休",
  comp_time: "调休",
};

const LEDGER_ACTION_LABELS: Record<string, string> = {
  earn: "加班入账",
  use: "使用扣减",
  void: "作废冲回",
  adjust: "行政调整",
  approved: "审批联动", // 历史数据（旧版代码口径）
};

function balanceTypeLabel(type?: string) {
  return BALANCE_TYPE_LABELS[String(type)] || type || "-";
}

function ledgerActionLabel(action?: string) {
  return LEDGER_ACTION_LABELS[String(action)] || action || "-";
}

function amountText(balanceType: string, value?: number) {
  const number = Number(value || 0);
  return balanceType === "annual_leave" ? `${days(number)} 天` : `${hours(number)} 小时`;
}

/** 变动量：带符号着色，入账/冲回为绿，扣减为红 */
function DeltaText({ balanceType, delta }: { balanceType: string; delta: number }) {
  const number = Number(delta || 0);
  const sign = number > 0 ? "+" : "";
  const color = number > 0 ? "text-emerald-600" : number < 0 ? "text-red-600" : "text-muted-foreground";
  const magnitude = balanceType === "annual_leave" ? `${days(Math.abs(number))} 天` : `${hours(Math.abs(number))} 小时`;
  return <span className={`font-semibold tabular-nums ${color}`}>{number < 0 ? `-${magnitude}` : `${sign}${magnitude}`}</span>;
}

function shortDate(value?: string | null) {
  const text = formatDate(value);
  return text === "-" ? "" : text;
}

/** 关联申请概要：假别/加班时长 + 起止日期（同日只显示一天） */
function requestSummary(request?: BalanceLedgerRequest | null) {
  if (!request) return "";
  const start = shortDate(request.startAt);
  const end = shortDate(request.endAt);
  const range = start && end && end !== start ? `${start} ~ ${end}` : start || end;
  if (request.requestType === "leave") {
    const leaveLabel = LEAVE_TYPE_LABELS[String(request.leaveType)] || "请假";
    return range ? `${leaveLabel} ${range}` : leaveLabel;
  }
  if (request.requestType === "overtime") {
    const base = `加班 ${hours(request.hours)} 小时`;
    return range ? `${base} · ${range}` : base;
  }
  if (request.requestType === "comp_time") {
    return range ? `调休 ${range}` : "调休";
  }
  return range || "";
}

interface BalanceLedgerPanelProps {
  items: BalanceLedgerItem[];
  loading: boolean;
  profile?: EmployeeProfile | null;
  onRefresh: () => void;
}

type LedgerFilter = "all" | "annual_leave" | "comp_time";

/** 员工本人额度变动清单：特休/调休的入账、扣减、冲回与行政调整流水（含变动后余额） */
export function BalanceLedgerPanel({ items, loading, profile, onRefresh }: BalanceLedgerPanelProps) {
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.balanceType === filter)),
    [items, filter],
  );
  const chips: Array<{ key: LedgerFilter; label: string; count: number }> = [
    { key: "all", label: "全部", count: items.length },
    { key: "annual_leave", label: "特休", count: items.filter((item) => item.balanceType === "annual_leave").length },
    { key: "comp_time", label: "调休", count: items.filter((item) => item.balanceType === "comp_time").length },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" />
          <div>
            <CardTitle className="text-base">额度变动记录</CardTitle>
            <CardDescription>特休与调休的每笔入账、扣减、冲回与行政调整，变动后余额逐条累算</CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">特休余额 {days(annualBalanceDays(profile))} 天</Badge>
          <Badge variant="secondary">调休余额 {hours(profile?.compTimeBalanceHours)} 小时</Badge>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => {
            const active = filter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                className={active
                  ? "flex h-8 items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-primary"
                  : "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted/50"}
              >
                {chip.label}
                <span className={active ? "font-semibold" : ""}>{chip.count}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />加载中
          </div>
        ) : !filtered.length ? (
          <EmptyState
            title="暂无额度变动记录"
            description={filter === "all" ? "请假、加班转调休或行政调整后，会在这里留下明细" : "该类型暂无变动记录"}
          />
        ) : (
          <ResponsiveList
            items={filtered}
            keyExtractor={(item) => String(item.id)}
            renderCard={(item) => (
              <ResponsiveCard
                title={ledgerActionLabel(item.action)}
                status={<DeltaText balanceType={item.balanceType} delta={item.delta} />}
                subtitle={requestSummary(item.request) || item.note || undefined}
                fields={[
                  { label: "类型", value: balanceTypeLabel(item.balanceType) },
                  { label: "变动后余额", value: amountText(item.balanceType, item.balanceAfter) },
                  { label: "时间", value: formatDateTime(item.createdAt) },
                  { label: "操作人", value: item.createdByName || "—" },
                ]}
              />
            )}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>变动</TableHead>
                  <TableHead>变动后余额</TableHead>
                  <TableHead>事由</TableHead>
                  <TableHead>操作人</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => {
                  const summary = requestSummary(item.request);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline">{balanceTypeLabel(item.balanceType)}</Badge></TableCell>
                      <TableCell><DeltaText balanceType={item.balanceType} delta={item.delta} /></TableCell>
                      <TableCell className="tabular-nums">{amountText(item.balanceType, item.balanceAfter)}</TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="text-sm">
                            <span className="font-medium">{ledgerActionLabel(item.action)}</span>
                            {summary ? <span className="ml-1.5 text-muted-foreground">{summary}</span> : null}
                          </div>
                          {item.note && item.note !== summary ? (
                            <div className="text-xs text-muted-foreground">{item.note}</div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.createdByName || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ResponsiveList>
        )}
      </CardContent>
    </Card>
  );
}
