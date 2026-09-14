import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CalendarDays, CheckCircle2, ListChecks, RefreshCw, Save, Send, ShieldCheck, Users } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/AuthContext"
import { api } from "@/services/api"

// spec 013：值班津贴页 = 纯设置项（长期名单）+ 月度确认（系统每月 1 号生成批次，主管提交、行政终审）
type Engineer = { id: number; employee_name: string; username?: string }
type HolidaySpan = { startDate: string; endDate: string; days: number }
type HolidaySetting = { name: string; spans: HolidaySpan[]; employeeIds: number[] }
type DutyRecord = { id: number; duty_date: string; duty_end_date: string | null; employee_id: number; employee_name: string; duty_type: string; reason: string; units: number; batch_status: string }
type Batch = { duty_month: string; status: string | null; rejected_reason?: string | null }

const currentMonth = new Date().toISOString().slice(0, 7)
const typeLabel: Record<string, string> = { monthly_on_call: "月度值班", legal_holiday_on_call: "法定节假日", weekend_on_call: "7×24 值班（旧）" }
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
  const [tab, setTab] = useState<"monthly" | "setup">(() => {
    const param = searchParams.get("duty")
    if (param === "setup" && canManage) return param
    return "monthly"
  })
  const [month, setMonth] = useState(currentMonth)
  const [engineers, setEngineers] = useState<Engineer[]>([])
  const [monthlyIds, setMonthlyIds] = useState<number[]>([])
  const [holidays, setHolidays] = useState<HolidaySetting[]>([])
  const [records, setRecords] = useState<DutyRecord[]>([])
  const [batch, setBatch] = useState<Batch>({ duty_month: currentMonth, status: null })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const toggle = (ids: number[], id: number) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
  const totalUnits = useMemo(() => records.reduce((sum, record) => sum + Number(record.units || 0), 0), [records])
  const peopleCount = useMemo(() => new Set(records.map((record) => record.employee_id)).size, [records])

  // 页签切换：与考勤页一致的胶囊分段控件
  const tabSwitcher = (
    <div className="flex w-fit gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
      <button type="button" onClick={() => setTab("monthly")} className={`flex h-8 items-center gap-1.5 rounded-md px-4 font-medium transition ${tab === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
        <CheckCircle2 className="size-4" />月度确认
      </button>
      {canManage && (
        <button type="button" onClick={() => setTab("setup")} className={`flex h-8 items-center gap-1.5 rounded-md px-4 font-medium transition ${tab === "setup" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <CalendarDays className="size-4" />值班设置
        </button>
      )}
    </div>
  )

  // 子页签写入 URL（?duty=setup），刷新后保持当前位置
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (tab === "setup") next.set("duty", "setup"); else next.delete("duty")
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [tab, searchParams, setSearchParams])

  // 无设置权限时不允许停留在 setup 页签（例如带了 ?duty=setup 的链接）
  useEffect(() => {
    if (!canManage && tab === "setup") setTab("monthly")
  }, [canManage, tab])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const data = await api.get("/attendance/duty/settings")
      setEngineers(data.engineers || [])
      setMonthlyIds(data.monthly?.employeeIds || [])
      setHolidays(data.holidays || [])
    } catch (error) { toast.error(error instanceof Error ? error.message : "加载值班设置失败") }
    finally { setLoading(false) }
  }

  const loadMonthly = async () => {
    setLoading(true)
    try {
      const data = await api.get(`/attendance/duty/monthly?month=${month}`)
      setRecords(data.records || [])
      setBatch(data.batch || { duty_month: month, status: null })
    } catch (error) { toast.error(error instanceof Error ? error.message : "加载月度记录失败") }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (tab === "setup") loadSettings(); else loadMonthly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, month])

  const saveSettings = async () => {
    if (!monthlyIds.length) return toast.error("请选择至少一名每月值班工程师")
    setSaving(true)
    try {
      const data = await api.put("/attendance/duty/settings", {
        monthly: { employeeIds: monthlyIds },
        holidays: holidays.map((holiday) => ({ name: holiday.name, employeeIds: holiday.employeeIds })),
      })
      toast.success(data.regenerated ? `值班设置已保存，当月批次已按新设置重算 ${data.regenerated} 条记录` : "值班设置已保存，下月 1 号起按新设置生成批次")
      setTab("monthly")
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

  return <div className="space-y-6">
    {embedded ? (
      tabSwitcher
    ) : (
    <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="size-4" />工程主管专用</div><h1 className="text-2xl font-semibold tracking-tight">工程师值班津贴</h1><p className="mt-1 text-sm text-muted-foreground">维护长期值班名单，系统每月 1 号自动生成当月批次，核对后提交行政主管终审。</p></div>
      {tabSwitcher}
    </div>
    )}
    {tab === "setup" ? <div className="space-y-5">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-5" />每月值班工程师</CardTitle><CardDescription>长期有效的固定值班名单，不按月重复填写。选中后系统每月 1 号自动生成当月值班记录，名单内每人每月各记 1 次。</CardDescription></CardHeader><CardContent>
        <EngineerPicker engineers={engineers} selected={monthlyIds} onToggle={(id) => setMonthlyIds(toggle(monthlyIds, id))} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded bg-rose-100 text-[11px] font-bold text-rose-700">假</span>法定节假日值班</CardTitle><CardDescription>按假期名称配置值班工程师，跨年自动沿用（如「国庆节」一次配置、每年生效）；不选人即该假期不安排。津贴按假期落在当月的天数计入。</CardDescription></CardHeader><CardContent className="space-y-5">{holidays.length ? holidays.map((holiday, index) => <div key={holiday.name} className="rounded-lg border p-4 transition hover:border-rose-200"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{holiday.name}</span>{holiday.spans.map((span) => <span key={span.startDate} className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs tabular-nums text-rose-700 ring-1 ring-inset ring-rose-200">{span.startDate} ~ {span.endDate}（{span.days} 天）</span>)}</div><span className={`text-xs ${holiday.employeeIds.length ? "font-medium text-rose-700" : "text-muted-foreground"}`}>{holiday.employeeIds.length ? `已选 ${holiday.employeeIds.length} 人` : "不安排值班"}</span></div><EngineerPicker compact engineers={engineers} selected={holiday.employeeIds} onToggle={(id) => setHolidays(holidays.map((item, itemIndex) => itemIndex === index ? { ...item, employeeIds: toggle(item.employeeIds, id) } : item))} /></div>) : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">尚未维护法定节假日，请先在假勤设置中维护。</div>}</CardContent></Card>
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">保存后下月 1 号生效；当月批次未送审时会立即按新设置重算。</p><Button disabled={saving || loading} onClick={saveSettings}><Save className="size-4" />{saving ? "保存中…" : "保存值班设置"}</Button></div>
    </div> : <div className="space-y-5">
      <Card><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>{month} 值班津贴</CardTitle><CardDescription>系统每月 1 号按值班设置自动生成当月批次；每条记录为 1 次值班／津贴，目的为加班费，不含实际出勤时数。</CardDescription><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{records.length} 条记录</Badge><Badge variant="secondary">{totalUnits} 人次</Badge><Badge variant="secondary">{peopleCount} 人参与</Badge>{batch.status ? <Badge variant={statusVariant[batch.status] || "secondary"}>{statusLabel[batch.status] || batch.status}</Badge> : <Badge variant="outline">批次未生成</Badge>}</div></div><div className="flex items-center gap-2"><Input className="w-44" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><Button variant="outline" onClick={loadMonthly}><RefreshCw className="size-4" /></Button></div></div></CardHeader><CardContent>
        {batch.rejected_reason && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">退回原因：{batch.rejected_reason}（可到「值班设置」调整名单，当月批次会按新设置重算后重新提交）</div>}
        <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>日期</TableHead><TableHead>工程师</TableHead><TableHead>值班类型</TableHead><TableHead>事由</TableHead><TableHead>次数</TableHead></TableRow></TableHeader><TableBody>{records.length ? records.map((record) => { const dutyDate = String(record.duty_date).slice(0, 10); const dutyEnd = record.duty_end_date ? String(record.duty_end_date).slice(0, 10) : dutyDate; const isSpan = dutyEnd !== dutyDate; return <TableRow key={record.id}><TableCell><div className="font-medium tabular-nums">{dutyDate}{isSpan ? `~${dutyEnd}` : ""}</div>{isSpan ? <div className="text-xs text-muted-foreground">{Number(record.units)} 天</div> : <div className="text-xs text-muted-foreground">{dutyWeekday(dutyDate)}</div>}</TableCell><TableCell className="font-medium">{record.employee_name}</TableCell><TableCell><Badge variant={record.duty_type === "legal_holiday_on_call" ? "rose" : "cyan"}>{typeLabel[record.duty_type] || record.duty_type}</Badge></TableCell><TableCell className="max-w-56 truncate text-muted-foreground" title={record.reason}>{record.reason}</TableCell><TableCell><span className="font-semibold tabular-nums">{Number(record.units)}</span> <span className="text-xs text-muted-foreground">次</span></TableCell></TableRow> }) : <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">{batch.status ? "本月暂无值班记录" : "本月批次尚未生成（系统每月 1 号自动生成，或保存值班设置后重算当月）"}</TableCell></TableRow>}</TableBody></Table></div>
      </CardContent></Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">{canManage && ["draft", "rejected"].includes(batch.status || "") && <Button disabled={saving || !records.length} onClick={() => action("submit")}><Send className="size-4" />提交行政主管</Button>}{canApprove && batch.status === "pending_admin" && <><div className="flex-1"><Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="退回时填写原因" /></div><Button variant="outline" disabled={saving || !rejectReason.trim()} onClick={() => action("reject", { reason: rejectReason })}>退回</Button><Button disabled={saving} onClick={() => action("approve")}><CheckCircle2 className="size-4" />终审通过</Button></>}</div>
    </div>}
  </div>
}

function EngineerPicker({ engineers, selected, onToggle, compact = false }: { engineers: Engineer[]; selected: number[]; onToggle: (id: number) => void; compact?: boolean }) {
  return <div className="space-y-2"><Label className="flex items-center gap-2"><Users className="size-4" />选择工程师（已选 {selected.length} 人）</Label><div className={`grid gap-2 ${compact ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4"}`}>{engineers.map((engineer) => { const active = selected.includes(engineer.id); return <label key={engineer.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted/50 ${active ? "border-primary bg-primary/10 font-medium" : ""}`}><Checkbox checked={active} onCheckedChange={() => onToggle(engineer.id)} /><span>{engineer.employee_name}</span></label> })}</div></div>
}
