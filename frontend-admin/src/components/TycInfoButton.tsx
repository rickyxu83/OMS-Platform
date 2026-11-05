// 天眼查资讯按钮：悬浮显示工商摘要浮层（读取缓存，0 消耗），点击仍打开完整资讯弹窗
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TycLogo } from "@/components/TycLogo";
import { api } from "@/services/api";

type ProfileSummary = {
  companyName?: string | null;
  creditCode?: string | null;
  legalPerson?: string | null;
  registeredCapital?: string | null;
  foundDate?: string | null;
  regStatus?: string | null;
  industry?: string | null;
  socialStaffNum?: number | null;
  fetchedAt?: string | null;
};

const HOVER_DELAY_MS = 200;

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

export function TycInfoButton({
  customerId,
  hasData,
  logoClassName = "h-4 w-4",
  buttonClassName = "inline-flex shrink-0 items-center rounded p-1 transition-colors hover:bg-accent",
  stopPropagation = true,
  onOpenDialog,
}: {
  customerId: number;
  hasData?: boolean;
  logoClassName?: string;
  buttonClassName?: string;
  stopPropagation?: boolean;
  onOpenDialog: () => void;
}) {
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (state !== "idle") return;
    setState("loading");
    try {
      const res = await api.get(`/customers/${customerId}/profile`);
      setSummary(res?.profile || null);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, [customerId, state]);

  const show = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 320;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    // 默认显示在按钮下方；视口底部空间不足时改到上方
    const belowTop = rect.bottom + 6;
    const top = belowTop + 260 > window.innerHeight ? Math.max(8, rect.top - 266) : belowTop;
    setPos({ top, left });
    load();
  };

  const hide = () => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    enterTimer.current = null;
    setPos(null);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={buttonClassName}
        title="天眼查企业资讯"
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
          onOpenDialog();
        }}
        onMouseEnter={() => {
          if (enterTimer.current) clearTimeout(enterTimer.current);
          enterTimer.current = setTimeout(show, HOVER_DELAY_MS);
        }}
        onMouseLeave={hide}
      >
        <TycLogo className={logoClassName} hasData={hasData} />
      </button>
      {pos
        ? createPortal(
            <div
              className="fixed z-[70] w-80 rounded-lg border bg-popover p-3 text-xs text-foreground shadow-lg"
              style={{ top: pos.top, left: pos.left }}
              onMouseEnter={() => { if (enterTimer.current) clearTimeout(enterTimer.current); }}
              onMouseLeave={hide}
            >
              {state === "loading" ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="btn-loader" aria-hidden="true" /> 正在读取资讯缓存…
                </div>
              ) : state === "error" ? (
                <div className="text-muted-foreground">资讯读取失败，点击查看详情重试</div>
              ) : summary ? (
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{summary.companyName || "—"}</div>
                  <Row label="信用代码" value={summary.creditCode} />
                  <Row label="法人" value={summary.legalPerson} />
                  <Row label="注册资本" value={summary.registeredCapital} />
                  <Row label="成立日期" value={summary.foundDate} />
                  <Row label="状态" value={summary.regStatus} />
                  <Row label="行业" value={summary.industry} />
                  <Row label="社保人数" value={summary.socialStaffNum} />
                  <div className="border-t pt-1.5 text-muted-foreground">点击查看完整资讯与风险总览</div>
                </div>
              ) : (
                <div className="text-muted-foreground">暂无资讯数据，点击按钮拉取</div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
