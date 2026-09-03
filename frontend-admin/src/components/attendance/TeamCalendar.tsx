/**
 * 团队请假日历（spec 006-C）：月历格子视图展示当月已批准的请假/调休条目，
 * 全员假勤用户可见（公司内部透明，佬 2026-09-03 裁决）。纯只读，不含申请/审批操作。
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/HelpTooltip";
import { api } from "@/services/api";
import { LEAVE_TYPE_LABELS } from "@/pages/attendance-shared";

interface CalendarItem {
  id: number | string;
  employeeId: number | string;
  employeeName: string;
  requestType: string; // leave | comp_time
  leaveType?: string | null;
  startAt: string; // "YYYY-MM-DD HH:mm"
  endAt: string;
  hours: number;
  workingDays: number | null;
}

interface DayEntry {
  key: string;
  employeeName: string;
  label: string; // 假别/调休
  marker: string; // "" 全天 | 上午 | 下午 | 时段文本
  colorCls: string;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// 假别色板：已知假别固定配色，未知假别走默认色；调休独立配色
const LEAVE_TYPE_COLORS: Record<string, string> = {
  annual: "bg-sky-100 text-sky-800 ring-sky-200",
  sick: "bg-rose-100 text-rose-800 ring-rose-200",
  personal: "bg-amber-100 text-amber-800 ring-amber-200",
  marriage: "bg-violet-100 text-violet-800 ring-violet-200",
  bereavement: "bg-slate-200 text-slate-700 ring-slate-300",
};
const COMP_TIME_COLOR = "bg-teal-100 text-teal-800 ring-teal-200";
const DEFAULT_LEAVE_COLOR = "bg-indigo-100 text-indigo-800 ring-indigo-200";

function itemLabel(item: CalendarItem) {
  return item.requestType === "comp_time" ? "调休" : LEAVE_TYPE_LABELS[item.leaveType || ""] || item.leaveType || "请假";
}

function itemColor(item: CalendarItem) {
  return item.requestType === "comp_time" ? COMP_TIME_COLOR : LEAVE_TYPE_COLORS[item.leaveType || ""] || DEFAULT_LEAVE_COLOR;
}

function splitDateTime(value: string) {
  const normalized = String(value || "").replace("T", " ");
  return { date: normalized.slice(0, 10), time: normalized.slice(11, 16) };
}

function addDays(date: string, days: number) {
  const base = new Date(`${date}T00:00:00`);
  base.setDate(base.getDate() + days);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

/** 把一条申请展开成逐日条目，附半天/时段标注 */
function expandItem(item: CalendarItem): Array<{ date: string; entry: DayEntry }> {
  const start = splitDateTime(item.startAt);
  const end = splitDateTime(item.endAt);
  if (!start.date || !end.date) return [];
  const out: Array<{ date: string; entry: DayEntry }> = [];
  const base = { key: String(item.id), employeeName: item.employeeName, label: itemLabel(item), colorCls: itemColor(item) };
  for (let date = start.date; date <= end.date; date = addDays(date, 1)) {
    let marker = "";
    if (item.requestType === "comp_time") {
      // 调休按小时：同日显示时段，跨日边界显示起止时刻
      if (start.date === end.date) marker = `${start.time}~${end.time}`;
      else if (date === start.date) marker = `${start.time}起`;
      else if (date === end.date) marker = `至${end.time}`;
    } else {
      const partialStart = date === start.date && start.time === "14:00";
      const partialEnd = date === end.date && end.time === "14:00";
      if (partialStart && partialEnd) marker = "下午";
      else if (partialStart) marker = "下午起";
      else if (partialEnd) marker = "上午止";
    }
    out.push({ date, entry: { ...base, key: `${item.id}-${date}`, marker } });
  }
  return out;
}

/** 月历网格：周日开头，6 行 × 7 列，空格补位用空串 */
function buildWeeks(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const first = `${month}-01`;
  const firstWeekday = new Date(`${first}T00:00:00`).getDay();
  const daysInMonth = new Date(year, mon, 0).getDate();
  const cells: string[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push("");
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push("");
  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(year, mon - 1 + delta, 1);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const MAX_CHIPS_PER_DAY = 3;

export function TeamCalendar() {
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/attendance/team-calendar?month=${month}`)
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "团队日历加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const today = useMemo(() => {
    const now = new Date();
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);

  const weeks = useMemo(() => buildWeeks(month), [month]);

  // 日期 → 当日条目
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const item of items) {
      for (const { date, entry } of expandItem(item)) {
        if (!date.startsWith(month)) continue;
        const list = map.get(date) || [];
        list.push(entry);
        map.set(date, list);
      }
    }
    return map;
  }, [items, month]);

  // 图例：当月实际出现的假别
  const legend = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      const label = itemLabel(item);
      if (!seen.has(label)) seen.set(label, itemColor(item));
    }
    return [...seen.entries()];
  }, [items]);

  const [year, mon] = month.split("-").map(Number);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-sky-600" />团队日历
            <HelpTooltip label="当月已批准的请假与调休一览：谁哪天不在、全天还是半天（上午止/下午起）。调休按小时显示时段。仅已批准的申请会上日历。" />
          </CardTitle>
          <CardDescription>已批准的请假/调休按天落格，半天与时段有标注</CardDescription>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上一月">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium tabular-nums">
            {year} 年 {mon} 月
          </span>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下一月">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {month !== currentMonth() ? (
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setMonth(currentMonth())}>
              回到本月
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-sm">
              {WEEKDAYS.map((day, index) => (
                <div
                  key={day}
                  className={`border-b bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground ${index === 0 || index === 6 ? "text-rose-400" : ""}`}
                >
                  {day}
                </div>
              ))}
              {weeks.flat().map((date, index) => {
                const entries = date ? entriesByDate.get(date) || [] : [];
                const weekend = index % 7 === 0 || index % 7 === 6;
                return (
                  <div
                    key={date || `pad-${index}`}
                    className={`min-h-20 border-b border-r p-1.5 last:border-r-0 md:min-h-24 [&:nth-child(7n)]:border-r-0 ${date ? "" : "bg-muted/30"} ${weekend && date ? "bg-rose-50/40" : ""}`}
                  >
                    {date ? (
                      <>
                        <div className="mb-1 flex items-center justify-between">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums ${date === today ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}
                          >
                            {Number(date.slice(8, 10))}
                          </span>
                          {entries.length > MAX_CHIPS_PER_DAY ? (
                            <span className="text-[10px] text-muted-foreground">{entries.length} 人</span>
                          ) : null}
                        </div>
                        <div className="space-y-0.5">
                          {entries.slice(0, MAX_CHIPS_PER_DAY).map((entry) => (
                            <div
                              key={entry.key}
                              title={`${entry.employeeName} · ${entry.label}${entry.marker ? ` · ${entry.marker}` : ""}`}
                              className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-4 ring-1 ring-inset ${entry.colorCls}`}
                            >
                              <span className="truncate font-medium">{entry.employeeName}</span>
                              <span className="shrink-0 opacity-75">{entry.label}{entry.marker ? `·${entry.marker}` : ""}</span>
                            </div>
                          ))}
                          {entries.length > MAX_CHIPS_PER_DAY ? (
                            <div className="px-1 text-[10px] text-muted-foreground">+{entries.length - MAX_CHIPS_PER_DAY} 更多</div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {legend.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>图例：</span>
                {legend.map(([label, colorCls]) => (
                  <span key={label} className={`rounded px-1.5 py-0.5 ring-1 ring-inset ${colorCls}`}>
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-muted-foreground">当月暂无已批准的请假/调休</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
