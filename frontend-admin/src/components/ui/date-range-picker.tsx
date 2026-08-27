import { useEffect, useRef, useState } from "react";
import { format, parse } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Calendar } from "./calendar";

interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

/** 日期范围选择器（一个控件，点开日历选开始/结束，类酒店订房）。 */
export function DateRangePicker({ start, end, onChange, placeholder = "选择日期范围", ariaLabel }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const startDate = start ? parse(start, "yyyy-MM-dd", new Date()) : undefined;
  const endDate = end ? parse(end, "yyyy-MM-dd", new Date()) : undefined;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const label = start && end ? `${start} ~ ${end}` : start ? `${start} ~` : placeholder;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel || placeholder}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 text-left text-sm shadow-sm transition-colors hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={start ? "truncate text-slate-900" : "truncate text-slate-400"}>{label}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <Calendar
            mode="range"
            selected={{ from: startDate, to: endDate }}
            onSelect={(range) => {
              const s = range?.from ? format(range.from, "yyyy-MM-dd") : "";
              const e = range?.to ? format(range.to, "yyyy-MM-dd") : "";
              onChange(s, e);
              if (range?.from && range?.to) setOpen(false);
            }}
            numberOfMonths={2}
          />
        </div>
      ) : null}
    </div>
  );
}
