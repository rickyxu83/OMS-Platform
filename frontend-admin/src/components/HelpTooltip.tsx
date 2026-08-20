import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";

const TOOLTIP_WIDTH = 288; // w-72
const VIEWPORT_GAP = 8;

/**
 * 问号帮助提示：图标保持小巧，气泡通过 portal 渲染到 body 并 fixed 定位，
 * 避免被卡片 overflow-hidden 或边框裁剪；靠近视口底部时自动翻转到图标上方。
 */
export function HelpTooltip({ label }: { label: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [flipped, setFlipped] = useState(false);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    left = Math.max(VIEWPORT_GAP, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_GAP));
    // 下方空间不足时翻到图标上方（气泡按内容自适应高度，预留约 160px 判断）
    const below = rect.bottom + VIEWPORT_GAP;
    const above = rect.top - VIEWPORT_GAP;
    const flip = window.innerHeight - below < 160 && above > 160;
    setFlipped(flip);
    setPos({ left, top: flip ? above : below });
  };

  const hide = () => setPos(null);

  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      tabIndex={0}
      aria-label={label}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <CircleHelp className="h-3 w-3 cursor-help text-muted-foreground/70 transition-colors hover:text-primary focus:text-primary" />
      {pos
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[100] w-72 rounded-md border bg-popover p-3 text-xs font-normal leading-5 text-popover-foreground shadow-lg"
              style={{
                left: pos.left,
                top: pos.top,
                transform: flipped ? "translateY(-100%)" : undefined,
              }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
