import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type AppLang = 'zh-CN' | 'zh-TW'

interface LanguageContextType {
  lang: AppLang
  isTraditional: boolean
  setLang: (lang: AppLang) => void
  toggleLang: () => void
}

const STORAGE_KEY = 'service-sheet-rc-admin-lang'

const LanguageContext = createContext<LanguageContextType | null>(null)

function detectInitialLang(): AppLang {
  if (typeof window === 'undefined') return 'zh-CN'

  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'zh-CN' || saved === 'zh-TW') return saved

  const browserLang = window.navigator.language.toLowerCase()
  return browserLang.includes('tw') || browserLang.includes('hk') ? 'zh-TW' : 'zh-CN'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(detectInitialLang)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((nextLang: AppLang) => {
    setLangState(nextLang)
  }, [])

  const toggleLang = useCallback(() => {
    setLangState((current) => (current === 'zh-CN' ? 'zh-TW' : 'zh-CN'))
  }, [])

  const value = useMemo(() => ({
    lang,
    isTraditional: lang === 'zh-TW',
    setLang,
    toggleLang,
  }), [lang, setLang, toggleLang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
