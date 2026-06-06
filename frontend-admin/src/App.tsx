import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { useAuth } from "@/contexts/AuthContext"
import { AdminLayout } from "@/components/AdminLayout"
import { Login } from "@/pages/Login"
import { Dashboard } from "@/pages/Dashboard"
import { ServiceOrders } from "@/pages/ServiceOrders"
import { InspectionSchedules } from "@/pages/InspectionSchedules"
import { Customers } from "@/pages/Customers"
import { Devices } from "@/pages/Devices"
import { MaintenanceParties } from "@/pages/MaintenanceParties"
import { Timesheets } from "@/pages/Timesheets"
import { Users } from "@/pages/Users"
import { AuditLogs } from "@/pages/AuditLogs"
import { SystemSettings } from "@/pages/SystemSettings"
import { useLanguage } from "@/contexts/LanguageContext"
import type { ReactNode } from "react"

const ROUTE_ACCESS_ROLES: Record<string, string[]> = {
  users: ["admin", "assistant", "dispatcher", "supervisor", "engineering_supervisor", "sales_supervisor"],
  "audit-logs": ["admin", "supervisor", "engineering_supervisor"],
  settings: ["admin", "supervisor", "engineering_supervisor"],
}

function ProtectedRoute({ children, allow }: { children: ReactNode; allow?: string[] }) {
  const { isAuthenticated, user, loading } = useAuth()
  const location = useLocation()
  const { lang } = useLanguage()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        {lang === "zh-TW" ? "載入中…" : "加载中…"}
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (allow && user && !allow.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Dashboard />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Dashboard />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/service-orders"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <ServiceOrders />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/inspection-schedules"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <InspectionSchedules />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Customers />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/devices"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Devices />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance-parties"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <MaintenanceParties />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheets"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Timesheets />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute allow={ROUTE_ACCESS_ROLES.users}>
              <AdminLayout>
                <Users />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <ProtectedRoute allow={ROUTE_ACCESS_ROLES["audit-logs"]}>
              <AdminLayout>
                <AuditLogs />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute allow={ROUTE_ACCESS_ROLES.settings}>
              <AdminLayout>
                <SystemSettings />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
