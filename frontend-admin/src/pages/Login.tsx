import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_VERSION, goToWorkspace, workspaceLabel, type WorkspaceOption } from "@/config/app";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { releaseInteractionLocks } from "@/services/api";

const LOGIN_BACKGROUND_BLOBS = [
  { left: "50%", top: "45%", sizeClass: "h-[620px] w-[620px]", moveX: -190, moveY: 135, scale: 1.04, scaleMove: 0.045 },
  { left: "41%", top: "34%", sizeClass: "h-[430px] w-[430px]", moveX: 240, moveY: 180, scale: 1.1, scaleMove: 0.06 },
  { left: "59%", top: "58%", sizeClass: "h-[470px] w-[470px]", moveX: -230, moveY: -190, scale: 1.08, scaleMove: 0.055 },
  { left: "30%", top: "63%", sizeClass: "h-[520px] w-[520px]", moveX: 260, moveY: -150, scale: 1.06, scaleMove: 0.05 },
  { left: "74%", top: "30%", sizeClass: "h-[500px] w-[500px]", moveX: -250, moveY: 165, scale: 1.08, scaleMove: 0.055 },
  { left: "18%", top: "18%", sizeClass: "h-[430px] w-[430px]", moveX: 320, moveY: 230, scale: 1.12, scaleMove: 0.07 },
  { left: "84%", top: "80%", sizeClass: "h-[500px] w-[500px]", moveX: -310, moveY: -250, scale: 1.08, scaleMove: 0.055 },
  { left: "54%", top: "12%", sizeClass: "h-[380px] w-[380px]", moveX: 210, moveY: 270, scale: 1.14, scaleMove: 0.075 },
];

const LOGIN_VIEWPORT_BACKGROUND = "#f7f1ea";
const LOGIN_MOTION_EASE = 0.22;
const LOGIN_MOTION_SETTLE_EPSILON = 0.002;
const LOGIN_ORIENTATION_MAX_TILT = 9;
const LOGIN_ORIENTATION_X_BOOST = 1.45;
const LOGIN_ORIENTATION_Y_BOOST = 1.25;
const LOGIN_ORIENTATION_ACTIVATION_EVENTS = ["pointerdown", "touchstart"] as const;
const LOGIN_DEEP_BLOB_COUNT = 4;
const LOGIN_DEEP_BLOB_FOCUS_SLOTS = [0, 1, 2, 3];
const LOGIN_DEEP_BLOB_EDGE_SLOTS = [4, 5, 6, 7];
const LOGIN_LIGHT_BLOB_COLOR_GROUPS = [
  [
    "rgba(254, 226, 226, 0.34)",
    "rgba(255, 228, 230, 0.34)",
    "rgba(255, 241, 242, 0.34)",
    "rgba(255, 237, 213, 0.34)",
  ],
  [
    "rgba(252, 231, 243, 0.34)",
    "rgba(243, 232, 255, 0.34)",
    "rgba(237, 233, 254, 0.34)",
    "rgba(250, 245, 255, 0.34)",
  ],
  [
    "rgba(224, 231, 255, 0.34)",
    "rgba(219, 234, 254, 0.34)",
    "rgba(224, 242, 254, 0.34)",
    "rgba(240, 249, 255, 0.34)",
  ],
  [
    "rgba(207, 250, 254, 0.34)",
    "rgba(204, 251, 241, 0.34)",
    "rgba(209, 250, 229, 0.32)",
    "rgba(240, 253, 250, 0.32)",
  ],
  [
    "rgba(220, 252, 231, 0.32)",
    "rgba(236, 252, 203, 0.30)",
    "rgba(254, 249, 195, 0.34)",
    "rgba(254, 243, 199, 0.34)",
    "rgba(255, 247, 237, 0.34)",
    "rgba(248, 250, 252, 0.30)",
  ],
];
const LOGIN_DEEP_BLOB_COLOR_GROUPS = [
  [
    "rgba(244, 63, 94, 0.52)",
    "rgba(239, 68, 68, 0.50)",
    "rgba(249, 115, 22, 0.52)",
    "rgba(245, 158, 11, 0.50)",
  ],
  [
    "rgba(236, 72, 153, 0.52)",
    "rgba(217, 70, 239, 0.50)",
    "rgba(192, 38, 211, 0.48)",
    "rgba(168, 85, 247, 0.50)",
  ],
  [
    "rgba(124, 58, 237, 0.50)",
    "rgba(99, 102, 241, 0.52)",
    "rgba(37, 99, 235, 0.50)",
    "rgba(59, 130, 246, 0.52)",
  ],
  [
    "rgba(14, 165, 233, 0.50)",
    "rgba(6, 182, 212, 0.48)",
    "rgba(20, 184, 166, 0.48)",
    "rgba(16, 185, 129, 0.48)",
  ],
  [
    "rgba(34, 197, 94, 0.46)",
    "rgba(132, 204, 22, 0.46)",
    "rgba(202, 138, 4, 0.48)",
    "rgba(217, 119, 6, 0.50)",
  ],
];

