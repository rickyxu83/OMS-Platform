import { type Key, type ReactNode } from "react";

/** 断点：与 tailwind 默认一致，md=768px、lg=1024px。宽表（min-w≥1100px）建议用 lg */
export type ResponsiveListBreakpoint = "md" | "lg";

interface ResponsiveListProps<T> {
  /** 列表数据（与桌面表格同一份，loading/empty 由页面层先行处理） */
  items: T[];
  keyExtractor: (item: T, index: number) => Key;
  /** 移动端卡片渲染，通常返回 <ResponsiveCard /> */
  renderCard: (item: T, index: number) => ReactNode;
  /** 桌面端内容（原表格/网格），断点以上原样渲染 */
  children: ReactNode;
  /** 切换断点，默认 lg（1100px+ 宽表在平板也走卡片，避免横滑） */
  breakpoint?: ResponsiveListBreakpoint;
  /** 追加到卡片行上的类名 */
  cardClassName?: string;
  /** 卡片入场动画（默认 true，与桌面行 list-row-enter 一致，封顶 400ms） */
  animateRows?: boolean;
}

const BP_CLASSES: Record<ResponsiveListBreakpoint, { desktop: string; mobile: string }> = {
  md: { desktop: "hidden md:block", mobile: "md:hidden" },
  lg: { desktop: "hidden lg:block", mobile: "lg:hidden" },
};

/**
 * 响应式列表：断点以上渲染 children（桌面表格），断点以下把 items 渲染为卡片流。
 * 纯 CSS 断点切换，无 JS matchMedia，SSR/首屏安全。
 * 用法：loading/empty 在页面层处理后再交给本组件，避免双份状态。
 */
export function ResponsiveList<T>({
  items,
  keyExtractor,
  renderCard,
  children,
  breakpoint = "lg",
  cardClassName = "",
  animateRows = true,
}: ResponsiveListProps<T>) {
  const bp = BP_CLASSES[breakpoint];
  return (
    <>
      <div className={bp.desktop}>{children}</div>
      <div className={bp.mobile}>
        {items.map((item, index) => (
          <div
            key={keyExtractor(item, index)}
            className={`border-b p-4 last:border-b-0 ${animateRows ? "list-row-enter" : ""} ${cardClassName}`}
            style={animateRows ? { animationDelay: `${Math.min(index * 30, 400)}ms` } : undefined}
          >
            {renderCard(item, index)}
          </div>
        ))}
      </div>
    </>
  );
}

interface ResponsiveCardField {
  /** 字段小标签（如 SN / 工程师），对应 Devices 雏形的 md:hidden 小标签 */
  label: ReactNode;
  value: ReactNode;
}

interface ResponsiveCardProps {
  /** 标题行左侧主标题（可放 Case ID、客户名等，可带图标的 flex 节点） */
  title: ReactNode;
  /** 标题行右侧状态位（Badge 等） */
  status?: ReactNode;
  /** 标题行下方的副标题（一行说明文字） */
  subtitle?: ReactNode;
  /** 字段区：label + value 两列网格 */
  fields?: ResponsiveCardField[];
  /** 底部操作区：按钮组，内部自行 stopPropagation */
  actions?: ReactNode;
  /** 整卡点击（提供后卡片获得 role=button / tabIndex / 键盘支持） */
  onClick?: () => void;
  className?: string;
}

/**
 * ResponsiveList 的标准卡片：标题行（标题 + 状态徽章）→ 副标题 → 字段区 → 底部操作区。
 * 三个列表页共用，保证移动端卡片视觉一致。
 */
export function ResponsiveCard({
  title,
  status,
  subtitle,
  fields,
  actions,
  onClick,
  className = "",
}: ResponsiveCardProps) {
  const interactiveProps = onClick
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        },
      }
    : {};
  return (
    <div
      className={`space-y-2.5 ${onClick ? "cursor-pointer" : ""} ${className}`}
      {...interactiveProps}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold">{title}</div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {subtitle ? <div className="min-w-0 truncate text-sm text-muted-foreground">{subtitle}</div> : null}
      {fields?.length ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {fields.map((field, i) => (
            <div key={i} className="min-w-0">
              <div className="text-xs text-muted-foreground">{field.label}</div>
              <div className="min-w-0 truncate text-sm">{field.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">{actions}</div>
      ) : null}
    </div>
  );
}
