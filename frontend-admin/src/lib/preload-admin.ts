// 登录页空闲时预取管理端核心 chunk（002 过场动画配套）：
// AdminLayout 与常见落地页均为 lazy 加载，跳转瞬间才下载会出现 Suspense 白屏、打断过场动画；
// 与 App.tsx 的 lazy() 指向同一模块，Vite 产同一 chunk，预取后懒加载即时命中。
let started = false

export function preloadAdminCore() {
  if (started) return
  started = true
  void import("@/components/AdminLayout")
  void import("@/pages/Dashboard")
  void import("@/pages/ApprovalTasks")
}
