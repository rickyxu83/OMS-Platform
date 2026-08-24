import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useCountUp } from './count-up'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HelpTooltip } from '@/components/HelpTooltip'
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
  if (value === null || value === undefined) return '-'
  return Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Rendered as "-" when empty, so read-only cards never show a blank line. */
export function textValue(value?: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

export function percent(value?: number | null) {
  return value === null || value === undefined ? '-' : `${Number(value).toFixed(2)}%`
}

export function AnimatedMoney({ value, animationKey = 0 }: { value?: number | null; animationKey?: number }) {
  const display = useCountUp(value, animationKey)
  return <>{value === null || value === undefined ? '-' : `¥ ${money(display)}`}</>
}

export function AnimatedPercent({ value, animationKey = 0 }: { value?: number | null; animationKey?: number }) {
  const display = useCountUp(value, animationKey)
  return <>{value === null || value === undefined ? '-' : percent(display)}</>
}

export function AnimatedInteger({ value, animationKey = 0 }: { value?: number | null; animationKey?: number }) {
  const display = useCountUp(value, animationKey)
  return <>{value === null || value === undefined ? '-' : Math.round(display).toLocaleString('zh-CN')}</>
}

export function choiceValue(value?: number | boolean | null, yes = '是', no = '否') {
  if (value === true || value === 1) return yes
  if (value === false || value === 0) return no
  return '-'
}

const REQUIRED_FIELD_LABELS = new Set([
  '计价模式',
  '发票类型',
  '项目分类',
  '客户名称',
  '开票方式',
  '开票内容',
  '开票/收款时间',
  '付款条件',
  '最晚交付日期',
  '验收条件',
  '装机承担方',
  '维护承担方',
  '品名及描述',
  '数量',
  '未税单价',
  '供应商',
  '采购成本（含税）',
  '采购税率',
])
export function SectionCard({
  id,
  title,
  icon: Icon,
  description,
  actions,
  flash = false,
  className = '',
  children,
}: {
  id: string
  title: string
  icon?: React.ComponentType<{ className?: string }>
  description?: ReactNode
  actions?: ReactNode
  flash?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section
      id={`mr-section-${id}`}
      aria-labelledby={`mr-section-${id}-title`}
      className={`scroll-mt-32 rounded-xl border bg-card shadow-sm transition-shadow ${flash ? 'ring-2 ring-destructive' : ''} ${className}`}
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
 * MR 专用 Field：双模设计（editable 填写态 / readonlyText 只读展示态），必填星号由 REQUIRED_FIELD_LABELS 推断。
 * 与 service-report/components 的 Field 是有意分化（那个仅填写态、预览走 ReportPreviewField），勿合并。
 */
export function Field({
  label,
  children,
  readonlyText,
  editable = true,
  required,
  help,
  className = '',
}: {
  label: string
  children?: ReactNode
  readonlyText?: ReactNode
  editable?: boolean
  required?: boolean
  help?: string
  className?: string
}) {
  const showRequired = required ?? REQUIRED_FIELD_LABELS.has(label)
  const labelContent = (
    <>
      {label}
      {showRequired ? <span className="ml-0.5 text-red-600" aria-hidden="true">*</span> : null}
      {help ? <HelpTooltip label={help} /> : null}
    </>
  )
  if (!editable) {
    return (
      <div className={`min-w-0 space-y-1 ${className}`}>
        <div className="text-xs text-muted-foreground">{help ? <span className="inline-flex items-center gap-1">{labelContent}</span> : labelContent}</div>
        <div className="min-h-6 text-sm break-words whitespace-pre-wrap">{readonlyText ?? children}</div>
      </div>
    )
  }
  return (
    <div role="group" aria-label={label} className={`min-w-0 space-y-1.5 ${className}`}>
      {help ? <Label className="flex items-center gap-1">{labelContent}</Label> : <Label>{labelContent}</Label>}
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
  required,
  choices,
  onChange,
  className = '',
}: {
  label: string
  value: string[]
  editable?: boolean
  required?: boolean
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
    <Field label={label} required={required} editable={editable} readonlyText={value.join('、') || '-'} className={className}>
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

export function SmartCombobox({
  value,
  placeholder,
  options,
  onChange,
  onSelect,
  readOnly = false,
  className = '',
}: {
  value: string
  placeholder?: string
  options: Array<{ value: string; label: string; hint?: string }>
  onChange: (value: string) => void
  onSelect?: (option: { value: string; label: string; hint?: string }) => void
  readOnly?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [text, setText] = useState(value)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  // 下拉用 portal + fixed 定位（脱离 overflow 容器，避免被联系人分区等处裁剪）
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)

  // 外部值变化（如选择客户后自动回填联系人）时同步文本框
  useEffect(() => { setText(value) }, [value])
  useEffect(() => { setOpen(false) }, [value])

  // 点击外部关闭（portal 下拉渲染在 body，需一并排除，否则点选项会被误判为点外部）
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const filtered = useMemo(() => {
    // 文本等于当前已选值（快照带出/刚选中、未输入新内容）时展示全部候选，便于直接改选；仅真正输入新内容才过滤
    if (text === value) return options
    const keyword = text.trim().toLowerCase()
    if (!keyword) return options
    return options.filter((option) => [option.label, option.hint || ''].some((item) => item.toLowerCase().includes(keyword)))
  }, [options, text, value])

  useEffect(() => {
    if (open && filtered.length) setActiveIndex(0)
  }, [open, filtered.length])

  const showDropdown = open && filtered.length > 0
  // 下拉打开时按输入框位置 fixed 定位，并随滚动/缩放跟随
  useEffect(() => {
    if (!showDropdown) return
    const updateRect = () => {
      const el = inputRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [showDropdown])

  if (readOnly) {
    return <Input readOnly value={value} placeholder={placeholder} className={className} />
  }

  const showList = showDropdown
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter') {
      if (showList) { event.preventDefault(); const option = filtered[activeIndex]; if (option) { onChange(option.label); setText(option.label); onSelect?.(option); setOpen(false) } }
    } else if (event.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={text}
          placeholder={placeholder}
          className="pr-8"
          onChange={(event) => { setText(event.target.value); onChange(event.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onMouseDown={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
      </div>
      {showList && dropdownRect ? createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}
          className="z-[100] max-h-64 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          {filtered.map((option, index) => (
            <button
              type="button"
              key={option.value}
              className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm ${index === activeIndex ? 'bg-accent text-accent-foreground' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onPointerDown={(event) => { event.preventDefault(); onChange(option.label); setText(option.label); onSelect?.(option); setOpen(false) }}
            >
              <span className="truncate font-medium">{option.label}</span>
              {option.hint ? <span className="truncate text-xs text-muted-foreground">{option.hint}</span> : null}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  )
}
