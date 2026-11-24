import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";

const TOOLTIP_MAX_WIDTH = 288; // w-72
const VIEWPORT_GAP = 8;

/**
 * 问号帮助提示：支持桌面悬停/键盘聚焦，也支持手机/平板点击展开与外点/Esc 关闭；
 * 气泡通过 portal 渲染到 body 并 fixed 定位，避免被容器裁剪，靠近视口底部时自动向上翻转。
 */
export function HelpTooltip({ label }: { label: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [pinned, setPinned] = useState(false);

  const computeAndShow = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(VIEWPORT_GAP, Math.min(left, window.innerWidth - width - VIEWPORT_GAP));
    const below = rect.bottom + VIEWPORT_GAP;
    const above = rect.top - VIEWPORT_GAP;
    const flip = window.innerHeight - below < 160 && above > 160;
    setFlipped(flip);
    setPos({ left, top: flip ? above : below });
  };

  const hide = () => {
    setPinned(false);
    setPos(null);
  };

  useEffect(() => {
    if (!pos) return;
    const onPointerDown = (event: PointerEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pos]);

  return (
    <button
      ref={triggerRef}
      type="button"
      className="inline-flex items-center justify-center rounded-full p-0.5 align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      aria-label={label}
      aria-expanded={Boolean(pos)}
      onMouseEnter={computeAndShow}
      onMouseLeave={() => { if (!pinned) setPos(null); }}
      onFocus={computeAndShow}
      onBlur={() => { if (!pinned) setPos(null); }}
      onClick={(event) => {
        event.stopPropagation();
        if (pinned && pos) {
          hide();
        } else {
          setPinned(true);
          computeAndShow();
        }
      }}
    >
      <CircleHelp className="h-3.5 w-3.5 cursor-help text-muted-foreground/70 transition-colors hover:text-primary" />
      {pos
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[100] w-72 max-w-[calc(100vw-16px)] rounded-md border bg-popover p-3 text-left text-xs font-normal leading-5 text-popover-foreground shadow-lg"
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
    </button>
  );
}
