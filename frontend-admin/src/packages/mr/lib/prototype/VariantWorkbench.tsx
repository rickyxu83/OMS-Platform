import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileSpreadsheet, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApprovalPanel } from '../ApprovalPanel'
import { MrItemTable } from '../MrItemTable'
import { Field, SectionCard, StatusBadge, money, percent } from '../mr-ui'
import { DetailSections } from './DetailSections'
import { PrototypeImportDialog } from './PrototypeImportDialog'
import type { MrPrototype } from './useMrPrototype'

/** Variant A — refined section workbench: essential cards up top, optional groups collapsed. */
export function VariantWorkbench({ vm }: { vm: MrPrototype }) {
  const navigate = useNavigate()
  const [importOpen, setImportOpen] = useState(false)
  const order = vm.calculated!
  const ready = Boolean(order.pricingMode && order.invoiceType)
  const totals = order.totals || {}

  const stats = [
    ['未税总计', `¥ ${money(totals.salesExcludingTax)}`],
    ['增值税', `¥ ${money(totals.vat)}`],
    ['含税合计', `¥ ${money(totals.salesIncludingTax)}`],
    ['COST 总计', `¥ ${money(totals.costExcludingTax)}`],
    ['毛利率', percent(totals.marginRate), Number(totals.marginRate) < 15],
  ] as Array<[string, string, boolean?]>

  return (
    <div className="min-h-full bg-muted/30">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" title="返回列表" onClick={() => navigate('/mr')}><ArrowLeft className="size-4" /></Button>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">MR 交易</div>
              <div className="truncate text-xs text-muted-foreground">{order.customerName || `草稿 #${order.id}`} · {order.ctrlNo || '未填 Ctrl.NO'}</div>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}><FileSpreadsheet className="mr-2 size-4" />报价导入</Button>
            <Button onClick={() => toast.info('原型中不实际提交，仅展示布局')}><Send className="mr-2 size-4" />提交签核</Button>
          </div>
        </div>
      </div>

      <div className="border-b bg-card"><div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-px bg-border px-0 lg:grid-cols-5">
        {stats.map(([label, value, warn]) => (
          <div key={label} className="min-w-0 bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${warn ? 'text-red-600' : ''}`}>{value}</div>
          </div>
        ))}
      </div></div>

      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-5 sm:px-6 min-[1450px]:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* 交易设置 */}
          <SectionCard id="trade" title="交易设置" description="先确定计价模式与发票别，再导入或添加品项。">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="计价模式">
                <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border bg-background p-1">
                  {vm.constants!.pricingModes.map((mode) => (
                    <Button key={mode.value} type="button" size="sm" variant={Number(order.pricingMode) === mode.value ? 'default' : 'ghost'} onClick={() => vm.changePricingMode(mode.value)}>{mode.label}</Button>
                  ))}
                </div>
              </Field>
              <Field label="未税总计">
                <Input type="number" min={0} step="0.01" value={order.totalExcludingTax ?? ''} disabled={Number(order.pricingMode) === 3} onChange={(e) => vm.patch({ totalExcludingTax: e.target.value === '' ? null : Number(e.target.value) })} />
              </Field>
              <Field label="发票别">
                <Select value={order.invoiceType || ''} onValueChange={(v) => vm.changeInvoiceType(v)}>
                  <SelectTrigger><SelectValue placeholder="选择发票别" /></SelectTrigger>
                  <SelectContent>{vm.constants!.INVOICE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="案分类">
                <Select value={order.caseCategory || ''} onValueChange={(v) => vm.patch({ caseCategory: v })}>
                  <SelectTrigger><SelectValue placeholder="选择案分类" /></SelectTrigger>
                  <SelectContent>{vm.constants!.CASE_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          </SectionCard>

          {/* 品项 */}
          <SectionCard id="items" title="品项明细" description={`共 ${order.items?.length || 0} 项`}
            actions={<Button variant="outline" size="sm" disabled={!ready} onClick={() => setImportOpen(true)}><FileSpreadsheet className="mr-2 size-4" />报价导入</Button>}>
            <MrItemTable order={order} editable={ready} vendors={vm.vendors} workOptions={vm.constants!.WORK_OPTIONS} onChange={(items) => vm.setItems(items)} />
            <div className="mt-4 grid gap-x-4 gap-y-1 rounded-lg border bg-muted/20 p-4 sm:grid-cols-5">
              {stats.map(([label, value, warn]) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className={`text-sm font-semibold tabular-nums ${warn ? 'text-red-600' : ''}`}>{value}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* 客户与单号 */}
          <SectionCard id="identity" title="客户与单号">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="客户名称" className="md:col-span-2">
                <Select value={order.customerId ? String(order.customerId) : ''} onValueChange={(v) => void vm.chooseCustomer(v)}>
                  <SelectTrigger><SelectValue placeholder="从客户档案选择" /></SelectTrigger>
                  <SelectContent>{vm.customers.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.code ? `${item.code} · ` : ''}{item.name || item.id}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Ctrl.NO">
                <Input value={order.ctrlNo || ''} onChange={(e) => vm.patch({ ctrlNo: e.target.value })} />
              </Field>
              <Field label="客户 P/O" className="md:col-span-2">
                <Input value={order.customerPo || ''} onChange={(e) => vm.patch({ customerPo: e.target.value })} />
              </Field>
            </div>
          </SectionCard>

          {/* 其余信息折叠 */}
          <SectionCard id="other" title="其他信息" description="开票付款 / 联系人 / 交付服务 / 备注（按需展开）">
            <DetailSections vm={vm} />
          </SectionCard>
        </div>

        {/* 右栏：签核与汇总 */}
        <aside className="hidden min-[1450px]:block">
          <div className="sticky top-24 space-y-3">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">电子签流转</h2><StatusBadge status={order.status} /></div>
              <ApprovalPanel order={order} />
            </div>
          </div>
        </aside>
      </div>

      <PrototypeImportDialog orderId={order.id!} open={importOpen} onOpenChange={setImportOpen} onApply={vm.applyImport} />
    </div>
  )
}