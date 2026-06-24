import { useEffect, useState } from "react";
import { Bell, Loader2, MapPinned, Pencil, Plus, RefreshCw, Save, Send, Trash2, WandSparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownContent } from "@/lib/markdown";
import { api } from "@/services/api";

interface SettingsForm {
  ai: {
    workSummaryEnabled: boolean;
    serviceDraftEnabled: boolean;
    provider: string;
    apiUrl: string;
    apiKey: string;
    model: string;
  };
  mail: {
    enabled: boolean;
    host: string;
    port: string;
    secure: boolean;
    from: string;
    user: string;
    password: string;
    assignNotifyEnabled: boolean;
  };
  notification: {
    maintenanceExpiryEnabled: boolean;
    maintenanceExpiryDays: string;
    maintenanceExpiryRecipients: string;
    inspectionReminderEnabled: boolean;
    inspectionReminderDays: string;
  };
  map: {
    amapRestKey: string;
    amapJsapiKey: string;
    amapSecurityJsCode: string;
  };
}

interface AnnouncementForm {
  title: string;
  contentMarkdown: string;
  kind: "info" | "warning" | "success";
  active: boolean;
  targetRoles: string[];
  startsAt: string;
  endsAt: string;
}

interface AnnouncementItem extends AnnouncementForm {
  id: number;
  createdAt?: string;
  updatedAt?: string;
}

const emptyForm: SettingsForm = {
  ai: {
    workSummaryEnabled: false,
    serviceDraftEnabled: false,
    provider: "custom",
    apiUrl: "",
    apiKey: "",
    model: "",
  },
  mail: {
    enabled: false,
    host: "",
    port: "465",
    secure: true,
    from: "",
    user: "",
    password: "",
    assignNotifyEnabled: false,
  },
  notification: {
    maintenanceExpiryEnabled: true,
    maintenanceExpiryDays: "30",
    maintenanceExpiryRecipients: "",
    inspectionReminderEnabled: true,
    inspectionReminderDays: "3",
  },
  map: {
    amapRestKey: "",
    amapJsapiKey: "",
    amapSecurityJsCode: "",
  },
};

const emptyAnnouncementForm: AnnouncementForm = {
  title: "",
  contentMarkdown: "",
  kind: "info",
  active: true,
  targetRoles: [],
  startsAt: "",
  endsAt: "",
};

const roleOptions = [
  ["admin", "管理员"],
  ["assistant", "助理"],
  ["dispatcher", "调度"],
  ["operations_director", "运营负责人"],
  ["engineering_supervisor", "工程主管"],
  ["administrative_supervisor", "行政主管"],
  ["sales_supervisor", "业务主管"],
  ["sales", "业务"],
  ["engineer", "工程师"],
];

const quickEmoji = ["📣", "⚠️", "✅", "🛠️", "📌", "📝", "🚀", "💡"];

function toBool(value: unknown) {
  return value === true || value === "true";
}

function toDateTimeInput(value?: string) {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
}

function formatDateTime(value?: string) {
  if (!value) return "长期";
  return String(value).replace("T", " ").slice(0, 16);
}

