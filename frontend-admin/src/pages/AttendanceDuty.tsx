import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CalendarDays, CheckCircle2, RefreshCw, Save, Send, ShieldCheck, Users } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/AuthContext"
import { api } from "@/services/api"

type Engineer = { id: number; employee_name: string; username?: string }
type Holiday = { name: string; startDate: string; endDate: string; days: number; employeeIds?: number[] }
type HolidayDraft = Holiday & { employeeIds: number[] }
type DutyRecord = { id: number; duty_date: string; duty_end_date: string | null; employee_id: number; employee_name: string; duty_type: string; reason: string; units: number; overlap_state: string; batch_status: string }
type Batch = { duty_month: string; status: string; rejected_reason?: string | null }

const currentYear = new Date().getFullYear()
const currentMonth = new Date().toISOString().slice(0, 7)
const typeLabel: Record<string, string> = { weekend_on_call: "7×24 值班", legal_holiday_on_call: "法定节假日值班" }
const statusLabel: Record<string, string> = { draft: "待主管确认", pending_admin: "待行政终审", approved: "已终审", rejected: "行政退回" }
const statusVariant: Record<string, "warning" | "info" | "success" | "destructive" | "secondary"> = { draft: "warning", pending_admin: "info", approved: "success", rejected: "destructive" }
const DUTY_WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
function dutyWeekday(date: string) {
  return DUTY_WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]
}

