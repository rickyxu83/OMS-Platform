import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ReasonConfirmDialogProps {
  open: boolean;
  /** 标题，如「驳回申请」「作废申请」 */
  title: string;
  /** 描述区：说明操作对象与影响 */
  description?: ReactNode;
  /** 警示文案（红底块），用于作废等不可逆操作的影响说明 */
  warning?: ReactNode;
  /** 原因输入：required=必填（驳回/作废），false=纯确认（撤回/停用） */
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  confirmLabel?: string;
  /** 危险操作样式（确认按钮 destructive） */
  destructive?: boolean;
  /** 外部请求进行中：禁用按钮并显示 loading */
  loading?: boolean;
  /** 确认回调；关闭弹窗与 loading 由调用方控制（失败时保留弹窗由调用方决定） */
  onConfirm: (reason: string) => void | Promise<unknown>;
  onCancel: () => void;
}

/**
 * 统一原因/确认对话框：替代原生 window.prompt / window.confirm。
 * 驳回、作废（必填原因留痕）、撤回、停用等操作共用同一交互，避免同一动作多种弹窗。
 */
export function ReasonConfirmDialog({
  open,
  title,
  description,
  warning,
  reasonRequired = false,
  reasonLabel = "原因",
  reasonPlaceholder = "请填写原因",
  confirmLabel = "确认",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ReasonConfirmDialogProps) {
  const [reason, setReason] = useState("");

  // 每次打开重置原因，避免上一次输入串到下一单
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const trimmed = reason.trim();
  const canConfirm = !loading && (!reasonRequired || trimmed.length > 0);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading) onCancel(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription asChild><div>{description}</div></DialogDescription> : null}
        </DialogHeader>
        {warning ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>{warning}</div>
          </div>
        ) : null}
        {reasonRequired ? (
          <div className="space-y-2">
            <Label>{reasonLabel}</Label>
            <Textarea
              autoFocus
              rows={3}
              maxLength={200}
              placeholder={reasonPlaceholder}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>取消</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!canConfirm}
            onClick={() => void onConfirm(trimmed)}          >
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
