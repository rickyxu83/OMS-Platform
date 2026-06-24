import { useState } from "react";
import { LockKeyhole, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

const passwordRules = [
  { label: "至少 8 位", test: (value: string) => value.length >= 8 },
  { label: "包含小写字母", test: (value: string) => /[a-z]/.test(value) },
  { label: "包含大写字母", test: (value: string) => /[A-Z]/.test(value) },
  { label: "包含数字", test: (value: string) => /\d/.test(value) },
  { label: "包含特殊符号", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

function passwordComplex(value: string) {
  return passwordRules.every((rule) => rule.test(value));
}

export function ChangePassword() {
  const { logout, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginAlias, setLoginAlias] = useState(String(user?.loginAlias || ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const passwordRuleState = passwordRules.map((rule) => ({ ...rule, passed: rule.test(newPassword) }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!passwordComplex(newPassword)) {
      setError("新密码至少 8 位，且需要包含大小写字母、数字和特殊符号");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    const normalizedAlias = loginAlias.trim();
    if (normalizedAlias && normalizedAlias.includes("@")) {
      setError("登录别名不能使用邮箱格式");
      return;
    }
    if (normalizedAlias && !/^[A-Za-z0-9._-]{2,32}$/.test(normalizedAlias)) {
      setError("登录别名仅支持 2-32 位字母、数字、点、下划线或短横线");
      return;
    }

    setSaving(true);
    try {
      await api.put("/users/me", { currentPassword, newPassword, loginAlias: normalizedAlias || null });
      setDone(true);
      window.setTimeout(() => logout(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "密码更新失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] px-4 py-10">
      <div className="mx-auto max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">修改初始密码</h1>
            <p className="text-sm text-muted-foreground">{user?.realName || user?.username || "当前账号"} 首次登录后必须设置新密码</p>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div> : null}
        {done ? <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">密码已更新，请重新登录。</div> : null}

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label>当前密码</Label>
            <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>新密码</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-describedby="password-policy"
              required
            />
            <div id="password-policy" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="mb-2 font-medium text-slate-700">密码要求</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {passwordRuleState.map((rule) => (
                  <span key={rule.label} className={rule.passed ? "text-emerald-700" : "text-slate-500"}>
                    {rule.passed ? "已满足" : "需满足"}：{rule.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>确认新密码</Label>
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>登录别名</Label>
            <Input
              value={loginAlias}
              onChange={(event) => setLoginAlias(event.target.value)}
              placeholder="可选，2-32 位字母/数字/._-"
            />
            <p className="text-xs text-muted-foreground">设置后可用别名或邮箱账号登录。</p>
          </div>
          <Button className="w-full" type="submit" disabled={saving || done}>
            <Save className="h-4 w-4" />
            {saving ? "保存中…" : "更新密码"}
          </Button>
        </form>
      </div>
    </div>
  );
}
