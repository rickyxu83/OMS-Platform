import { CircleHelp } from "lucide-react";

export function HelpTooltip({ label }: { label: string }) {
  return (
    <span className="group relative inline-flex" tabIndex={0} aria-label={label}>
      <CircleHelp className="h-3 w-3 cursor-help text-muted-foreground/70 transition-colors group-hover:text-primary group-focus:text-primary" />
      <span className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-72 rounded-md border bg-popover p-3 text-xs font-normal leading-5 text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100 sm:left-1/2 sm:-translate-x-1/2">
        {label}
      </span>
    </span>
  );
}
