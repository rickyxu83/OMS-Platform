import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Fingerprint, Globe, Loader2, LockKeyhole, TriangleAlert, UserRound } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_VERSION, getPreferredWorkspace, goToWorkspace, workspaceLabel, type WorkspaceOption } from "@/config/app";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api, releaseInteractionLocks } from "@/services/api";
import { preloadAdminCore } from "@/lib/preload-admin";
import { cancelLoginTransition, finishLoginTransition, startLoginTransition } from "@/lib/login-transition";

const LOGIN_BACKGROUND_BLOBS = [
  { left: "50%", top: "44%", sizeClass: "h-[580px] w-[580px]", moveX: -170, moveY: 120, scale: 1.04, scaleMove: 0.04, duration: "22s", delay: "-3s" },
  { left: "38%", top: "32%", sizeClass: "h-[430px] w-[430px]", moveX: 210, moveY: 160, scale: 1.08, scaleMove: 0.05, duration: "25s", delay: "-9s" },
  { left: "62%", top: "58%", sizeClass: "h-[460px] w-[460px]", moveX: -200, moveY: -165, scale: 1.06, scaleMove: 0.05, duration: "20s", delay: "-14s" },
  { left: "28%", top: "66%", sizeClass: "h-[500px] w-[500px]", moveX: 230, moveY: -135, scale: 1.05, scaleMove: 0.045, duration: "27s", delay: "-6s" },
  { left: "76%", top: "28%", sizeClass: "h-[480px] w-[480px]", moveX: -220, moveY: 145, scale: 1.06, scaleMove: 0.05, duration: "24s", delay: "-17s" },
  { left: "16%", top: "18%", sizeClass: "h-[420px] w-[420px]", moveX: 280, moveY: 200, scale: 1.1, scaleMove: 0.06, duration: "28s", delay: "-11s" },
  { left: "84%", top: "80%", sizeClass: "h-[480px] w-[480px]", moveX: -270, moveY: -210, scale: 1.07, scaleMove: 0.05, duration: "23s", delay: "-4s" },
  { left: "54%", top: "12%", sizeClass: "h-[380px] w-[380px]", moveX: 190, moveY: 230, scale: 1.1, scaleMove: 0.06, duration: "26s", delay: "-19s" },
];

const LOGIN_VIEWPORT_BACKGROUND = "#f7f3ee";
const IS_TEST_SERVER = String(import.meta.env.VITE_APP_ENVIRONMENT || "").toLowerCase() === "test";
const LOGIN_MOTION_EASE = 0.2;
const LOGIN_MOTION_SETTLE_EPSILON = 0.002;

/**
 * 4 套与敦阳品牌紫（#582b8b）和谐配色的精选极光色板：
 * 每次进入随机抽取一整套同调色板，避免单球随机混抽出现红绿黄撞色浑浊感。
 */
const LOGIN_AURORA_THEMES: string[][] = [
  // 1. 暮光紫韵（品牌紫 · 鸢尾蓝 · 柔粉玫瑰 · 暖香槟）
  [
    "rgba(124, 58, 237, 0.30)",
    "rgba(168, 85, 247, 0.28)",
    "rgba(236, 72, 153, 0.22)",
    "rgba(99, 102, 241, 0.24)",
    "rgba(251, 207, 232, 0.42)",
    "rgba(233, 213, 255, 0.44)",
    "rgba(254, 243, 199, 0.38)",
    "rgba(224, 231, 255, 0.40)",
  ],
  // 2. 晨曦暖紫（梅子紫 · 珊瑚蜜桃 · 琥珀柔光 · 薰衣草雾）
  [
    "rgba(139, 92, 246, 0.28)",
    "rgba(244, 114, 182, 0.25)",
    "rgba(251, 146, 60, 0.20)",
    "rgba(168, 85, 247, 0.24)",
    "rgba(255, 228, 230, 0.44)",
    "rgba(243, 232, 255, 0.45)",
    "rgba(254, 215, 170, 0.36)",
    "rgba(250, 232, 255, 0.42)",
  ],
  // 3. 星云靛蓝（深紫罗兰 · 矢车菊蓝 · 冰透天青 · 丁香云）
  [
    "rgba(109, 40, 217, 0.27)",
    "rgba(79, 70, 229, 0.26)",
    "rgba(56, 189, 248, 0.22)",
    "rgba(147, 51, 234, 0.23)",
    "rgba(224, 242, 254, 0.44)",
    "rgba(237, 233, 254, 0.46)",
    "rgba(219, 234, 254, 0.42)",
    "rgba(245, 243, 255, 0.44)",
  ],
  // 4. 冰川紫青（紫水晶 · 湖水青 · 薄荷薄雾 · 浅靛紫）
  [
    "rgba(124, 58, 237, 0.27)",
    "rgba(20, 184, 166, 0.20)",
    "rgba(99, 102, 241, 0.25)",
    "rgba(168, 85, 247, 0.23)",
    "rgba(204, 251, 241, 0.38)",
    "rgba(237, 233, 254, 0.45)",
    "rgba(224, 231, 255, 0.42)",
    "rgba(250, 245, 255, 0.44)",
  ],
];

