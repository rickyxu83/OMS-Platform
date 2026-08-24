import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, CheckCircle2, Copy, Fingerprint, KeyRound, Link2, Loader2, LogOut, Pencil, QrCode, Save, Settings, Trash2, X } from "lucide-react";
import QRCode from "qrcode";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SignatureCapture } from "@/components/SignatureCapture";
import { SHOW_MR_ATTENDANCE } from "@/lib/feature-flags";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { getPreferredWorkspace, setPreferredWorkspace, workspaceLabel } from "@/config/app";
import { formatDateTime } from "@/lib/format";
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
  const [signatureLinkOpen, setSignatureLinkOpen] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [signatureLink, setSignatureLink] = useState("");
  const [signatureLinkExpiresAt, setSignatureLinkExpiresAt] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [assistants, setAssistants] = useState<Array<{ id: string | number; realName?: string; username?: string; email?: string }>>([]);
  const [assistantUserId, setAssistantUserId] = useState("");
  // 通行密钥（002-login-security）：列表/登记/改名/删除
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeys, setPasskeys] = useState<Array<{ id: number; deviceName: string; createdAt?: string; lastUsedAt?: string | null }>>([]);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [renamingPasskeyId, setRenamingPasskeyId] = useState<number | null>(null);
  const [passkeyRenameValue, setPasskeyRenameValue] = useState("");
  const [confirmDeletePasskeyId, setConfirmDeletePasskeyId] = useState<number | null>(null);

  const workspaces = useMemo(() => (
    Array.isArray(user?.availableWorkspaces) ? user.availableWorkspaces : []
  ), [user?.availableWorkspaces]);
  const canMaintainEngineerSignature = Boolean(user);
  const canSetAssistant = ["sales", "sales_supervisor"].includes(String(user?.role || ""));
  const passwordRuleState = passwordRules.map((rule) => ({ ...rule, passed: rule.test(newPassword) }));

  useEffect(() => {
    if (!open) return;
    setLoginAlias(String(user?.loginAlias || ""));
    setPreferredWorkspaceState(getPreferredWorkspace(user?.id) || user?.defaultWorkspace || workspaces[0]?.key || "");
    refreshUser().catch(() => {});
    api.get("/users/me").then((data) => setEngineerSignature(String(data?.user?.engineerSignature || ""))).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !canSetAssistant) return;
    let active = true;
    Promise.all([api.get("/users/assistants"), api.get("/mr/assistant-setting")])
      .then(([directory, setting]) => {
        if (!active) return;
        setAssistants(Array.isArray(directory?.items) ? directory.items : []);
        setAssistantUserId(setting?.assistantUserId ? String(setting.assistantUserId) : "");
      })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "助理设置加载失败"); });
    return () => { active = false; };
  }, [open, canSetAssistant]);

  useEffect(() => {
    if (!open) return;
    setLoginAlias(String(user?.loginAlias || ""));
  }, [open, user?.loginAlias]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const supported = typeof window !== "undefined"
          && window.isSecureContext
          && typeof window.PublicKeyCredential !== "undefined";
        if (!supported) return;
        const methods = await api.get("/auth/login-methods");
        if (!active || !methods?.passkey) return;
        setPasskeySupported(true);
        const data = await api.get("/auth/webauthn/credentials");
        if (active) setPasskeys(Array.isArray(data?.items) ? data.items : []);
      } catch { /* 探测或加载失败：入口隐藏 */ }
    })();
    return () => { active = false; };
  }, [open]);

  async function reloadPasskeys() {
    try {
      const data = await api.get("/auth/webauthn/credentials");
      setPasskeys(Array.isArray(data?.items) ? data.items : []);
    } catch { /* 静默 */ }
  }

  async function registerThisDevice() {
    setPasskeyBusy(true);
    try {
      const options = await api.post("/auth/webauthn/register/options", {});
      const response = await startRegistration({ optionsJSON: options.publicKey });
      await api.post("/auth/webauthn/register/verify", { challengeToken: options.challengeToken, response });
      toast.success("通行密钥已登记，下次登录可直接刷脸/按指纹");
      await reloadPasskeys();
    } catch (error: any) {
      if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
        toast.error("已取消登记");
      } else {
        toast.error(error instanceof Error ? error.message : "登记失败");
      }
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function savePasskeyRename(id: number) {
    const deviceName = passkeyRenameValue.trim();
    if (!deviceName) return;
    setPasskeyBusy(true);
    try {
      await api.patch(`/auth/webauthn/credentials/${id}`, { deviceName });
      setRenamingPasskeyId(null);
      await reloadPasskeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "改名失败");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function deletePasskey(id: number) {
    setPasskeyBusy(true);
    try {
      await api.delete(`/auth/webauthn/credentials/${id}`);
      setConfirmDeletePasskeyId(null);
      toast.success("已删除，该设备的通行密钥即刻失效");
      await reloadPasskeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setPasskeyBusy(false);
    }
  }

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
    if (canSetAssistant && !assistantUserId) {
      toast.error("请选择对应助理");
      return;
    }

    setSavingProfile(true);
    try {
      await api.put("/users/me", { loginAlias: normalizedAlias || null });
      if (canSetAssistant) await api.put("/mr/assistant-setting", { assistantUserId });
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

  // 外层设置弹窗关闭时，一并关闭签名链接弹窗，避免孤儿弹窗残留
  useEffect(() => {
    if (!open) setSignatureLinkOpen(false);
  }, [open]);

  async function generateSignatureLink() {
    setGeneratingLink(true);
    try {
      // 管理端可能部署在子路径（如 /admin/），把完整 base path 传给后端拼链接
      const publicBaseUrl = new URL(String((import.meta as any).env.BASE_URL || "/"), window.location.origin).toString().replace(/\/+$/, "");
      const data = await api.post("/users/me/signature-links", { publicBaseUrl });
      const url = String(data?.url || "");
      if (!url) {
        toast.error("链接生成失败，请稍后再试");
        return;
      }
      setSignatureLink(url);
      setSignatureLinkExpiresAt(String(data?.expiresAt || ""));
      setSignatureLinkOpen(true);
      try {
        setQrDataUrl(await QRCode.toDataURL(url, { width: 200, margin: 1 }));
      } catch {
        setQrDataUrl("");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "链接生成失败");
    } finally {
      setGeneratingLink(false);
    }
  }

  async function copySignatureLink() {
    try {
      await navigator.clipboard.writeText(signatureLink);
      toast.success("链接已复制，去微信或短信发送吧");
    } catch {
      toast.error("复制失败，请长按手动复制");
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
              {canSetAssistant ? (
                <div className="space-y-1.5 rounded-lg border bg-amber-50/60 p-3">
                  <Label>MR 对应助理</Label>
                  <Select value={assistantUserId} onValueChange={setAssistantUserId}>
                    <SelectTrigger><SelectValue placeholder="请选择负责你的 MR 助理" /></SelectTrigger>
                    <SelectContent>
                      {assistants.map((assistant) => (
                        <SelectItem key={assistant.id} value={String(assistant.id)}>
                          {assistant.realName || assistant.username} · {assistant.email || "未配置邮箱"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">更换后，尚未完成助理会签的 MR 会立即转给新助理并重新发送邮件。</p>
                </div>
              ) : null}
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
                    <div className="flex shrink-0 items-center gap-2">
                      {engineerSignature ? (
                        <Badge variant="success"><CheckCircle2 className="h-3 w-3" />已填写</Badge>
                      ) : (
                        <Badge variant="warning">未维护</Badge>
                      )}
                      {SHOW_MR_ATTENDANCE ? (
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={generateSignatureLink} disabled={generatingLink}>
                          <QrCode className="h-4 w-4" />
                          {generatingLink ? "生成中..." : "手机签名"}
                        </Button>
                      ) : null}
                    </div>
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

            {passkeySupported ? (
              <>
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">通行密钥</h3>
                    <p className="text-xs text-muted-foreground">登记本设备后，登录页可直接使用 Face ID / Touch ID / 指纹 / 人脸验证，无需输密码。</p>
                  </div>
                  {passkeys.length ? (
                    <div className="space-y-2">
                      {passkeys.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 rounded-lg border bg-slate-50/60 px-3 py-2">
                          <Fingerprint className="h-4 w-4 shrink-0 text-primary" />
                          {renamingPasskeyId === item.id ? (
                            <>
                              <Input
                                value={passkeyRenameValue}
                                onChange={(event) => setPasskeyRenameValue(event.target.value)}
                                className="h-8 flex-1"
                                maxLength={64}
                                autoFocus
                              />
                              <Button size="sm" variant="outline" className="h-8 gap-1" disabled={passkeyBusy} onClick={() => savePasskeyRename(item.id)}>
                                <Check className="h-3.5 w-3.5" /> 保存
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8" disabled={passkeyBusy} onClick={() => setRenamingPasskeyId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{item.deviceName}</div>
                                <div className="text-xs text-muted-foreground">
                                  登记于 {formatDateTime(item.createdAt) || "-"}
                                  {item.lastUsedAt ? ` · 最近登录 ${formatDateTime(item.lastUsedAt)}` : ""}
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" className="h-8 gap-1" disabled={passkeyBusy} onClick={() => { setRenamingPasskeyId(item.id); setPasskeyRenameValue(item.deviceName); }}>
                                <Pencil className="h-3.5 w-3.5" /> 改名
                              </Button>
                              {confirmDeletePasskeyId === item.id ? (
                                <>
                                  <Button size="sm" variant="destructive" className="h-8 gap-1" disabled={passkeyBusy} onClick={() => deletePasskey(item.id)}>
                                    确认删除
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-8" disabled={passkeyBusy} onClick={() => setConfirmDeletePasskeyId(null)}>
                                    取消
                                  </Button>
                                </>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-8 gap-1 text-destructive hover:text-destructive" disabled={passkeyBusy} onClick={() => setConfirmDeletePasskeyId(item.id)}>
                                  <Trash2 className="h-3.5 w-3.5" /> 删除
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">尚未登记任何设备。</p>
                  )}
                  <div className="flex justify-end">
                    <Button variant="outline" onClick={registerThisDevice} disabled={passkeyBusy}>
                      {passkeyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                      {passkeyBusy ? "登记中..." : "登记本设备"}
                    </Button>
                  </div>
                </section>

                <Separator className="my-5" />
              </>
            ) : null}

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

        <Dialog open={signatureLinkOpen} onOpenChange={setSignatureLinkOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                手机签名链接
              </DialogTitle>
              <DialogDescription>
                在手机上打开链接即可直接手写签名，无需登录。链接 1 小时内有效，生成新链接会作废之前的链接。
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input value={signatureLink} readOnly className="bg-slate-50 text-xs" />
              <Button variant="outline" className="shrink-0 gap-1.5" onClick={copySignatureLink}>
                <Copy className="h-4 w-4" />
                复制
              </Button>
            </div>
            {qrDataUrl ? (
              <div className="flex justify-center rounded-lg border bg-white p-3">
                <img src={qrDataUrl} alt="签名链接二维码" className="h-44 w-44" />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              微信扫一扫可直接打开；也可以复制链接后通过微信或短信发送。
              {signatureLinkExpiresAt ? <span>有效期至 {signatureLinkExpiresAt}。</span> : null}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setSignatureLinkOpen(false)}>完成</Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
