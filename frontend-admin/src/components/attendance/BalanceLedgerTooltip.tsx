import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/services/api";
import { Loader2 } from "lucide-react";
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

/** 余额变动来源悬浮（2026-11-12 佬需求）：hover 指标数字时显示最近 5 条增减流水 */
export function BalanceLedgerTooltip({ balanceType, children }: { balanceType: "annual_leave" | "comp_time"; children: React.ReactNode }) {
  const [items, setItems] = useState<BalanceLedgerItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const unit = balanceType === "annual_leave" ? "天" : "小时";

  async function show(e: React.MouseEvent<HTMLSpanElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)), top: rect.bottom + 8 });
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

  return (
    <>
      <span className="inline-flex cursor-help" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
        {children}
      </span>
      {pos ? createPortal(
        <div
          className="fixed z-[100] w-80 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
          style={{ left: pos.left, top: pos.top }}
          onMouseEnter={() => { /* 保持展开 */ }}
          onMouseLeave={() => setPos(null)}
        >
          <div className="mb-2 text-xs font-semibold">最近变动（{balanceType === "annual_leave" ? "特休" : "调休"}）</div>
          {loading ? (
            <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />加载中</div>
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
