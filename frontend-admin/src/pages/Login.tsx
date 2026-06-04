import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Languages, Globe } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"zh-CN" | "zh-TW">("zh-CN");
  const [loading, setLoading] = useState(false);

  const i18n = {
    "zh-CN": {
      title: "运维管理系统",
      welcome: "欢迎回来",
      username: "账号",
      password: "密码",
      remember: "记住账号",
      login: "登录",
      errorEmpty: "请输入账号和密码",
      errorNotFound: "账号不存在",
      errorPassword: "密码错误",
      errorAuth: "您的账号无权访问管理端",
      demoTitle: "测试账号",
      version: "系统版本",
    },
    "zh-TW": {
      title: "運維管理系統",
      welcome: "歡迎回來",
      username: "帳號",
      password: "密碼",
      remember: "記住帳號",
      login: "登錄",
      errorEmpty: "請輸入帳號和密碼",
      errorNotFound: "帳號不存在",
      errorPassword: "密碼錯誤",
      errorAuth: "您的帳號無權訪問管理端",
      demoTitle: "測試帳號",
      version: "系統版本",
    },
  };

  const t = i18n[lang];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError(t.errorEmpty);
      return;
    }

    setLoading(true);
    try {
      await login(username, password, rememberMe);
      if (rememberMe) {
        localStorage.setItem("remembered_username", username);
      }
      navigate("/dashboard");
    } catch (err: any) {
      const msg = String(err?.message || "")
      if (msg.includes("账号不存在") || msg.includes("User not found")) setError(t.errorNotFound)
      else if (msg.includes("密码") || msg.includes("password")) setError(t.errorPassword)
      else if (msg.includes("无权") || msg.includes("权限") || msg.includes("forbidden")) setError(t.errorAuth)
      else setError(msg || "登录失败")
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] relative overflow-hidden p-4">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-[20%] h-[20%] bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Language Switcher Fixed at Top Right */}
      <div className="absolute top-8 right-8 z-50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 bg-white/50 backdrop-blur-md border-slate-200/60 shadow-sm hover:bg-white transition-all rounded-full px-4 h-9">
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-slate-600">
                {lang === "zh-CN" ? "简体中文" : "繁體中文"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl mt-2 min-w-[120px]">
            <DropdownMenuItem 
              onClick={() => setLang("zh-CN")}
              className={`cursor-pointer ${lang === "zh-CN" ? "bg-primary/10 text-primary font-bold" : ""}`}
            >
              简体中文
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setLang("zh-TW")}
              className={`cursor-pointer ${lang === "zh-TW" ? "bg-primary/10 text-primary font-bold" : ""}`}
            >
              繁體中文
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Login Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl shadow-purple-500/10 border border-white/50 p-10">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 mb-6 shadow-xl shadow-primary/20 rotate-3 hover:rotate-0 transition-transform duration-300">
              <LayoutDashboard className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent">
              {t.title}
            </h1>
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest opacity-70">
              {t.welcome}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium text-center animate-shake">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                {t.username}
              </Label>
              <Input
                id="username"
                placeholder={lang === "zh-CN" ? "请输入账号" : "請輸入帳號"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="h-12 rounded-xl bg-slate-50/50 border-slate-200/60 focus:bg-white transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                {t.password}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={lang === "zh-CN" ? "请输入密码" : "請輸入密碼"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-12 rounded-xl bg-slate-50/50 border-slate-200/60 focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <Label
                  htmlFor="remember"
                  className="text-sm cursor-pointer font-medium text-slate-600"
                >
                  {t.remember}
                </Label>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all active:scale-[0.98]">
              {loading ? "登录中…" : t.login}
            </Button>
          </form>

          {/* Demo Info & Version */}
          <div className="mt-10 pt-8 border-t border-slate-100/80">
            <div className="flex flex-col items-center gap-6">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground bg-slate-50/50 p-3 rounded-xl w-full">
                <div className="col-span-2 text-center font-bold text-slate-400 mb-1 uppercase tracking-tighter">{t.demoTitle}</div>
                <div className="text-right font-medium">admin001:</div>
                <div className="font-mono">admin123</div>
                <div className="text-right font-medium">wang.supervisor:</div>
                <div className="font-mono">123456</div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.version}</span>
                <Badge variant="outline" className="text-[10px] h-4 py-0 px-1.5 font-mono opacity-50 border-slate-300">v2.4.8</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
