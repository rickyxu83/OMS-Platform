import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/services/api";
import type { BalanceLedgerItem } from "@/components/attendance/BalanceLedgerPanel";

const ACTION_LABELS: Record<string, string> = {
  earn: "加班入账",
  use: "使用扣减",
  void: "作废冲回",
  adjust: "行政调整",
  year_end_carryover: "年末折算结转",
  comp_expire: "到期清零",
  approved: "审批联动",
};

const PANEL_MAX_WIDTH = 320;
const VIEWPORT_GAP = 8;

/** 余额变动来源浮卡：支持桌面 hover / 键盘聚焦，也支持触屏点击展开（外点 / Esc 关闭），显示最近 5 条增减流水。 */
export function BalanceLedgerTooltip({ balanceType, children }: { balanceType: "annual_leave" | "comp_time"; children: React.ReactNode }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<BalanceLedgerItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; flipped: boolean } | null>(null);
  const [pinned, setPinned] = useState(false);
  const unit = balanceType === "annual_leave" ? "天" : "小时";

  async function openPanel() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
    const left = Math.max(VIEWPORT_GAP, Math.min(rect.left, window.innerWidth - width - VIEWPORT_GAP));
    const flipped = window.innerHeight - rect.bottom < 220 && rect.top > 220;
    setPos({ left, top: flipped ? rect.top - VIEWPORT_GAP : rect.bottom + VIEWPORT_GAP, flipped });
    if (items !== null || loading) return;
    setLoading(true);
    try {
      const data = await api.get("/attendance/me/balance-ledger");
      const rows = ((data?.items || []) as BalanceLedgerItem[])
        .filter((item) => item.balanceType === balanceType)
        .slice(-5)
        .reverse(); // 最新在前
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function closePanel() {
    setPinned(false);
    setPos(null);
  }

  useEffect(() => {
    if (!pos) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closePanel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={Boolean(pos)}
        aria-label={`查看${balanceType === "annual_leave" ? "特休" : "调休"}最近变动`}
        className="inline-flex cursor-help items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded"
        onMouseEnter={() => { void openPanel(); }}
        onMouseLeave={() => { if (!pinned) setPos(null); }}
        onFocus={() => { void openPanel(); }}
        onBlur={() => { if (!pinned) setPos(null); }}
        onClick={(event) => {
          event.stopPropagation();
          if (pinned && pos) {
            closePanel();
          } else {
            setPinned(true);
            void openPanel();
          }
        }}
      >
        {children}
      </button>
      {pos ? createPortal(
        <div
          ref={panelRef}
          className="fixed z-[100] w-80 max-w-[calc(100vw-16px)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
          style={{
            left: pos.left,
            top: pos.top,
            transform: pos.flipped ? "translateY(-100%)" : undefined,
          }}
          onMouseEnter={() => { /* 保持展开 */ }}
          onMouseLeave={() => { if (!pinned) setPos(null); }}
        >
          <div className="mb-2 text-xs font-semibold">最近变动（{balanceType === "annual_leave" ? "特休" : "调休"}）</div>
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <span className="btn-loader btn-loader-sm" aria-hidden="true" />
              加载中
            </div>
          ) : items && items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((item) => {
                const delta = Number(item.delta || 0);
                const positive = delta > 0;
                return (
                  <li key={item.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`shrink-0 font-semibold ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                        {positive ? "+" : ""}{delta} {unit}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{ACTION_LABELS[item.action] || item.action || "-"}</span>
                    </div>
                    {item.note ? <div className="mt-0.5 line-clamp-2 text-muted-foreground">{item.note}</div> : null}
                    <div className="mt-0.5 text-muted-foreground/80">{String(item.createdAt || "").replace("T", " ").slice(0, 16)}</div>
                    {item.balanceAfter !== undefined ? (
                      <div className="mt-0.5 text-muted-foreground">
                        余额 {Number((item.balanceAfter - delta).toFixed(2))} → {item.balanceAfter} {unit}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-1 text-xs text-muted-foreground">暂无变动记录</div>
          )}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
