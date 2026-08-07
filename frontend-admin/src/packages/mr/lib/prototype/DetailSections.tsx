import { type ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { BinaryChoice, Field, SubPanel, WorkOptions } from '../mr-ui'
import type { MrPrototype } from './useMrPrototype'

/**
 * PROTOTYPE — the rarely-opened form groups (开票付款 / 联系人 / 交付服务 / 备注),
 * shared by all variants behind a simple <details> accordion so the main view
 * stays clean while every text field stays reachable.
 */
export function DetailSections({ vm }: { vm: MrPrototype }) {
  const { form: order, constants } = vm
  if (!order || !constants) return null
  const patch = vm.patch

  const group = (title: string, hint: string, children: ReactNode) => (
    <details className="group rounded-xl border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
        <span className="flex-1">{title}</span>
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </summary>
      <div className="space-y-4 border-t px-4 py-4">{children}</div>
    </details>
  )

  return (
    <div className="space-y-3">
      {group('开票与付款', '结账信息', (
        <div className="grid gap-4 lg:grid-cols-2">
          <SubPanel title="开票">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="发票处理">
                <Select value={order.invoiceProcess || ''} onValueChange={(v) => patch({ invoiceProcess: v })}>
                  <SelectTrigger><SelectValue placeholder="选择处理方式" /></SelectTrigger>
                  <SelectContent>{constants.INVOICE_PROCESSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="开票 / 收款">
                <Input value={order.billingTiming || ''} onChange={(e) => patch({ billingTiming: e.target.value })} />
              </Field>
              <Field label="开票内容" className="sm:col-span-2">
                <Input value={order.billingContent || ''} onChange={(e) => patch({ billingContent: e.target.value })} />
              </Field>
            </div>
          </SubPanel>
          <SubPanel title="付款">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="付款条件">
                <Select value={order.paymentTerms || ''} onValueChange={(v) => patch({ paymentTerms: v })}>
                  <SelectTrigger><SelectValue placeholder="选择付款条件" /></SelectTrigger>
                  <SelectContent>{constants.PAYMENT_TERMS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {order.paymentTerms === '其他' ? (
                <Field label="付款条件说明">
                  <Input value={order.paymentOther || ''} onChange={(e) => patch({ paymentOther: e.target.value })} />
                </Field>
              ) : null}
            </div>
          </SubPanel>
        </div>
      ))}

      {group('联系人', '默认跟随客户联系人', (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)]">
          <Field label="客户联系人">
            <Select
              value={order.customerContactId ? String(order.customerContactId) : 'none'}
              disabled={!order.customerId}
              onValueChange={(v) => { if (v !== 'none') vm.chooseContact(v) }}
            >
              <SelectTrigger><SelectValue placeholder="选择客户联系人" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未关联档案（手工填写）</SelectItem>
                {vm.contacts.filter((item) => item.id && item.name).map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>{item.name}{item.phone ? ` · ${item.phone}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-end text-sm text-muted-foreground">采购、发票收件和收件默认沿用客户联系人；按姓名输入会自动带入电话。</div>
        </div>
      ))}

      {group('交付与服务', '交货、验收、装机', (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="最晚交货日">
            <Input type="date" value={order.latestDeliveryDate || ''} onChange={(e) => patch({ latestDeliveryDate: e.target.value })} />
          </Field>
          <Field label="分批送机">
            <BinaryChoice value={order.splitDelivery} yes="可" no="否" onChange={(v) => patch({ splitDelivery: v })} />
          </Field>
          <Field label="验收">
            <Select value={order.acceptance || ''} onValueChange={(v) => patch({ acceptance: v })}>
              <SelectTrigger><SelectValue placeholder="选择验收条件" /></SelectTrigger>
              <SelectContent>{constants.ACCEPTANCE_TYPES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {order.acceptance === '其他' ? (
            <Field label="验收说明">
              <Input value={order.acceptanceOther || ''} onChange={(e) => patch({ acceptanceOther: e.target.value })} />
            </Field>
          ) : null}
          <Field label="送机地点" className="md:col-span-2">
            <Textarea rows={2} value={order.deliveryLocation || ''} onChange={(e) => patch({ deliveryLocation: e.target.value })} />
          </Field>
          <WorkOptions label="装机对象" value={order.installOptions || []} choices={constants.WORK_OPTIONS} onChange={(v) => vm.setInstallOptions(v)} />
          <WorkOptions label="维护对象" value={order.maintenanceOptions || []} choices={constants.WORK_OPTIONS} onChange={(v) => patch({ maintenanceOptions: v })} />
        </div>
      ))}

      {group('备注', '', (
        <Textarea rows={4} value={order.remark || ''} onChange={(e) => patch({ remark: e.target.value })} />
      ))}
    </div>
  )
}