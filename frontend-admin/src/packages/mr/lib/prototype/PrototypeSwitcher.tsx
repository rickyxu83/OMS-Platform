import { useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const VARIANT_NAMES: Record<string, string> = {
  A: '精简分区工作台',
  B: '电子表格（批处理）',
  C: '三步引导流程',
}
export const VARIANT_ORDER = ['A', 'B', 'C']

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null
  return Boolean(node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable))
}

/** PROTOTYPE — floating bottom pill to cycle UI variants (dev builds only). */
export function PrototypeSwitcher({ current, onChange }: { current: string; onChange: (variant: string) => void }) {
  const step = (dir: number) => {
    const index = VARIANT_ORDER.indexOf(current)
    const next = VARIANT_ORDER[(index + dir + VARIANT_ORDER.length) % VARIANT_ORDER.length]
    onChange(next)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      step(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, onChange])

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900/90 py-1.5 pl-1.5 pr-1.5 shadow-xl">
      <button type="button" onClick={() => step(-1)} className="flex size-8 items-center justify-center rounded-full text-white hover:bg-white/15" aria-label="上一个变体"><ChevronLeft className="size-5" /></button>
      <span className="min-w-[150px] px-2 text-center text-sm font-medium text-white">{VARIANT_NAMES[current] || current}</span>
      <button type="button" onClick={() => step(1)} className="flex size-8 items-center justify-center rounded-full text-white hover:bg-white/15" aria-label="下一个变体"><ChevronRight className="size-5" /></button>
    </div>
  )
}