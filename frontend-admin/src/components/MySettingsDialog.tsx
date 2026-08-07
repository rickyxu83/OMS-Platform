import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, KeyRound, LogOut, Save, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SignatureCapture } from "@/components/SignatureCapture";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { getPreferredWorkspace, setPreferredWorkspace, workspaceLabel } from "@/config/app";
import { toast } from "sonner";

const passwordRules = [
  { label: "至少 8 位", test: (value: string) => value.length >= 8 },
  { label: "小写字母", test: (value: string) => /[a-z]/.test(value) },
  { label: "大写字母", test: (value: string) => /[A-Z]/.test(value) },
  { label: "数字", test: (value: string) => /\d/.test(value) },
  { label: "特殊符号", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

function displayName(user: Record<string, any> | null | undefined) {
  return String(user?.realName || user?.name || user?.username || "用户");
}

function userInitial(user: Record<string, any> | null | undefined) {
  return displayName(user).trim().slice(0, 1).toUpperCase() || "U";
}

export function UserAvatar({ user, className = "h-9 w-9", textClassName = "text-sm" }: {
  user: Record<string, any> | null | undefined;
  className?: string;
  textClassName?: string;
}) {
  const name = displayName(user);
  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 text-primary shadow-sm`}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className={`font-semibold ${textClassName}`}>{userInitial(user)}</span>
      )}
    </span>
  );
}

function passwordComplex(value: string) {
  return passwordRules.every((rule) => rule.test(value));
}

export function MySettingsDialog({ open, onOpenChange, roleLabel }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleLabel: string;
}) {
  const { user, logout, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loginAlias, setLoginAlias] = useState("");
  const [preferredWorkspace, setPreferredWorkspaceState] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [engineerSignature, setEngineerSignature] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);

  const workspaces = useMemo(() => (
    Array.isArray(user?.availableWorkspaces) ? user.availableWorkspaces : []
  ), [user?.availableWorkspaces]);
  const canMaintainEngineerSignature = Boolean(user);
  const passwordRuleState = passwordRules.map((rule) => ({ ...rule, passed: rule.test(newPassword) }));

  useEffect(() => {
    if (!open) return;
    setLoginAlias(String(user?.loginAlias || ""));
    setPreferredWorkspaceState(getPreferredWorkspace(user?.id) || user?.defaultWorkspace || workspaces[0]?.key || "");
    refreshUser().catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoginAlias(String(user?.loginAlias || ""));
    setEngineerSignature(String(user?.engineerSignature || ""));
  }, [open, user?.loginAlias, user?.engineerSignature]);

  async function saveProfile() {
    const normalizedAlias = loginAlias.trim();
    if (normalizedAlias && normalizedAlias.includes("@")) {
      toast.error("登录别名不能使用邮箱格式");
      return;
    }
    if (normalizedAlias && !/^[A-Za-z0-9._-]{2,32}$/.test(normalizedAlias)) {
      toast.error("登录别名仅支持 2-32 位字母、数字、点、下划线或短横线");
      return;
    }

    setSavingProfile(true);
    try {
      await api.put("/users/me", { loginAlias: normalizedAlias || null });
      setPreferredWorkspace(user?.id, preferredWorkspace);
      await refreshUser();
      toast.success("我的设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("请填写当前密码、新密码和确认密码");
      return;
    }
    if (!passwordComplex(newPassword)) {
      toast.error("新密码至少 8 位，且需要包含大小写字母、数字和特殊符号");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }

    setSavingPassword(true);
    try {
      await api.put("/users/me", { currentPassword, newPassword });
      toast.success("密码已修改，请重新登录");
      setTimeout(() => {
        logout();
        window.location.replace(`${import.meta.env.BASE_URL}login`);
      }, 900);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setSavingPassword(false);
    }
  }

  async function uploadAvatar(file: File | null | undefined) {
    if (!file) return;
    const formData = new FormData();
    formData.append("avatar", file);
    setSavingAvatar(true);
    try {
      await api.postForm("/users/me/avatar", formData);
      await refreshUser();
      toast.success("头像已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "头像上传失败");
    } finally {
      setSavingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeAvatar() {
    setSavingAvatar(true);
    try {
      await api.delete("/users/me/avatar");
      await refreshUser();
      toast.success("头像已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "头像删除失败");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function saveEngineerSignature() {
    setSavingSignature(true);
    try {
      await api.put("/users/me", { engineerSignature });
      await refreshUser();
      toast.success(engineerSignature ? "签名已保存" : "签名已清除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "签名保存失败");
    } finally {
      setSavingSignature(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            我的设置
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-0 md:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b bg-slate-50/70 p-5 md:border-b-0 md:border-r">
            <div className="flex items-center gap-3 md:block md:text-center">
              <UserAvatar user={user} className="h-16 w-16" textClassName="text-2xl" />
              <div className="min-w-0 md:mt-3">
                <div className="truncate text-base font-semibold">{displayName(user)}</div>
                <div className="mt-1 text-sm text-muted-foreground">{roleLabel || user?.role || "-"}</div>
                <div className="mt-2 flex flex-wrap gap-1 md:justify-center">
                  <Badge variant={user?.status === "active" ? "success" : "outline"}>
                    {user?.status === "active" ? "启用" : user?.status || "未知"}
                  </Badge>
                  {user?.loginAlias ? <Badge variant="outline">别名登录</Badge> : null}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => uploadAvatar(event.target.files?.[0])}
              />
              <Button variant="outline" className="justify-center gap-2" onClick={() => fileInputRef.current?.click()} disabled={savingAvatar}>
                <Camera className="h-4 w-4" />
                {savingAvatar ? "处理中..." : "上传头像"}
              </Button>
              {user?.hasAvatar ? (
                <Button variant="ghost" className="justify-center gap-2 text-destructive hover:text-destructive" onClick={removeAvatar} disabled={savingAvatar}>
                  <Trash2 className="h-4 w-4" />
                  删除头像
                </Button>
              ) : null}
            </div>
          </aside>

          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto p-5">
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">个人资料</h3>
                <p className="text-xs text-muted-foreground">姓名和角色由管理员维护。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>姓名</Label>
                  <Input value={displayName(user)} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>邮箱账号</Label>
                  <Input value={String(user?.email || user?.username || "")} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>手机号</Label>
                  <Input value={String(user?.phone || "")} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>最近登录</Label>
                  <Input value={String(user?.lastLoginAt || "-")} disabled />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>登录别名</Label>
                  <Input
                    value={loginAlias}
                    onChange={(event) => setLoginAlias(event.target.value)}
                    placeholder="2-32 位字母/数字/._-"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>默认工作区</Label>
                  <Select value={preferredWorkspace} onValueChange={setPreferredWorkspaceState} disabled={workspaces.length <= 1}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择默认入口" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((workspace: { key: string; label?: string }) => (
                        <SelectItem key={workspace.key} value={workspace.key}>
                          {workspaceLabel(workspace.key, workspace.label || "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={savingProfile}>
                  <Save className="h-4 w-4" />
                  {savingProfile ? "保存中..." : "保存资料"}
                </Button>
              </div>
            </section>

            {canMaintainEngineerSignature ? (
              <>
                <Separator className="my-5" />
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">手写签名</h3>
                      <p className="text-xs text-muted-foreground">用于系统中需要本人签署的记录，可在此手写、更新或清除。</p>
                    </div>
                    {engineerSignature ? (
                      <Badge variant="success"><CheckCircle2 className="h-3 w-3" />已填写</Badge>
                    ) : (
                      <Badge variant="warning">未维护</Badge>
                    )}
                  </div>
                  <SignatureCapture value={engineerSignature} onChange={setEngineerSignature} />
                  <div className="flex justify-end">
                    <Button onClick={saveEngineerSignature} disabled={savingSignature}>
                      <Save className="h-4 w-4" />
                      {savingSignature ? "保存中..." : "保存签名"}
                    </Button>
                  </div>
                </section>
              </>
            ) : null}

            <Separator className="my-5" />

            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">修改密码</h3>
                <p className="text-xs text-muted-foreground">修改成功后需要重新登录。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>当前密码</Label>
                  <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>新密码</Label>
                  <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>确认新密码</Label>
                  <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {passwordRuleState.map((rule) => (
                  <Badge key={rule.label} variant={rule.passed ? "success" : "outline"}>
                    {rule.label}
                  </Badge>
                ))}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={savePassword} disabled={savingPassword}>
                  <KeyRound className="h-4 w-4" />
                  {savingPassword ? "修改中..." : "修改密码"}
                </Button>
              </div>
            </section>

            <Separator className="my-5" />

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">账号备注</h3>
              <Textarea value={`角色：${roleLabel || user?.role || "-"}\n权限由管理员在“成员与角色”中维护。`} readOnly className="min-h-[76px] bg-slate-50 text-sm" />
              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => {
                  logout();
                  window.location.replace(`${import.meta.env.BASE_URL}login`);
                }}>
                  <LogOut className="h-4 w-4" />
                  退出登录
                </Button>
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
