import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";

interface StatStripProps {
  children: ReactNode;
  className?: string;
}

/** 列表页顶部统一紧凑统计条容器。 */
export function StatStrip({ children, className = "" }: StatStripProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-card px-3.5 py-2 text-sm shadow-sm sm:gap-x-4 sm:px-4 sm:py-2.5 ${className}`}>
      {children}
    </div>
  );
}

interface StatStripItemProps {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  active?: boolean;
  loading?: boolean;
  animationIndex?: number;
  title?: string;
  onClick?: () => void;
  className?: string;
}

/** 统计条单项：支持静态展示或点击筛选（选中态统一使用浅紫底 + 主色字）。 */
export function StatStripItem({
  label,
  value,
  icon: Icon,
  iconClassName = "",
  active = false,
  loading = false,
  animationIndex = 0,
  title,
  onClick,
  className = "",
}: StatStripItemProps) {
  const valueNode = loading ? (
    <Skeleton className="inline-block h-5 w-8 align-middle" />
  ) : (
    <span
      className={`stat-value-enter inline-block text-base font-bold tabular-nums ${active ? "text-primary" : "text-foreground"}`}
      style={{ animationDelay: `${Math.min(animationIndex * 100, 400)}ms` }}
    >
      {value}
    </span>
  );

  const inner = (
    <>
      {Icon ? <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : iconClassName}`} aria-hidden="true" /> : null}
      <span className={active ? "font-medium text-primary" : "text-muted-foreground"}>{label}</span>
      {valueNode}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        title={title}
        className={`inline-flex items-baseline gap-1.5 rounded-lg px-2 py-1 text-sm transition-colors ${
          active
            ? "bg-primary-soft text-primary ring-1 ring-primary/25"
            : "hover:bg-accent"
        } ${className}`}
      >
        {inner}
      </button>
    );
  }

  return (
    <span title={title} className={`inline-flex items-baseline gap-1.5 px-2 py-1 text-sm ${className}`}>
      {inner}
    </span>
  );
}
