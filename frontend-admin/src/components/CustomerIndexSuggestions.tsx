/**
 * 客户索引下拉共享组件（右侧 A-Z 索引条 + 拼音首字母分组 + 近期/常用区）。
 *
 * 合并自原先近乎相同的两个实现：service-report/CustomerInlineSuggestions 与
 * devices/DeviceCustomerSuggestions。供 工单填写 / 设备资产 / MR 等页面的客户选择复用。
 * 通过 idPrefix 区分各页面的分组锚点 DOM id，emptyText 适配各场景空态文案。
 */
import { Badge } from "@/components/ui/badge";
import type { IndexedCustomer } from "@/lib/customer-index";
import { CUSTOMER_INDEX_LETTERS, customerMeta, customerName } from "@/lib/customer-index";

export function CustomerIndexSuggestions<T extends IndexedCustomer>({
  open,
  searching,
  recentCustomers,
  groups,
  selectedCustomerId,
  onSelect,
  idPrefix = "customer-index-letter",
  emptyText = "未找到匹配客户",
}: {
  open: boolean;
  searching: boolean;
  recentCustomers: T[];
  groups: Array<{ letter: string; items: T[] }>;
  selectedCustomerId: string;
  onSelect: (customer: T) => void;
  idPrefix?: string;
  emptyText?: string;
}) {
  const availableLetters = new Set(groups.map((group) => group.letter));
  const hasResults = recentCustomers.length || groups.some((group) => group.items.length);
  if (!open) return null;

  function scrollToLetter(letter: string) {
    document.getElementById(`${idPrefix}-${letter}`)?.scrollIntoView({ block: "start" });
  }

  function renderCustomer(customer: T, badge?: string) {
    const selected = Boolean(selectedCustomerId) && String(customer.id) === selectedCustomerId;
    return (
      <button
        key={`${badge || "customer"}-${customer.id || customer.name}`}
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
          <span title={customerName(customer)} className="block truncate text-base font-semibold text-foreground sm:text-sm">{customerName(customer)}</span>
          <span title={customerMeta(customer)} className="mt-0.5 hidden line-clamp-2 text-xs text-muted-foreground sm:block">{customerMeta(customer)}</span>
        </span>
        {badge ? <Badge className="hidden sm:inline-flex" variant="secondary">{badge}</Badge> : selected ? <Badge className="hidden sm:inline-flex" variant="outline">已选择</Badge> : null}
      </button>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-50 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
      <div className="relative">
        <div className="max-h-[68dvh] overflow-y-auto p-2 pr-7 sm:max-h-96 sm:pr-8">
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
            <div key={group.letter} id={`${idPrefix}-${group.letter}`} className="scroll-mt-2 space-y-2 pb-3">
              <div className="sticky top-0 z-10 bg-popover/95 px-1 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
                {group.letter}
              </div>
              {group.items.map((customer) => renderCustomer(customer))}
            </div>
          ))}

          {!hasResults ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {emptyText}
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
                className="flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-medium leading-none text-muted-foreground/80 transition-colors disabled:pointer-events-none disabled:text-muted-foreground/25 enabled:hover:bg-primary/10 enabled:hover:text-primary enabled:focus-visible:bg-primary/10 enabled:focus-visible:text-primary enabled:focus-visible:outline-none enabled:focus-visible:ring-1 enabled:focus-visible:ring-primary/30"
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
