export const APP_NAME = "OMS Platform 运维智管"
export const APP_NAME_HANT = "OMS Platform 運維智管"
export const APP_VERSION = (
  (import.meta as any).env.VITE_APP_VERSION
  || (import.meta as any).env.VITE_APP_BUILD_VERSION
  || "26.0904.1726"
)
export const ADMIN_WORKSPACE_LABEL = "管理工作台"
export const ADMIN_WORKSPACE_LABEL_HANT = "管理工作臺"
export const ENGINEER_WORKSPACE_LABEL = "工单填写"
export const ENGINEER_WORKSPACE_LABEL_HANT = "工單填寫"

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

function normalizeWorkspaceHome(home = "") {
  const value = String(home || "").trim()
  if (!value) return ""
  return value.startsWith("/") ? value : `/${value}`
}

export function workspaceUrl(workspaceKey: string, home = "") {
  if (workspaceKey === "admin") return normalizeWorkspaceHome(home) || "/dashboard"
  if (workspaceKey === "engineer") return normalizeWorkspaceHome(home) || "/service-report"
  return "/dashboard"
}

export function goToWorkspace(workspaceKey: string, home = "") {
  const target = workspaceUrl(workspaceKey, home)
  if ((workspaceKey === "admin" || workspaceKey === "engineer") && target.startsWith("/")) {
    return target
  }
  window.location.assign(target)
  return ""
}

const PREFERRED_WORKSPACE_KEY_PREFIX = "oms-admin:preferred-workspace"

function preferredWorkspaceStorageKey(userId?: string | number | null) {
  return `${PREFERRED_WORKSPACE_KEY_PREFIX}:${userId || "anonymous"}`
}

export function getPreferredWorkspace(userId?: string | number | null) {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(preferredWorkspaceStorageKey(userId)) || ""
}

export function setPreferredWorkspace(userId: string | number | null | undefined, workspaceKey: string) {
  if (typeof window === "undefined") return
  const key = preferredWorkspaceStorageKey(userId)
  const value = String(workspaceKey || "").trim()
  if (!value) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, value)
}
