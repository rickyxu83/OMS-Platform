export const APP_NAME = "敦阳科技服务表电子化系统"
export const APP_NAME_HANT = "敦陽科技服務表電子化系統"
export const ADMIN_WORKSPACE_LABEL = "管理工作台"
export const ADMIN_WORKSPACE_LABEL_HANT = "管理工作臺"
export const ENGINEER_WORKSPACE_LABEL = "工程师工作台"
export const ENGINEER_WORKSPACE_LABEL_HANT = "工程師工作臺"

export interface WorkspaceOption {
  key: "admin" | "engineer" | string
  label: string
  home?: string
}

export function workspaceLabel(key: string, fallback = "") {
  if (key === "admin") return ADMIN_WORKSPACE_LABEL
  if (key === "engineer") return ENGINEER_WORKSPACE_LABEL
  return fallback || key
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

function inferEngineerWorkspaceUrl() {
  const url = new URL(window.location.href)
  if (url.hostname.startsWith("admin-aliyun.")) {
    url.hostname = url.hostname.replace(/^admin-aliyun\./, "eng-aliyun.")
    url.pathname = "/"
    url.search = ""
    url.hash = ""
    return url.toString()
  }
  if (url.hostname.startsWith("admin.")) {
    url.hostname = url.hostname.replace(/^admin\./, "eng.")
    url.pathname = "/"
    url.search = ""
    url.hash = ""
    return url.toString()
  }
  return `${window.location.origin}/engineer/`
}

export function workspaceUrl(workspaceKey: string) {
  if (workspaceKey === "admin") return "/dashboard"
  if (workspaceKey === "engineer") {
    const configured = (import.meta as any).env.VITE_ENGINEER_WORKSPACE_URL
    return configured ? `${trimTrailingSlash(configured)}/` : inferEngineerWorkspaceUrl()
  }
  return "/dashboard"
}

export function goToWorkspace(workspaceKey: string) {
  const target = workspaceUrl(workspaceKey)
  if (workspaceKey === "admin" && target.startsWith("/")) {
    return target
  }
  window.location.assign(target)
  return ""
}
