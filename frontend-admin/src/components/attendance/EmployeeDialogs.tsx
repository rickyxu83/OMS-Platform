import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Check, Loader2, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/services/api";
import {
  annualBalanceDays,
  dateInputValue,
  days,
  hours,
  roleLabel,
  type EmployeeProfile,
} from "@/pages/attendance-shared";

interface EmployeeDraft {
  employeeName: string;
  nationality: string;
  hireDate: string;
  leaveDate: string;
  attendanceEnabled: boolean;
  annualLeaveRule: string;
}
interface AdjustDraft {
  balanceType: "comp_time" | "annual_leave";
  amount: string;
  note: string;
}
function createEmployeeDraft(employee: EmployeeProfile): EmployeeDraft {
  return {
    employeeName: String(employee.employeeName || ""),
    nationality: String(employee.nationality || "mainland"),
    hireDate: dateInputValue(employee.hireDate),
    leaveDate: dateInputValue(employee.leaveDate),
    attendanceEnabled: employee.attendanceEnabled !== false,
    annualLeaveRule: String(employee.annualLeaveRule || employee.nationality || "mainland"),
  };
}

function createAdjustDraft(): AdjustDraft {
  return { balanceType: "comp_time", amount: "", note: "" };
}

interface EmployeeDialogProps {
  /** 非 null 即打开 */
  employee: EmployeeProfile | null;
  onClose: () => void;
  /** 保存成功后回调（主页面刷新） */
  onSaved: () => Promise<void> | void;
}

/** 编辑员工档案弹窗：draft 状态内化，employee 变化时重建草稿 */
export function EmployeeEditDialog({ employee, onClose, onSaved }: EmployeeDialogProps) {
  const [draft, setDraft] = useState<EmployeeDraft | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (employee) setDraft(createEmployeeDraft(employee));
  }, [employee]);

  function patchDraft(patch: Partial<EmployeeDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function saveEmployee() {
    if (!employee || !draft) return;
    setSaving(true);
    try {
      await api.put(`/attendance/employees/${employee.id}`, {
        employeeName: draft.employeeName.trim() || employee.employeeName,
        nationality: draft.nationality || "mainland",
        hireDate: draft.hireDate || null,
        leaveDate: draft.leaveDate || null,
        attendanceEnabled: draft.attendanceEnabled,
        annualLeaveRule: draft.annualLeaveRule || draft.nationality || "mainland",
      });
      toast.success("员工档案已保存");
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
      <Dialog open={Boolean(employee)} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>编辑员工档案</DialogTitle>
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
                <Label>籍别</Label>
                <Select
                  value={draft.nationality}
                  onValueChange={(value) => patchDraft({ nationality: value, annualLeaveRule: value })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mainland">陆籍</SelectItem>
                    <SelectItem value="taiwan">台籍</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>入职日期</Label>
                  <Input
                    type="date"
                    value={draft.hireDate}
                    onChange={(event) => patchDraft({ hireDate: event.target.value })}
                  />
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
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium">参与考勤</div>
                  <div className="text-xs text-muted-foreground">停用后该员工暂不纳入考勤管理</div>
                </div>
                <Switch
                  checked={draft.attendanceEnabled}
                  onCheckedChange={(checked) => patchDraft({ attendanceEnabled: checked })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => onClose()} disabled={saving}>取消</Button>
            <Button onClick={saveEmployee} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}

/** 调整余额弹窗：切换余额类型保留已输入金额（历史教训：误触同选项不丢输入） */
export function AdjustBalanceDialog({ employee, onClose, onSaved }: EmployeeDialogProps) {
  const [draft, setDraft] = useState<AdjustDraft | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (employee) setDraft(createAdjustDraft());
  }, [employee]);

  function patchDraft(patch: Partial<AdjustDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function submitAdjustBalance() {
    if (!employee || !draft) return;
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error(draft.balanceType === "annual_leave" ? "请填写调整天数（正数增加，负数扣减）" : "请填写调整小时数（正数增加，负数扣减）");
      return;
    }
    const annualAdjust = draft.balanceType === "annual_leave";
    setSaving(true);
    try {
      await api.post(`/attendance/employees/${employee.id}/adjust-balance`, {
        balanceType: draft.balanceType,
        deltaDays: annualAdjust ? amount : undefined,
        deltaHours: annualAdjust ? undefined : amount,
        note: draft.note,
      });
      toast.success("余额已调整");
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "调整失败");
    } finally {
      setSaving(false);
    }
  }

  return (
      <Dialog open={Boolean(employee)} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>调整余额</DialogTitle>
            <DialogDescription>
              {employee ? `${employee.employeeName || "-"} · 特休 ${days(annualBalanceDays(employee))} 天 / 调休 ${hours(employee.compTimeBalanceHours)} 小时` : ""}
            </DialogDescription>
          </DialogHeader>
          {employee && draft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>余额类型</Label>
                <Select
                  value={draft.balanceType}
                  onValueChange={(value) => setDraft((current) => {
                    if (!current) return current
                    const balanceType = value as AdjustDraft["balanceType"]
                    // 切换类型保留已输入的金额（单位变化用户自理，不清空避免再度丢失）
                    return balanceType === current.balanceType ? current : { ...current, balanceType }
                  })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comp_time">调休（按小时）</SelectItem>
                    <SelectItem value="annual_leave">特休（按天）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{draft.balanceType === "annual_leave" ? "调整天数" : "调整小时数"}</Label>
                <div className="flex flex-wrap gap-2">
                  {["0.5", "1", "-0.5", "-1"].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant={draft.amount === preset ? "default" : "outline"}
                      onClick={() => patchDraft({ amount: preset })}
                    >
                      {Number(preset) > 0 ? `+${preset}` : preset}{draft.balanceType === "annual_leave" ? "天" : "小时"}
                    </Button>
                  ))}
                </div>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="正数增加，负数扣减"
                  value={draft.amount}
                  onChange={(event) => patchDraft({ amount: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>备注</Label>
                <Input
                  placeholder="备注（可选）"
                  value={draft.note}
                  onChange={(event) => patchDraft({ note: event.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => onClose()} disabled={saving}>取消</Button>
            <Button onClick={submitAdjustBalance} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              确认调整
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
