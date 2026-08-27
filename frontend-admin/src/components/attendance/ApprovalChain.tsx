import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { approvalStepLabel, approvalStepStatus, formatDateTime, roleLabel, type ApprovalStep } from "@/pages/attendance-shared";

// 审批链默认折叠为一行摘要（级数 + 当前/最终状态），点击展开完整签核过程。
// 申请明细行信息密度高，全量审批历史属低频查档信息，不应默认占视觉面积。
export function ApprovalChain({ steps }: { steps: ApprovalStep[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!steps.length) return null;
  const current = steps.find((step) => step.status === "pending");
  const rejected = steps.find((step) => step.status === "rejected");
  const summary = current
    ? `${steps.length} 级审批 · 当前：${approvalStepLabel(current)}`
    : rejected
      ? `${steps.length} 级审批 · ${approvalStepLabel(rejected)}已驳回`
      : `${steps.length} 级审批 · 已全部通过`;
  return (
    <div className="mt-1 text-xs leading-5 text-muted-foreground">
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium text-muted-foreground transition hover:text-foreground"
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "" : "-rotate-90"}`} />
        {summary}
      </button>
      {expanded ? (
        <div className="mt-0.5 border-l pl-3">
          {steps.map((step) => (
            <div key={step.id}>
              {approvalStepLabel(step)}：{approvalStepStatus(step)}
              {step.assigneeEmployeeName ? `（${step.assigneeEmployeeName}）` : step.stepType !== "role" && step.assigneeRole ? `（${roleLabel(step.assigneeRole)}）` : ""}
              {step.approvedByName ? ` · ${step.approvedByName}` : ""}
              {step.approvedAt ? ` · ${formatDateTime(step.approvedAt)}` : ""}
              {step.rejectedByName ? ` · ${step.rejectedByName}` : ""}
              {step.rejectedAt ? ` · ${formatDateTime(step.rejectedAt)}` : ""}
              {step.rejectedReason ? ` · ${step.rejectedReason}` : ""}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
