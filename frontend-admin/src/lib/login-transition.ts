// 登录 → 主页过场动画核心（打分赛定稿：E 模糊过渡）：
// 两种启动时序——
// ① 乐观启动 start/finish（通行密钥路径）：指纹一通过立即克隆登录页开播退出动画，
//    动画前段正好盖住 login/verify 的网络往返（RTT 暂停感的根因），验证成功 finish 导航，失败 cancel 复原；
// ② 成功启动 play（密码路径）：服务端确认后才克隆覆盖层，带 380ms 覆盖窗再掀开。
// 覆盖层内输入框值为空（cloneNode 不复制 live value），恰好避免账号/密码在过渡期间残留可见。

export const LOGIN_TRANSITION_STYLE = "crossfade"

const COVER_MS = 380
const EXIT_BUFFER_MS = 80

let activeOverlay: HTMLElement | null = null
let activeStartedAt = 0

function createOverlay(): HTMLElement | null {
  const root = document.getElementById("login-root")
  if (!root) return null
  const overlay = document.createElement("div")
  overlay.className = "login-transition-overlay"
  overlay.setAttribute("aria-hidden", "true")
  const clone = root.cloneNode(true) as HTMLElement
  clone.removeAttribute("id")
  overlay.appendChild(clone)
  document.body.appendChild(overlay)
  return overlay
}

function readExitMs(overlay: HTMLElement): number {
  return (
    Number(getComputedStyle(overlay).getPropertyValue("--lt-exit-ms").replace(/[^0-9.]/g, "")) || 450
  )
}

// ① 乐观启动：生物识别一成功就调用，动画立即开始（覆盖随后的 verify 网络往返）
export function startLoginTransition(style: string = LOGIN_TRANSITION_STYLE): boolean {
  if (activeOverlay) return false
  const overlay = createOverlay()
  if (!overlay) return false
  activeOverlay = overlay
  activeStartedAt = performance.now()
  // 下一帧再加退出类，保证初始状态先渲染一帧，动画从头播起
  requestAnimationFrame(() => overlay.classList.add(`lt-out-${style}`))
  return true
}

// 验证通过：导航到工作台（在覆盖层之下加载），并按已播时长安排覆盖层移除
export function finishLoginTransition(navigate: () => void, style: string = LOGIN_TRANSITION_STYLE) {
  if (!activeOverlay) {
    playLoginTransition(style, navigate)
    return
  }
  const overlay = activeOverlay
  activeOverlay = null
  navigate()
  const exitMs = readExitMs(overlay)
  const remaining = Math.max(0, exitMs - (performance.now() - activeStartedAt))
  window.setTimeout(() => overlay.remove(), remaining + EXIT_BUFFER_MS)
}

// 验证失败：撤掉覆盖层，登录页原样露出（覆盖层只是克隆，未动真页面）
export function cancelLoginTransition() {
  activeOverlay?.remove()
  activeOverlay = null
}

// ② 成功启动（密码路径）：先罩住加载间隙，覆盖窗结束后掀开
export function playLoginTransition(style: string, navigate: () => void) {
  const overlay = createOverlay()
  if (!overlay) {
    navigate()
    return
  }

  navigate()

  window.setTimeout(() => {
    overlay.classList.add(`lt-out-${style}`)
    const exitMs = readExitMs(overlay)
    window.setTimeout(() => overlay.remove(), exitMs + EXIT_BUFFER_MS)
  }, COVER_MS)
}
