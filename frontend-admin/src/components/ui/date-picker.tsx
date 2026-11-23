import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, parse, setMonth, setYear } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { zhCN } from "date-fns/locale";
import "react-day-picker/dist/style.css";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

const YEARS = Array.from({ length: 16 }, (_, i) => 2020 + i);
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const VIEWPORT_GAP = 8;

/** 单日期选择器 · D 款：桌面侧栏年份 + 月份 12 宫格 + 日历；窄屏自动折叠为顶部横向年份条，防 375px 溢出。 */
export function DatePicker({ value, onChange, placeholder = "选择日期", ariaLabel }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const [viewMonth, setViewMonth] = useState<Date>(selected || new Date());

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      const inPanel = t instanceof Element && !!t.closest?.("[data-date-picker-panel]");
      if (ref.current && !ref.current.contains(t) && !inPanel) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (open && selected) setViewMonth(selected);
  }, [open]);

  // 实测弹层宽高并钳制在视口内，防止右侧/底部溢出（含 375px 窄屏与弹窗偏下位置）
  useLayoutEffect(() => {
    if (!open || !panelPos || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nextLeft = Math.max(VIEWPORT_GAP, Math.min(panelPos.left, vw - rect.width - VIEWPORT_GAP));
    const nextTop = Math.max(VIEWPORT_GAP, Math.min(panelPos.top, vh - rect.height - VIEWPORT_GAP));
    if (nextLeft !== panelPos.left || nextTop !== panelPos.top) {
      setPanelPos({ top: nextTop, left: nextLeft });
    }
  }, [open, panelPos]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const estimatedWidth = window.innerWidth < 640 ? Math.min(312, window.innerWidth - VIEWPORT_GAP * 2) : 380;
      const rightAligned = rect.left + estimatedWidth > window.innerWidth - VIEWPORT_GAP * 2;
      const left = rightAligned
        ? Math.max(VIEWPORT_GAP, rect.right - estimatedWidth)
        : Math.max(VIEWPORT_GAP, rect.left);
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP;
      const top = spaceBelow >= 240 ? rect.bottom + 4 : Math.max(VIEWPORT_GAP, rect.top - 12);
      setPanelPos({ top, left });
    }
    setOpen(true);
  };

  const viewYear = viewMonth.getFullYear();
  const viewMonthIdx = viewMonth.getMonth();

  return (
    <div ref={ref} className="relative">
      <div className="flex h-9 w-full items-center rounded-md border border-slate-300 bg-white shadow-sm transition-colors hover:border-slate-400 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <button
          type="button"
          aria-label={ariaLabel || placeholder}
          aria-expanded={open}
          onClick={toggleOpen}
          className="flex h-full min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-sm focus:outline-none"
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span title={value || placeholder} className={value ? "truncate text-slate-900" : "truncate text-slate-400"}>
            {value || placeholder}
          </span>
        </button>
        {value ? (
          <button
            type="button"
            aria-label="清空日期"
            title="清空日期"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setOpen(false);
            }}
            className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open ? createPortal(
        <div
          ref={panelRef}
          data-date-picker-panel
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed z-[100] flex max-h-[calc(100dvh-16px)] max-w-[calc(100vw-16px)] flex-col overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl sm:flex-row sm:overflow-hidden"
          style={panelPos ? { top: panelPos.top, left: panelPos.left } : undefined}
        >
          {/* 年份：窄屏顶部横向滚动条，桌面左侧纵列 */}
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b bg-slate-50 px-2 py-1.5 text-center text-xs sm:block sm:max-h-[320px] sm:w-[72px] sm:overflow-x-hidden sm:overflow-y-auto sm:border-r sm:border-b-0 sm:px-0 sm:py-2 sm:text-sm">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setViewMonth(setYear(viewMonth, y))}
                className={`shrink-0 rounded px-2 py-1 transition-colors sm:block sm:w-full sm:rounded-none sm:px-0 sm:py-1.5 ${
                  y === viewYear
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          {/* 月份 12 宫格 + 日历 */}
          <div className="p-2.5 sm:p-3">
            <div className="mb-2 grid w-full min-w-[252px] grid-cols-6 gap-1 sm:w-[280px]">
              {MONTHS.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMonth(setMonth(viewMonth, i))}
                  className={`rounded py-1 text-center text-xs transition-colors ${
                    i === viewMonthIdx
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <DayPicker
              mode="single"
              locale={zhCN}
              month={viewMonth}
              onMonthChange={setViewMonth}
              selected={selected}
              onSelect={(day) => {
                onChange(day ? format(day, "yyyy-MM-dd") : "");
                if (day) setOpen(false);
              }}
              className="rdp-custom"
            />
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
