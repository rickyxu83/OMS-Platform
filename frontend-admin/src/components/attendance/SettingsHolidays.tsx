import { type Dispatch, type SetStateAction } from "react";
import { Check, Download, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HelpTooltip } from "@/components/HelpTooltip";
import { fmtHolidayDate, holidayWeekday, type LegalHolidayItem } from "@/pages/attendance-shared";

// 法定节假日模块说明文案
const HOLIDAY_TABLE_HELP = "法定节假日数据来源：① 内置——系统预置国务院已公布年份，启动时自动校正；② 自动——每年 11~12 月每天 09:15 自动检查来年数据，从两个国务院公告镜像源（holiday-cn、jiejiariapi）拉取并比对，一致后自动写入并邮件通知管理员；同步失败时每周一提醒一次，12 月 15 日起仍未成功则每天提醒；③ 手动——管理员手工新增。「调休补班」按正常工作日处理。";
const HOLIDAY_SYNC_HELP = "数据来自 holiday-cn 与 jiejiariapi 两个独立维护的国务院公告镜像源，双源比对一致且通过结构校验（放假日数量合理、补班日必须在周末、七大节日齐全）后才展示预览；点击「确认写入」时后端会重新拉取校验，不信任前端回传。支持任意年份（可用于回填历史或测试）。来年数据无需手动操作：每年 11 月起系统每天自动同步，成功或持续失败都会邮件通知管理员。";
const HOLIDAY_SOURCE_HELP = "内置：系统预置的官方数据，每次启动自动校正；自动：每年 11~12 月定时任务双源同步写入；手动：管理员手工维护，作为前两者的兜底。";
const HOLIDAY_SOURCE_LABELS: Record<string, string> = {
  builtin: "内置",
  manual: "手动",
  auto: "自动",
};
const DAY_TYPE_LABELS: Record<string, string> = {
  legal_holiday: "放假",
  makeup_workday: "调休补班",
};

export interface HolidaySyncPreview {
  items: Array<{ date: string; name: string; dayType: string }>;
  warnings: string[];
  sources: Array<{ label: string; count: number; error?: string | null }>;
}

export interface HolidayDraft {
  date: string;
  name: string;
  dayType: string;
}

interface SettingsHolidaysProps {
  canManage: boolean;
  holidayYear: string;
  setHolidayYear: (year: string) => void;
  syncYear: string;
  setSyncYear: (year: string) => void;
  syncPreview: HolidaySyncPreview | null;
  setSyncPreview: (preview: HolidaySyncPreview | null) => void;
  syncLoading: boolean;
  syncSaving: boolean;
  runSyncPreview: () => void;
  confirmSyncWrite: () => void;
  holidayDraft: HolidayDraft;
  setHolidayDraft: Dispatch<SetStateAction<HolidayDraft>>;
  saveLegalHoliday: () => void;
  legalHolidays: LegalHolidayItem[];
  disableLegalHoliday: (item: LegalHolidayItem) => void;
  enableLegalHoliday: (item: LegalHolidayItem) => void;
}

