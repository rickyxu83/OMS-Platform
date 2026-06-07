import * as React from "react";

import { cn } from "./utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "resize-none placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-primary/20 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm transition-[background-color,border-color,color,box-shadow] outline-none hover:bg-slate-50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
