import { useEffect, useRef, useState } from "react";
import { format, parse, setMonth, setYear } from "date-fns";
import { CalendarDays } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { zhCN } from "date-fns/locale";
import "react-day-picker/dist/style.css";

interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

const YEARS = Array.from({ length: 16 }, (_, i) => 2020 + i);
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

/** 日期范围选择器 · D 款：侧栏年份纵列 + 月份 12 宫格 + 日历（公司主题紫）。
 *  年/月一键跳转（不逐月翻页），日历区用 react-day-picker 受控 month。 */
export function DateRangePicker({ start, end, onChange, placeholder = "选择日期范围", ariaLabel }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);
  const startDate = start ? parse(start, "yyyy-MM-dd", new Date()) : undefined;
  const endDate = end ? parse(end, "yyyy-MM-dd", new Date()) : undefined;
  const [viewMonth, setViewMonth] = useState<Date>(startDate || new Date());

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open && startDate) setViewMonth(startDate);
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const panelWidth = 380; // 侧栏 72 + 日历 ~300
      setAlignRight(rect.left + panelWidth > window.innerWidth - 16);
    }
  }, [open]);

  const label = start && end ? `${start} ~ ${end}` : start ? `${start} ~` : placeholder;
  const viewYear = viewMonth.getFullYear();
  const viewMonthIdx = viewMonth.getMonth();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel || placeholder}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 text-left text-sm shadow-sm transition-colors hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-[#582b8b]/20"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={start ? "truncate text-slate-900" : "truncate text-slate-400"}>{label}</span>
      </button>
      {open ? (
        <div className={`absolute top-full z-50 mt-1 flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 ${alignRight ? "right-0" : "left-0"}`}>
          {/* 侧栏：年份纵列 */}
          <div className="max-h-[320px] w-[72px] overflow-y-auto border-r bg-slate-50 py-2 text-center text-sm dark:bg-slate-800/50">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setViewMonth(setYear(viewMonth, y))}
                className={`block w-full py-1.5 transition-colors ${y === viewYear ? "bg-[#582b8b] font-semibold text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"}`}
              >
                {y}
              </button>
            ))}
          </div>
          {/* 右侧：月份 12 宫格 + 日历 */}
          <div className="p-3">
            <div className="mb-2 grid w-[280px] grid-cols-6 gap-1">
              {MONTHS.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMonth(setMonth(viewMonth, i))}
                  className={`rounded py-1 text-center text-xs transition-colors ${i === viewMonthIdx ? "bg-[#582b8b] font-semibold text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <DayPicker
              mode="range"
              locale={zhCN}
              month={viewMonth}
              onMonthChange={setViewMonth}
              selected={{ from: startDate, to: endDate }}
              onSelect={(range) => {
                const s = range?.from ? format(range.from, "yyyy-MM-dd") : "";
                const e = range?.to ? format(range.to, "yyyy-MM-dd") : "";
                onChange(s, e);
                if (range?.from && range?.to) setOpen(false);
              }}
              className="rdp-custom"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