/** 考勤设置-工作日历：法定节假日列表 + 双源同步预览 + 手工维护 */
export function SettingsHolidays(props: SettingsHolidaysProps) {
  const {
    canManage, holidayYear, setHolidayYear, syncYear, setSyncYear, syncPreview, setSyncPreview,
    syncLoading, syncSaving, runSyncPreview, confirmSyncWrite, holidayDraft, setHolidayDraft,
    saveLegalHoliday, legalHolidays, disableLegalHoliday, enableLegalHoliday,
  } = props;
  return (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-1.5">法定节假日 <HelpTooltip label={HOLIDAY_TABLE_HELP} /></CardTitle>
                  <CardDescription>启用状态会影响加班可用的加班类型</CardDescription>
                </div>
                <div className="w-36 space-y-2">
                  <Label>年份</Label>
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={holidayYear}
                    onChange={(event) => setHolidayYear(event.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">同步官方数据</span>
                  <HelpTooltip label={HOLIDAY_SYNC_HELP} />
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={syncYear}
                    onChange={(event) => setSyncYear(event.target.value)}
                    className="h-8 w-24"
                  />
                  <Button size="sm" onClick={runSyncPreview} disabled={syncLoading}>
                    {syncLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                    获取预览
                  </Button>
                  {syncPreview ? (
                    <Button size="sm" onClick={confirmSyncWrite} disabled={syncSaving}>
                      {syncSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                      确认写入
                    </Button>
                  ) : null}
                  {syncPreview ? (
                    <Button size="sm" variant="ghost" onClick={() => setSyncPreview(null)}>取消</Button>
                  ) : null}
                </div>
                {syncPreview ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {syncPreview.sources.map((source) => (
                        <Badge key={source.label} variant={source.error ? "destructive" : "secondary"}>
                          {source.label} {source.error ? "不可用" : `${source.count} 天`}
                        </Badge>
                      ))}
                    </div>
                    {syncPreview.warnings.length ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {syncPreview.warnings.map((warning) => <div key={warning}>⚠ {warning}</div>)}
                      </div>
                    ) : null}
                    <div className="text-xs font-medium text-muted-foreground">同步结果预览（{syncPreview.items.length} 天）：</div>
                    <div className="flex flex-wrap gap-1.5">
                      {syncPreview.items.map((item) => (
                        <span
                          key={item.date}
                          className={`rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${
                            item.dayType === "makeup_workday"
                              ? "bg-orange-50 text-orange-700 ring-orange-200"
                              : "bg-rose-50 text-rose-700 ring-rose-200"
                          }`}
                        >
                          {item.name} · {fmtHolidayDate(item.date)}（{holidayWeekday(item.date)}）{item.dayType === "makeup_workday" ? " 补班" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {canManage ? (
                <div className="grid gap-3 md:grid-cols-[160px_1fr_140px_auto]">
                  <div className="space-y-2">
                    <Label>日期</Label>
                    <Input
                      type="date"
                      value={holidayDraft.date}
                      onChange={(event) => setHolidayDraft((current) => ({ ...current, date: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>名称</Label>
                    <Input
                      value={holidayDraft.name}
                      onChange={(event) => setHolidayDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="如：国庆节"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>类型</Label>
                    <Select value={holidayDraft.dayType} onValueChange={(value) => setHolidayDraft((current) => ({ ...current, dayType: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="legal_holiday">放假</SelectItem>
                        <SelectItem value="makeup_workday">调休补班</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={saveLegalHoliday}>
                      <Plus className="mr-1 h-4 w-4" /> 保存
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead><span className="inline-flex items-center gap-1">来源 <HelpTooltip label={HOLIDAY_SOURCE_HELP} /></span></TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {legalHolidays.map((item) => (
                      <TableRow key={item.date} className={item.active === false ? "opacity-55" : ""}>
                        <TableCell>
                          <div className="font-medium tabular-nums">{item.date}</div>
                          <div className="text-xs text-muted-foreground">{holidayWeekday(item.date)}</div>
                        </TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <Badge variant={(item.dayType || "legal_holiday") === "makeup_workday" ? "orange" : "rose"}>
                            {DAY_TYPE_LABELS[item.dayType || "legal_holiday"] || "放假"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{HOLIDAY_SOURCE_LABELS[item.source] || item.source || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={item.active === false ? "outline" : "success"}>{item.active === false ? "停用" : "启用"}</Badge>
                        </TableCell>
                        <TableCell>
                          {canManage ? (
                            item.active === false ? (
                              <Button size="sm" variant="outline" onClick={() => enableLegalHoliday(item)}>
                                <Check className="mr-1 h-4 w-4" /> 启用
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => disableLegalHoliday(item)}>
                                <Trash2 className="mr-1 h-4 w-4" /> 停用
                              </Button>
                            )
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {legalHolidays.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无法定节假日</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
  );
}