export function SystemSettings() {
  const [form, setForm] = useState<SettingsForm>(emptyForm);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(emptyAnnouncementForm);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [testRecipient, setTestRecipient] = useState("");

  async function loadAnnouncements() {
    const data = await api.get("/announcements");
    const items = Array.isArray(data?.items) ? data.items : [];
    setAnnouncements(items.map((item: any) => ({
      id: item.id,
      title: item.title || "",
      contentMarkdown: item.contentMarkdown || "",
      kind: item.kind || "info",
      active: Boolean(item.active),
      targetRoles: Array.isArray(item.targetRoles) ? item.targetRoles : [],
      startsAt: item.startsAt || "",
      endsAt: item.endsAt || "",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })));
  }

  async function load() {
    setLoading(true);
    setError("");
    setSaved("");
    try {
      const data = await api.get("/settings");
      const item = data?.item || {};
      const n = item.notification || {};
      setForm({
        ai: {
          workSummaryEnabled: toBool(item.ai?.workSummaryEnabled),
          serviceDraftEnabled: toBool(item.ai?.serviceDraftEnabled),
          provider: item.ai?.provider || "custom",
          apiUrl: item.ai?.apiUrl || "",
          apiKey: item.ai?.apiKey || "",
          model: item.ai?.model || "",
        },
        mail: {
          enabled: toBool(item.mail?.enabled),
          host: item.mail?.host || "",
          port: String(item.mail?.port || "465"),
          secure: toBool(item.mail?.secure ?? true),
          from: item.mail?.from || "",
          user: item.mail?.user || "",
          password: item.mail?.password || "",
          assignNotifyEnabled: toBool(item.mail?.assignNotifyEnabled),
        },
        notification: {
          maintenanceExpiryEnabled: toBool(n.maintenanceExpiryEnabled ?? true),
          maintenanceExpiryDays: String(n.maintenanceExpiryDays || "30"),
          maintenanceExpiryRecipients: n.maintenanceExpiryRecipients || "",
          inspectionReminderEnabled: toBool(n.inspectionReminderEnabled ?? true),
          inspectionReminderDays: String(n.inspectionReminderDays || "3"),
        },
        map: {
          amapRestKey: item.map?.amapRestKey || "",
          amapJsapiKey: item.map?.amapJsapiKey || "",
          amapSecurityJsCode: item.map?.amapSecurityJsCode || "",
        },
      });
      await loadAnnouncements();
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      await api.put("/settings", {
        ai: {
          ...form.ai,
          workSummaryEnabled: form.ai.workSummaryEnabled,
          serviceDraftEnabled: form.ai.serviceDraftEnabled,
        },
        mail: {
          ...form.mail,
          enabled: form.mail.enabled,
          secure: form.mail.secure,
          assignNotifyEnabled: form.mail.assignNotifyEnabled,
        },
        notification: form.notification,
        map: form.map,
      });
      setSaved("设置已保存");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存设置失败");
    } finally {
      setSaving(false);
    }
  }

  async function testAi() {
    setTestingAi(true);
    setError("");
    setSaved("");
    try {
      const data = await api.post("/settings/test-ai", { ai: form.ai });
      setSaved(data?.message || "AI 连接测试成功");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 连接测试失败");
    } finally {
      setTestingAi(false);
    }
  }

  async function testMail() {
    setTestingMail(true);
    setError("");
    setSaved("");
    try {
      const data = await api.post("/settings/test-mail", { mail: form.mail, to: testRecipient.trim() || undefined });
      setSaved(data?.message || "SMTP 测试邮件已发送");
    } catch (e) {
      setError(e instanceof Error ? e.message : "SMTP 测试失败");
    } finally {
      setTestingMail(false);
    }
  }

  function resetAnnouncementForm() {
    setAnnouncementForm(emptyAnnouncementForm);
    setEditingAnnouncementId(null);
  }

  function toggleAnnouncementRole(role: string, checked: boolean | "indeterminate") {
    setAnnouncementForm((current) => {
      const roles = new Set(current.targetRoles);
      if (checked === true) roles.add(role);
      else roles.delete(role);
      return { ...current, targetRoles: Array.from(roles) };
    });
  }

  function insertEmoji(emoji: string) {
    setAnnouncementForm((current) => ({
      ...current,
      contentMarkdown: `${current.contentMarkdown}${current.contentMarkdown ? " " : ""}${emoji} `,
    }));
  }

  function editAnnouncement(item: AnnouncementItem) {
    setEditingAnnouncementId(item.id);
    setAnnouncementForm({
      title: item.title,
      contentMarkdown: item.contentMarkdown,
      kind: item.kind,
      active: item.active,
      targetRoles: item.targetRoles || [],
      startsAt: toDateTimeInput(item.startsAt),
      endsAt: toDateTimeInput(item.endsAt),
    });
  }

  async function saveAnnouncement() {
    setAnnouncementSaving(true);
    setError("");
    setSaved("");
    try {
      const payload = {
        ...announcementForm,
        startsAt: announcementForm.startsAt || null,
        endsAt: announcementForm.endsAt || null,
      };
      if (editingAnnouncementId) {
        await api.put(`/announcements/${editingAnnouncementId}`, payload);
      } else {
        await api.post("/announcements", payload);
      }
      setSaved(editingAnnouncementId ? "公告已更新" : "公告已发布");
      resetAnnouncementForm();
      await loadAnnouncements();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存公告失败");
    } finally {
      setAnnouncementSaving(false);
    }
  }

  async function deleteAnnouncement(id: number) {
    if (!window.confirm("确定删除这条公告吗？已读记录也会一起删除。")) return;
    setAnnouncementSaving(true);
    setError("");
    setSaved("");
    try {
      await api.delete(`/announcements/${id}`);
      setSaved("公告已删除");
      if (editingAnnouncementId === id) resetAnnouncementForm();
      await loadAnnouncements();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除公告失败");
    } finally {
      setAnnouncementSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">系统设置</h1>
          <p className="mt-1 text-muted-foreground">配置 AI 总结、地图服务和派单邮件通知</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button onClick={save} disabled={loading || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            保存设置
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}
      {saved && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">{saved}</div>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            正在加载…
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>AI 总结</CardTitle>
                <Button variant="outline" size="sm" onClick={testAi} disabled={loading || saving || testingAi}>
                  {testingAi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                  测试 AI
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">启用 AI 运营总结</div>
                  <div className="text-sm text-muted-foreground">月报导出会调用这里配置的模型生成摘要。</div>
                </div>
                <Switch
                  checked={form.ai.workSummaryEnabled}
                  onCheckedChange={(checked) => setForm({ ...form, ai: { ...form.ai, workSummaryEnabled: checked } })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">启用 AI 语音填单</div>
                  <div className="text-sm text-muted-foreground">工程师端可用语音转写内容生成服务记录草稿。</div>
                </div>
                <Switch
                  checked={form.ai.serviceDraftEnabled}
                  onCheckedChange={(checked) => setForm({ ...form, ai: { ...form.ai, serviceDraftEnabled: checked } })}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>服务商</Label>
                  <Input value={form.ai.provider} onChange={(e) => setForm({ ...form, ai: { ...form.ai, provider: e.target.value } })} />
                </div>
                <div className="space-y-2">
                  <Label>模型</Label>
                  <Input value={form.ai.model} onChange={(e) => setForm({ ...form, ai: { ...form.ai, model: e.target.value } })} placeholder="deepseek-v4-flash" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>API 地址</Label>
                <Input value={form.ai.apiUrl} onChange={(e) => setForm({ ...form, ai: { ...form.ai, apiUrl: e.target.value } })} placeholder="https://..." />
              </div>

              <div className="space-y-2">
                <Label>API Token</Label>
                <Input
                  type="password"
                  value={form.ai.apiKey}
                  onChange={(e) => setForm({ ...form, ai: { ...form.ai, apiKey: e.target.value } })}
                  placeholder="保存后会以星号显示"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>邮件通知</CardTitle>
                <Button variant="outline" size="sm" onClick={testMail} disabled={loading || saving || testingMail}>
                  {testingMail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  测试 SMTP
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">启用邮件系统</div>
                    <div className="text-sm text-muted-foreground">开启后使用 SMTP 发送通知。</div>
                  </div>
                  <Switch
                    checked={form.mail.enabled}
                    onCheckedChange={(checked) => setForm({ ...form, mail: { ...form.mail, enabled: checked } })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">派单后发送邮件</div>
                    <div className="text-sm text-muted-foreground">发送给被派发工程师的邮箱。</div>
                  </div>
                  <Switch
                    checked={form.mail.assignNotifyEnabled}
                    onCheckedChange={(checked) => setForm({ ...form, mail: { ...form.mail, assignNotifyEnabled: checked } })}
                  />
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <Label>SMTP 主机</Label>
                  <Input value={form.mail.host} onChange={(e) => setForm({ ...form, mail: { ...form.mail, host: e.target.value } })} placeholder="smtp.example.com" />
                </div>
                <div className="space-y-2">
                  <Label>端口</Label>
                  <Input value={form.mail.port} onChange={(e) => setForm({ ...form, mail: { ...form.mail, port: e.target.value } })} placeholder="465" />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">SSL/TLS</div>
                  <div className="text-sm text-muted-foreground">163 企业邮箱建议使用 smtp.qiye.163.com:465 并开启；密码填写客户端授权码。</div>
                </div>
                <Switch
                  checked={form.mail.secure}
                  onCheckedChange={(checked) => setForm({ ...form, mail: { ...form.mail, secure: checked } })}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>发件人</Label>
                  <Input value={form.mail.from} onChange={(e) => setForm({ ...form, mail: { ...form.mail, from: e.target.value } })} placeholder="OMS Platform 运维智管 <service@example.com>" />
                </div>
                <div className="space-y-2">
                  <Label>SMTP 账号</Label>
                  <Input value={form.mail.user} onChange={(e) => setForm({ ...form, mail: { ...form.mail, user: e.target.value } })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>SMTP 密码</Label>
                <Input
                  type="password"
                  value={form.mail.password}
                  onChange={(e) => setForm({ ...form, mail: { ...form.mail, password: e.target.value } })}
                  placeholder="填写邮箱客户端授权码，保存后会以星号显示"
                />
              </div>

              <div className="space-y-2">
                <Label>测试收件人</Label>
                <Input
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="不填则发送到 SMTP 账号"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  <CardTitle>登录公告</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={resetAnnouncementForm} disabled={announcementSaving}>
                  <Plus className="mr-2 h-4 w-4" />
                  新公告
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="space-y-2">
                    <Label>标题</Label>
                    <Input
                      value={announcementForm.title}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                      placeholder="例如：📣 本周功能更新"
                      maxLength={160}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>类型</Label>
                    <Select
                      value={announcementForm.kind}
                      onValueChange={(value) => setAnnouncementForm({ ...announcementForm, kind: value as AnnouncementForm["kind"] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">📣 普通通知</SelectItem>
                        <SelectItem value="warning">⚠️ 重要提醒</SelectItem>
                        <SelectItem value="success">✅ 完成通知</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>内容（支持 Markdown 和 emoji）</Label>
                  <div className="flex flex-wrap gap-2">
                    {quickEmoji.map((emoji) => (
                      <Button
                        key={emoji}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 px-0 text-base"
                        onClick={() => insertEmoji(emoji)}
                      >
                        {emoji}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    value={announcementForm.contentMarkdown}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, contentMarkdown: e.target.value })}
                    placeholder={`可写：
## 功能更新
- 支持 **加粗**、列表、链接和 emoji
- 支持 [red]红色重点[/red]、[blue]蓝色说明[/blue]、[green]绿色完成[/green]
- 请补充客户资料`}
                    className="min-h-[180px] font-mono text-sm"
                    maxLength={10000}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>开始显示</Label>
                    <Input
                      type="datetime-local"
                      value={announcementForm.startsAt}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, startsAt: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>结束显示</Label>
                    <Input
                      type="datetime-local"
                      value={announcementForm.endsAt}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, endsAt: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">启用公告</div>
                    <div className="text-sm text-muted-foreground">关闭后不会对用户弹出，已读记录仍保留。</div>
                  </div>
                  <Switch
                    checked={announcementForm.active}
                    onCheckedChange={(checked) => setAnnouncementForm({ ...announcementForm, active: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>目标角色</Label>
                  <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-3">
                    {roleOptions.map(([role, label]) => (
                      <label key={role} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={announcementForm.targetRoles.includes(role)}
                          onCheckedChange={(checked) => toggleAnnouncementRole(role, checked)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">不勾选时面向所有已登录用户。</div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {editingAnnouncementId && (
                    <Button variant="outline" onClick={resetAnnouncementForm} disabled={announcementSaving}>
                      取消编辑
                    </Button>
                  )}
                  <Button onClick={saveAnnouncement} disabled={announcementSaving}>
                    {announcementSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {editingAnnouncementId ? "更新公告" : "发布公告"}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border bg-slate-50/70 p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-700">弹窗预览</div>
                  <div className="rounded-lg border bg-white p-4 shadow-sm">
                    <div className="mb-3 text-lg font-semibold">
                      {announcementForm.kind === "warning" ? "⚠️" : announcementForm.kind === "success" ? "✅" : "📣"} {announcementForm.title || "公告标题"}
                    </div>
                    <MarkdownContent content={announcementForm.contentMarkdown || "公告内容预览"} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">近期公告</div>
                  <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                    {announcements.map((item) => (
                      <div key={item.id} className="rounded-lg border bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{item.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.active ? "启用" : "停用"} · {formatDateTime(item.startsAt)} 至 {formatDateTime(item.endsAt)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.targetRoles.length ? item.targetRoles.map((role) => roleOptions.find(([value]) => value === role)?.[1] || role).join("、") : "所有用户"}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="icon" onClick={() => editAnnouncement(item)} disabled={announcementSaving} aria-label="编辑公告">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteAnnouncement(item.id)} disabled={announcementSaving} aria-label="删除公告">
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!announcements.length && (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        暂无公告
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>通知提醒</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">维保到期预警</div>
                  <div className="text-sm text-muted-foreground">设备维保到期前发送邮件通知，默认同时抄送客户销售负责人。</div>
                </div>
                <Switch
                  checked={form.notification.maintenanceExpiryEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, maintenanceExpiryEnabled: c } })}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>提前提醒天数</Label>
                  <Input
                    type="number" min="1" max="365"
                    value={form.notification.maintenanceExpiryDays}
                    onChange={(e) => setForm({ ...form, notification: { ...form.notification, maintenanceExpiryDays: e.target.value } })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>额外收件人</Label>
                  <Input
                    value={form.notification.maintenanceExpiryRecipients}
                    onChange={(e) => setForm({ ...form, notification: { ...form.notification, maintenanceExpiryRecipients: e.target.value } })}
                    placeholder="user1@example.com, user2@example.com"
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">巡检执行提醒</div>
                  <div className="text-sm text-muted-foreground">巡检计划执行前发送邮件给工程师。</div>
                </div>
                <Switch
                  checked={form.notification.inspectionReminderEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, inspectionReminderEnabled: c } })}
                />
              </div>
              <div className="space-y-2">
                <Label>提前提醒天数</Label>
                <Input
                  type="number" min="1" max="365"
                  value={form.notification.inspectionReminderDays}
                  onChange={(e) => setForm({ ...form, notification: { ...form.notification, inspectionReminderDays: e.target.value } })}
                />
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                系统每天 08:00 检查维保到期，07:00 检查巡检执行。保存后次日生效。
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPinned className="h-5 w-5 text-primary" />
                <CardTitle>地图服务</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>高德 Web 服务 API Key</Label>
                <Input
                  type="password"
                  value={form.map.amapRestKey}
                  onChange={(e) => setForm({ ...form, map: { ...form.map, amapRestKey: e.target.value } })}
                  placeholder="用于客户地址搜索，保存后会以星号显示"
                />
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>高德 JSAPI Key</Label>
                  <Input
                    type="password"
                    value={form.map.amapJsapiKey}
                    onChange={(e) => setForm({ ...form, map: { ...form.map, amapJsapiKey: e.target.value } })}
                    placeholder="用于管理端地图展示"
                  />
                </div>
                <div className="space-y-2">
                  <Label>高德 JSAPI 安全密钥</Label>
                  <Input
                    type="password"
                    value={form.map.amapSecurityJsCode}
                    onChange={(e) => setForm({ ...form, map: { ...form.map, amapSecurityJsCode: e.target.value } })}
                    placeholder="securityJsCode，保存后会以星号显示"
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                后端地址搜索使用 Web 服务 API Key；仪表盘地图使用 Web 端 JSAPI Key 和该 Key 同一行的安全密钥。若高德启用了 Referer 白名单，请加入当前管理端域名。
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
