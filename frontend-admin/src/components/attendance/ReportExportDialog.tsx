import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/services/api";
import { dateIndex, monthDateRange, type EmployeeProfile } from "@/pages/attendance-shared";

interface ReportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 打开时按当前月度汇总月份初始化统计范围 */
  initialMonth: string;
  employees: EmployeeProfile[];
}

/** 导出考勤报表弹窗：按月/自定义范围 + 员工范围多选，状态自包含 */
export function ReportExportDialog({ open, onOpenChange, initialMonth, employees }: ReportExportDialogProps) {
  const [reportExportMode, setReportExportMode] = useState<"month" | "range">("month");
  const [reportExportMonth, setReportExportMonth] = useState(initialMonth);
  const [reportExportStartDate, setReportExportStartDate] = useState(monthDateRange(initialMonth).startDate);
  const [reportExportEndDate, setReportExportEndDate] = useState(monthDateRange(initialMonth).endDate);
  const [reportExportEmployeeIds, setReportExportEmployeeIds] = useState<string[]>([]);
  const [reportExporting, setReportExporting] = useState(false);

  // 每次打开按当前汇总月份重置统计范围与员工选择
  useEffect(() => {
    if (open) {
      setReportExportMode("month");
      setReportExportMonth(initialMonth);
      setReportExportStartDate(monthDateRange(initialMonth).startDate);
      setReportExportEndDate(monthDateRange(initialMonth).endDate);
      setReportExportEmployeeIds([]);
    }
  }, [open, initialMonth]);

  async function exportAttendanceReport() {
    if (reportExporting) return;
    const range = reportExportMode === "month"
      ? monthDateRange(reportExportMonth)
      : { startDate: reportExportStartDate, endDate: reportExportEndDate };
    if (!range.startDate || !range.endDate) {
      toast.error("请选择完整的统计日期");
      return;
    }
    if (dateIndex(range.endDate) < dateIndex(range.startDate)) {
      toast.error("结束日期不能早于开始日期");
      return;
    }
    if (dateIndex(range.endDate) - dateIndex(range.startDate) + 1 > 366) {
      toast.error("单次统计范围不能超过 366 天");
      return;
    }
    setReportExporting(true);
    try {
      const query = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate });
      if (reportExportEmployeeIds.length) query.set("employeeIds", reportExportEmployeeIds.join(","));
      const blob = await api.download(`/attendance/reports/export?${query.toString()}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `考勤报表-${range.startDate.replace(/-/g, "")}-${range.endDate.replace(/-/g, "")}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      onOpenChange(false);
      toast.success("考勤报表已导出");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "考勤报表导出失败");
    } finally {
      setReportExporting(false);
    }
  }
  return (
      <Dialog open={open} onOpenChange={(open) => { if (!reportExporting) onOpenChange(open); }}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>导出考勤报表</DialogTitle>
            <DialogDescription>生成包含请假统计、加班统计和假期余额的 Excel 文件，仅统计已通过申请。</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>统计方式</Label>
              <Select value={reportExportMode} onValueChange={(value) => setReportExportMode(value as "month" | "range")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">按月统计</SelectItem>
                  <SelectItem value="range">自定义日期范围</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {reportExportMode === "month" ? (
              <div className="space-y-2">
                <Label>月份</Label>
                <Input type="month" value={reportExportMonth} onChange={(event) => setReportExportMonth(event.target.value)} />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>开始日期</Label>
                  <Input type="date" value={reportExportStartDate} onChange={(event) => setReportExportStartDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>结束日期</Label>
                  <Input type="date" value={reportExportEndDate} onChange={(event) => setReportExportEndDate(event.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>员工范围</Label>
                <Button type="button" size="sm" variant="ghost" onClick={() => setReportExportEmployeeIds([])} disabled={!reportExportEmployeeIds.length}>全部员工</Button>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {employees.map((employee) => {
                  const id = String(employee.id);
                  const checked = reportExportEmployeeIds.includes(id);
                  const status = employee.leaveDate ? "离职" : employee.attendanceEnabled === false ? "停用" : "在职";
                  return (
                    <label key={id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={checked}
                        onChange={(event) => setReportExportEmployeeIds((current) => event.target.checked
                          ? [...current, id]
                          : current.filter((item) => item !== id))}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm" title={employee.employeeName || `员工 #${id}`}>{employee.employeeName || `员工 #${id}`}</span>
                      <Badge variant={status === "在职" ? "success" : "outline"}>{status}</Badge>
                    </label>
                  );
                })}
                {employees.length === 0 ? <div className="py-5 text-center text-sm text-muted-foreground">暂无员工档案</div> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {reportExportEmployeeIds.length ? `已选择 ${reportExportEmployeeIds.length} 人` : "未选择时导出全部符合统计范围的员工"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reportExporting}>取消</Button>
            <Button onClick={exportAttendanceReport} disabled={reportExporting}>
              {reportExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {reportExporting ? "生成中…" : "导出 Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
