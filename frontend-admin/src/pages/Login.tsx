import { useState } from "react";
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
      username: "账号",
      password: "密码",
      remember: "记住账号",
      login: "登录",
      loggingIn: "登录中…",
      chooseWorkspace: "请选择要进入的工作台",
      enterWorkspace: "进入",
      errorEmpty: "请输入账号和密码",
      errorNotFound: "账号不存在",
      errorPassword: "密码错误",
      errorAuth: "当前账号没有可用工作台",
      errorFallback: "登录失败",
      version: "系统版本",
      langLabel: "简体中文",
      langOptionCn: "简体中文",
      langOptionTw: "繁體中文",
      usernamePlaceholder: "请输入账号",
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
      username: "帳號",
      password: "密碼",
      remember: "記住帳號",
      login: "登錄",
      loggingIn: "登錄中…",
      chooseWorkspace: "請選擇要進入的工作臺",
      enterWorkspace: "進入",
      errorEmpty: "請輸入帳號和密碼",
      errorNotFound: "帳號不存在",
      errorPassword: "密碼錯誤",
      errorAuth: "目前帳號沒有可用工作臺",
      errorFallback: "登錄失敗",
      version: "系統版本",
      langLabel: "繁體中文",
      langOptionCn: "简体中文",
      langOptionTw: "繁體中文",
      usernamePlaceholder: "請輸入帳號",
      passwordPlaceholder: "請輸入密碼",
      copyrightNotice: "© 2026 敦陽（寧波）科技有限公司",
      icpNotice: "浙ICP备2026045692号",
      licenseLine: "OMS Platform 已開源發布，遵循 GPL-3.0 授權條款",
    },
  };

  const t = i18n[lang];
  const appVersion = APP_VERSION;
  const logoSrc = `${import.meta.env.BASE_URL}dunyang-mark.png`;

  const enterWorkspace = (workspaceKey: string) => {
    const localTarget = goToWorkspace(workspaceKey);
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
        enterWorkspace(explicitWorkspace.key);
        return;
      }

      if (workspaces.length === 1) {
        enterWorkspace(workspaces[0].key);
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
      className="fixed inset-0 overflow-hidden p-3 sm:p-4"
      style={{ background: "linear-gradient(to bottom right, #fef3f2, #fef9c3, #f0f9ff)", overscrollBehavior: "none" }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[10%] h-[500px] w-[500px] rounded-full bg-orange-400/25 blur-3xl" />
        <div className="absolute top-[20%] right-[-10%] h-[400px] w-[400px] rounded-full bg-pink-500/20 blur-3xl" />
        <div className="absolute bottom-[-15%] left-[-10%] h-[550px] w-[550px] rounded-full bg-blue-500/25 blur-3xl" />
        <div className="absolute bottom-[10%] right-[20%] h-[350px] w-[350px] rounded-full bg-yellow-400/25 blur-3xl" />
        <div className="absolute top-[40%] left-[10%] h-[450px] w-[450px] rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute top-[10%] left-[30%] h-[300px] w-[300px] rounded-full bg-purple-500/20 blur-3xl" />
        <div className="absolute bottom-[30%] right-[40%] h-[380px] w-[380px] rounded-full bg-rose-400/20 blur-3xl" />
      </div>

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

      <div className="relative z-10 flex h-full items-center justify-center pb-20">
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
                      onClick={() => enterWorkspace(workspace.key)}
                    >
                      <span>{workspaceLabel(workspace.key, workspace.label)}</span>
                      <span className="text-xs text-gray-500">{t.enterWorkspace}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-center gap-2 border-t border-white/60 pt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t.version}</span>
              <Badge variant="outline" className="h-4 border-gray-300 px-1.5 py-0 font-mono text-[10px] opacity-50">
                {appVersion}
              </Badge>
            </div>
          </div>

        </div>
      </div>

      <div className="fixed bottom-3 left-1/2 z-20 w-full -translate-x-1/2 px-4 text-center text-[11px] leading-relaxed tracking-wider sm:bottom-4">
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
