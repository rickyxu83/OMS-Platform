import { useMemo, useState } from "react"
import { Ban, CalendarClock, CheckCircle2, CircleCheck, Clock3, FileSignature, Hourglass, ListTodo, Save, Send, Settings2, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

/**
 * 值班津贴新版交互 Demo（纯本地 mock，不调后端、不落库）。
 * 交互决策：
 * - 「值班津贴」页面本身只是设置项（每月值班名单 + 法定节假日名单）
 * - 每月 1 号系统按设置自动生成待办，进入统一待办中心（ApprovalTasks 同款），
 *   主管在待办里点开核对、一键提交行政终审
 */

type Engineer = { id: number; name: string }
type Holiday = { key: string; name: string; startDate: string; endDate: string; days: number }
type DutyRecord = { label: string; engineerId: number; type: "monthly" | "holiday"; reason: string; units: number }
type TodoStatus = "draft" | "pending_admin" | "approved" | "rejected"
type DutyTodo = { month: string; status: TodoStatus; generatedAt: string; submittedAt?: string; decidedAt?: string; rejectReason?: string }

// ---- Demo 数据 ----
const ENGINEERS: Engineer[] = [
  { id: 1, name: "张伟" },
  { id: 2, name: "李强" },
  { id: 3, name: "王磊" },
  { id: 4, name: "赵敏" },
  { id: 5, name: "陈晨" },
]
// 法定节假日数据将来取自假勤设置，这里用 2026 下半年示例
const HOLIDAYS: Holiday[] = [
  { key: "mid-autumn-2026", name: "中秋节", startDate: "2026-09-25", endDate: "2026-09-27", days: 3 },
  { key: "national-day-2026", name: "国庆节", startDate: "2026-10-01", endDate: "2026-10-07", days: 7 },
]

const todoStatusLabel: Record<TodoStatus, string> = { draft: "待主管确认", pending_admin: "待行政终审", approved: "已终审", rejected: "行政退回" }
const todoStatusVariant: Record<TodoStatus, "warning" | "info" | "success" | "destructive"> = { draft: "warning", pending_admin: "info", approved: "success", rejected: "destructive" }

function monthOffset(month: string, offset: number) {
  const [year, mon] = month.split("-").map(Number)
  const date = new Date(Date.UTC(year, mon - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function holidayDaysInMonth(holiday: Holiday, month: string) {
  const [year, mon] = month.split("-").map(Number)
  const monthStart = `${month}-01`
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`
  const start = holiday.startDate > monthStart ? holiday.startDate : monthStart
  const end = holiday.endDate < monthEnd ? holiday.endDate : monthEnd
  if (start > end) return 0
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1
}

// 待办列表指标样式与 ApprovalTasks 同款：图标 + 文字，不用 Badge 大色块
function indicator(icon: LucideIcon, color: string, label: string) {
  const Icon = icon
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      {label}
    </span>
  )
}

// 混在待办列表里的其他业务 mock 行，演示值班津贴待办融入统一待办中心的效果
const OTHER_TASKS = [
  { key: "mr-1", title: "MR-20260912-001 · 城东水厂加药间维修", biz: indicator(FileSignature, "text-indigo-600", "MR·签核"), status: indicator(Hourglass, "text-amber-600", "待处理"), initiator: "张伟", time: "2026-09-12 10:32" },
  { key: "att-1", title: "请假申请 · 赵敏 · 年假 2 天", biz: indicator(CalendarClock, "text-orange-600", "假勤"), status: indicator(Hourglass, "text-amber-600", "待处理"), initiator: "赵敏", time: "2026-09-13 16:08" },
]

export function AttendanceDutyDemo() {
  const currentMonth = "2026-09"
  const [tab, setTab] = useState<"todo" | "setup">("todo")
  // 值班设置（将来对应后端一份长期配置，不按月重复填）
  const [roster, setRoster] = useState<number[]>([1, 2, 3, 4])
  const [holidayAssignees, setHolidayAssignees] = useState<Record<string, number[]>>({ "mid-autumn-2026": [3, 4], "national-day-2026": [1, 2] })
  // 每月值班待办（将来由调度器每月 1 号生成，进入统一待办中心）
  const [todos, setTodos] = useState<DutyTodo[]>([
    { month: "2026-07", status: "approved", generatedAt: "2026-07-01 08:00", submittedAt: "2026-07-01 10:12", decidedAt: "2026-07-02 09:40" },
    { month: "2026-08", status: "approved", generatedAt: "2026-08-01 08:00", submittedAt: "2026-08-01 09:05", decidedAt: "2026-08-01 16:22" },
    { month: currentMonth, status: "draft", generatedAt: "2026-09-01 08:00" },
  ])
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const engineerName = (id: number) => ENGINEERS.find((engineer) => engineer.id === id)?.name || `#${id}`
  const toggle = (ids: number[], id: number) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]

  // 按当前设置推演某月的值班明细（Demo 生成器，正式版由后端调度器在每月 1 号执行）
  const generateRecords = (month: string): DutyRecord[] => {
    const records: DutyRecord[] = roster.map((engineerId) => ({ label: "当月值班", engineerId, type: "monthly", reason: "月度值班", units: 1 }))
    for (const holiday of HOLIDAYS) {
      const days = holidayDaysInMonth(holiday, month)
      if (!days) continue
      for (const engineerId of holidayAssignees[holiday.key] || []) {
        records.push({ label: `${holiday.name} ${holiday.startDate}~${holiday.endDate}`, engineerId, type: "holiday", reason: `${holiday.name}值班`, units: days })
      }
    }
    return records.sort((a, b) => a.label.localeCompare(b.label) || a.engineerId - b.engineerId)
  }

  const activeTodo = useMemo(() => todos.find((todo) => todo.status === "draft" || todo.status === "pending_admin" || todo.status === "rejected") || null, [todos])
  const openTodo = useMemo(() => todos.find((todo) => todo.month === openMonth) || null, [todos, openMonth])
  const openRecords = useMemo(() => openTodo ? generateRecords(openTodo.month) : [], [openTodo, roster, holidayAssignees]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchTodo = (month: string, patch: Partial<DutyTodo>) => setTodos(todos.map((todo) => todo.month === month ? { ...todo, ...patch } : todo))

  const submitTodo = (month: string) => {
    patchTodo(month, { status: "pending_admin", submittedAt: "刚刚", rejectReason: undefined })
    toast.success(`${month} 值班安排已提交行政主管终审`)
  }

  const simulateApprove = (month: string) => {
    patchTodo(month, { status: "approved", decidedAt: "刚刚" })
    setOpenMonth(null)
    toast.success("（模拟）行政主管已终审通过")
  }

  const simulateReject = (month: string) => {
    if (!rejectReason.trim()) return toast.error("请填写退回原因")
    patchTodo(month, { status: "rejected", decidedAt: "刚刚", rejectReason: rejectReason.trim() })
    setRejectReason("")
    toast.warning("（模拟）行政主管已退回，主管可调整设置后重新提交")
  }

  // 模拟调度器：每月 1 号按当前设置自动生成下月待办
  const simulateGenerateNext = () => {
    const nextMonth = monthOffset(currentMonth, 1)
    if (todos.some((todo) => todo.month === nextMonth)) return toast.info(`${nextMonth} 待办已存在`)
    setTodos([...todos, { month: nextMonth, status: "draft", generatedAt: `${nextMonth}-01 08:00` }])
    toast.success(`（模拟）系统已在 ${nextMonth}-01 自动生成值班待办，已入待办中心`)
  }

  const saveSetup = () => {
    if (!roster.length) return toast.error("请选择至少一名每月值班工程师")
    toast.success("值班设置已保存（Demo 不落库），下月 1 号起按新设置生成待办")
  }

  const dutyTaskRow = (todo: DutyTodo) => {
    const statusIndicator = todo.status === "draft" || todo.status === "rejected"
      ? indicator(Hourglass, "text-amber-600", "待处理")
      : todo.status === "pending_admin"
        ? indicator(Clock3, "text-sky-600", "待行政终审")
        : indicator(CircleCheck, "text-emerald-600", "已终审")
    return (
      <TableRow key={todo.month} className="cursor-pointer" onClick={() => setOpenMonth(todo.month)}>
        <TableCell className="font-medium">{todo.month} 值班津贴确认<span className="ml-2 text-xs font-normal text-muted-foreground">点击查看明细</span></TableCell>
        <TableCell>{indicator(CalendarClock, "text-orange-600", "值班津贴")}</TableCell>
        <TableCell>{statusIndicator}</TableCell>
        <TableCell className="text-muted-foreground">系统（每月 1 号自动生成）</TableCell>
        <TableCell className="text-muted-foreground tabular-nums">{todo.generatedAt}</TableCell>
      </TableRow>
    )
  }

  const tabSwitcher = (
    <div className="flex w-fit gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
      <button type="button" onClick={() => setTab("todo")} className={`flex h-8 items-center gap-1.5 rounded-md px-4 font-medium transition ${tab === "todo" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
        <ListTodo className="size-4" />待办中心
      </button>
      <button type="button" onClick={() => setTab("setup")} className={`flex h-8 items-center gap-1.5 rounded-md px-4 font-medium transition ${tab === "setup" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
        <Settings2 className="size-4" />值班津贴设置
      </button>
    </div>
  )

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="size-4" />工程主管专用<Badge variant="secondary">Demo · 本地预览数据</Badge></div>
        <h1 className="text-2xl font-semibold tracking-tight">工程师值班津贴（新版）</h1>
        <p className="mt-1 text-sm text-muted-foreground">值班津贴页面只保留设置项；每月 1 号系统按设置自动生成待办进入统一待办中心，主管核对后一键提交。</p>
      </div>
      {tabSwitcher}
    </div>

    {tab === "todo" ? <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><ListTodo className="size-5" />待我处理</CardTitle>
              <CardDescription>统一待办中心（ApprovalTasks 同款样式）：值班津贴待办与 MR、假勤等待办混排展示。</CardDescription>
            </div>
            <Button variant="outline" onClick={simulateGenerateNext}><Sparkles className="size-4" />模拟 1 号生成 {monthOffset(currentMonth, 1)} 待办</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>待办事项</TableHead><TableHead>业务</TableHead><TableHead>状态</TableHead><TableHead>发起人</TableHead><TableHead>时间</TableHead></TableRow></TableHeader>
              <TableBody>
                {todos.filter((todo) => todo.status !== "approved").map(dutyTaskRow)}
                {OTHER_TASKS.map((task) => (
                  <TableRow key={task.key} className="cursor-pointer" onClick={() => toast.info("其他业务待办（mock），点击会跳对应单据")}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>{task.biz}</TableCell>
                    <TableCell>{task.status}</TableCell>
                    <TableCell className="text-muted-foreground">{task.initiator}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{task.time}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5" />我已处理</CardTitle><CardDescription>历史值班津贴批次随其他已办待办一起归档。</CardDescription></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>待办事项</TableHead><TableHead>业务</TableHead><TableHead>状态</TableHead><TableHead>提交时间</TableHead><TableHead>终审时间</TableHead></TableRow></TableHeader>
              <TableBody>
                {todos.filter((todo) => todo.status === "approved").map((todo) => (
                  <TableRow key={todo.month} className="cursor-pointer" onClick={() => setOpenMonth(todo.month)}>
                    <TableCell className="font-medium">{todo.month} 值班津贴确认</TableCell>
                    <TableCell>{indicator(CalendarClock, "text-orange-600", "值班津贴")}</TableCell>
                    <TableCell>{indicator(CircleCheck, "text-emerald-600", "已终审")}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{todo.submittedAt}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{todo.decidedAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div> : <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="size-5" />每月值班工程师</CardTitle>
          <CardDescription>长期有效的固定值班名单，不按月重复填写。选中后系统每月 1 号自动生成当月值班待办，名单内每人每月各记 1 次。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Users className="size-4" />值班名单（已选 {roster.length} 人）</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ENGINEERS.map((engineer) => {
                const active = roster.includes(engineer.id)
                return (
                  <label key={engineer.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted/50 ${active ? "border-primary bg-primary/10 font-medium" : ""}`}>
                    <Checkbox checked={active} onCheckedChange={() => setRoster(toggle(roster, engineer.id))} />
                    <span>{engineer.name}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded bg-rose-100 text-[11px] font-bold text-rose-700">假</span>法定节假日值班</CardTitle>
          <CardDescription>假期数据来自假勤设置，只需为每个假期指定值班工程师；不选人即该假期不安排值班。津贴按假期天数计入。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {HOLIDAYS.map((holiday) => {
            const selected = holidayAssignees[holiday.key] || []
            return (
              <div key={holiday.key} className="rounded-lg border p-4 transition hover:border-rose-200">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{holiday.name}</span>
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs tabular-nums text-rose-700 ring-1 ring-inset ring-rose-200">{holiday.startDate} ~ {holiday.endDate}（{holiday.days} 天）</span>
                  </div>
                  <span className={`text-xs ${selected.length ? "font-medium text-rose-700" : "text-muted-foreground"}`}>{selected.length ? `已选 ${selected.length} 人` : "不安排值班"}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {ENGINEERS.map((engineer) => {
                    const active = selected.includes(engineer.id)
                    return (
                      <label key={engineer.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted/50 ${active ? "border-primary bg-primary/10 font-medium" : ""}`}>
                        <Checkbox checked={active} onCheckedChange={() => setHolidayAssignees({ ...holidayAssignees, [holiday.key]: toggle(selected, engineer.id) })} />
                        <span>{engineer.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">保存后下月 1 号生效；已生成未提交的当月待办会按新设置刷新。</p>
        <Button onClick={saveSetup}><Save className="size-4" />保存值班设置</Button>
      </div>
    </div>}

    {/* 待办点开后的值班明细弹窗：核对 → 提交；含 Demo 行政终审模拟 */}
    <Dialog open={!!openTodo} onOpenChange={(open) => { if (!open) { setOpenMonth(null); setRejectReason("") } }}>
      <DialogContent className="max-w-3xl">
        {openTodo && <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{openTodo.month} 值班津贴确认<Badge variant={todoStatusVariant[openTodo.status]}>{todoStatusLabel[openTodo.status]}</Badge></DialogTitle>
            <DialogDescription>系统于 {openTodo.generatedAt} 按值班设置自动生成；名单调整请到「值班津贴设置」，已生成未提交的待办会按新设置刷新。</DialogDescription>
          </DialogHeader>
          {openTodo.status === "rejected" && openTodo.rejectReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">行政退回：{openTodo.rejectReason}</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{openRecords.length} 条记录</Badge>
            <Badge variant="secondary">{openRecords.reduce((sum, record) => sum + record.units, 0)} 人次</Badge>
            <Badge variant="secondary">{new Set(openRecords.map((record) => record.engineerId)).size} 人参与</Badge>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>安排</TableHead><TableHead>工程师</TableHead><TableHead>类型</TableHead><TableHead>事由</TableHead><TableHead>次数</TableHead></TableRow></TableHeader>
              <TableBody>
                {openRecords.map((record, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{record.label}</TableCell>
                    <TableCell className="font-medium">{engineerName(record.engineerId)}</TableCell>
                    <TableCell><Badge variant={record.type === "holiday" ? "rose" : "cyan"}>{record.type === "holiday" ? "法定节假日" : "月度值班"}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{record.reason}</TableCell>
                    <TableCell><span className="font-semibold tabular-nums">{record.units}</span> <span className="text-xs text-muted-foreground">次</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="flex-col gap-3 sm:flex-col">
            {(openTodo.status === "draft" || openTodo.status === "rejected") && (
              <div className="flex justify-end"><Button onClick={() => submitTodo(openTodo.month)}><Send className="size-4" />确认无误，提交审批</Button></div>
            )}
            {openTodo.status === "pending_admin" && (
              <div className="w-full rounded-lg border border-dashed bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground"><Sparkles className="size-4" />Demo 演示区：模拟行政主管操作</div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="退回时填写原因（模拟）" />
                  <div className="flex shrink-0 items-start gap-2">
                    <Button variant="outline" disabled={!rejectReason.trim()} onClick={() => simulateReject(openTodo.month)}><Ban className="size-4" />模拟退回</Button>
                    <Button onClick={() => simulateApprove(openTodo.month)}><CircleCheck className="size-4" />模拟终审通过</Button>
                  </div>
                </div>
              </div>
            )}
            {openTodo.status === "approved" && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-emerald-600" />已于 {openTodo.decidedAt} 终审通过，本批次归档。</p>}
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </div>
}
