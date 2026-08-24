// 登录 → 主页过场动画核心（打分赛）：
// 跳转瞬间克隆当前登录页视觉为 fixed 覆盖层，navigate 后工作台的懒加载/首帧渲染都在覆盖层之下完成，
// 覆盖窗结束后覆盖层按候选风格播退出动画并移除——用户全程看到连续画面，不会看到 Suspense 白屏。
// 覆盖层内输入框值为空（cloneNode 不复制 live value），恰好避免账号/密码在过渡期间残留可见。

const COVER_MS = 380
const EXIT_BUFFER_MS = 80

export function playLoginTransition(style: string, navigate: () => void) {
  const root = document.getElementById("login-root")
  if (!root) {
    navigate()
    return
  }

  const overlay = document.createElement("div")
  overlay.className = "login-transition-overlay"
  overlay.setAttribute("aria-hidden", "true")
  const clone = root.cloneNode(true) as HTMLElement
  clone.removeAttribute("id")
  overlay.appendChild(clone)
  document.body.appendChild(overlay)

  navigate()

  const exitMs = Number(
    getComputedStyle(overlay).getPropertyValue("--lt-exit-ms").replace(/[^0-9.]/g, ""),
  ) || 450

  window.setTimeout(() => {
    overlay.classList.add(`lt-out-${style}`)
    window.setTimeout(() => overlay.remove(), exitMs + EXIT_BUFFER_MS)
  }, COVER_MS)
}
