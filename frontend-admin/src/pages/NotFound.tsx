import { Link } from "react-router-dom"
import { Compass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/contexts/LanguageContext"

const STRINGS = {
  zh: {
    title: "页面不存在",
    description: "您访问的页面不存在或已被移除，请检查链接是否正确。",
    backHome: "返回首页",
  },
  "zh-TW": {
    title: "頁面不存在",
    description: "您造訪的頁面不存在或已被移除，請檢查連結是否正確。",
    backHome: "返回首頁",
  },
} as const

export function NotFound({ homePath = "/" }: { homePath?: string }) {
  const { lang } = useLanguage()
  const t = STRINGS[lang === "zh-TW" ? "zh-TW" : "zh"]

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4 py-16 text-center">
      <div className="grid justify-items-center gap-3">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
          <Compass className="h-8 w-8 text-primary" aria-hidden="true" />
        </span>
        <div className="font-mono text-6xl font-bold tracking-tight text-primary/25">404</div>
      </div>
      <div className="grid gap-1.5">
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t.description}</p>
      </div>
      <Button asChild>
        <Link to={homePath}>{t.backHome}</Link>
      </Button>
    </div>
  )
}
