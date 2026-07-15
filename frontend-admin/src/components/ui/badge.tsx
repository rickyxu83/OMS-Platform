import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-slate-500 bg-slate-600 text-white shadow-sm [a&]:hover:bg-slate-500",
        draft:
          "border-slate-700 bg-slate-800 text-slate-100 shadow-sm [a&]:hover:bg-slate-700",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border-slate-600 bg-slate-700 text-white shadow-sm [a&]:hover:bg-slate-600",
        success:
          "border-transparent bg-emerald-600 text-white shadow hover:bg-emerald-500",
        warning:
          "border-transparent bg-amber-600 text-white shadow hover:bg-amber-500",
        info:
          "border-transparent bg-sky-600 text-white shadow hover:bg-sky-500",
        purple:
          "border-transparent bg-purple-600 text-white shadow hover:bg-purple-500",
        rose:
          "border-transparent bg-rose-600 text-white shadow hover:bg-rose-500",
        cyan:
          "border-transparent bg-cyan-600 text-white shadow hover:bg-cyan-500",
        teal:
          "border-transparent bg-teal-600 text-white shadow hover:bg-teal-500",
        orange:
          "border-transparent bg-orange-600 text-white shadow hover:bg-orange-500",
        lime:
          "border-transparent bg-lime-600 text-white shadow hover:bg-lime-500",
        fuchsia:
          "border-transparent bg-fuchsia-600 text-white shadow hover:bg-fuchsia-500",
        indigo:
          "border-transparent bg-indigo-600 text-white shadow hover:bg-indigo-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Badge = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<"span"> &
    VariantProps<typeof badgeVariants> & { asChild?: boolean }
>(({ className, variant, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge, badgeVariants };