type LoginMotionPoint = { x: number; y: number };
type OrientationBaseline = { beta: number; gamma: number };
type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function clampMotionValue(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function normalizedPointerPosition(clientX: number, clientY: number) {
  return {
    x: clampMotionValue((clientX / Math.max(window.innerWidth, 1) - 0.5) * 2),
    y: clampMotionValue((clientY / Math.max(window.innerHeight, 1) - 0.5) * 2),
  };
}

function shuffledCopy<T>(values: T[]) {
  const list = [...values];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
}

function groupedRandomColors(colorGroups: string[][], count: number) {
  const groups = shuffledCopy(colorGroups).map((group) => shuffledCopy(group));
  const colors: string[] = [];

  while (colors.length < count) {
    for (const group of groups) {
      const color = group.shift();
      if (color) colors.push(color);
      if (colors.length >= count) break;
    }
  }

  return colors;
}

function randomDeepBlobSlots() {
  const focusSlots = shuffledCopy(LOGIN_DEEP_BLOB_FOCUS_SLOTS).slice(0, 2);
  const slots = [
    ...focusSlots,
    shuffledCopy(LOGIN_DEEP_BLOB_EDGE_SLOTS)[0],
  ].filter((slot): slot is number => typeof slot === "number");
  const remainingSlots = shuffledCopy([
    ...LOGIN_DEEP_BLOB_FOCUS_SLOTS,
    ...LOGIN_DEEP_BLOB_EDGE_SLOTS,
  ]).filter((slot) => !slots.includes(slot));

  return [...slots, ...remainingSlots].slice(0, LOGIN_DEEP_BLOB_COUNT);
}

function motionBlobTransform(
  config: (typeof LOGIN_BACKGROUND_BLOBS)[number],
  point: LoginMotionPoint,
) {
  const activeScale = config.scale + (Math.abs(point.x) + Math.abs(point.y)) * config.scaleMove;
  return `translate3d(calc(-50% + ${(point.x * config.moveX).toFixed(2)}px), calc(-50% + ${(point.y * config.moveY).toFixed(2)}px), 0) scale(${activeScale.toFixed(3)})`;
}

function randomLoginPalette() {
  const palette = groupedRandomColors(LOGIN_LIGHT_BLOB_COLOR_GROUPS, LOGIN_BACKGROUND_BLOBS.length);
  const deepColors = groupedRandomColors(LOGIN_DEEP_BLOB_COLOR_GROUPS, LOGIN_DEEP_BLOB_COUNT);
  const deepSlots = randomDeepBlobSlots();

  for (let index = 0; index < deepSlots.length; index += 1) {
    palette[deepSlots[index]] = deepColors[index];
  }
  return palette;
}

function isTouchOrCoarsePointer() {
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

function screenOrientationAngle() {
  const orientationAngle = window.screen.orientation?.angle;
  if (typeof orientationAngle === "number") return orientationAngle;
  return typeof window.orientation === "number" ? window.orientation : 0;
}

function motionFromDeviceOrientation(
  event: DeviceOrientationEvent,
  baseline: OrientationBaseline,
): LoginMotionPoint | null {
  if (event.beta === null || event.gamma === null) return null;

  const deltaBeta = event.beta - baseline.beta;
  const deltaGamma = event.gamma - baseline.gamma;
  const angle = ((screenOrientationAngle() % 360) + 360) % 360;
  let x = deltaGamma;
  let y = deltaBeta;

  if (angle === 90) {
    x = -deltaBeta;
    y = deltaGamma;
  } else if (angle === 270) {
    x = deltaBeta;
    y = -deltaGamma;
  } else if (angle === 180) {
    x = -deltaGamma;
    y = -deltaBeta;
  }

  return {
    x: clampMotionValue((x / LOGIN_ORIENTATION_MAX_TILT) * LOGIN_ORIENTATION_X_BOOST),
    y: clampMotionValue((y / LOGIN_ORIENTATION_MAX_TILT) * LOGIN_ORIENTATION_Y_BOOST),
  };
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

    const setMotionTarget = (target: LoginMotionPoint) => {
      targetRef.current = target;
      ensureFrame();
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateTarget(event.clientX, event.clientY);
    };

    const handleMouseMove = (event: MouseEvent) => {
      updateTarget(event.clientX, event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (orientationState.hasOrientationInput) return;
      const touch = event.touches[0];
      if (!touch) return;
      updateTarget(touch.clientX, touch.clientY);
    };

    const handlePointerLeave = () => {
      targetRef.current = { x: 0, y: 0 };
      ensureFrame();
    };

    const isMobileMotion = isTouchOrCoarsePointer();
    const supportsDeviceOrientation = "DeviceOrientationEvent" in window;
    const OrientationEvent = window.DeviceOrientationEvent as DeviceOrientationEventWithPermission;
    const requestOrientationPermission = OrientationEvent?.requestPermission;
    const needsOrientationPermission = typeof requestOrientationPermission === "function";
    const orientationState = {
      listening: false,
      hasOrientationInput: false,
      permissionRequested: false,
      baseline: null as OrientationBaseline | null,
    };

    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      if (!orientationState.baseline) {
        orientationState.baseline = { beta: event.beta, gamma: event.gamma };
      }
      const motion = motionFromDeviceOrientation(event, orientationState.baseline);
      if (!motion) return;
      orientationState.hasOrientationInput = true;
      setMotionTarget(motion);
    };

    const startOrientationTracking = () => {
      if (!isMobileMotion || !supportsDeviceOrientation || orientationState.listening) return;
      orientationState.listening = true;
      window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true });
    };

    const requestOrientationAccess = () => {
      if (!isMobileMotion || !supportsDeviceOrientation || orientationState.permissionRequested) return;
      orientationState.permissionRequested = true;
      if (!needsOrientationPermission) {
        startOrientationTracking();
        return;
      }
      requestOrientationPermission()
        .then((permission) => {
          if (permission === "granted") startOrientationTracking();
        })
        .catch(() => {
          orientationState.hasOrientationInput = false;
        });
    };

    const supportsPointerEvent = "PointerEvent" in window;
    if (isMobileMotion) {
      if (!needsOrientationPermission) startOrientationTracking();
      LOGIN_ORIENTATION_ACTIVATION_EVENTS.forEach((eventName) => {
        window.addEventListener(eventName, requestOrientationAccess, { passive: true });
      });
      window.addEventListener("touchmove", handleTouchMove, { passive: true });
    } else if (supportsPointerEvent) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
    } else {
      window.addEventListener("mousemove", handleMouseMove, { passive: true });
    }
    document.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("deviceorientation", handleDeviceOrientation);
      if (isMobileMotion) {
        LOGIN_ORIENTATION_ACTIVATION_EVENTS.forEach((eventName) => {
          window.removeEventListener(eventName, requestOrientationAccess);
        });
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
              "radial-gradient(circle at 50% 43%, rgba(255,255,255,0.18), rgba(255,255,255,0.04) 28%, transparent 42%), linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.18))",
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
              className={`absolute rounded-full blur-3xl will-change-transform motion-reduce:transition-none ${blob.sizeClass}`}
              style={{
                background: blobColors[index % blobColors.length],
                transform: motionBlobTransform(blob, { x: 0, y: 0 }),
              }}
            />
          </div>
        ))}
      </div>
      <div
        className="absolute inset-x-0 top-0 h-[12svh] md:hidden"
        style={{ background: `linear-gradient(to bottom, ${LOGIN_VIEWPORT_BACKGROUND} 0%, rgba(247,241,234,0.58) 42%, rgba(247,241,234,0) 100%)` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[12svh] md:hidden"
        style={{ background: `linear-gradient(to top, ${LOGIN_VIEWPORT_BACKGROUND} 0%, rgba(247,241,234,0.58) 42%, rgba(247,241,234,0) 100%)` }}
      />
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
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

  const i18n = {
    "zh-CN": {
      title: "OMS Platform",
      welcome: "欢迎回来",
      subtitle: "运维智管",
      pleaseLogin: "请登录您的账户",
      username: "邮箱或别名",
      password: "密码",
      remember: "记住邮箱/别名",
      login: "登录",
      loggingIn: "登录中…",
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
      copyrightNotice: "© 2026 敦阳（宁波）科技有限公司",
      icpNotice: "浙ICP备2026045692号",
      licenseLine: "OMS Platform 已开源发布，遵循 GPL-3.0 许可证",
    },
    "zh-TW": {
      title: "OMS Platform",
      welcome: "歡迎回來",
      subtitle: "運維智管",
      pleaseLogin: "請登錄您的賬戶",
      username: "信箱或別名",
      password: "密碼",
      remember: "記住信箱/別名",
      login: "登錄",
      loggingIn: "登錄中…",
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

  const enterWorkspace = (workspaceKey: string, home = "") => {
    const localTarget = goToWorkspace(workspaceKey, home);
    if (localTarget) navigate(localTarget, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError(t.errorEmpty);
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
      const workspaces = result.availableWorkspaces || result.user?.availableWorkspaces || [];
      const requestedWorkspace = searchParams.get("workspace") || "";
      const explicitWorkspace = workspaces.find((workspace) => workspace.key === requestedWorkspace);

      if (explicitWorkspace) {
        enterWorkspace(explicitWorkspace.key, explicitWorkspace.home || "");
        return;
      }

      if (workspaces.length === 1) {
        enterWorkspace(workspaces[0].key, workspaces[0].home || "");
        return;
      }

      if (workspaces.length > 1) {
        setWorkspaceChoices(workspaces);
        return;
      }

      setError(t.errorAuth);
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
      className="fixed inset-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4"
      style={{
        backgroundColor: LOGIN_VIEWPORT_BACKGROUND,
        colorScheme: "light",
        minHeight: "100dvh",
        overscrollBehavior: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <LoginMotionBackground />

      <div className="absolute top-4 right-4 z-20 sm:top-6 sm:right-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-full border bg-white/80 px-3.5 shadow-md backdrop-blur-sm transition-all duration-300 hover:bg-white hover:shadow-lg"
              style={{ borderColor: "rgba(88, 43, 139, 0.2)" }}
            >
              <Globe className="h-4 w-4" style={{ color: "#582B8B" }} />
              <span className="text-sm font-medium text-gray-700">{t.langLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="mt-2 min-w-[120px] rounded-xl">
            <DropdownMenuItem
              onClick={() => setLang("zh-CN")}
              className={`cursor-pointer ${lang === "zh-CN" ? "bg-purple-50 font-bold text-[#582B8B]" : ""}`}
            >
              {t.langOptionCn}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setLang("zh-TW")}
              className={`cursor-pointer ${lang === "zh-TW" ? "bg-purple-50 font-bold text-[#582B8B]" : ""}`}
            >
              {t.langOptionTw}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative z-10 flex min-h-full items-center justify-center py-16 pb-28 sm:py-20">
        <div className="w-full max-w-sm">
          <div className="rounded-3xl border border-white/20 bg-white/80 p-6 shadow-2xl backdrop-blur-xl sm:p-7">
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
              <h1 className="mb-1.5 text-2xl font-bold" style={{ color: "#582B8B" }}>
                {t.title}
              </h1>
              <p className="text-sm text-gray-500">{t.subtitle}</p>
              <p className="mt-1 text-xs text-gray-400">{t.pleaseLogin}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-[10px] border border-red-100 bg-red-50 p-3 text-center text-sm font-medium text-red-600">
                  {error}
                </div>
              )}

              <div>
                <Label htmlFor="username" className="sr-only">
                  {t.username}
                </Label>
                <Input
                  id="username"
                  placeholder={t.usernamePlaceholder || t.username}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="h-11 rounded-[10px] border-[1.5px] border-gray-200 bg-gray-50/80 px-3.5 shadow-none transition-all placeholder:text-gray-400 hover:border-[#582B8B] focus-visible:border-[#582B8B] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#582B8B]/20"
                />
              </div>

              <div>
                <Label htmlFor="password" className="sr-only">
                  {t.password}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t.passwordPlaceholder || t.password}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-11 rounded-[10px] border-[1.5px] border-gray-200 bg-gray-50/80 px-3.5 pr-11 shadow-none transition-all placeholder:text-gray-400 hover:border-[#582B8B] focus-visible:border-[#582B8B] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#582B8B]/20"
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-purple-50 hover:text-[#582B8B]"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center text-sm">
                <label className="group flex cursor-pointer items-center">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                    className="h-4 w-4 rounded border-gray-300 data-[state=checked]:border-[#582B8B] data-[state=checked]:bg-[#582B8B]"
                  />
                  <span className="ml-2 text-gray-600 transition-colors group-hover:text-[#582B8B]">{t.remember}</span>
                </label>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-[10px] bg-[#582B8B] text-base font-semibold text-white shadow-[0_4px_14px_rgba(88,43,139,0.4)] transition-all hover:bg-[#4A2472] hover:shadow-[0_6px_20px_rgba(88,43,139,0.5)] active:scale-[0.98]"
              >
                {loading ? t.loggingIn : t.login}
              </Button>
            </form>

            {workspaceChoices.length > 0 && (
              <div className="mt-4 space-y-2.5">
                <p className="text-center text-sm font-medium text-gray-500">{t.chooseWorkspace}</p>
                <div className="grid gap-2">
                  {workspaceChoices.map((workspace) => (
                    <Button
                      key={workspace.key}
                      type="button"
                      variant="outline"
                      className="h-11 justify-between rounded-[10px] border-purple-100 bg-white/70 hover:border-[#582B8B] hover:bg-purple-50"
                      onClick={() => enterWorkspace(workspace.key, workspace.home || "")}
                    >
                      <span>{workspaceLabel(workspace.key, workspace.label)}</span>
                      <span className="text-xs text-gray-500">{t.enterWorkspace}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-center gap-2 border-t border-white/60 pt-4">
              <span className="text-xs font-bold uppercase text-gray-400">{t.version}</span>
              <Badge variant="outline" className="h-4 border-gray-300 px-1.5 py-0 font-mono text-xs opacity-50">
                {appVersion}
              </Badge>
            </div>
          </div>

        </div>
      </div>

      <div className="fixed bottom-3 left-1/2 z-20 w-full -translate-x-1/2 px-4 text-center text-xs leading-relaxed sm:bottom-4">
        <p className="text-gray-600">
          {t.copyrightNotice}
          <span className="mx-1.5 text-gray-300">│</span>
          <a className="text-gray-600 underline-offset-2 hover:text-gray-600 hover:underline" href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
            {t.icpNotice}
          </a>
        </p>
        <p className="text-gray-600">
          {t.licenseLine}
          <span className="mx-1 text-sm text-red-500">❤</span>
          <a className="text-gray-600 underline-offset-2 hover:text-gray-600 hover:underline" href="https://github.com/rickyxu83/OMS-Platform" rel="noreferrer" target="_blank">
            github.com/rickyxu83/OMS-Platform
          </a>
        </p>
      </div>
    </div>
  );
}
