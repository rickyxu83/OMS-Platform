import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { useAuth } from "@/contexts/AuthContext"
import { Login } from "@/pages/Login"
import { useLanguage } from "@/contexts/LanguageContext"
import { useAdminDomTextI18n } from "@/lib/use-admin-dom-text-i18n"
import { SHOW_ATTENDANCE } from "@/lib/feature-flags"
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react"

const AdminLayout = lazy(() => import("@/components/AdminLayout").then((module) => ({ default: module.AdminLayout })))
const Dashboard = lazy(() => import("@/pages/Dashboard").then((module) => ({ default: module.Dashboard })))
const ApprovalTasks = lazy(() => import("@/pages/ApprovalTasks").then((module) => ({ default: module.ApprovalTasks })))
const ServiceReport = lazy(() => import("@/pages/ServiceReport").then((module) => ({ default: module.ServiceReport })))
const CustomerSignature = lazy(() => import("@/pages/CustomerSignature").then((module) => ({ default: module.CustomerSignature })))
const EngineerSignature = lazy(() => import("@/pages/EngineerSignature").then((module) => ({ default: module.EngineerSignature })))
const ServiceOrders = lazy(() => import("@/pages/ServiceOrders").then((module) => ({ default: module.ServiceOrders })))
const MrListPage = lazy(() => import("@/packages/mr/MrListPage").then((module) => ({ default: module.MrListPage })))
const MrFormPage = lazy(() => import("@/packages/mr/MrFormPage").then((module) => ({ default: module.MrFormPage })))
const MrPrintPage = lazy(() => import("@/packages/mr/MrPrintPage").then((module) => ({ default: module.MrPrintPage })))
const InspectionSchedules = lazy(() => import("@/pages/InspectionSchedules").then((module) => ({ default: module.InspectionSchedules })))
const Customers = lazy(() => import("@/pages/Customers").then((module) => ({ default: module.Customers })))
const Devices = lazy(() => import("@/pages/Devices").then((module) => ({ default: module.Devices })))
const MaintenanceParties = lazy(() => import("@/pages/MaintenanceParties").then((module) => ({ default: module.MaintenanceParties })))
const Timesheets = lazy(() => import("@/pages/Timesheets").then((module) => ({ default: module.Timesheets })))
const Attendance = lazy(() => import("@/pages/Attendance").then((module) => ({ default: module.Attendance })))
const Users = lazy(() => import("@/pages/Users").then((module) => ({ default: module.Users })))
const AuditLogs = lazy(() => import("@/pages/AuditLogs").then((module) => ({ default: module.AuditLogs })))
const SystemSettings = lazy(() => import("@/pages/SystemSettings").then((module) => ({ default: module.SystemSettings })))
const ChangePassword = lazy(() => import("@/pages/ChangePassword").then((module) => ({ default: module.ChangePassword })))
const NotFound = lazy(() => import("@/pages/NotFound").then((module) => ({ default: module.NotFound })))

const ROUTE_ACCESS_PERMISSIONS: Record<string, string[]> = {
  dashboard: ["order.view", "order.engineer.own"],
  "service-report": ["order.engineer.own"],
  "service-orders": ["order.view"],
  mr: ["mr.view"],
  "inspection-schedules": ["inspection.view"],
  customers: ["customer.view"],
  devices: ["device.view"],
  "maintenance-parties": ["maintenance-party.view"],
  timesheets: ["timesheet.view"],
  attendance: ["attendance.apply", "attendance.approve", "attendance.view", "attendance.admin.approve", "attendance.manage"],
  "attendance-duty": ["attendance.duty.manage", "attendance.duty.admin.approve"],
  users: ["user.view"],
  "audit-logs": ["audit-log.view"],
  settings: ["settings.view"],
}

const ADMIN_ROUTE_FALLBACKS: Array<{ path: string; permissions: string[] }> = [
  { path: "/service-report", permissions: ROUTE_ACCESS_PERMISSIONS["service-report"] },
  { path: "/dashboard", permissions: ROUTE_ACCESS_PERMISSIONS.dashboard },
  { path: "/service-orders", permissions: ROUTE_ACCESS_PERMISSIONS["service-orders"] },
  { path: "/mr", permissions: ROUTE_ACCESS_PERMISSIONS.mr },
  { path: "/inspection-schedules", permissions: ROUTE_ACCESS_PERMISSIONS["inspection-schedules"] },
  { path: "/customers", permissions: ROUTE_ACCESS_PERMISSIONS.customers },
  { path: "/devices", permissions: ROUTE_ACCESS_PERMISSIONS.devices },
  { path: "/maintenance-parties", permissions: ROUTE_ACCESS_PERMISSIONS["maintenance-parties"] },
  { path: "/attendance", permissions: ROUTE_ACCESS_PERMISSIONS.attendance },
  { path: "/attendance-duty", permissions: ROUTE_ACCESS_PERMISSIONS["attendance-duty"] },
  { path: "/timesheets", permissions: ROUTE_ACCESS_PERMISSIONS.timesheets },
]
/** 暗启动隐藏路由：SHOW_ATTENDANCE=false 时登录默认跳转候选剔除考勤（与菜单过滤一致）；MR/待办已点亮常驻 */
const FEATURE_FLAG_HIDDEN_ROUTE_PATHS = new Set(["/attendance", "/attendance-duty"])

function firstAccessibleAdminPath(hasPermission: (...permissions: string[]) => boolean) {
  return ADMIN_ROUTE_FALLBACKS.find((route) => (
    (SHOW_ATTENDANCE || !FEATURE_FLAG_HIDDEN_ROUTE_PATHS.has(route.path)) && hasPermission(...route.permissions)
  ))?.path || "/login"
}

