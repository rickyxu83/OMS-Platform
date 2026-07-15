import { useEffect } from "react"
import type { AppLang } from "@/contexts/LanguageContext"

export function useAdminDomTextI18n(lang: AppLang) {
  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined

    import("@/lib/text-i18n").then(({ setupAdminDomTextI18n }) => {
      if (cancelled) return
      cleanup = setupAdminDomTextI18n(lang)
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [lang])
}
