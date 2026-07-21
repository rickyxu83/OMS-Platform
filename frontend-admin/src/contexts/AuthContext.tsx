import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api, saveSession, saveUser, clearSession, getCurrentUser } from '@/services/api'
import type { WorkspaceOption } from '@/config/app'

const ADMIN_ACCESS_ROLES = [
  'admin', 'assistant', 'dispatcher', 'operations_director',
  'engineering_supervisor', 'administrative_supervisor', 'sales_supervisor', 'sales',
  'engineer',
]
const ADMIN_SUPERUSER_EXCLUDED_PERMISSIONS = new Set(['order.engineer.own', 'workspace.engineer'])

interface User {
  id?: string
  name: string
  role: string
  permissions?: string[]
  availableWorkspaces?: WorkspaceOption[]
  defaultWorkspace?: string
  [key: string]: any
}

interface LoginResult {
  user: User
  availableWorkspaces: WorkspaceOption[]
  defaultWorkspace: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (username: string, password: string, remember?: boolean) => Promise<LoginResult>
  logout: () => void
  refreshUser: () => Promise<User | null>
  isAuthenticated: boolean
  hasPermission: (...permissions: string[]) => boolean
}

const AuthContext = createContext<AuthContextType>(null!)

function availableWorkspaces(user?: User | null): WorkspaceOption[] {
  return Array.isArray(user?.availableWorkspaces) ? user.availableWorkspaces : []
}

function hasAdminWorkspace(user?: User | null) {
  const workspaces = availableWorkspaces(user)
  if (workspaces.length > 0) return workspaces.some((workspace) => workspace.key === 'admin')
  return Boolean(user?.role && ADMIN_ACCESS_ROLES.includes(user.role))
}

export function userHasPermission(user: User | null | undefined, ...permissions: string[]) {
  if (!permissions.length) return true
  if (user?.role === 'admin') return permissions.some((permission) => !ADMIN_SUPERUSER_EXCLUDED_PERMISSIONS.has(permission))
  const granted = new Set(Array.isArray(user?.permissions) ? user.permissions : [])
  return permissions.some((permission) => granted.has(permission))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getCurrentUser() as User | null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const verify = async () => {
      try {
        const data = await api.get('/auth/me')
        setUser(data.user)
        setIsAuthenticated(hasAdminWorkspace(data.user))
      } catch (error) {
        const status = (error as Error & { status?: number })?.status
        if (status === 401 || status === 403) {
          // 仅在确认未认证时清会话;网络抖动/后端 5xx 不应清掉"记住我"的本地会话
          clearSession()
          setUser(null)
          setIsAuthenticated(false)
        } else {
          const cached = getCurrentUser() as User | null
          setUser(cached)
          setIsAuthenticated(hasAdminWorkspace(cached))
        }
      } finally {
        setLoading(false)
      }
    }
    verify()
  }, [])

  useEffect(() => {
    // api 层收到 401 已清存储,这里同步清 React 状态,避免页面停留在"假登录"
    const onUnauthorized = () => {
      setUser(null)
      setIsAuthenticated(false)
    }
    window.addEventListener('oms:unauthorized', onUnauthorized)
    return () => window.removeEventListener('oms:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (username: string, password: string, remember = true) => {
    const data = await api.post('/auth/login', { username, password })
    saveSession(data.user, remember)
    setUser(data.user)
    setIsAuthenticated(hasAdminWorkspace(data.user))
    return {
      user: data.user,
      availableWorkspaces: data.availableWorkspaces || data.user?.availableWorkspaces || [],
      defaultWorkspace: data.defaultWorkspace || data.user?.defaultWorkspace || '',
    }
  }, [])

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => {})
    clearSession()
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  const refreshUser = useCallback(async () => {
    // /users/me 不含 permissions/availableWorkspaces;/auth/me 的 publicUser 才返回完整会话字段
    const data = await api.get('/auth/me')
    // 以服务端返回值优先(?? 保留服务端的空数组等合法值),本地旧值仅作缺省回退,
    // 否则权限调整后 refreshUser 永远刷不新
    const nextUser = {
      ...user,
      ...data.user,
      permissions: data.user?.permissions ?? user?.permissions ?? [],
      permissionDetails: data.user?.permissionDetails ?? user?.permissionDetails ?? [],
      availableWorkspaces: data.user?.availableWorkspaces ?? user?.availableWorkspaces ?? [],
      defaultWorkspace: data.user?.defaultWorkspace ?? user?.defaultWorkspace ?? '',
    }
    saveUser(nextUser)
    setUser(nextUser)
    setIsAuthenticated(hasAdminWorkspace(nextUser))
    return nextUser
  }, [user])

  const hasPermission = useCallback((...permissions: string[]) => userHasPermission(user, ...permissions), [user])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, isAuthenticated, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
