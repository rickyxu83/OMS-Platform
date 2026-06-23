import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { useAuth } from "@/contexts/AuthContext"
import { Login } from "@/pages/Login"
import { useLanguage } from "@/contexts/LanguageContext"
import { useAdminDomTextI18n } from "@/lib/text-i18n"
import { lazy, Suspense, type ReactNode } from "react"

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
const ChangePassword = lazy(() => import("@/pages/ChangePassword").then((module) => ({ default: module.ChangePassword })))

const ROUTE_ACCESS_ROLES: Record<string, string[]> = {
  users: ["admin", "dispatcher", "operations_director", "engineering_supervisor", "sales_supervisor"],
  "audit-logs": ["admin", "operations_director", "engineering_supervisor"],
  settings: ["admin", "operations_director", "engineering_supervisor"],
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
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
