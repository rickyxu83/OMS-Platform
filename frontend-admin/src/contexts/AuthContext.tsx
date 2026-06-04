import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api, saveSession, clearSession, getCurrentUser, getToken, isLoggedIn } from '@/services/api'

const ADMIN_ACCESS_ROLES = [
  'admin', 'assistant', 'dispatcher', 'supervisor',
  'engineering_supervisor', 'sales_supervisor', 'sales',
]

interface User {
  id?: string
  name: string
  role: string
  [key: string]: any
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (username: string, password: string, remember?: boolean) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getCurrentUser() as User | null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(isLoggedIn())

  useEffect(() => {
    const verify = async () => {
      if (!isLoggedIn()) {
        setLoading(false)
        return
      }
      try {
        const data = await api.get('/auth/me')
        if (!ADMIN_ACCESS_ROLES.includes(data.user?.role)) {
          clearSession()
          setUser(null)
          setIsAuthenticated(false)
        } else {
          setUser(data.user)
          setIsAuthenticated(true)
        }
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
    if (!ADMIN_ACCESS_ROLES.includes(data.user?.role)) {
      throw new Error('您的账号无权访问管理端')
    }
    saveSession(data.token, data.user, remember)
    setUser(data.user)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
