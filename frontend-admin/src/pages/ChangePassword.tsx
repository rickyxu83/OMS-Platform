import { useState } from "react";
import { LockKeyhole, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

function passwordComplex(value: string) {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

export function ChangePassword() {
  const { logout, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

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

    setSaving(true);
    try {
      await api.put("/users/me", { currentPassword, newPassword });
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
            <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>确认新密码</Label>
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
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
