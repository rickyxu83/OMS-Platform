import { Briefcase, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  buildHolidayRanges,
  dateIndex,
  dateValue,
  fmtHolidayDate,
  holidayWeekday,
  type LegalHolidayItem,
} from "@/pages/attendance-shared";

interface HolidayPanelProps {
  /** 已按年份过滤的节假日（含停用项，组件内再过滤 active） */
  publicHolidays: LegalHolidayItem[];
  publicHolidayYear: string;
  setPublicHolidayYear: (year: string) => void;
}

/** 审批页法定节假日只读一览：全体考勤用户可见，默认当年、可切换年份 */
export function HolidayPanel({ publicHolidays, publicHolidayYear, setPublicHolidayYear }: HolidayPanelProps) {
  return (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="h-4 w-4 text-rose-500" />
                  法定节假日
                  <HelpTooltip label="全年法定节假日与调休补班一览，供请假与排班参考。节假日由管理员在「考勤设置」中维护，并有每年 11~12 月自动同步来年数据的机制。" />
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">全年法定节假日一览，供请假与排班参考</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={Number(publicHolidayYear) <= 2000}
                  onClick={() => setPublicHolidayYear(String(Math.max(2000, Number(publicHolidayYear) - 1)))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="w-16 text-center text-lg font-bold tabular-nums">{publicHolidayYear}</div>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={Number(publicHolidayYear) >= 2100}
                  onClick={() => setPublicHolidayYear(String(Math.min(2100, Number(publicHolidayYear) + 1)))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="px-5 py-4">
              {(() => {
                const items = publicHolidays.filter((item) => item.active !== false);
                if (!items.length) return <p className="py-10 text-center text-sm text-muted-foreground">暂无 {publicHolidayYear} 年法定节假日数据</p>;
                const { ranges, orphanMakeup } = buildHolidayRanges(items);
                const todayStr = dateValue();
                const holidayDays = ranges.reduce((sum, range) => sum + range.days, 0);
                const makeupCount = items.filter((item) => item.dayType === "makeup_workday").length;
                const ongoing = ranges.find((range) => range.start <= todayStr && todayStr <= range.end) || null;
                const upcoming = ranges.find((range) => range.start > todayStr) || null;
                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="rose">{ranges.length} 个假期 · 共 {holidayDays} 天</Badge>
                      <Badge variant="orange">调休补班 {makeupCount} 天</Badge>
                      {ongoing ? (
                        <span className="text-muted-foreground">正在放假：{ongoing.name}（{fmtHolidayDate(ongoing.end)} 结束）</span>
                      ) : upcoming ? (
                        <span className="text-muted-foreground">下个假期：{upcoming.name}，还有 {dateIndex(upcoming.start) - dateIndex(todayStr)} 天</span>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {ranges.map((range) => {
                        const past = range.end < todayStr;
                        const isOngoing = ongoing?.start === range.start;
                        const isNext = !isOngoing && upcoming?.start === range.start;
                        return (
                          <div
                            key={`${range.name}-${range.start}`}
                            className={`rounded-xl border p-4 transition ${past ? "opacity-55" : ""} ${isOngoing ? "border-emerald-300 bg-emerald-50/60 shadow-sm" : isNext ? "border-rose-300 bg-rose-50/50 shadow-sm" : "bg-muted/20 hover:bg-muted/40"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-base font-semibold">{range.name}</div>
                              {isOngoing ? (
                                <Badge variant="success">进行中</Badge>
                              ) : isNext ? (
                                <Badge variant="rose">还有 {dateIndex(range.start) - dateIndex(todayStr)} 天</Badge>
                              ) : past ? (
                                <Badge variant="secondary">已结束</Badge>
                              ) : null}
                            </div>
                            <div className="mt-2 text-sm font-medium tabular-nums">
                              {fmtHolidayDate(range.start)}
                              <span className="ml-1 text-xs font-normal text-muted-foreground">{holidayWeekday(range.start)}</span>
                              {range.end !== range.start ? (
                                <>
                                  <span className="mx-1.5 text-muted-foreground">–</span>
                                  {fmtHolidayDate(range.end)}
                                  <span className="ml-1 text-xs font-normal text-muted-foreground">{holidayWeekday(range.end)}</span>
                                </>
                              ) : null}
                              <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700">共 {range.days} 天</span>
                            </div>
                            {range.makeup.length ? (
                              <div className="mt-2.5 border-t border-dashed pt-2 text-xs text-muted-foreground">
                                <span className="mr-1 inline-flex items-center gap-1 font-medium text-orange-600">
                                  <Briefcase className="h-3 w-3" />调休补班
                                </span>
                                {range.makeup.map((date) => `${fmtHolidayDate(date)}（${holidayWeekday(date)}）`).join("、")}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {orphanMakeup.length ? (
                      <div className="rounded-lg border border-dashed p-3">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-orange-600">
                          <Briefcase className="h-3.5 w-3.5" />其他调休补班
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {orphanMakeup.map((item) => (
                            <span key={item.date} className="rounded-full bg-orange-50 px-2.5 py-1 text-xs text-orange-700 ring-1 ring-inset ring-orange-200">
                              {item.name} · {fmtHolidayDate(item.date)}（{holidayWeekday(item.date)}）
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          </div>
  );
}
