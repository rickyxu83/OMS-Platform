import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api, saveSession, clearSession, getCurrentUser } from '@/services/api'
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
      } catch {
        clearSession()
        setUser(null)
        setIsAuthenticated(false)
      } finally {
        setLoading(false)
      }
    }
    verify()
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

  const hasPermission = useCallback((...permissions: string[]) => userHasPermission(user, ...permissions), [user])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
