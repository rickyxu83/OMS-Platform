/**
 * Devices 页客户内联建议组件（自 4800 行单文件拆出）。
 */
import { useMemo, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Customer } from "./types";
import { customerInitial, customerMatches, customerMeta, customerLabel, groupCustomersByInitial } from "./utils";
import { CUSTOMER_INDEX_LETTERS } from "./constants";

export function DeviceCustomerSuggestions({
  open,
  searching,
  recentCustomers,
  groups,
  selectedCustomerId,
  onSelect,
}: {
  open: boolean;
  searching: boolean;
  recentCustomers: Customer[];
  groups: Array<{ letter: string; items: Customer[] }>;
  selectedCustomerId: string;
  onSelect: (customer: Customer) => void;
}) {
  const availableLetters = new Set(groups.map((group) => group.letter));
  const hasResults = recentCustomers.length || groups.some((group) => group.items.length);
  if (!open) return null;

  function scrollToLetter(letter: string) {
    document.getElementById(`device-customer-letter-${letter}`)?.scrollIntoView({ block: "start" });
  }

  function renderCustomer(customer: Customer, badge?: string) {
    const selected = selectedCustomerId && String(customer.id) === selectedCustomerId;
    return (
      <button
        key={`${badge || "customer"}-${customer.id}`}
        type="button"
        className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
          selected ? "border-primary/60 bg-primary/5" : "border-border bg-background hover:border-primary/40 hover:bg-accent/40"
        }`}
        onMouseDown={(event) => {
          event.preventDefault();
          onSelect(customer);
        }}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{customerLabel(customer)}</span>
          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{customerMeta(customer)}</span>
        </span>
        {badge ? <Badge className="shrink-0" variant="secondary">{badge}</Badge> : selected ? <Badge className="shrink-0" variant="outline">已选择</Badge> : null}
      </button>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-50 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
      <div className="relative">
        <div className="max-h-80 overflow-y-auto p-2 pr-8">
          {searching ? (
            <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              <span className="btn-loader" aria-hidden="true" />
              正在检索客户…
            </div>
          ) : null}
          {recentCustomers.length ? (
            <div className="mb-3 space-y-2">
              <div className="px-1 text-xs font-semibold text-muted-foreground">近期使用</div>
              {recentCustomers.map((customer) => renderCustomer(customer, "近期"))}
            </div>
          ) : null}
          {groups.map((group) => (
            <div key={group.letter} id={`device-customer-letter-${group.letter}`} className="scroll-mt-2 space-y-2 pb-3">
              <div className="sticky top-0 z-10 bg-popover/95 px-1 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
                {group.letter}
              </div>
              {group.items.map((customer) => renderCustomer(customer))}
            </div>
          ))}
          {!hasResults ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              未找到匹配客户，请调整关键词
            </div>
          ) : null}
        </div>
        {groups.length ? (
          <div className="absolute bottom-2 right-1 top-2 flex flex-col items-center gap-px rounded-md bg-popover/70 px-0.5 py-1 backdrop-blur-sm">
            {CUSTOMER_INDEX_LETTERS.map((letter) => (
              <button
                key={letter}
                type="button"
                disabled={!availableLetters.has(letter)}
                aria-label={`跳转到 ${letter} 分组`}
                className="flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-medium leading-none text-muted-foreground/80 transition-colors disabled:pointer-events-none disabled:text-muted-foreground/25 enabled:hover:bg-primary/10 enabled:hover:text-primary"
                onMouseDown={(event) => {
                  event.preventDefault();
                  scrollToLetter(letter);
                }}
              >
                {letter}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}










