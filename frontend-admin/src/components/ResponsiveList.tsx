import { useRef, useState, type Key, type ReactNode } from "react";

/** 断点：与 tailwind 默认一致，md=768px、lg=1024px。宽表（min-w≥1100px）建议用 lg */
export type ResponsiveListBreakpoint = "md" | "lg";

/** 移动端卡片左滑露出的操作（如删除） */
export interface ResponsiveSwipeAction {
  /** 露出区内容（图标+文字） */
  label: ReactNode;
  /** 点击露出按钮触发 */
  onTrigger: () => void;
}

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
  /** 移动端卡片左滑露出的操作（触摸端常见交互）；返回 null/undefined 则该行无手势 */
  swipeAction?: (item: T, index: number) => ResponsiveSwipeAction | null | undefined;
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
  swipeAction,
}: ResponsiveListProps<T>) {
  const bp = BP_CLASSES[breakpoint];
  return (
    <>
      <div className={bp.desktop}>{children}</div>
      <div className={bp.mobile}>
        {items.map((item, index) => (
          <div
            key={keyExtractor(item, index)}
            className={`border-b last:border-b-0 ${animateRows ? "list-row-enter" : ""} ${cardClassName}`}
            style={animateRows ? { animationDelay: `${Math.min(index * 30, 400)}ms` } : undefined}
          >
            <SwipeableRow action={swipeAction?.(item, index) ?? null}>
              {renderCard(item, index)}
            </SwipeableRow>
          </div>
        ))}
      </div>
    </>
  );
}

const REVEAL_WIDTH = 88;

interface SwipeGesture {
  startX: number;
  startY: number;
  base: number;
  horizontal: boolean | null;
  moved: boolean;
}

/**
 * 左滑露出操作按钮的行容器（触摸端常见交互，如 iOS 邮件滑动删除）。
 * - 内容层 touch-action: pan-y：垂直滚动不受影响，横向手势由本组件接管
 * - 滑动超过一半宽度松手 → 吸附展开；否则回弹
 * - 展开后点击内容区 → 收起（吞掉这次点击，不触发卡片自身点击）
 * - 无 action 时退化为普通容器，不挂任何手势
 */
function SwipeableRow({ action, children }: { action: ResponsiveSwipeAction | null; children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<SwipeGesture | null>(null);
  const suppressClick = useRef(false);

  if (!action) return <div className="p-4">{children}</div>;

  const close = () => setOffset(0);

  return (
    <div className="relative overflow-hidden">
      {/* 底层操作区：右側红色按钮，内容左滑后露出 */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: REVEAL_WIDTH }}>
        <button
          type="button"
          className="flex w-full flex-col items-center justify-center gap-1 bg-red-500 text-xs font-medium text-white active:bg-red-600"
          onClick={(event) => {
            event.stopPropagation();
            close();
            action.onTrigger();
          }}
        >
          {action.label}
        </button>
      </div>
      {/* 滑动内容层 */}
      <div
        className={`relative bg-card p-4 ${dragging ? "" : "transition-transform duration-150 ease-out"}`}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined, touchAction: "pan-y" }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          gesture.current = { startX: touch.clientX, startY: touch.clientY, base: offset, horizontal: null, moved: false };
          suppressClick.current = false;
        }}
        onTouchMove={(event) => {
          const g = gesture.current;
          if (!g) return;
          const touch = event.touches[0];
          const dx = touch.clientX - g.startX;
          const dy = touch.clientY - g.startY;
          // 8px 死区内不判方向，避免轻触抖动误触发
          if (g.horizontal === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            g.horizontal = Math.abs(dx) > Math.abs(dy);
          }
          if (!g.horizontal) return;
          g.moved = true;
          setDragging(true);
          // 只允许向左滑出（负方向），已展开时允许向右回滑
          setOffset(Math.min(0, Math.max(-REVEAL_WIDTH, g.base + dx)));
        }}
        onTouchEnd={() => {
          const g = gesture.current;
          gesture.current = null;
          setDragging(false);
          if (!g?.moved) return;
          suppressClick.current = true;
          setOffset((current) => (current < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0));
        }}
        onClickCapture={(event) => {
          // 刚结束滑动手势的残留点击：吞掉，不触发卡片点击
          if (suppressClick.current) {
            suppressClick.current = false;
            event.stopPropagation();
            event.preventDefault();
            return;
          }
          // 展开状态下点击内容区：收起并吞掉点击
          if (offset !== 0) {
            event.stopPropagation();
            event.preventDefault();
            close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface ResponsiveCardField {
  /** 字段小标签（如 SN / 工程师），对应 Devices 雏形的 md:hidden 小标签 */
  label: ReactNode;
  value: ReactNode;
  /** 占整行（默认一格），用于地址等长文本 */
  span?: 1 | 2;
  /** 允许换行显示全（默认单行 truncate），长文本配合 span: 2 使用 */
  wrap?: boolean;
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
        <div title={typeof title === "string" ? title : undefined} className="min-w-0 truncate text-sm font-semibold">{title}</div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {subtitle ? <div title={typeof subtitle === "string" ? subtitle : undefined} className="min-w-0 truncate text-sm text-muted-foreground">{subtitle}</div> : null}
      {fields?.length ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {fields.map((field, i) => (
            <div key={i} className={`min-w-0 ${field.span === 2 ? "col-span-2" : ""}`}>
              <div className="text-xs text-muted-foreground">{field.label}</div>
              <div title={typeof field.value === "string" ? field.value : undefined} className={`min-w-0 text-sm ${field.wrap ? "break-words" : "truncate"}`}>{field.value}</div>
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
