import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface StatusIndicatorProps {
  icon: LucideIcon;
  color: string;
  label: ReactNode;
  className?: string;
}

/**
 * 轻量状态/类型指示器（图标 + 中性文字，替代大色块 Badge）。
 * 全站列表与详情页共用，保持状态视觉一致。
 */
export function StatusIndicator({ icon: Icon, color, label, className = "" }: StatusIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium text-muted-foreground ${className}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function indicatorSpan(icon: LucideIcon, color: string, label: ReactNode, className = "") {
  return <StatusIndicator icon={icon} color={color} label={label} className={className} />;
}
