import { useEffect, useMemo, useState } from "react"
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
type Holiday = { date: string; name: string }
type HolidayDraft = Holiday & { employeeIds: number[] }
type DutyRecord = { id: number; duty_date: string; employee_id: number; employee_name: string; duty_type: string; reason: string; units: number; overlap_state: string; batch_status: string }
type Batch = { duty_month: string; status: string; rejected_reason?: string | null }

const currentYear = new Date().getFullYear()
const currentMonth = new Date().toISOString().slice(0, 7)
const typeLabel: Record<string, string> = { weekend_on_call: "7×24 值班", legal_holiday_on_call: "法定节假日值班" }
const statusLabel: Record<string, string> = { draft: "待主管确认", pending_admin: "待行政终审", approved: "已终审", rejected: "行政退回" }

export function AttendanceDuty({ embedded = false }: { embedded?: boolean }) {
  const { hasPermission } = useAuth()
  const canManage = hasPermission("attendance.duty.manage")
  const canApprove = hasPermission("attendance.duty.admin.approve")
  const [tab, setTab] = useState<"setup" | "monthly">(canManage ? "setup" : "monthly")
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

  const loadSetup = async () => {
    setLoading(true)
    try {
      const data = await api.get(`/attendance/duty/setup?year=${year}`)
      setEngineers(data.engineers || [])
      setWeekendMode(data.weekend?.mode || "rotation")
      setWeekendIds(data.weekend?.employeeIds || [])
      const assigned = new Map<string, number[]>()
      for (const row of data.holidayAssignments || []) {
        const date = String(row.duty_date).slice(0, 10)
        assigned.set(date, [...(assigned.get(date) || []), Number(row.employee_id)])
      }
      setHolidays((data.holidays || []).map((item: Holiday) => ({ ...item, employeeIds: assigned.get(item.date) || [] })))
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

  useEffect(() => { if (tab === "setup") loadSetup(); else loadMonthly() }, [tab, year, month])

  const saveSetup = async () => {
    if (!weekendIds.length) return toast.error("请选择至少一名 7×24 值班工程师")
    setSaving(true)
    try {
      const data = await api.put(`/attendance/duty/setup/${year}`, { weekend: { mode: weekendMode, employeeIds: weekendIds }, holidays })
      toast.success(`年度设置已保存，共生成 ${data.generated || 0} 条值班记录`)
      setTab("monthly")
      setMonth(`${year}-01`)
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
      <div className="flex gap-2">{canManage && <Button variant={tab === "setup" ? "default" : "outline"} onClick={() => setTab("setup")}><CalendarDays className="size-4" />年度设置</Button>}<Button variant={tab === "monthly" ? "default" : "outline"} onClick={() => setTab("monthly")}><CheckCircle2 className="size-4" />月度审批</Button></div>
    ) : (
    <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="size-4" />工程主管专用</div><h1 className="text-2xl font-semibold tracking-tight">工程师值班津贴</h1><p className="mt-1 text-sm text-muted-foreground">年度安排 7×24 与法定节假日值班，按月确认后交行政主管终审。</p></div>
      <div className="flex gap-2">{canManage && <Button variant={tab === "setup" ? "default" : "outline"} onClick={() => setTab("setup")}><CalendarDays className="size-4" />年度设置</Button>}<Button variant={tab === "monthly" ? "default" : "outline"} onClick={() => setTab("monthly")}><CheckCircle2 className="size-4" />月度审批</Button></div>
    </div>
    )}
    {tab === "setup" ? <div className="space-y-5">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-5" />{year} 年 7×24 值班</CardTitle><CardDescription>系统自动计算全年周六、周日。轮值以一个周末为单位，同一周六、周日安排同一人；固定值班组则每天给所有选中工程师各记 1 次。</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>年度</Label><Input type="number" min={2020} max={2099} value={year} onChange={(event) => setYear(Number(event.target.value))} /></div><div className="space-y-2"><Label>安排方式</Label><Select value={weekendMode} onValueChange={setWeekendMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rotation">按顺序轮值</SelectItem><SelectItem value="fixed">固定值班组</SelectItem></SelectContent></Select></div></div>
        <EngineerPicker engineers={engineers} selected={weekendIds} onToggle={(id) => setWeekendIds(toggle(weekendIds, id))} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle>法定节假日值班</CardTitle><CardDescription>只需为实际安排值班的节假日选择工程师；与 7×24 独立设置，同一工程师同一天重叠时，月度提交前必须选择保留一项。</CardDescription></CardHeader><CardContent className="space-y-5">{holidays.length ? holidays.map((holiday, index) => <div key={holiday.date} className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between"><div className="font-medium">{holiday.name}</div><Badge variant="outline">{holiday.date}</Badge></div><EngineerPicker compact engineers={engineers} selected={holiday.employeeIds} onToggle={(id) => setHolidays(holidays.map((item, itemIndex) => itemIndex === index ? { ...item, employeeIds: toggle(item.employeeIds, id) } : item))} /></div>) : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">该年度尚未维护法定节假日，请先在考勤设置中维护。</div>}</CardContent></Card>
      <div className="flex justify-end"><Button disabled={saving || loading} onClick={saveSetup}><Save className="size-4" />{saving ? "保存中…" : "保存并生成全年记录"}</Button></div>
    </div> : <div className="space-y-5">
      <Card><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>{month} 值班津贴</CardTitle><CardDescription>每条记录为 1 次值班／津贴，目的为加班费，不含实际出勤时数。</CardDescription></div><div className="flex items-center gap-2"><Input className="w-44" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><Button variant="outline" onClick={loadMonthly}><RefreshCw className="size-4" /></Button><Badge>{statusLabel[batch.status] || batch.status}</Badge></div></div></CardHeader><CardContent>
        {unresolved > 0 && <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">有 {unresolved} 条重叠记录尚未处理，处理完成后才能提交。</div>}
        {batch.rejected_reason && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">退回原因：{batch.rejected_reason}</div>}
        <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>日期</TableHead><TableHead>工程师</TableHead><TableHead>值班类型</TableHead><TableHead>事由</TableHead><TableHead>次数</TableHead><TableHead>状态／处理</TableHead></TableRow></TableHeader><TableBody>{records.length ? records.map((record) => <TableRow key={record.id}><TableCell>{String(record.duty_date).slice(0, 10)}</TableCell><TableCell className="font-medium">{record.employee_name}</TableCell><TableCell>{typeLabel[record.duty_type]}</TableCell><TableCell>{record.reason}</TableCell><TableCell>{Number(record.units)} 次</TableCell><TableCell>{record.overlap_state === "unresolved" ? <div className="flex flex-wrap gap-2"><Badge variant="destructive">值班重叠</Badge>{canManage && <><Button size="sm" variant="outline" onClick={() => resolve(record.id, "weekend_on_call")}>保留 7×24</Button><Button size="sm" variant="outline" onClick={() => resolve(record.id, "legal_holiday_on_call")}>保留法定节假日</Button></>}</div> : <Badge variant="outline">正常</Badge>}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">本月暂无值班记录</TableCell></TableRow>}</TableBody></Table></div>
      </CardContent></Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">{canManage && ["draft", "rejected"].includes(batch.status) && <Button disabled={saving || unresolved > 0 || !records.length} onClick={() => action("submit")}><Send className="size-4" />提交行政主管</Button>}{canApprove && batch.status === "pending_admin" && <><div className="flex-1"><Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="退回时填写原因" /></div><Button variant="outline" disabled={saving || !rejectReason.trim()} onClick={() => action("reject", { reason: rejectReason })}>退回</Button><Button disabled={saving} onClick={() => action("approve")}><CheckCircle2 className="size-4" />终审通过</Button></>}</div>
    </div>}
  </div>
}

function EngineerPicker({ engineers, selected, onToggle, compact = false }: { engineers: Engineer[]; selected: number[]; onToggle: (id: number) => void; compact?: boolean }) {
  return <div className="space-y-2"><Label className="flex items-center gap-2"><Users className="size-4" />选择工程师（已选 {selected.length} 人）</Label><div className={`grid gap-2 ${compact ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4"}`}>{engineers.map((engineer) => <label key={engineer.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"><Checkbox checked={selected.includes(engineer.id)} onCheckedChange={() => onToggle(engineer.id)} /><span>{engineer.employee_name}</span></label>)}</div></div>
}
