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

const LOGIN_BACKGROUND_SHAPES = [
  { className: "top-[5%] left-[-35%] h-[150px] w-[125vw] rounded-[36px] border border-white/45 bg-orange-400/35 shadow-[0_28px_90px_rgba(251,146,60,0.20)]", moveX: 142, moveY: -34, rotate: -11, rotateMove: 8, scale: 1 },
  { className: "top-[21%] right-[-38%] h-[130px] w-[118vw] rounded-[34px] border border-white/40 bg-pink-500/30 shadow-[0_26px_84px_rgba(236,72,153,0.18)]", moveX: -126, moveY: 52, rotate: 13, rotateMove: -9, scale: 1.03 },
  { className: "top-[41%] left-[-42%] h-[160px] w-[132vw] rounded-[40px] border border-white/40 bg-sky-500/30 shadow-[0_30px_96px_rgba(14,165,233,0.18)]", moveX: 116, moveY: -62, rotate: 8, rotateMove: 7, scale: 1.02 },
  { className: "bottom-[20%] right-[-35%] h-[140px] w-[122vw] rounded-[36px] border border-white/45 bg-yellow-400/35 shadow-[0_28px_88px_rgba(250,204,21,0.20)]", moveX: -138, moveY: -48, rotate: -9, rotateMove: -7, scale: 1.01 },
  { className: "bottom-[4%] left-[-38%] h-[135px] w-[120vw] rounded-[34px] border border-white/40 bg-purple-500/28 shadow-[0_26px_84px_rgba(168,85,247,0.18)]", moveX: 154, moveY: 44, rotate: 15, rotateMove: 9, scale: 1.04 },
  { className: "top-[11%] left-[18%] h-[90px] w-[58vw] rounded-[28px] border border-white/50 bg-white/32 shadow-[0_20px_70px_rgba(88,43,139,0.12)]", moveX: -98, moveY: 76, rotate: -18, rotateMove: 12, scale: 1.02 },
];

function LoginMotionBackground() {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;

    const layer = layerRef.current;
    const shapeNodes = Array.from(layer?.querySelectorAll<HTMLElement>("[data-motion-shape]") || []);
    if (!layer || !shapeNodes.length) return;

    const stopIfSettled = () => {
      const target = targetRef.current;
      const current = currentRef.current;
      const settled = Math.abs(target.x - current.x) < 0.002
        && Math.abs(target.y - current.y) < 0.002;
      if (settled && rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const render = () => {
      const target = targetRef.current;
      const current = currentRef.current;
      current.x += (target.x - current.x) * 0.16;
      current.y += (target.y - current.y) * 0.16;

      shapeNodes.forEach((node, index) => {
        const config = LOGIN_BACKGROUND_SHAPES[index];
        if (!config) return;
        const rotation = config.rotate + current.x * config.rotateMove;
        node.style.transform = `translate3d(${(current.x * config.moveX).toFixed(2)}px, ${(current.y * config.moveY).toFixed(2)}px, 0) rotate(${rotation.toFixed(2)}deg) scale(${config.scale})`;
      });

      rafRef.current = window.requestAnimationFrame(render);
      stopIfSettled();
    };

    const ensureFrame = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      targetRef.current = {
        x: (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2,
        y: (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2,
      };
      ensureFrame();
    };

    const handlePointerLeave = () => {
      targetRef.current = { x: 0, y: 0 };
      ensureFrame();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={layerRef} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.30),transparent_28%,rgba(255,255,255,0.22)_62%,transparent)]" />
      {LOGIN_BACKGROUND_SHAPES.map((shape, index) => (
        <div
          key={index}
          data-motion-shape
          className={`absolute blur-sm transition-transform duration-500 ease-out motion-reduce:transition-none ${shape.className}`}
          style={{ transform: `translate3d(0, 0, 0) rotate(${shape.rotate}deg) scale(${shape.scale})` }}
        />
      ))}
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
      style={{ background: "linear-gradient(to bottom right, #fef3f2, #fef9c3, #f0f9ff)", overscrollBehavior: "none" }}
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
