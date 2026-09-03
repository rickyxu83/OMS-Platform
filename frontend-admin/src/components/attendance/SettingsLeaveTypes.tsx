import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "sonner";
import { api } from "@/services/api";
import { invalidateLeaveTypesCache, useAnnualLeaveTiers, invalidateAnnualLeaveTiersCache, type AnnualLeaveTierItem, type LeaveTypeItem } from "@/pages/attendance-shared";

const QUOTA_HELP = "年度带薪额度（天）：按自然年跟踪该假别已批准天数，申请与审批时提示使用情况；超出额度的部分按「超额减薪比例」在提示与邮件中标注，系统不做强制拦截，以审批人把关为准。当前用于病假（3 天带薪，超额扣 30%）。产假等政策性强假别建议只配「参考天数 + 政策说明」，天数以审批为准。";

interface LeaveTypeDraft {
  code: string;
  label: string;
  sortOrder: string;
  enabled: boolean;
  requiresProof: boolean;
  includeNonWorkingDays: boolean;
  referenceDays: string;
  policyNote: string;
  paidQuotaDays: string;
  exceedDeductionPercent: string;
}

const blankDraft: LeaveTypeDraft = {
  code: "",
  label: "",
  sortOrder: "100",
  enabled: true,
  requiresProof: false,
  includeNonWorkingDays: false,
  referenceDays: "",
  policyNote: "",
  paidQuotaDays: "",
  exceedDeductionPercent: "",
};

function draftOf(item: LeaveTypeItem): LeaveTypeDraft {
  return {
    code: item.code,
    label: item.label,
    sortOrder: String(item.sortOrder),
    enabled: item.enabled,
    requiresProof: item.requiresProof,
    includeNonWorkingDays: item.includeNonWorkingDays,
    referenceDays: item.referenceDays || "",
    policyNote: item.policyNote || "",
    paidQuotaDays: item.paidQuotaDays === null ? "" : String(item.paidQuotaDays),
    exceedDeductionPercent: item.exceedDeductionPercent === null ? "" : String(item.exceedDeductionPercent),
  };
}

