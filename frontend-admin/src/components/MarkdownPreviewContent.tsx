import { useEffect, useState } from 'react'
import type { Components } from 'react-markdown'
import { cn } from '@/lib/utils'

/**
 * Markdown 附件在线预览内容区（不带弹窗外壳，由调用方放进 Dialog）。
 * 渲染为排版后的 HTML（GFM 表格/删除线/任务列表均支持），不展示源码。
 * react-markdown 默认不渲染原始 HTML，无 XSS 风险；库按需动态加载，不进首屏 bundle。
 */
const markdownComponents: Components = {
  h1: (props) => <h1 className="mb-3 mt-6 border-b pb-2 text-xl font-bold first:mt-0" {...props} />,
  h2: (props) => <h2 className="mb-2 mt-5 border-b pb-1.5 text-lg font-semibold first:mt-0" {...props} />,
  h3: (props) => <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0" {...props} />,
  h4: (props) => <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0" {...props} />,
  p: (props) => <p className="my-2 leading-7" {...props} />,
  a: (props) => <a className="text-sky-600 underline underline-offset-2 hover:text-sky-700" target="_blank" rel="noreferrer" {...props} />,
  ul: (props) => <ul className="my-2 list-disc space-y-1 pl-6" {...props} />,
  ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-6" {...props} />,
  li: (props) => <li className="leading-7" {...props} />,
  blockquote: (props) => <blockquote className="my-3 border-l-4 border-muted-foreground/30 pl-4 text-muted-foreground" {...props} />,
  hr: () => <hr className="my-4 border-muted-foreground/30" />,
  code: ({ className, children, ...props }) => (
    <code
      className={cn(
        'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]',
        className?.includes('language-') && 'block bg-transparent p-0',
        className,
      )}
      {...props}
    >
      {children}
    </code>
  ),
  pre: (props) => (
    <pre
      className="my-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-200 [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  table: (props) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-muted/60" {...props} />,
  th: (props) => <th className="border-b px-3 py-2 text-left font-medium" {...props} />,
  td: (props) => <td className="border-b px-3 py-2 align-top" {...props} />,
  img: (props) => <img className="my-2 max-h-[50dvh] max-w-full rounded-lg object-contain" loading="lazy" {...props} />,
}

export function MarkdownPreviewContent({ text, className }: {
  text: string
  className?: string
}) {
  const [renderer, setRenderer] = useState<{
    Markdown: (typeof import('react-markdown'))['default']
    remarkGfm: (typeof import('remark-gfm'))['default']
  } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([import('react-markdown'), import('remark-gfm')])
      .then(([md, gfm]) => {
        if (!cancelled) setRenderer({ Markdown: md.default, remarkGfm: gfm.default })
      })
      .catch(() => {
        if (!cancelled) setError('Markdown 渲染组件加载失败，请下载后查看')
      })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return <div className="flex min-h-[260px] items-center justify-center text-sm text-destructive">{error}</div>
  }
  if (!renderer) {
    return (
      <div className="flex min-h-[360px] items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="btn-loader" aria-hidden="true" />
        正在加载渲染组件…
      </div>
    )
  }

  const { Markdown, remarkGfm } = renderer
  return (
    <div className={cn('min-h-[200px] rounded-lg border bg-background p-4 text-sm text-foreground sm:p-6', className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </Markdown>
    </div>
  )
}
