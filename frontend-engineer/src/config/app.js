export const APP_NAME = '敦阳科技服务表电子化系统'
export const ENGINEER_WORKSPACE_LABEL = '工程师工作台'

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function inferUnifiedLoginUrl() {
  const url = new URL(window.location.href)
  if (url.hostname.startsWith('eng-aliyun.')) {
    url.hostname = url.hostname.replace(/^eng-aliyun\./, 'admin-aliyun.')
    url.pathname = '/login'
    url.search = ''
    url.hash = ''
    return url.toString()
  }
  if (url.hostname.startsWith('eng.')) {
    url.hostname = url.hostname.replace(/^eng\./, 'admin.')
    url.pathname = '/login'
    url.search = ''
    url.hash = ''
    return url.toString()
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
