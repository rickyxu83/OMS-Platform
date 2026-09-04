import { useEffect, useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/services/api";
import {
  ANNUAL_LEAVE_SCHEME_LABELS,
  annualBalanceDays,
  dateInputValue,
  days,
  hours,
  roleLabel,
  type EmployeeProfile,
} from "@/pages/attendance-shared";

/** 特休级别三档（与考勤设置「特休档位表」方案一一对应；原籍别字段并入：陆籍→mainland，台籍两档→taiwan） */
const ANNUAL_LEAVE_SCHEME_CODES = ["mainland", "taiwan", "taiwan_special"] as const;

interface ManageDraft {
  employeeName: string;
  annualLeaveScheme: string;
  hireDate: string;
  leaveDate: string;
  balanceType: "comp_time" | "annual_leave";
  balanceTarget: string;
}

/** 调休仅工程师/司机有（产品口径 2026-09-04）：其他角色不显示调休选项 */
function employeeHasCompTime(employee: EmployeeProfile | null) {
  return ["engineer", "driver"].includes(String(employee?.role || ""));
}

function currentBalanceOf(employee: EmployeeProfile, balanceType: ManageDraft["balanceType"]) {
  return balanceType === "annual_leave"
    ? annualBalanceDays(employee)
    : Math.round(Number(employee.compTimeBalanceHours || 0) * 100) / 100;
}

function createManageDraft(employee: EmployeeProfile): ManageDraft {
  const balanceType = employeeHasCompTime(employee) ? "comp_time" : "annual_leave";
  return {
    employeeName: String(employee.employeeName || ""),
    annualLeaveScheme: String(employee.annualLeaveScheme || employee.annualLeaveRule || employee.nationality || "mainland"),
    hireDate: dateInputValue(employee.hireDate),
    leaveDate: dateInputValue(employee.leaveDate),
    balanceType,
    balanceTarget: String(currentBalanceOf(employee, balanceType)),
  };
}

interface EmployeeDialogProps {
  /** 非 null 即打开 */
  employee: EmployeeProfile | null;
  onClose: () => void;
  /** 保存成功后回调（主页面刷新） */
  onSaved: () => Promise<void> | void;
}

/** 员工管理弹窗（2026-09-04 佬裁决合并版）：档案编辑 + 余额设定合一，原「编辑」「调余额」两按钮合并；
 *  级别直接用三档特休方案（原籍别并入）；「参与假勤」开关移除，原值透传防后端默认启用覆盖；
 *  余额直接填目标值并实时预览变化，差额由服务端在余额锁内读台账计算入账 */
export function EmployeeManageDialog({ employee, onClose, onSaved }: EmployeeDialogProps) {
  const [draft, setDraft] = useState<ManageDraft | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (employee) setDraft(createManageDraft(employee));
  }, [employee]);

  function patchDraft(patch: Partial<ManageDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function save() {
    if (!employee || !draft) return;
    const annualAdjust = draft.balanceType === "annual_leave";
    const current = currentBalanceOf(employee, draft.balanceType);
    const target = Number(draft.balanceTarget);
    const balanceChanged = draft.balanceTarget.trim() !== "" && Math.abs(target - current) >= 0.0001;
    if (draft.balanceTarget.trim() !== "" && (!Number.isFinite(target) || target < 0)) {
      toast.error("目标余额不正确（不能为负数）");
      return;
    }
    if (balanceChanged && Math.abs(target * 2 - Math.round(target * 2)) > 0.0001) {
      toast.error("目标余额须以 0.5 为单位");
      return;
    }
    setSaving(true);
    let profileSaved = false;
    try {
      await api.put(`/attendance/employees/${employee.id}`, {
        employeeName: draft.employeeName.trim() || employee.employeeName,
        nationality: draft.annualLeaveScheme === "mainland" ? "mainland" : "taiwan",
        annualLeaveRule: draft.annualLeaveScheme,
        hireDate: draft.hireDate || null,
        leaveDate: draft.leaveDate || null,
        attendanceEnabled: employee.attendanceEnabled !== false,
      });
      profileSaved = true;
      if (balanceChanged) {
        await api.post(`/attendance/employees/${employee.id}/adjust-balance`, {
          balanceType: draft.balanceType,
          targetDays: annualAdjust ? target : undefined,
          targetHours: annualAdjust ? undefined : target,
        });
      }
      toast.success(balanceChanged ? "员工档案与余额已保存" : "员工档案已保存");
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? (profileSaved ? `档案已保存，但余额设定失败：${e.message}` : e.message) : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
      <Dialog open={Boolean(employee)} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>员工管理</DialogTitle>
            <DialogDescription>
              {employee ? `${employee.employeeName || "-"}（${employee.username || "-"} · ${roleLabel(employee.role)}）` : ""}
            </DialogDescription>
          </DialogHeader>
          {employee && draft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>姓名</Label>
                <Input
                  value={draft.employeeName}
                  onChange={(event) => patchDraft({ employeeName: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>特休级别</Label>
                <Select
                  value={draft.annualLeaveScheme}
                  onValueChange={(value) => patchDraft({ annualLeaveScheme: value })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANNUAL_LEAVE_SCHEME_CODES.map((code) => (
                      <SelectItem key={code} value={code}>{ANNUAL_LEAVE_SCHEME_LABELS[code]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">默认随籍别（陆籍 / 台籍·常规）；个别台籍特批由行政在此指定，档位天数在考勤设置「特休档位表」维护</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>入职日期</Label>
                  <Input
                    type="date"
                    value={draft.hireDate}
                    onChange={(event) => patchDraft({ hireDate: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">特休档位以此日期起算（满年对齐自然年底）；需累计以往工龄的特殊员工，由行政将此日期手工前调</p>
                </div>
                <div className="space-y-2">
                  <Label>离职日期</Label>
                  <Input
                    type="date"
                    value={draft.leaveDate}
                    onChange={(event) => patchDraft({ leaveDate: event.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="text-sm font-medium">
                  余额设定
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    特休 {days(annualBalanceDays(employee))} 天{employeeHasCompTime(employee) ? ` / 调休 ${hours(employee.compTimeBalanceHours)} 小时` : ""}
                  </span>
                </div>
                {employeeHasCompTime(employee) ? (
                  <div className="space-y-2">
                    <Label>余额类型</Label>
                    <Select
                      value={draft.balanceType}
                      onValueChange={(value) => setDraft((current) => {
                        if (!current || !employee) return current
                        const balanceType = value as ManageDraft["balanceType"]
                        // 目标值模式：切换类型时目标值换成该类型的当前余额，避免串单位
                        return balanceType === current.balanceType ? current : { ...current, balanceType, balanceTarget: String(currentBalanceOf(employee, balanceType)) }
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="comp_time">调休（按小时）</SelectItem>
                        <SelectItem value="annual_leave">特休（按天）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>设定为（{draft.balanceType === "annual_leave" ? "天" : "小时"}）</Label>
                  {draft.balanceType === "annual_leave" && employee.annualLeaveSuggestedDays !== null && employee.annualLeaveSuggestedDays !== undefined ? (
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      按入职日期计算：满 {employee.annualLeaveTierYears ?? "-"} 年档，建议年度 {employee.annualLeaveSuggestedDays} 天
                    </div>
                  ) : null}
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="直接填写目标余额"
                    value={draft.balanceTarget}
                    onChange={(event) => patchDraft({ balanceTarget: event.target.value })}
                  />
                  {/* 实时预览余额变化：直接设定目标值，不再做加减心算 */}
                  {(() => {
                    const current = currentBalanceOf(employee, draft.balanceType);
                    const unit = draft.balanceType === "annual_leave" ? "天" : "小时";
                    if (draft.balanceTarget.trim() === "") {
                      return <p className="text-xs text-muted-foreground">当前余额 {current} {unit}</p>;
                    }
                    const target = Number(draft.balanceTarget);
                    if (!Number.isFinite(target)) {
                      return <p className="text-xs text-muted-foreground">当前余额 {current} {unit}</p>;
                    }
                    const delta = Math.round((target - current) * 100) / 100;
                    if (Math.abs(delta) < 0.0001) {
                      return <p className="text-xs text-muted-foreground">当前 {current} {unit} → 设定为 {target} {unit}（无变化）</p>;
                    }
                    return (
                      <p className={`text-xs ${delta > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                        当前 {current} {unit} → 设定为 {target} {unit}（{delta > 0 ? `增加 ${delta}` : `减少 ${Math.abs(delta)}`} {unit}）
                      </p>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => onClose()} disabled={saving}>取消</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}

interface BatchBalanceDialogProps {
  open: boolean;
  /** 已选中的员工（主页面按 selectedEmployeeIds 过滤后传入） */
  selectedEmployees: EmployeeProfile[];
  onClose: () => void;
  /** 成功后回调（主页面清空选择并刷新） */
  onSaved: () => Promise<void> | void;
}

/** 批量初始化余额弹窗：把选中员工的余额统一设定为目标值，差额计入调整流水 */
export function BatchBalanceDialog({ open, selectedEmployees, onClose, onSaved }: BatchBalanceDialogProps) {
  const [draft, setDraft] = useState<{ balanceType: "annual_leave" | "comp_time"; target: string; note: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setDraft({ balanceType: "annual_leave", target: "", note: "" });
  }, [open]);

  async function submitBatchBalanceInit() {
    if (!draft) return;
    const target = Number(draft.target);
    if (!Number.isFinite(target) || target < 0) {
      toast.error("请输入有效的目标余额（不能为负数）");
      return;
    }
    if (Math.abs(target * 2 - Math.round(target * 2)) > 0.0001) {
      toast.error("目标余额须以 0.5 为单位");
      return;
    }
    setSaving(true);
    try {
      const data = await api.post("/attendance/employees/batch-balance-init", {
        employeeIds: selectedEmployees.map((employee) => String(employee.id)),
        balanceType: draft.balanceType,
        target,
        note: draft.note,
      });
      toast.success(`批量初始化完成：${data?.initialized ?? 0} 人已设定${data?.skipped ? `，${data.skipped} 人已是目标值跳过` : ""}`);
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量初始化失败");
    } finally {
      setSaving(false);
    }
  }

  return (
      <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>批量初始化余额</DialogTitle>
            <DialogDescription>把选中的 {selectedEmployees.length} 人的余额统一设定为目标值，差额自动计入调整流水</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="max-h-28 overflow-y-auto rounded-md border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {selectedEmployees.map((employee) => employee.employeeName || employee.username).join("、")}
              </div>
              <div className="space-y-2">
                <Label>余额类型</Label>
                <Select
                  value={draft.balanceType}
                  onValueChange={(value) => setDraft((current) => {
                    if (!current) return current
                    const balanceType = value as "annual_leave" | "comp_time"
                    // 切换类型保留已输入的目标值（单位变化用户自理，不清空避免再度丢失）
                    return balanceType === current.balanceType ? current : { ...current, balanceType }
                  })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual_leave">特休（按天）</SelectItem>
                    <SelectItem value="comp_time">调休（按小时）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>设定为（{draft.balanceType === "annual_leave" ? "天" : "小时"}）</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="如 10"
                  value={draft.target}
                  onChange={(event) => setDraft((current) => current ? { ...current, target: event.target.value } : current)}
                />
                <p className="text-xs text-muted-foreground">须以 0.5 为单位；已是目标值的员工自动跳过</p>
              </div>
              <div className="space-y-2">
                <Label>备注</Label>
                <Input
                  placeholder="备注（可选，默认「批量初始化」）"
                  value={draft.note}
                  onChange={(event) => setDraft((current) => current ? { ...current, note: event.target.value } : current)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => onClose()} disabled={saving}>取消</Button>
            <Button onClick={submitBatchBalanceInit} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              确认初始化
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
