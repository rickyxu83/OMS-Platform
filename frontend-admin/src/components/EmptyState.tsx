import { Inbox, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  /** 图标，默认 Inbox */
  icon?: LucideIcon;
  /** 空态主文案 */
  title: string;
  /** 补充说明（可选） */
  description?: string;
  /** 主行动按钮文案（可选，需配合 onAction） */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * 统一空态组件：图标 + 主文案 + 可选说明 + 可选行动按钮。
 * 替换各列表页"一行灰字"的裸空态，保持全站一致。
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-4 py-8 text-center ${className}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button type="button" variant="outline" size="sm" className="mt-1" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
