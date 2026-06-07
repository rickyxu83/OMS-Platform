export const APP_NAME = 'OMS Platform 运维智管'
export const ENGINEER_WORKSPACE_LABEL = '工程师工作台'

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function inferUnifiedLoginUrl() {
  const url = new URL(window.location.href)
  const engineerHostPrefix = import.meta.env.VITE_ENGINEER_HOST_PREFIX || 'eng.'
  const adminHostPrefix = import.meta.env.VITE_ADMIN_HOST_PREFIX || 'admin.'

  const prefixPairs = [[engineerHostPrefix, adminHostPrefix]]
  if (!import.meta.env.VITE_ENGINEER_HOST_PREFIX && !import.meta.env.VITE_ADMIN_HOST_PREFIX) {
    prefixPairs.push(['eng-', 'admin-'])
  }

  for (const [fromPrefix, toPrefix] of prefixPairs) {
    if (fromPrefix && toPrefix && url.hostname.startsWith(fromPrefix)) {
      url.hostname = `${toPrefix}${url.hostname.slice(fromPrefix.length)}`
      url.pathname = '/login'
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  }
  return `${window.location.origin}/login`
}

export function unifiedLoginUrl(redirectPath = '/') {
  const configured = import.meta.env.VITE_UNIFIED_LOGIN_URL
  const base = configured ? `${trimTrailingSlash(configured)}/login` : inferUnifiedLoginUrl()
  const url = new URL(base, window.location.origin)
  url.searchParams.set('workspace', 'engineer')
  url.searchParams.set('redirect', redirectPath || '/')
  return url.toString()
}