type LoginMotionPoint = { x: number; y: number };

function clampMotionValue(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function normalizedPointerPosition(clientX: number, clientY: number) {
  return {
    x: clampMotionValue((clientX / Math.max(window.innerWidth, 1) - 0.5) * 2),
    y: clampMotionValue((clientY / Math.max(window.innerHeight, 1) - 0.5) * 2),
  };
}

function motionBlobTransform(
  config: (typeof LOGIN_BACKGROUND_BLOBS)[number],
  point: LoginMotionPoint,
) {
  const activeScale = config.scale + (Math.abs(point.x) + Math.abs(point.y)) * config.scaleMove;
  return `translate3d(calc(-50% + ${(point.x * config.moveX).toFixed(2)}px), calc(-50% + ${(point.y * config.moveY).toFixed(2)}px), 0) scale(${activeScale.toFixed(3)})`;
}

function randomLoginPalette() {
  const theme = LOGIN_AURORA_THEMES[Math.floor(Math.random() * LOGIN_AURORA_THEMES.length)] || LOGIN_AURORA_THEMES[0];
  return theme;
}

function isTouchOrCoarsePointer() {
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

function LoginMotionBackground() {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef<LoginMotionPoint>({ x: 0, y: 0 });
  const currentRef = useRef<LoginMotionPoint>({ x: 0, y: 0 });
  const [blobColors] = useState(randomLoginPalette);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const layer = layerRef.current;
    const blobNodes = Array.from(layer?.querySelectorAll<HTMLElement>("[data-motion-blob]") || []);
    if (!layer || !blobNodes.length) return;

    const motionSettled = () => {
      const target = targetRef.current;
      const current = currentRef.current;
      return Math.abs(target.x - current.x) < LOGIN_MOTION_SETTLE_EPSILON
        && Math.abs(target.y - current.y) < LOGIN_MOTION_SETTLE_EPSILON;
    };

    const applyTransforms = () => {
      const current = currentRef.current;
      blobNodes.forEach((node, index) => {
        const config = LOGIN_BACKGROUND_BLOBS[index];
        if (!config) return;
        node.style.transform = motionBlobTransform(config, current);
      });
    };

    const render = () => {
      rafRef.current = null;
      const target = targetRef.current;
      const current = currentRef.current;
      current.x += (target.x - current.x) * LOGIN_MOTION_EASE;
      current.y += (target.y - current.y) * LOGIN_MOTION_EASE;
      applyTransforms();

      if (!motionSettled()) {
        rafRef.current = window.requestAnimationFrame(render);
      }
    };

    const ensureFrame = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(render);
    };

    const updateTarget = (clientX: number, clientY: number) => {
      targetRef.current = normalizedPointerPosition(clientX, clientY);
      ensureFrame();
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateTarget(event.clientX, event.clientY);
    };

    const handleMouseMove = (event: MouseEvent) => {
      updateTarget(event.clientX, event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      updateTarget(touch.clientX, touch.clientY);
    };

    const handlePointerLeave = () => {
      targetRef.current = { x: 0, y: 0 };
      ensureFrame();
    };

    const isMobileMotion = isTouchOrCoarsePointer();
    const supportsPointerEvent = "PointerEvent" in window;
    if (isMobileMotion) {
      window.addEventListener("touchmove", handleTouchMove, { passive: true });
    } else if (supportsPointerEvent) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
    } else {
      window.addEventListener("mousemove", handleMouseMove, { passive: true });
    }
    document.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      if (isMobileMotion) {
        window.removeEventListener("touchmove", handleTouchMove);
      } else if (supportsPointerEvent) {
        window.removeEventListener("pointermove", handlePointerMove);
      } else {
        window.removeEventListener("mousemove", handleMouseMove);
      }
      document.removeEventListener("pointerleave", handlePointerLeave);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={layerRef} className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute" style={{ inset: "-14vh -14vw" }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgba(255,255,255,0.42), rgba(255,255,255,0.08) 34%, transparent 56%), linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.22))",
          }}
        />
        {LOGIN_BACKGROUND_BLOBS.map((blob, index) => (
          <div
            key={index}
            className="absolute"
            style={{ left: blob.left, top: blob.top }}
          >
            <div
              data-motion-blob
              className={`absolute will-change-transform motion-reduce:transition-none ${blob.sizeClass}`}
              style={{
                transform: motionBlobTransform(blob, { x: 0, y: 0 }),
              }}
            >
              <div
                className={`h-full w-full rounded-full blur-3xl ${index % 2 === 0 ? "login-aurora-breathe-a" : "login-aurora-breathe-b"}`}
                style={
                  {
                    background: blobColors[index % blobColors.length],
                    "--aurora-duration": blob.duration,
                    animationDelay: blob.delay,
                  } as CSSProperties
                }
              />
            </div>
          </div>
        ))}
      </div>
      <div
        className="absolute inset-x-0 top-0 h-[10svh] md:hidden"
        style={{ background: `linear-gradient(to bottom, ${LOGIN_VIEWPORT_BACKGROUND} 0%, rgba(247,243,238,0.45) 45%, rgba(247,243,238,0) 100%)` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[10svh] md:hidden"
        style={{ background: `linear-gradient(to top, ${LOGIN_VIEWPORT_BACKGROUND} 0%, rgba(247,243,238,0.5) 45%, rgba(247,243,238,0) 100%)` }}
      />
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, completeLogin } = useAuth();
  const { lang, setLang } = useLanguage();
  const [username, setUsername] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("remembered_username") || "";
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(localStorage.getItem("remembered_username"));
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [workspaceChoices, setWorkspaceChoices] = useState<WorkspaceOption[]>([]);
  // 通行密钥（002-login-security）：login-methods 探测 + 浏览器能力探测双重门控，不满足就不出现入口
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const passkeyActiveRef = useRef(false);
  // identifier-first 单框流：先只问账号，再按账号能力决定唤起生物识别还是展开密码框
  const [step, setStep] = useState<"identifier" | "password">("identifier");

  const i18n = {
    "zh-CN": {
      title: "OMS Platform",
      welcome: "欢迎回来",
      subtitle: "运维智管",
      pleaseLogin: "请登录您的账户",
      testServer: "测试开发服务器",
      testServerNotice: "此环境仅供测试，请勿录入正式业务数据",
      username: "邮箱或别名",
      password: "密码",
      remember: "记住邮箱/别名",
      login: "登录",
      loggingIn: "登录中…",
      showPassword: "显示密码",
      hidePassword: "隐藏密码",
      chooseWorkspace: "请选择要进入的工作台",
      enterWorkspace: "进入",
      errorEmpty: "请输入邮箱/别名和密码",
      errorNotFound: "账号不存在",
      errorPassword: "密码错误",
      errorAuth: "当前账号没有可用工作台",
      errorFallback: "登录失败",
      version: "系统版本",
      langLabel: "简体中文",
      langOptionCn: "简体中文",
      langOptionTw: "繁體中文",
      usernamePlaceholder: "请输入邮箱或别名",
      passwordPlaceholder: "请输入密码",
      passkeyLogin: "通行密钥登录",
      passkeyLoggingIn: "验证中…",
      continue: "继续",
      changeAccount: "更改",
      passkeyAutoHint: "登记过通行密钥的账号将直接验证指纹/人脸",
      passkeyTip: "通行密钥可用指纹 / 人脸 / PIN 码免密码登录。设置方法：密码登录后进入「我的设置 → 通行密钥」，那里有详细说明。",
      usePasskeyInstead: "改用通行密钥验证",
      errorEmptyIdentifier: "请输入邮箱/别名",
      errorEmptyPassword: "请输入密码",
      copyrightNotice: "© 2026 敦阳（宁波）科技有限公司",
      icpNotice: "浙ICP备2026045692号",
      licenseLine: "OMS Platform 已开源发布，遵循 GPL-3.0 许可证",
    },
    "zh-TW": {
      title: "OMS Platform",
      welcome: "歡迎回來",
      subtitle: "運維智管",
      pleaseLogin: "請登錄您的賬戶",
      testServer: "測試開發伺服器",
      testServerNotice: "此環境僅供測試，請勿錄入正式業務資料",
      username: "信箱或別名",
      password: "密碼",
      remember: "記住信箱/別名",
      login: "登錄",
      loggingIn: "登錄中…",
      showPassword: "顯示密碼",
      hidePassword: "隱藏密碼",
      chooseWorkspace: "請選擇要進入的工作臺",
      enterWorkspace: "進入",
      errorEmpty: "請輸入信箱/別名和密碼",
      errorNotFound: "帳號不存在",
      errorPassword: "密碼錯誤",
      errorAuth: "目前帳號沒有可用工作臺",
      errorFallback: "登錄失敗",
      version: "系統版本",
      langLabel: "繁體中文",
      langOptionCn: "简体中文",
      langOptionTw: "繁體中文",
      usernamePlaceholder: "請輸入信箱或別名",
      passwordPlaceholder: "請輸入密碼",
      passkeyLogin: "通行密鑰登錄",
      passkeyLoggingIn: "驗證中…",
      continue: "繼續",
      changeAccount: "更改",
      passkeyAutoHint: "登記過通行密鑰的帳號將直接驗證指紋/人臉",
      passkeyTip: "通行密鑰可用指紋 / 人臉 / PIN 碼免密碼登錄。設定方法：密碼登錄後進入「我的設定 → 通行密鑰」，那裡有詳細說明。",
      usePasskeyInstead: "改用通行密鑰驗證",
      errorEmptyIdentifier: "請輸入信箱或別名",
      errorEmptyPassword: "請輸入密碼",
      copyrightNotice: "© 2026 敦陽（寧波）科技有限公司",
      icpNotice: "浙ICP备2026045692号",
      licenseLine: "OMS Platform 已開源發布，遵循 GPL-3.0 授權條款",
    },
  };

  const t = i18n[lang];
  const appVersion = APP_VERSION;
  const logoSrc = `${import.meta.env.BASE_URL}dunyang-mark.png`;

  useEffect(() => {
    releaseInteractionLocks();
    // 用户输账号/刷指纹的空档期预取管理端 chunk，消除登录跳转时的懒加载白屏
    preloadAdminCore();
    const timer = window.setTimeout(releaseInteractionLocks, 80);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const rootElement = document.documentElement;
    const bodyElement = document.body;
    const appElement = document.getElementById("root");
    const previousRootBackground = rootElement.style.backgroundColor;
    const previousBodyBackground = bodyElement.style.backgroundColor;
    const previousAppBackground = appElement?.style.backgroundColor || "";
    const existingThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const themeColorMeta = existingThemeColor || document.createElement("meta");
    const previousThemeColor = themeColorMeta.getAttribute("content");

    if (!existingThemeColor) {
      themeColorMeta.setAttribute("name", "theme-color");
      document.head.appendChild(themeColorMeta);
    }

    rootElement.style.backgroundColor = LOGIN_VIEWPORT_BACKGROUND;
    bodyElement.style.backgroundColor = LOGIN_VIEWPORT_BACKGROUND;
    if (appElement) appElement.style.backgroundColor = LOGIN_VIEWPORT_BACKGROUND;
    themeColorMeta.setAttribute("content", LOGIN_VIEWPORT_BACKGROUND);

    return () => {
      rootElement.style.backgroundColor = previousRootBackground;
      bodyElement.style.backgroundColor = previousBodyBackground;
      if (appElement) appElement.style.backgroundColor = previousAppBackground;
      if (existingThemeColor) {
        if (previousThemeColor === null) themeColorMeta.removeAttribute("content");
        else themeColorMeta.setAttribute("content", previousThemeColor);
      } else {
        themeColorMeta.remove();
      }
    };
  }, []);

  const [exitTransition, setExitTransition] = useState(false);

  const enterWorkspace = (workspaceKey: string, home = "") => {
    const localTarget = goToWorkspace(workspaceKey, home);
    if (!localTarget || exitTransition) return;
    const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      navigate(localTarget, { replace: true });
      return;
    }
    // 过场动画定稿 A（打分赛：交叉淡化）：乐观路径已由 startLoginTransition 开播，此处收口导航；
    // 密码路径无乐观覆盖层，finish 内部回退为「先罩住再掀开」
    setExitTransition(true);
    finishLoginTransition(() => navigate(localTarget, { replace: true }));
  };

  // 登录成功后的工作台路由（密码/通行密钥共用）
  const routeAfterLogin = (result: { user?: any; availableWorkspaces?: WorkspaceOption[] }) => {
    const workspaces: WorkspaceOption[] = result.availableWorkspaces || result.user?.availableWorkspaces || [];
    const requestedWorkspace = searchParams.get("workspace") || "";
    const explicitWorkspace = workspaces.find((workspace) => workspace.key === requestedWorkspace);

    if (explicitWorkspace) {
      enterWorkspace(explicitWorkspace.key, explicitWorkspace.home || "");
      return true;
    }

    if (workspaces.length === 1) {
      enterWorkspace(workspaces[0].key, workspaces[0].home || "");
      return true;
    }

    if (workspaces.length > 1) {
      const preferredWorkspace = getPreferredWorkspace(result.user?.id);
      const preferredChoice = workspaces.find((workspace) => workspace.key === preferredWorkspace);
      if (preferredChoice) {
        enterWorkspace(preferredChoice.key, preferredChoice.home || "");
        return true;
      }
      setWorkspaceChoices(workspaces);
      return true;
    }
    return false;
  };

  // 通行密钥能力探测：后端配置开启 + 安全上下文 + 平台认证器可用，三者齐备才显示入口
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supported = typeof window !== "undefined"
          && window.isSecureContext
          && typeof window.PublicKeyCredential !== "undefined";
        if (!supported) return;
        const methods = await api.get("/auth/login-methods");
        if (!active || !methods?.passkey) return;
        const platformReady = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
        if (active && platformReady) setPasskeyAvailable(true);
      } catch { /* 探测失败即保持隐藏 */ }
    })();
    return () => { active = false; };
  }, []);

  // 通行密钥自动填充（conditional UI）：账号框获得焦点时由浏览器原生下拉列出本机通行密钥
  useEffect(() => {
    if (!passkeyAvailable) return;
    let active = true;
    passkeyActiveRef.current = true;
    (async () => {
      try {
        const conditionalReady = await PublicKeyCredential.isConditionalMediationAvailable?.().catch(() => false);
        if (!active || !conditionalReady) return;
        const options = await api.post("/auth/webauthn/login/options", { identifier: "" });
        if (!active) return;
        // useBrowserAutofill：挂起等待用户从自动填充中选择；其他 WebAuthn 调用会自动中止它
        const response = await startAuthentication({ optionsJSON: options.publicKey, useBrowserAutofill: true });
        if (!active) return;
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) startLoginTransition();
        const verify = await api.post("/auth/webauthn/login/verify", { challengeToken: options.challengeToken, response });
        if (!active) {
          cancelLoginTransition();
          return;
        }
        const result = completeLogin(verify, true);
        routeAfterLogin(result);
      } catch {
        cancelLoginTransition(); /* 用户未选择/被中止：静默 */
      }
    })();
    return () => {
      active = false;
      passkeyActiveRef.current = false;
      cancelLoginTransition();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passkeyAvailable]);

  // 通行密钥登录尝试：成功返回 true；账号无凭据/用户取消/接口异常返回 false（由调用方落密码步）
  const attemptPasskeyLogin = async (identifier: string): Promise<boolean> => {
    if (!passkeyAvailable) return false;
    setPasskeyLoading(true);
    try {
      const options = await api.post("/auth/webauthn/login/options", { identifier });
      if (!(options?.publicKey?.allowCredentials || []).length) return false;
      const response = await startAuthentication({ optionsJSON: options.publicKey });
      // 乐观过渡：指纹/人脸一通过立即开播动画，前段正好盖住 verify 网络往返（消除暂停感）
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) startLoginTransition();
      const verify = await api.post("/auth/webauthn/login/verify", { challengeToken: options.challengeToken, response });
      if (rememberMe) {
        localStorage.setItem("remembered_username", identifier);
      } else {
        localStorage.removeItem("remembered_username");
      }
      const result = completeLogin(verify, rememberMe);
      if (!routeAfterLogin(result)) {
        cancelLoginTransition();
        setError(t.errorAuth);
      }
      return true;
    } catch (err: any) {
      cancelLoginTransition();
      // NotAllowedError/AbortError = 用户取消/本机无匹配凭据/超时：静默落密码步
      if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
        setError(err?.message || t.errorFallback);
      }
      return false;
    } finally {
      setPasskeyLoading(false);
    }
  };

  // 第一步「继续」：有通行密钥直接唤起生物识别；否则展开密码框
  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const identifier = username.trim();
    if (!identifier) {
      setError(t.errorEmptyIdentifier);
      return;
    }
    const loggedIn = await attemptPasskeyLogin(identifier);
    if (!loggedIn) setStep("password");
  };

  const backToIdentifierStep = () => {
    setStep("identifier");
    setPassword("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError(t.errorEmptyPassword);
      return;
    }

    setLoading(true);
    try {
      const result = await login(username, password, rememberMe);
      if (rememberMe) {
        localStorage.setItem("remembered_username", username);
      } else {
        localStorage.removeItem("remembered_username");
      }
      if (!routeAfterLogin(result)) setError(t.errorAuth);
    } catch (err: any) {
      const msg = String(err?.message || "")
      if (msg.includes("账号不存在") || msg.includes("User not found")) setError(t.errorNotFound)
      else if (msg.includes("密码") || msg.includes("password")) setError(t.errorPassword)
      else if (msg.includes("无权") || msg.includes("权限") || msg.includes("forbidden")) setError(t.errorAuth)
      else setError(msg || t.errorFallback)
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="login-root"
      className="fixed inset-0 overflow-y-auto overflow-x-hidden"
      style={{
        backgroundColor: LOGIN_VIEWPORT_BACKGROUND,
        colorScheme: "light",
        minHeight: "100vh",
        overscrollBehavior: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <LoginMotionBackground />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col justify-between px-4 pb-[max(0.875rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] supports-[min-height:100dvh]:min-h-[100dvh] sm:px-6 sm:pb-5 sm:pt-5">
        {/* 顶部栏：测试服紧凑警示胶囊 + 语言切换同排，不遮挡不跳位 */}
        <div className="flex items-start justify-between gap-2.5">
          {IS_TEST_SERVER ? (
            <div
              role="status"
              className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-amber-400/90 bg-amber-100/90 px-3 py-1.5 text-amber-950 shadow-sm backdrop-blur-md sm:px-3.5 sm:py-2"
            >
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-700 sm:h-4.5 sm:w-4.5" aria-hidden="true" />
              <div className="min-w-0 text-xs leading-snug">
                <span className="font-bold">{t.testServer}</span>
                <span className="mx-1.5 hidden text-amber-700/50 sm:inline">·</span>
                <span className="block truncate font-medium text-amber-900/90 sm:inline">{t.testServerNotice}</span>
              </div>
            </div>
          ) : (
            <div />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 rounded-full border-white/80 bg-white/78 px-3.5 shadow-[0_4px_14px_-2px_rgba(46,16,101,0.08)] ring-1 ring-slate-900/[0.05] backdrop-blur-md transition-all hover:bg-white hover:shadow-[0_6px_18px_-2px_rgba(46,16,101,0.13)]"
              >
                <Globe className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
                <span className="text-xs font-medium text-slate-700 sm:text-sm">{t.langLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="mt-1.5 min-w-[124px] rounded-xl border-white/80 bg-white/95 backdrop-blur-xl">
              <DropdownMenuItem
                onClick={() => setLang("zh-CN")}
                className={`cursor-pointer rounded-lg ${lang === "zh-CN" ? "bg-primary/10 font-semibold text-primary" : ""}`}
              >
                {t.langOptionCn}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLang("zh-TW")}
                className={`cursor-pointer rounded-lg ${lang === "zh-TW" ? "bg-primary/10 font-semibold text-primary" : ""}`}
              >
                {t.langOptionTw}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 主卡片区：垂直居中，弹起手机键盘时自然滚动不重叠 */}
        <main className="my-auto flex w-full justify-center py-5 sm:py-8">
          <div className="w-full max-w-[392px]">
            <div className="relative overflow-hidden rounded-[28px] border border-white/85 bg-white/[0.84] p-6 shadow-[0_24px_60px_-15px_rgba(46,16,101,0.16),0_8px_20px_-6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-slate-900/[0.04] backdrop-blur-2xl sm:p-8">
              {/* 顶部高光掠影 */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
              />

              <div className="mb-4 flex justify-center">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <div
                    className="absolute h-20 w-20 rounded-full blur-2xl"
                    style={{ background: "radial-gradient(circle, rgba(88, 43, 139, 0.35) 0%, rgba(168, 85, 247, 0.18) 50%, transparent 70%)" }}
                  />
                  <div
                    className="absolute h-24 w-24 rounded-full blur-3xl"
                    style={{ background: "radial-gradient(circle, rgba(88, 43, 139, 0.25) 0%, rgba(168, 85, 247, 0.12) 50%, transparent 70%)" }}
                  />
                  <div
                    className="absolute h-28 w-28 rounded-full blur-3xl"
                    style={{ background: "radial-gradient(circle, rgba(88, 43, 139, 0.18) 0%, rgba(168, 85, 247, 0.08) 50%, transparent 70%)" }}
                  />
                  <div
                    className="absolute h-[72px] w-[72px] rounded-full blur-xl"
                    style={{ background: "radial-gradient(circle, rgba(88, 43, 139, 0.4) 0%, rgba(168, 85, 247, 0.25) 40%, transparent 70%)" }}
                  />
                  <img
                    src={logoSrc}
                    alt="Dunyang Technology Logo"
                    className="relative z-10 h-[72px] w-[72px] object-contain"
                    style={{ filter: "drop-shadow(0 0 10px rgba(88, 43, 139, 0.5))" }}
                  />
                </div>
              </div>

              <div className="mb-6 text-center">
                <h1 className="mb-1.5 text-2xl font-bold text-primary">
                  {t.title}
                </h1>
                <p className="text-sm text-gray-500">{t.subtitle}</p>
                <p className="mt-1 text-xs text-gray-400">{t.pleaseLogin}</p>
              </div>

              <form onSubmit={step === "identifier" ? handleContinue : handleSubmit} className="space-y-4">
                {error && (
                  <div role="alert" className="rounded-xl border border-rose-200/80 bg-rose-50/90 px-3.5 py-2.5 text-center text-sm font-medium text-rose-600">
                    {error}
                  </div>
                )}

                {step === "identifier" ? (
                  <div key="identifier" className="login-step-enter space-y-4">
                    <div>
                      <Label htmlFor="username" className="sr-only">
                        {t.username}
                      </Label>
                      <div className="group relative">
                        <UserRound
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary"
                        />
                        <Input
                          id="username"
                          name="username"
                          type="text"
                          placeholder={t.usernamePlaceholder || t.username}
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          autoComplete="username webauthn"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          enterKeyHint="next"
                          className="h-[46px] rounded-xl border border-slate-200/90 bg-slate-50/70 pl-10 pr-3.5 shadow-none transition-all placeholder:text-slate-400 hover:border-primary/50 focus-visible:border-primary focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-primary/12"
                        />
                      </div>
                    </div>

                    <div className="flex items-center text-sm">
                      <label className="group flex cursor-pointer select-none items-center py-0.5">
                        <Checkbox
                          id="remember"
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                          className="h-4 w-4 rounded border-slate-300 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                        />
                        <span className="ml-2 text-slate-600 transition-colors group-hover:text-primary">{t.remember}</span>
                      </label>
                    </div>

                    <Button
                      type="submit"
                      disabled={loading || passkeyLoading}
                      className="group h-[46px] w-full rounded-xl bg-gradient-to-b from-[color-mix(in_oklab,var(--primary)_92%,white)] to-primary text-[15px] font-semibold text-white shadow-[0_8px_20px_-4px_rgba(88,43,139,0.42),inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:brightness-[1.03] hover:shadow-[0_10px_24px_-4px_rgba(88,43,139,0.5)] active:scale-[0.985]"
                    >
                      {passkeyLoading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.passkeyLoggingIn}</>
                      ) : (
                        <>
                          {t.continue}
                          <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </Button>

                    {passkeyAvailable ? (
                      <div className="flex items-center justify-center gap-1.5 px-1 text-center text-xs leading-relaxed text-slate-500">
                        <Fingerprint className="h-3.5 w-3.5 shrink-0 text-primary/75" />
                        <span>{t.passkeyAutoHint}</span>
                        <HelpTooltip label={t.passkeyTip} />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div key="password" className="login-step-enter space-y-4">
                    <button
                      type="button"
                      onClick={backToIdentifierStep}
                      className="group flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-white"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <UserRound className="h-3.5 w-3.5" />
                        </span>
                        <span title={username} className="truncate text-sm font-medium text-slate-700">{username}</span>
                      </span>
                      <span className="shrink-0 rounded-md bg-primary/[0.08] px-2 py-0.5 text-xs font-medium text-primary transition-colors group-hover:bg-primary/15">
                        {t.changeAccount}
                      </span>
                    </button>

                    <div>
                      <Label htmlFor="password" className="sr-only">
                        {t.password}
                      </Label>
                      <div className="group relative">
                        <LockKeyhole
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary"
                        />
                        <Input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          placeholder={t.passwordPlaceholder || t.password}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          enterKeyHint="go"
                          autoFocus
                          className="h-[46px] rounded-xl border border-slate-200/90 bg-slate-50/70 pl-10 pr-11 shadow-none transition-all placeholder:text-slate-400 hover:border-primary/50 focus-visible:border-primary focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-primary/12"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-primary/10 hover:text-primary"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={showPassword ? t.hidePassword : t.showPassword}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center text-sm">
                      <label className="group flex cursor-pointer select-none items-center py-0.5">
                        <Checkbox
                          id="remember-password"
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                          className="h-4 w-4 rounded border-slate-300 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                        />
                        <span className="ml-2 text-slate-600 transition-colors group-hover:text-primary">{t.remember}</span>
                      </label>
                    </div>

                    <Button
                      type="submit"
                      disabled={loading || passkeyLoading}
                      className="h-[46px] w-full rounded-xl bg-gradient-to-b from-[color-mix(in_oklab,var(--primary)_92%,white)] to-primary text-[15px] font-semibold text-white shadow-[0_8px_20px_-4px_rgba(88,43,139,0.42),inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:brightness-[1.03] hover:shadow-[0_10px_24px_-4px_rgba(88,43,139,0.5)] active:scale-[0.985]"
                    >
                      {loading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.loggingIn}</>
                      ) : t.login}
                    </Button>

                    {passkeyAvailable ? (
                      <div className="flex items-center justify-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          disabled={passkeyLoading}
                          onClick={() => { setError(""); void attemptPasskeyLogin(username.trim()); }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.05] px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                        >
                          {passkeyLoading
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Fingerprint className="h-3.5 w-3.5" />}
                          {t.usePasskeyInstead}
                        </button>
                        <HelpTooltip label={t.passkeyTip} />
                      </div>
                    ) : null}
                  </div>
                )}
              </form>

              {workspaceChoices.length > 0 && (
                <div className="mt-4 space-y-2.5">
                  <p className="text-center text-sm font-medium text-slate-500">{t.chooseWorkspace}</p>
                  <div className="grid gap-2">
                    {workspaceChoices.map((workspace) => (
                      <Button
                        key={workspace.key}
                        type="button"
                        variant="outline"
                        className="h-11 justify-between rounded-xl border-primary/20 bg-white/80 hover:border-primary hover:bg-primary/10"
                        onClick={() => enterWorkspace(workspace.key, workspace.home || "")}
                      >
                        <span>{workspaceLabel(workspace.key, workspace.label)}</span>
                        <span className="text-xs text-slate-500">{t.enterWorkspace}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center justify-center gap-2">
                <span className="text-[11px] font-semibold tracking-wider text-slate-400">{t.version}</span>
                <span className="rounded-md bg-slate-100/90 px-2 py-0.5 font-mono text-[11px] text-slate-500">{appVersion}</span>
              </div>
            </div>
          </div>
        </main>

        {/* 底部版权与备案信息：随弹性流沉底，弹起手机键盘时不悬浮遮挡输入框 */}
        <footer className="pt-2 text-center text-[11px] leading-relaxed text-slate-500 sm:text-xs">
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
            <span>{t.copyrightNotice}</span>
            <span className="text-slate-300">│</span>
            <a className="underline-offset-2 transition-colors hover:text-slate-700 hover:underline" href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
              {t.icpNotice}
            </a>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
            <span>{t.licenseLine}</span>
            <span className="text-rose-500" aria-hidden="true">❤</span>
            <a className="underline-offset-2 transition-colors hover:text-slate-700 hover:underline" href="https://github.com/rickyxu83/OMS-Platform" rel="noreferrer" target="_blank">
              github.com/rickyxu83/OMS-Platform
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
