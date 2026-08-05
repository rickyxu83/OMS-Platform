import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { MrStatus } from '../types'

export const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  in_review: '签核中',
  approved: '已通过',
  rejected: '已驳回',
  voided: '已作废',
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-100 text-slate-700',
  in_review: 'border-amber-200 bg-amber-100 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  rejected: 'border-red-200 bg-red-100 text-red-800',
  voided: 'border-zinc-200 bg-zinc-200 text-zinc-600',
}

export function statusLabel(status?: string | null) {
  const key = String(status || 'draft')
  return STATUS_LABELS[key] || key
}

export function StatusBadge({ status, className = '' }: { status?: MrStatus | string | null; className?: string }) {
  const key = String(status || 'draft')
  return (
    <span className={`inline-flex w-fit shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_CLASSES[key] || STATUS_CLASSES.draft} ${className}`}>
      {statusLabel(key)}
    </span>
  )
}

export function money(value?: number | null) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Rendered as "-" when empty, so read-only cards never show a blank line. */
export function textValue(value?: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

export function percent(value?: number | null) {
  return value === null || value === undefined ? '-' : `${Number(value).toFixed(2)}%`
}

export function choiceValue(value?: number | boolean | null, yes = '是', no = '否') {
  if (value === true || value === 1) return yes
  if (value === false || value === 0) return no
  return '-'
}

export function SectionCard({
  id,
  title,
  icon: Icon,
  description,
  actions,
  flash = false,
  children,
}: {
  id: string
  title: string
  icon?: React.ComponentType<{ className?: string }>
  description?: ReactNode
  actions?: ReactNode
  flash?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={`mr-section-${id}`}
      aria-labelledby={`mr-section-${id}-title`}
      className={`scroll-mt-24 rounded-xl border bg-card shadow-sm transition-shadow ${flash ? 'ring-2 ring-destructive' : ''}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id={`mr-section-${id}-title`} className="flex items-center gap-2 text-base font-semibold">
            {Icon ? <Icon className="size-4 text-primary" /> : null}
            {title}
          </h2>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </section>
  )
}

/** Sub-grouping inside a SectionCard (e.g. 计价与发票 / 合约 side by side). */
export function SubPanel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  )
}

/**
 * One labelled field. When `editable` is false the label/value pair renders as
 * plain text (`readonlyText`, falling back to `children`) instead of a disabled
 * control, so approved orders read like a document rather than a greyed-out form.
 */
export function Field({
  label,
  children,
  readonlyText,
  editable = true,
  className = '',
}: {
  label: string
  children?: ReactNode
  readonlyText?: ReactNode
  editable?: boolean
  className?: string
}) {
  if (!editable) {
    return (
      <div className={`min-w-0 space-y-1 ${className}`}>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="min-h-6 text-sm break-words whitespace-pre-wrap">{readonlyText ?? children}</div>
      </div>
    )
  }
  return (
    <div role="group" aria-label={label} className={`min-w-0 space-y-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function BinaryChoice({
  value,
  disabled,
  onChange,
  yes = '是',
  no = '否',
}: {
  value?: number | boolean | null
  disabled?: boolean
  onChange: (value: number) => void
  yes?: string
  no?: string
}) {
  const normalized = value === true || value === 1 ? 1 : value === false || value === 0 ? 0 : null
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-md border bg-background p-1">
      <Button type="button" size="sm" variant={normalized === 0 ? 'default' : 'ghost'} disabled={disabled} onClick={() => onChange(0)} className="h-7">{no}</Button>
      <Button type="button" size="sm" variant={normalized === 1 ? 'default' : 'ghost'} disabled={disabled} onClick={() => onChange(1)} className="h-7">{yes}</Button>
    </div>
  )
}

export function WorkOptions({
  label,
  value,
  editable = true,
  choices,
  onChange,
  className = '',
}: {
  label: string
  value: string[]
  editable?: boolean
  choices: string[]
  onChange: (value: string[]) => void
  className?: string
}) {
  const toggle = (choice: string, checked: boolean) => {
    if (!checked) return onChange(value.filter((item) => item !== choice))
    // "NO" means nobody takes the work, so it is exclusive with every other choice.
    if (choice === 'NO') return onChange(['NO'])
    onChange([...new Set(value.filter((item) => item !== 'NO').concat(choice))])
  }
  return (
    <Field label={label} editable={editable} readonlyText={value.join('、') || '-'} className={className}>
      <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-background px-3 py-2">
        {choices.map((choice) => (
          <label key={choice} className="flex items-center gap-2 text-sm">
            <Checkbox checked={value.includes(choice)} onCheckedChange={(checked) => toggle(choice, Boolean(checked))} />
            {choice}
          </label>
        ))}
      </div>
    </Field>
  )
}
