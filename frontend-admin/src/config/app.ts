export const APP_NAME = "OMS Platform 运维智管"
export const APP_NAME_HANT = "OMS Platform 運維智管"
export const APP_VERSION = (
  (import.meta as any).env.VITE_APP_VERSION
  || (import.meta as any).env.VITE_APP_BUILD_VERSION
  || "26.622.1236"
)
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
  const adminHostPrefix = (import.meta as any).env.VITE_ADMIN_HOST_PREFIX || "admin."
  const engineerHostPrefix = (import.meta as any).env.VITE_ENGINEER_HOST_PREFIX || "eng."
  if (adminHostPrefix && engineerHostPrefix && url.hostname.startsWith(adminHostPrefix)) {
    url.hostname = `${engineerHostPrefix}${url.hostname.slice(adminHostPrefix.length)}`
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