export function AttendanceDuty({ embedded = false }: { embedded?: boolean }) {
  const { hasPermission } = useAuth()
  const canManage = hasPermission("attendance.duty.manage")
  const canApprove = hasPermission("attendance.duty.admin.approve")
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<"setup" | "monthly">(() => {
    const param = searchParams.get("duty")
    if (param === "setup" || param === "monthly") return param
    return canManage ? "setup" : "monthly"
  })
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [engineers, setEngineers] = useState<Engineer[]>([])
  const [weekendMode, setWeekendMode] = useState("rotation")
  const [weekendIds, setWeekendIds] = useState<number[]>([])
  const [holidays, setHolidays] = useState<HolidayDraft[]>([])
  const [records, setRecords] = useState<DutyRecord[]>([])
  const [batch, setBatch] = useState<Batch>({ duty_month: currentMonth, status: "draft" })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const toggle = (ids: number[], id: number) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
  const unresolved = useMemo(() => records.filter((record) => record.overlap_state === "unresolved").length, [records])
  const totalUnits = useMemo(() => records.reduce((sum, record) => sum + Number(record.units || 0), 0), [records])
  const peopleCount = useMemo(() => new Set(records.map((record) => record.employee_id)).size, [records])

  // 页签切换：与考勤页一致的胶囊分段控件
  const tabSwitcher = (
    <div className="flex w-fit gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
      {canManage && (
        <button type="button" onClick={() => setTab("setup")} className={`flex h-8 items-center gap-1.5 rounded-md px-4 font-medium transition ${tab === "setup" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <CalendarDays className="size-4" />年度设置
        </button>
      )}
      <button type="button" onClick={() => setTab("monthly")} className={`flex h-8 items-center gap-1.5 rounded-md px-4 font-medium transition ${tab === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
        <CheckCircle2 className="size-4" />月度审批
      </button>
    </div>
  )

  // 子页签写入 URL（?duty=setup|monthly），刷新后保持当前位置
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (tab === "setup") next.delete("duty"); else next.set("duty", tab)
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [tab, searchParams, setSearchParams])

  // 无年度设置权限时不允许停留在 setup 页签（例如带了 ?duty=setup 的链接）
  useEffect(() => {
    if (!canManage && tab === "setup") setTab("monthly")
  }, [canManage, tab])

  const loadSetup = async () => {
    setLoading(true)
    try {
      const data = await api.get(`/attendance/duty/setup?year=${year}`)
      setEngineers(data.engineers || [])
      setWeekendMode(data.weekend?.mode || "rotation")
      setWeekendIds(data.weekend?.employeeIds || [])
      // 后端已按假期名称聚合为段（含已选人员）；历史记录按天合并去重后在段级回填
      setHolidays((data.holidays || []).map((item: Holiday) => ({ ...item, employeeIds: item.employeeIds || [] })))
    } catch (error) { toast.error(error instanceof Error ? error.message : "加载年度设置失败") }
    finally { setLoading(false) }
  }

  const loadMonthly = async () => {
    setLoading(true)
    try {
      const data = await api.get(`/attendance/duty/monthly?month=${month}`)
      setRecords(data.records || [])
      setBatch(data.batch || { duty_month: month, status: "draft" })
    } catch (error) { toast.error(error instanceof Error ? error.message : "加载月度记录失败") }
    finally { setLoading(false) }
  }

  useEffect(() => {
    // year 为 number 输入：输入过程（如 "202"）不产生有效年份，守卫拦截避免逐击键重载
    if (tab === "setup") { if (year >= 2000 && year <= 2099) loadSetup(); }
    else loadMonthly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, year, month])

  const saveSetup = async () => {
    if (!weekendIds.length) return toast.error("请选择至少一名 7×24 值班工程师")
    setSaving(true)
    try {
      const data = await api.put(`/attendance/duty/setup/${year}`, { weekend: { mode: weekendMode, employeeIds: weekendIds }, holidays })
      toast.success(`年度设置已保存，共生成 ${data.generated || 0} 条值班记录`)
      setTab("monthly")
      // 同年落在当前月（年中保存当年设置不必回看 1 月）；其他年份落 1 月便于检查全年安排
      setMonth(year === currentYear ? currentMonth : `${year}-01`)
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存失败") }
    finally { setSaving(false) }
  }

  const action = async (name: "submit" | "approve" | "reject", body?: object) => {
    setSaving(true)
    try {
      await api.post(`/attendance/duty/monthly/${month}/${name}`, body)
      toast.success(name === "submit" ? "已提交行政主管终审" : name === "approve" ? "月度值班津贴已终审" : "已退回工程主管")
      setRejectReason("")
      await loadMonthly()
    } catch (error) { toast.error(error instanceof Error ? error.message : "操作失败") }
    finally { setSaving(false) }
  }

  const resolve = async (id: number, keepType: string) => {
    try { await api.put(`/attendance/duty/records/${id}/overlap`, { keepType }); await loadMonthly(); toast.success("重叠记录已处理") }
    catch (error) { toast.error(error instanceof Error ? error.message : "处理失败") }
  }

  return <div className="space-y-6">
    {embedded ? (
      tabSwitcher
    ) : (
    <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="size-4" />工程主管专用</div><h1 className="text-2xl font-semibold tracking-tight">工程师值班津贴</h1><p className="mt-1 text-sm text-muted-foreground">年度安排 7×24 与法定节假日值班，按月确认后交行政主管终审。</p></div>
      {tabSwitcher}
    </div>
    )}
    {tab === "setup" ? <div className="space-y-5">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-5" />{year} 年 7×24 值班</CardTitle><CardDescription>系统自动计算全年周六、周日。轮值以一个周末为单位，同一周六、周日安排同一人；固定值班组则每天给所有选中工程师各记 1 次。</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>年度</Label><Input type="number" min={2020} max={2099} value={year} onChange={(event) => setYear(Number(event.target.value))} /></div><div className="space-y-2"><Label>安排方式</Label><div className="flex w-fit gap-1 rounded-lg border bg-muted/40 p-1 text-sm">{[{ value: "rotation", label: "按顺序轮值", hint: "周六日同一人" }, { value: "fixed", label: "固定值班组", hint: "每人每天各记 1 次" }].map((option) => <button key={option.value} type="button" onClick={() => setWeekendMode(option.value)} title={option.hint} className={`h-8 rounded-md px-4 font-medium transition ${weekendMode === option.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{option.label}</button>)}</div></div></div>
        <EngineerPicker engineers={engineers} selected={weekendIds} onToggle={(id) => setWeekendIds(toggle(weekendIds, id))} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded bg-rose-100 text-[11px] font-bold text-rose-700">假</span>法定节假日值班</CardTitle><CardDescription>按假期为单位安排：整个假期指定一批工程师即可，不再按每天拆条；值班津贴按假期天数计入（一条记录、单位=假期天数）。</CardDescription></CardHeader><CardContent className="space-y-5">{holidays.length ? holidays.map((holiday, index) => <div key={holiday.startDate} className="rounded-lg border p-4 transition hover:border-rose-200"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-medium">{holiday.name}</span><span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs tabular-nums text-rose-700 ring-1 ring-inset ring-rose-200">{holiday.startDate} ~ {holiday.endDate}（{holiday.days} 天）</span></div><span className={`text-xs ${holiday.employeeIds.length ? "font-medium text-rose-700" : "text-muted-foreground"}`}>{holiday.employeeIds.length ? `已选 ${holiday.employeeIds.length} 人` : "不安排值班"}</span></div><EngineerPicker compact engineers={engineers} selected={holiday.employeeIds} onToggle={(id) => setHolidays(holidays.map((item, itemIndex) => itemIndex === index ? { ...item, employeeIds: toggle(item.employeeIds, id) } : item))} /></div>) : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">该年度尚未维护法定节假日，请先在考勤设置中维护。</div>}</CardContent></Card>
      <div className="flex justify-end"><Button disabled={saving || loading} onClick={saveSetup}><Save className="size-4" />{saving ? "保存中…" : "保存并生成全年记录"}</Button></div>
    </div> : <div className="space-y-5">
      <Card><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>{month} 值班津贴</CardTitle><CardDescription>每条记录为 1 次值班／津贴，目的为加班费，不含实际出勤时数。</CardDescription><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{records.length} 条记录</Badge><Badge variant="secondary">{totalUnits} 人次</Badge><Badge variant="secondary">{peopleCount} 人参与</Badge><Badge variant={statusVariant[batch.status] || "secondary"}>{statusLabel[batch.status] || batch.status}</Badge></div></div><div className="flex items-center gap-2"><Input className="w-44" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><Button variant="outline" onClick={loadMonthly}><RefreshCw className="size-4" /></Button></div></div></CardHeader><CardContent>
        {unresolved > 0 && <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">有 {unresolved} 条重叠记录尚未处理，处理完成后才能提交。</div>}
        {batch.rejected_reason && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">退回原因：{batch.rejected_reason}</div>}
        <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>日期</TableHead><TableHead>工程师</TableHead><TableHead>值班类型</TableHead><TableHead>事由</TableHead><TableHead>次数</TableHead><TableHead>状态／处理</TableHead></TableRow></TableHeader><TableBody>{records.length ? records.map((record) => { const dutyDate = String(record.duty_date).slice(0, 10); const dutyEnd = record.duty_end_date ? String(record.duty_end_date).slice(0, 10) : dutyDate; const isSpan = dutyEnd !== dutyDate; return <TableRow key={record.id} className={record.overlap_state === "unresolved" ? "bg-amber-50/60 hover:bg-amber-50/60" : ""}><TableCell><div className="font-medium tabular-nums">{dutyDate}{isSpan ? `~${dutyEnd}` : ""}</div>{isSpan ? <div className="text-xs text-muted-foreground">{Number(record.units)} 天</div> : <div className="text-xs text-muted-foreground">{dutyWeekday(dutyDate)}</div>}</TableCell><TableCell className="font-medium">{record.employee_name}</TableCell><TableCell><Badge variant={record.duty_type === "legal_holiday_on_call" ? "rose" : "cyan"}>{typeLabel[record.duty_type]}</Badge></TableCell><TableCell className="max-w-56 truncate text-muted-foreground" title={record.reason}>{record.reason}</TableCell><TableCell><span className="font-semibold tabular-nums">{Number(record.units)}</span> <span className="text-xs text-muted-foreground">次</span></TableCell><TableCell>{record.overlap_state === "unresolved" ? <div className="flex flex-wrap gap-2"><Badge variant="destructive">值班重叠</Badge>{canManage && <><Button size="sm" variant="outline" onClick={() => resolve(record.id, "weekend_on_call")}>保留 7×24</Button><Button size="sm" variant="outline" onClick={() => resolve(record.id, "legal_holiday_on_call")}>保留法定节假日</Button></>}</div> : <Badge variant="outline">正常</Badge>}</TableCell></TableRow> }) : <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">本月暂无值班记录</TableCell></TableRow>}</TableBody></Table></div>
      </CardContent></Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">{canManage && ["draft", "rejected"].includes(batch.status) && <Button disabled={saving || unresolved > 0 || !records.length} onClick={() => action("submit")}><Send className="size-4" />提交行政主管</Button>}{canApprove && batch.status === "pending_admin" && <><div className="flex-1"><Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="退回时填写原因" /></div><Button variant="outline" disabled={saving || !rejectReason.trim()} onClick={() => action("reject", { reason: rejectReason })}>退回</Button><Button disabled={saving} onClick={() => action("approve")}><CheckCircle2 className="size-4" />终审通过</Button></>}</div>
    </div>}
  </div>
}

function EngineerPicker({ engineers, selected, onToggle, compact = false }: { engineers: Engineer[]; selected: number[]; onToggle: (id: number) => void; compact?: boolean }) {
  return <div className="space-y-2"><Label className="flex items-center gap-2"><Users className="size-4" />选择工程师（已选 {selected.length} 人）</Label><div className={`grid gap-2 ${compact ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4"}`}>{engineers.map((engineer) => { const active = selected.includes(engineer.id); return <label key={engineer.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted/50 ${active ? "border-primary bg-primary/10 font-medium" : ""}`}><Checkbox checked={active} onCheckedChange={() => onToggle(engineer.id)} /><span>{engineer.employee_name}</span></label> })}</div></div>
}