function defaultAdminPath(user: any, hasPermission: (...permissions: string[]) => boolean) {
  if (user?.role === "engineer" && hasPermission("order.engineer.own")) return "/service-report"
  if (hasPermission("order.view")) return "/dashboard"
  return firstAccessibleAdminPath(hasPermission)
}

const CHUNK_RELOAD_KEY = "oms-admin:chunk-reload"

function isChunkLoadError(error: unknown) {
  const text = String((error as Error)?.message || error || "")
  return /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text)
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; stack: string }> {
  state = { error: null as Error | null, stack: "" }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ stack: errorInfo.componentStack || "" })
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
        {this.state.error?.message ? (
          <>
            <pre className="max-w-[640px] whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-3 text-left text-xs text-foreground">
              {this.state.error.message}
            </pre>
            {this.state.stack ? (
              <pre className="max-w-[640px] whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-3 text-left text-[11px] text-foreground">
                {this.state.stack}
              </pre>
            ) : null}
          </>
        ) : null}
        <button className="rounded-md border px-4 py-2 text-sm text-foreground" type="button" onClick={() => window.location.reload()}>
          刷新页面
        </button>
      </div>
    )
  }
}

function ProtectedRoute({ children, allowPermissions }: { children: ReactNode; allowPermissions?: string[] }) {
  const { isAuthenticated, user, loading, hasPermission } = useAuth()
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

  if (allowPermissions && user && !hasPermission(...allowPermissions)) {
    return <Navigate to={firstAccessibleAdminPath(hasPermission)} replace />
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

function ProtectedAdminPage({ children, allowPermissions }: { children: ReactNode; allowPermissions?: string[] }) {
  return (
    <ProtectedRoute allowPermissions={allowPermissions}>
      <Suspense fallback={<PageLoading />}>
        <AdminLayout>
          {children}
        </AdminLayout>
      </Suspense>
    </ProtectedRoute>
  )
}

function ProtectedAdminDefaultRedirect() {
  const { user, hasPermission } = useAuth()
  return (
    <ProtectedRoute>
      <Navigate to={defaultAdminPath(user, hasPermission)} replace />
    </ProtectedRoute>
  )
}

function ProtectedAdminNotFound() {
  const { user, hasPermission } = useAuth()
  return (
    <ProtectedRoute>
      <Suspense fallback={<PageLoading />}>
        <AdminLayout>
          <NotFound homePath={defaultAdminPath(user, hasPermission)} />
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
            path="/customer-signature/:token"
            element={
              <Suspense fallback={<PageLoading />}>
                <CustomerSignature />
              </Suspense>
            }
          />
          <Route
            path="/engineer/customer-signature/:token"
            element={
              <Suspense fallback={<PageLoading />}>
                <CustomerSignature />
              </Suspense>
            }
          />
          <Route
            path="/engineer-signature/:token"
            element={
              <Suspense fallback={<PageLoading />}>
                <EngineerSignature />
              </Suspense>
            }
          />
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
            element={<ProtectedAdminDefaultRedirect />}
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS.dashboard}>
                <Dashboard />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/approval-tasks"
            element={<ProtectedAdminPage><ApprovalTasks /></ProtectedAdminPage>}
          />
          <Route
            path="/service-orders"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS["service-orders"]}>
                <ServiceOrders />
              </ProtectedAdminPage>
            }
          />
          <>
              <Route
                path="/mr"
                element={
                  <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS.mr}>
                    <MrListPage />
                  </ProtectedAdminPage>
                }
              />
              <Route
                path="/mr/:id"
                element={
                  <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS.mr}>
                    <MrFormPage />
                  </ProtectedAdminPage>
                }
              />
              <Route
                path="/mr/:id/print"
                element={
                  <ProtectedRoute allowPermissions={ROUTE_ACCESS_PERMISSIONS.mr}>
                    <Suspense fallback={<PageLoading />}>
                      <MrPrintPage />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
            </>
          <Route
            path="/service-report"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS["service-report"]}>
                <ServiceReport />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/service-report/new"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS["service-report"]}>
                <ServiceReport />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/service-report/:id"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS["service-report"]}>
                <ServiceReport />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/inspection-schedules"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS["inspection-schedules"]}>
                <InspectionSchedules />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS.customers}>
                <Customers />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/devices"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS.devices}>
                <Devices />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/maintenance-parties"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS["maintenance-parties"]}>
                <MaintenanceParties />
              </ProtectedAdminPage>
            }
          />
          {SHOW_ATTENDANCE ? (
            <>
              <Route
                path="/attendance"
                element={
                  <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS.attendance}>
                    <Attendance />
                  </ProtectedAdminPage>
                }
              />
              <Route
                path="/attendance-duty"
                element={
                  <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS["attendance-duty"]}>
                    <Navigate to="/attendance" replace />
                  </ProtectedAdminPage>
                }
              />
            </>
          ) : null}
          <Route
            path="/timesheets"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS.timesheets}>
                <Timesheets />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS.users}>
                <Users />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS["audit-logs"]}>
                <AuditLogs />
              </ProtectedAdminPage>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedAdminPage allowPermissions={ROUTE_ACCESS_PERMISSIONS.settings}>
                <SystemSettings />
              </ProtectedAdminPage>
            }
          />
          <Route path="*" element={<ProtectedAdminNotFound />} />
        </Routes>
      </RouteErrorBoundary>
      <Toaster />
    </>
  )
}