/** 考勤设置-假别管理（spec 004）：假别再配置化，政策文案/额度修改不改代码 */
export function SettingsLeaveTypes({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<LeaveTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveTypeItem | null>(null);
  const [draft, setDraft] = useState<LeaveTypeDraft>(blankDraft);

  // 特休档位表（spec 005 v2）：方案（陆籍/台籍·常规/台籍·特批）× 满 N 年 → 年度天数，支持递增封顶尾档
  const { items: tiers, schemes } = useAnnualLeaveTiers();
  const [tierRows, setTierRows] = useState<Array<{ schemeCode: string; minYears: string; days: string; plusPerYear: string; maxDays: string; note: string }>>([]);
  const [tierScheme, setTierScheme] = useState("mainland");
  const [tiersDirty, setTiersDirty] = useState(false);
  const [tiersSaving, setTiersSaving] = useState(false);
  useEffect(() => {
    if (!tiersDirty && tiers.length) {
      setTierRows(tiers.map((tier) => ({
        schemeCode: tier.schemeCode,
        minYears: String(tier.minYears),
        days: String(tier.days),
        plusPerYear: tier.plusPerYear === null ? "" : String(tier.plusPerYear),
        maxDays: tier.maxDays === null ? "" : String(tier.maxDays),
        note: tier.note || "",
      })));
    }
  }, [tiers, tiersDirty]);

  async function saveTiers() {
    setTiersSaving(true);
    try {
      await api.put("/attendance/annual-leave-tiers", {
        items: tierRows.map((row) => ({
          schemeCode: row.schemeCode,
          minYears: Number(row.minYears),
          days: Number(row.days),
          plusPerYear: row.plusPerYear.trim() === "" ? null : Number(row.plusPerYear),
          maxDays: row.maxDays.trim() === "" ? null : Number(row.maxDays),
          note: row.note.trim(),
        })),
      });
      invalidateAnnualLeaveTiersCache();
      setTiersDirty(false);
      toast.success("特休档位表已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存档位表失败");
    } finally {
      setTiersSaving(false);
    }
  }

  function patchTierRow(index: number, patch: Partial<{ minYears: string; days: string; plusPerYear: string; maxDays: string; note: string }>) {
    setTierRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setTiersDirty(true);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/attendance/leave-types?all=1");
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载假别失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setDraft(blankDraft);
    setDialogOpen(true);
  }

  function openEdit(item: LeaveTypeItem) {
    setEditing(item);
    setDraft(draftOf(item));
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        code: draft.code.trim(),
        label: draft.label.trim(),
        sortOrder: Number(draft.sortOrder || 0),
        enabled: draft.enabled,
        requiresProof: draft.requiresProof,
        includeNonWorkingDays: draft.includeNonWorkingDays,
        referenceDays: draft.referenceDays.trim(),
        policyNote: draft.policyNote.trim(),
        paidQuotaDays: draft.paidQuotaDays.trim() === "" ? null : Number(draft.paidQuotaDays),
        exceedDeductionPercent: draft.exceedDeductionPercent.trim() === "" ? null : Number(draft.exceedDeductionPercent),
      };
      if (editing) {
        await api.put(`/attendance/leave-types/${editing.id}`, payload);
        toast.success("假别已更新");
      } else {
        await api.post("/attendance/leave-types", payload);
        toast.success("假别已新增");
      }
      invalidateLeaveTypesCache();
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存假别失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(item: LeaveTypeItem, enabled: boolean) {
    try {
      await api.put(`/attendance/leave-types/${item.id}`, { ...draftOf(item), enabled });
      invalidateLeaveTypesCache();
      toast.success(enabled ? `「${item.label}」已启用` : `「${item.label}」已停用，申请下拉里不再出现`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    }
  }

  async function remove(item: LeaveTypeItem) {
    if (!window.confirm(`确定删除假别「${item.label}」吗？已被单据引用的假别只能停用。`)) return;
    try {
      await api.delete(`/attendance/leave-types/${item.id}`);
      invalidateLeaveTypesCache();
      toast.success("假别已删除");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除假别失败");
    }
  }

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-1.5">假别管理 <HelpTooltip label={QUOTA_HELP} /></CardTitle>
            <CardDescription>假别再配置化：新增/改名/停用即时生效；名称与政策文案的修改不影响历史单据（提交时已快照）</CardDescription>
          </div>
          {canManage ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新增假别
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>代码</TableHead>
                  <TableHead>启用</TableHead>
                  <TableHead>需证明</TableHead>
                  <TableHead>含非工作日</TableHead>
                  <TableHead>参考天数</TableHead>
                  <TableHead>带薪额度</TableHead>
                  <TableHead>引用</TableHead>
                  {canManage ? <TableHead className="text-right">操作</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className={item.enabled ? "" : "opacity-55"}>
                    <TableCell className="font-medium">
                      {item.label}
                      {item.systemReserved ? <Badge variant="secondary" className="ml-1.5">内置</Badge> : null}
                      {!item.countsBalance && !item.referenceDays && item.paidQuotaDays === null ? (
                        <Badge variant="info" className="ml-1.5">申请前问行政</Badge>
                      ) : null}
                      {item.policyNote ? <div className="mt-0.5 max-w-[240px] truncate text-xs font-normal text-muted-foreground" title={item.policyNote}>{item.policyNote}</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.code}</TableCell>
                    <TableCell>
                      <Switch checked={item.enabled} disabled={!canManage || item.systemReserved} onCheckedChange={(checked) => toggleEnabled(item, checked)} aria-label={`启用 ${item.label}`} />
                    </TableCell>
                    <TableCell>{item.requiresProof ? "需要" : "-"}</TableCell>
                    <TableCell>{item.includeNonWorkingDays ? "自然日" : "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.referenceDays || "-"}</TableCell>
                    <TableCell>
                      {item.paidQuotaDays !== null ? (
                        <span>{item.paidQuotaDays} 天{item.exceedDeductionPercent !== null ? <span className="text-xs text-muted-foreground">（超额扣 {item.exceedDeductionPercent}%）</span> : null}</span>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.referenced || 0} 条</TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label={`编辑 ${item.label}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!item.systemReserved ? (
                            <Button variant="ghost" size="icon" onClick={() => remove(item)} aria-label={`删除 ${item.label}`}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">暂无假别</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(next) => { if (!saving) setDialogOpen(next); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editing ? `编辑假别「${editing.label}」` : "新增假别"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editing ? (
              <div className="space-y-2">
                <Label>代码（创建后不可改，小写字母/数字/下划线）</Label>
                <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="如 maternity" maxLength={32} />
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="如 产假" maxLength={64} />
              </div>
              <div className="space-y-2">
                <Label>排序（小的在前）</Label>
                <Input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex min-h-14 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>启用</span>
                <Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })} disabled={editing?.systemReserved} />
              </label>
              <label className="flex min-h-14 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>需上传证明</span>
                <Switch checked={draft.requiresProof} onCheckedChange={(checked) => setDraft({ ...draft, requiresProof: checked })} />
              </label>
              <label className="flex min-h-14 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>含非工作日（自然日）</span>
                <Switch checked={draft.includeNonWorkingDays} onCheckedChange={(checked) => setDraft({ ...draft, includeNonWorkingDays: checked })} />
              </label>
            </div>
            <div className="space-y-2">
              <Label>参考天数（仅展示，不校验）</Label>
              <Input value={draft.referenceDays} onChange={(e) => setDraft({ ...draft, referenceDays: e.target.value })} placeholder="如 98+60 或 按当地政策" maxLength={64} />
            </div>
            <div className="space-y-2">
              <Label>政策说明（申请页/详情/邮件展示）</Label>
              <Textarea
                value={draft.policyNote}
                onChange={(e) => setDraft({ ...draft, policyNote: e.target.value })}
                placeholder="如：按参保地最新政策执行，奖励假天数以当地条例为准"
                className="min-h-[72px]"
                maxLength={500}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>年度带薪额度（天，可空）</Label>
                <Input type="number" min="0" max="365" step="0.5" value={draft.paidQuotaDays} onChange={(e) => setDraft({ ...draft, paidQuotaDays: e.target.value })} placeholder="如 3" />
              </div>
              <div className="space-y-2">
                <Label>超额减薪比例（%，可空）</Label>
                <Input type="number" min="0" max="100" step="1" value={draft.exceedDeductionPercent} onChange={(e) => setDraft({ ...draft, exceedDeductionPercent: e.target.value })} placeholder="如 30" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={save} disabled={saving || !draft.label.trim() || (!editing && !draft.code.trim())}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? "保存" : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>

    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-1.5">特休档位表 <HelpTooltip label="档位年限按入职日期计算：满年对齐自然年底（入职当年与次年为 0 档，第三年起满 1 年档）。建议额度 = 员工方案内满年数不超过档位年限的最大一档，含「每年加 N 天」递增与封顶；仅作展示与一键带入，入账由行政在余额控制台确认。台籍·特批方案由行政在员工编辑对话框手工指定。" /></CardTitle>
            <CardDescription>方案 × 满 N 年 → 年度特休天数；规则变化时直接改表，无需改代码</CardDescription>
          </div>
          {canManage ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setTierRows([...tierRows, { schemeCode: tierScheme, minYears: "", days: "", plusPerYear: "", maxDays: "", note: "" }]); setTiersDirty(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                新增档位
              </Button>
              <Button size="sm" onClick={saveTiers} disabled={tiersSaving || !tiersDirty}>
                {tiersSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                保存档位表
              </Button>
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex w-fit gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
          {schemes.map((scheme) => (
            <button
              key={scheme.code}
              type="button"
              onClick={() => setTierScheme(scheme.code)}
              title={scheme.note}
              className={`h-8 rounded-md px-4 font-medium transition ${tierScheme === scheme.code ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >{scheme.label}</button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">满年数（≥）</TableHead>
                <TableHead className="w-28">基础天数</TableHead>
                <TableHead className="w-28">每年加（可空）</TableHead>
                <TableHead className="w-28">封顶（可空）</TableHead>
                <TableHead>备注</TableHead>
                {canManage ? <TableHead className="w-16 text-right">操作</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tierRows.map((row, index) => ({ row, index })).filter(({ row }) => row.schemeCode === tierScheme).map(({ row, index }) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input type="number" min="0" max="100" step="1" value={row.minYears} disabled={!canManage}
                      onChange={(e) => patchTierRow(index, { minYears: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min="0" max="365" step="0.5" value={row.days} disabled={!canManage}
                      onChange={(e) => patchTierRow(index, { days: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min="0" max="30" step="0.5" value={row.plusPerYear} disabled={!canManage} placeholder="-"
                      onChange={(e) => patchTierRow(index, { plusPerYear: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min="0" max="365" step="0.5" value={row.maxDays} disabled={!canManage} placeholder="-"
                      onChange={(e) => patchTierRow(index, { maxDays: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input value={row.note} disabled={!canManage} maxLength={200}
                      onChange={(e) => patchTierRow(index, { note: e.target.value })} />
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label="删除档位"
                        onClick={() => { setTierRows(tierRows.filter((_, i) => i !== index)); setTiersDirty(true); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {tierRows.filter((row) => row.schemeCode === tierScheme).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">该方案暂无档位</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
