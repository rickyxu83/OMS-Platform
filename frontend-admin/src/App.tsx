import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { useAuth } from "@/contexts/AuthContext"
import { Login } from "@/pages/Login"
import { useLanguage } from "@/contexts/LanguageContext"
import { useAdminDomTextI18n } from "@/lib/text-i18n"
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react"

const AdminLayout = lazy(() => import("@/components/AdminLayout").then((module) => ({ default: module.AdminLayout })))
const Dashboard = lazy(() => import("@/pages/Dashboard").then((module) => ({ default: module.Dashboard })))
const ServiceOrders = lazy(() => import("@/pages/ServiceOrders").then((module) => ({ default: module.ServiceOrders })))
const InspectionSchedules = lazy(() => import("@/pages/InspectionSchedules").then((module) => ({ default: module.InspectionSchedules })))
const Customers = lazy(() => import("@/pages/Customers").then((module) => ({ default: module.Customers })))
const Devices = lazy(() => import("@/pages/Devices").then((module) => ({ default: module.Devices })))
const MaintenanceParties = lazy(() => import("@/pages/MaintenanceParties").then((module) => ({ default: module.MaintenanceParties })))
const Timesheets = lazy(() => import("@/pages/Timesheets").then((module) => ({ default: module.Timesheets })))
const Users = lazy(() => import("@/pages/Users").then((module) => ({ default: module.Users })))
const AuditLogs = lazy(() => import("@/pages/AuditLogs").then((module) => ({ default: module.AuditLogs })))
const SystemSettings = lazy(() => import("@/pages/SystemSettings").then((module) => ({ default: module.SystemSettings })))
const Feedback = lazy(() => import("@/pages/Feedback").then((module) => ({ default: module.Feedback })))
const ChangePassword = lazy(() => import("@/pages/ChangePassword").then((module) => ({ default: module.ChangePassword })))

const ROUTE_ACCESS_ROLES: Record<string, string[]> = {
  users: ["admin", "dispatcher", "operations_director", "engineering_supervisor", "administrative_supervisor", "sales_supervisor"],
  "audit-logs": ["admin", "operations_director", "engineering_supervisor"],
  settings: ["admin", "operations_director", "engineering_supervisor"],
}

const CHUNK_RELOAD_KEY = "oms-admin:chunk-reload"

function isChunkLoadError(error: unknown) {
  const text = String((error as Error)?.message || error || "")
  return /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text)
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    const reloadKey = window.location.href
    if (isChunkLoadError(error) && sessionStorage.getItem(CHUNK_RELOAD_KEY) !== reloadKey) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, reloadKey)
      window.location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
        <div>页面资源已更新，请刷新后继续。</div>
        <button className="rounded-md border px-4 py-2 text-sm text-foreground" type="button" onClick={() => window.location.reload()}>
          刷新页面
        </button>
      </div>
    )
  }
}

function ProtectedRoute({ children, allow }: { children: ReactNode; allow?: string[] }) {
  const { isAuthenticated, user, loading } = useAuth()
  const location = useLocation()
  const { lang } = useLanguage()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        {lang === "zh-TW" ? "正在載入…" : "正在加载…"}
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (user?.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />
  }

  if (allow && user && !allow.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function PageLoading() {
  const { lang } = useLanguage()
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      {lang === "zh-TW" ? "正在載入…" : "正在加载…"}
    </div>
  )
}

function ProtectedAdminPage({ children, allow }: { children: ReactNode; allow?: string[] }) {
  return (
    <ProtectedRoute allow={allow}>
      <Suspense fallback={<PageLoading />}>
        <AdminLayout>
          {children}
        </AdminLayout>
      </Suspense>
    </ProtectedRoute>
  )
}

export default function App() {
  const { lang } = useLanguage()
  useAdminDomTextI18n(lang)

  return (
    <>
      <RouteErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoading />}>
                  <ChangePassword />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedAdminPage>
                <Dashboard />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedAdminPage>
                <Dashboard />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/service-orders"
            element={
              <ProtectedAdminPage>
                <ServiceOrders />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/inspection-schedules"
            element={
              <ProtectedAdminPage>
                <InspectionSchedules />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedAdminPage>
                <Customers />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/devices"
            element={
              <ProtectedAdminPage>
                <Devices />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/maintenance-parties"
            element={
              <ProtectedAdminPage>
                <MaintenanceParties />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/timesheets"
            element={
              <ProtectedAdminPage>
                <Timesheets />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedAdminPage allow={ROUTE_ACCESS_ROLES.users}>
                <Users />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <ProtectedAdminPage allow={ROUTE_ACCESS_ROLES["audit-logs"]}>
                <AuditLogs />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedAdminPage allow={ROUTE_ACCESS_ROLES.settings}>
                <SystemSettings />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/feedback"
            element={
              <ProtectedAdminPage>
                <Feedback />
              </ProtectedAdminPage>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </RouteErrorBoundary>
      <Toaster />
    </>
  )
}
