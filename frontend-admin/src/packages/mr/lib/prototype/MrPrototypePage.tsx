import { Loader2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMrPrototype } from './useMrPrototype'
import { PrototypeSwitcher, VARIANT_NAMES } from './PrototypeSwitcher'
import { VariantWorkbench } from './VariantWorkbench'
import { VariantGrid } from './VariantGrid'
import { VariantFlow } from './VariantFlow'

/**
 * PROTOTYPE — throwaway MR-restyle explorer. Serves embedded demo data so it
 * renders with no login and no backend. ?variant=A|B|C switches the layout via
 * the floating bottom pill. Edits are local-only; nothing is saved.
 */
export function MrPrototypePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const variant = searchParams.get('variant') || 'A'
  const vm = useMrPrototype({ demo: true })

  const setVariant = (variant: string) => {
    navigate(`/mr/prototype?variant=${variant}`, { replace: true })
  }

  if (vm.loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }
  if (vm.error || !vm.calculated) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center"><p className="text-sm text-red-600">{vm.error || '演示数据加载失败'}</p></div>
  }

  return (
    <>
      {import.meta.env.DEV ? (
        <div className="pointer-events-none fixed right-4 top-20 z-40 rounded-md bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-white">
          原型演示数据 · 修改不保存 · {VARIANT_NAMES[variant] || variant}
        </div>
      ) : null}
      {variant === 'B' ? <VariantGrid vm={vm} />
        : variant === 'C' ? <VariantFlow vm={vm} />
        : <VariantWorkbench vm={vm} />}
      {import.meta.env.DEV ? <PrototypeSwitcher current={variant} onChange={setVariant} /> : null}
    </>
  )
}