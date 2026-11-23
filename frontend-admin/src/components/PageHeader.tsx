import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** 标准管理端页面容器：统一最大宽度（1600px）、内边距与纵向节奏，避免超宽屏拉散或各页留白不一。 */
export function PageContainer({ children, className = "" }: PageContainerProps) {
  return (
    <div className={`mx-auto w-full min-w-0 max-w-[1600px] space-y-5 p-4 sm:p-6 lg:space-y-6 ${className}`}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/** 标准页面头部：统一 h1 字号（text-2xl sm:text-3xl）、副标题样式与右侧操作区换行布局。 */
export function PageHeader({ title, subtitle, icon: Icon, actions, className = "" }: PageHeaderProps) {
  return (
    <header className={`flex flex-col justify-between gap-3 md:flex-row md:items-center md:gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {Icon ? <Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" /> : null}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
