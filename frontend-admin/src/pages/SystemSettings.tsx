import { useEffect, useState, type ReactNode } from "react";
import { Bell, MapPinned, Pencil, Plus, RefreshCw, Save, Send, Trash2, WandSparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ErrorToast";
import { MarkdownContent } from "@/lib/markdown";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface SettingsForm {
  ai: {
    workSummaryEnabled: boolean;
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
    attendanceNotifyEnabled: boolean;
  };
  notification: {
    maintenanceExpiryEnabled: boolean;
    maintenanceExpiryDays: string;
    maintenanceExpiryRecipients: string;
    noMaintenanceReminderEnabled: boolean;
    missingCustomerSalespersonEnabled: boolean;
    missingCustomerSalespersonRecipients: string;
    inspectionReminderEnabled: boolean;
    inspectionReminderDays: string;
    inspectionReminderRecipients: string;
    inspectionReminderSalesNotifyEnabled: boolean;
    inspectionScheduleDateMissingEnabled: boolean;
    inspectionAutoGenerateEnabled: boolean;
    inspectionConfirmationEnabled: boolean;
    inspectionConfirmationRecipients: string;
    inspectionOverdueEnabled: boolean;
    inspectionOverdueDays: string;
    inspectionOverdueRecipients: string;
    monthlyOperationsSummaryEnabled: boolean;
    monthlyOperationsSummaryRecipients: string;
    monthlyOperationsSummarySalesEnabled: boolean;
    monthlyOperationsSummaryEngineersEnabled: boolean;
    serviceOrderSalesNotifyEnabled: boolean;
    serviceOrderSalesDelayMinutes: string;
    serviceOrderAdminBaseUrl: string;
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

interface RecipientUser {
  id: number;
  username: string;
  realName: string;
  email: string;
  role: string;
  status: string;
}

const emptyForm: SettingsForm = {
  ai: {
    workSummaryEnabled: false,
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
    attendanceNotifyEnabled: true,
  },
  notification: {
    maintenanceExpiryEnabled: true,
    maintenanceExpiryDays: "30",
    maintenanceExpiryRecipients: "",
    noMaintenanceReminderEnabled: true,
    missingCustomerSalespersonEnabled: true,
    missingCustomerSalespersonRecipients: "",
    inspectionReminderEnabled: true,
    inspectionReminderDays: "3",
    inspectionReminderRecipients: "",
    inspectionReminderSalesNotifyEnabled: true,
    inspectionScheduleDateMissingEnabled: true,
    inspectionAutoGenerateEnabled: true,
    inspectionConfirmationEnabled: true,
    inspectionConfirmationRecipients: "",
    inspectionOverdueEnabled: true,
    inspectionOverdueDays: "1",
    inspectionOverdueRecipients: "",
    monthlyOperationsSummaryEnabled: true,
    monthlyOperationsSummaryRecipients: "",
    monthlyOperationsSummarySalesEnabled: false,
    monthlyOperationsSummaryEngineersEnabled: false,
    serviceOrderSalesNotifyEnabled: false,
    serviceOrderSalesDelayMinutes: "60",
    serviceOrderAdminBaseUrl: "",
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
  ["purchaser", "采购"],
];

const quickEmoji = ["📣", "⚠️", "✅", "🛠️", "📌", "📝", "🚀", "💡"];

const emailSplitPattern = /[,;\s，；]+/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toBool(value: unknown) {
  return value === true || value === "true";
}

function roleLabel(role?: string) {
  return roleOptions.find(([value]) => value === role)?.[1] || role || "未指定角色";
}

function parseRecipientEmails(value: string) {
  const seen = new Set<string>();
  return String(value || "")
    .split(emailSplitPattern)
    .map((email) => email.trim())
    .filter((email) => {
      const key = email.toLowerCase();
      if (!email || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function serializeRecipientEmails(emails: string[]) {
  const seen = new Set<string>();
  return emails
    .map((email) => email.trim())
    .filter((email) => {
      const key = email.toLowerCase();
      if (!email || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function toDateTimeInput(value?: string) {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
}

function formatDateTime(value?: string) {
  if (!value) return "长期";
  return String(value).replace("T", " ").slice(0, 16);
}

function SettingsGroupHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SettingsNavLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <a
      href={href}
      className="rounded-lg border bg-card px-4 py-3 text-sm shadow-sm transition-colors hover:border-primary hover:bg-accent/40"
    >
      <span className="block font-semibold text-foreground">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
    </a>
  );
}

function NotificationGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border bg-muted/10 p-4">
      <div>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function NotificationRule({
  title,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

function RecipientPicker({
  value,
  users,
  onChange,
  placeholder = "external@example.com",
}: {
  value: string;
  users: RecipientUser[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [manualEmail, setManualEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const emails = parseRecipientEmails(value);
  const emailSet = new Set(emails.map((email) => email.toLowerCase()));
  const emailUsers = users
    .filter((user) => user.email)
    .sort((left, right) => String(left.realName || left.username).localeCompare(String(right.realName || right.username), "zh-Hans-CN"));

  function updateEmails(nextEmails: string[]) {
    onChange(serializeRecipientEmails(nextEmails));
  }

  function addEmails(nextEmails: string[]) {
    updateEmails([...emails, ...nextEmails]);
  }

  function removeEmail(email: string) {
    updateEmails(emails.filter((item) => item.toLowerCase() !== email.toLowerCase()));
  }

  function addManualEmail() {
    const candidates = parseRecipientEmails(manualEmail);
    if (!candidates.length) return;
    addEmails(candidates);
    setManualEmail("");
  }

  function addRole(role: string) {
    const roleEmails = emailUsers.filter((user) => user.role === role).map((user) => user.email);
    if (roleEmails.length) addEmails(roleEmails);
    setSelectedRole("");
  }

  function userLabel(user: RecipientUser) {
    return `${user.realName || user.username} / ${roleLabel(user.role)} / ${user.email}`;
  }

  return (
    <div className="space-y-2">
      <div className="min-h-10 rounded-md border bg-white px-2 py-2">
        {emails.length ? (
          <div className="flex flex-wrap gap-1.5">
            {emails.map((email) => {
              const matched = emailUsers.find((user) => user.email.toLowerCase() === email.toLowerCase());
              return (
                <Badge key={email} variant={matched ? "secondary" : emailPattern.test(email) ? "outline" : "warning"} className="max-w-full gap-1">
                  <span className="max-w-[220px] truncate">
                    {matched ? `${matched.realName || matched.username} · ${email}` : email}
                  </span>
                  <button
                    type="button"
                    className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
                    onClick={() => removeEmail(email)}
                    aria-label={`移除 ${email}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">未选择收件人</div>
        )}
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        <Select
          value={selectedUser}
          onValueChange={(email) => {
            setSelectedUser(email);
            if (email) addEmails([email]);
            window.setTimeout(() => setSelectedUser(""), 0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="添加用户邮箱" />
          </SelectTrigger>
          <SelectContent>
            {emailUsers.map((user) => (
              <SelectItem key={user.id} value={user.email} disabled={emailSet.has(user.email.toLowerCase())}>
                {userLabel(user)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedRole}
          onValueChange={(role) => {
            setSelectedRole(role);
            if (role) addRole(role);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="按角色添加" />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map(([role, label]) => {
              const count = emailUsers.filter((user) => user.role === role && !emailSet.has(user.email.toLowerCase())).length;
              return (
                <SelectItem key={role} value={role} disabled={count === 0}>
                  {label}（{count}）
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            value={manualEmail}
            onChange={(event) => setManualEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addManualEmail();
              }
            }}
            placeholder={placeholder}
          />
          <Button type="button" variant="outline" size="icon" onClick={addManualEmail} aria-label="添加邮箱">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SystemSettings() {
  const { hasPermission } = useAuth();
  const canEditSettings = hasPermission("settings.edit");
  const canManageAnnouncements = hasPermission("announcement.manage");
  const [form, setForm] = useState<SettingsForm>(emptyForm);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(emptyAnnouncementForm);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [recipientUsers, setRecipientUsers] = useState<RecipientUser[]>([]);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [error, setError] = useState("");
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

  async function loadRecipientUsers() {
    const data = await api.get("/users?status=active");
    const items = Array.isArray(data?.items) ? data.items : [];
    setRecipientUsers(items
      .map((item: any) => ({
        id: Number(item.id),
        username: item.username || "",
        realName: item.realName || "",
        email: item.email || "",
        role: item.role || "",
        status: item.status || "",
      }))
      .filter((item: RecipientUser) => item.email));
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.get("/settings");
      const item = data?.item || {};
      const n = item.notification || {};
      setForm({
        ai: {
          workSummaryEnabled: toBool(item.ai?.workSummaryEnabled),
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
          attendanceNotifyEnabled: toBool(item.mail?.attendanceNotifyEnabled ?? true),
        },
        notification: {
          maintenanceExpiryEnabled: toBool(n.maintenanceExpiryEnabled ?? true),
          maintenanceExpiryDays: String(n.maintenanceExpiryDays || "30"),
          maintenanceExpiryRecipients: n.maintenanceExpiryRecipients || "",
          noMaintenanceReminderEnabled: toBool(n.noMaintenanceReminderEnabled ?? true),
          missingCustomerSalespersonEnabled: toBool(n.missingCustomerSalespersonEnabled ?? true),
          missingCustomerSalespersonRecipients: n.missingCustomerSalespersonRecipients || "",
          inspectionReminderEnabled: toBool(n.inspectionReminderEnabled ?? true),
          inspectionReminderDays: String(n.inspectionReminderDays || "3"),
          inspectionReminderRecipients: n.inspectionReminderRecipients || "",
          inspectionReminderSalesNotifyEnabled: toBool(n.inspectionReminderSalesNotifyEnabled ?? true),
          inspectionScheduleDateMissingEnabled: toBool(n.inspectionScheduleDateMissingEnabled ?? true),
          inspectionAutoGenerateEnabled: toBool(n.inspectionAutoGenerateEnabled ?? true),
          inspectionConfirmationEnabled: toBool(n.inspectionConfirmationEnabled ?? true),
          inspectionConfirmationRecipients: n.inspectionConfirmationRecipients || "",
          inspectionOverdueEnabled: toBool(n.inspectionOverdueEnabled ?? true),
          inspectionOverdueDays: String(n.inspectionOverdueDays || "1"),
          inspectionOverdueRecipients: n.inspectionOverdueRecipients || "",
          monthlyOperationsSummaryEnabled: toBool(n.monthlyOperationsSummaryEnabled ?? true),
          monthlyOperationsSummaryRecipients: n.monthlyOperationsSummaryRecipients || "",
          monthlyOperationsSummarySalesEnabled: toBool(n.monthlyOperationsSummarySalesEnabled),
          monthlyOperationsSummaryEngineersEnabled: toBool(n.monthlyOperationsSummaryEngineersEnabled),
          serviceOrderSalesNotifyEnabled: toBool(n.serviceOrderSalesNotifyEnabled),
          serviceOrderSalesDelayMinutes: String(n.serviceOrderSalesDelayMinutes || "60"),
          serviceOrderAdminBaseUrl: n.serviceOrderAdminBaseUrl || "",
        },
        map: {
          amapRestKey: item.map?.amapRestKey || "",
          amapJsapiKey: item.map?.amapJsapiKey || "",
          amapSecurityJsCode: item.map?.amapSecurityJsCode || "",
        },
      });
      await Promise.all([
        canManageAnnouncements ? loadAnnouncements().catch(() => setAnnouncements([])) : Promise.resolve(setAnnouncements([])),
        loadRecipientUsers().catch(() => setRecipientUsers([])),
      ]);
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
    try {
      await api.put("/settings", {
        ai: {
          ...form.ai,
          workSummaryEnabled: form.ai.workSummaryEnabled,
        },
        mail: {
          ...form.mail,
          enabled: form.mail.enabled,
          secure: form.mail.secure,
          assignNotifyEnabled: form.mail.assignNotifyEnabled,
          attendanceNotifyEnabled: form.mail.attendanceNotifyEnabled,
        },
        notification: form.notification,
        map: form.map,
      });
      toast.success("设置已保存");
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
    try {
      const data = await api.post("/settings/test-ai", { ai: form.ai });
      toast.success(data?.message || "AI 连接测试成功");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 连接测试失败");
    } finally {
      setTestingAi(false);
    }
  }

  async function testMail() {
    setTestingMail(true);
    setError("");
    try {
      const data = await api.post("/settings/test-mail", { mail: form.mail, to: testRecipient.trim() || undefined });
      toast.success(data?.message || "SMTP 测试邮件已发送");
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
    if (!canManageAnnouncements) return;
    setAnnouncementSaving(true);
    setError("");
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
      toast.success(editingAnnouncementId ? "公告已更新" : "公告已发布");
      resetAnnouncementForm();
      await loadAnnouncements();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存公告失败");
    } finally {
      setAnnouncementSaving(false);
    }
  }

  async function deleteAnnouncement(id: number) {
    if (!canManageAnnouncements) return;
    if (!window.confirm("确定删除这条公告吗？已读记录也会一起删除。")) return;
    setAnnouncementSaving(true);
    setError("");
    try {
      await api.delete(`/announcements/${id}`);
      toast.success("公告已删除");
      if (editingAnnouncementId === id) resetAnnouncementForm();
      await loadAnnouncements();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除公告失败");
    } finally {
      setAnnouncementSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-6 pb-16">
      <div>
        <div>
          <h1 className="text-3xl font-semibold">系统设置</h1>
          <p className="mt-1 text-muted-foreground">配置 AI 总结、地图服务和派单邮件通知</p>
        </div>
      </div>

      <ErrorToast message={error} />

      {!loading && (
        <div className="grid gap-3 md:grid-cols-3">
          <SettingsNavLink href="#settings-integrations" title="集成与密钥" description="AI API、SMTP 邮件、高德地图 Key" />
          <SettingsNavLink href="#settings-notifications" title="自动提醒" description="维保、巡检、销售服务单通知" />
          <SettingsNavLink href="#settings-announcements" title="登录公告" description="登录弹窗、目标角色、有效时间" />
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <span className="btn-loader mr-2" aria-hidden="true" />
            正在加载…
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <section id="settings-integrations" className="scroll-mt-6 space-y-4">
            <SettingsGroupHeader title="集成与密钥" description="集中管理外部服务连接信息。密钥保存后仍以星号展示，保留原来的后端保护逻辑。" />
            <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>AI 与 API Key</CardTitle>
                <Button variant="outline" size="sm" onClick={testAi} disabled={!canEditSettings || loading || saving || testingAi}>
                  {testingAi ? <span className="btn-loader mr-2" aria-hidden="true" /> : <WandSparkles className="mr-2 h-4 w-4" />}
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
                <CardTitle>SMTP 邮件</CardTitle>
                <Button variant="outline" size="sm" onClick={testMail} disabled={!canEditSettings || loading || saving || testingMail}>
                  {testingMail ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Send className="mr-2 h-4 w-4" />}
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
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">考勤审批邮件</div>
                    <div className="text-sm text-muted-foreground">请假提交、逐级审批、驳回和完成时发送邮件。</div>
                  </div>
                  <Switch
                    checked={form.mail.attendanceNotifyEnabled}
                    onCheckedChange={(checked) => setForm({ ...form, mail: { ...form.mail, attendanceNotifyEnabled: checked } })}
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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPinned className="h-5 w-5 text-primary" />
                <CardTitle>地图 API</CardTitle>
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
          </section>

          <section id="settings-announcements" className="scroll-mt-6 space-y-4">
            <SettingsGroupHeader title="登录公告" description="集中维护登录弹窗公告、目标角色和展示时间，公告内容支持 Markdown。" />
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  <CardTitle>登录公告</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={resetAnnouncementForm} disabled={!canManageAnnouncements || announcementSaving}>
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
                    <Label>结束显示（不填代表长期有效）</Label>
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
                    <Button variant="outline" onClick={resetAnnouncementForm} disabled={!canManageAnnouncements || announcementSaving}>
                      取消编辑
                    </Button>
                  )}
                  <Button onClick={saveAnnouncement} disabled={!canManageAnnouncements || announcementSaving}>
                    {announcementSaving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" />}
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
                            <Button variant="ghost" size="icon" onClick={() => editAnnouncement(item)} disabled={!canManageAnnouncements || announcementSaving} aria-label="编辑公告">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteAnnouncement(item.id)} disabled={!canManageAnnouncements || announcementSaving} aria-label="删除公告">
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

          </section>

          <section id="settings-notifications" className="scroll-mt-6 space-y-4">
            <SettingsGroupHeader title="自动提醒" description="维护周期性邮件提醒和销售服务单延迟通知，不改变 SMTP 本身的账号配置。" />
          <Card>
            <CardHeader>
              <CardTitle>通知规则</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <NotificationGroup title="设备与维保" description="围绕设备维保状态和资料完整性的提醒，主要面向客户关联销售。">
                <NotificationRule
                  title="维保到期预警"
                  description="设备维保到期前发送邮件通知客户销售负责人和固定收件人。"
                  checked={form.notification.maintenanceExpiryEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, maintenanceExpiryEnabled: c } })}
                >
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
                      <Label>固定收件人</Label>
                      <RecipientPicker
                        value={form.notification.maintenanceExpiryRecipients}
                        users={recipientUsers}
                        onChange={(value) => setForm({ ...form, notification: { ...form.notification, maintenanceExpiryRecipients: value } })}
                        placeholder="user1@example.com, user2@example.com"
                      />
                    </div>
                  </div>
                </NotificationRule>

                <NotificationRule
                  title="维保信息待完善提醒"
                  description="每周汇总无维保类型，或已有维保类型但缺少维保周期的客户设备，只通知对应销售。"
                  checked={form.notification.noMaintenanceReminderEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, noMaintenanceReminderEnabled: c } })}
                />
              </NotificationGroup>

              <NotificationGroup title="客户资料" description="用于补齐客户主数据，避免后续通知无法匹配到负责人。">
                <NotificationRule
                  title="客户缺少销售提醒"
                  description="每周汇总未填写销售人员的客户，发送给指定助理。"
                  checked={form.notification.missingCustomerSalespersonEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, missingCustomerSalespersonEnabled: c } })}
                >
                  <div className="space-y-2">
                    <Label>助理收件人</Label>
                    <RecipientPicker
                      value={form.notification.missingCustomerSalespersonRecipients}
                      users={recipientUsers}
                      onChange={(value) => setForm({ ...form, notification: { ...form.notification, missingCustomerSalespersonRecipients: value } })}
                      placeholder="assistant@example.com"
                    />
                  </div>
                </NotificationRule>
              </NotificationGroup>

              <NotificationGroup title="巡检" description="巡检计划、执行提醒、确认和逾期跟进集中放在这里。">
                <NotificationRule
                  title="自动生成巡检工单"
                  description="每天 06:30 生成未来 14 天内的待确认巡检工单；确认后才会派给工程师。"
                  checked={form.notification.inspectionAutoGenerateEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, inspectionAutoGenerateEnabled: c } })}
                />

                <NotificationRule
                  title="巡检执行提醒"
                  description="巡检计划执行前发送给工程师；可同步给客户销售和指定管理邮箱。"
                  checked={form.notification.inspectionReminderEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, inspectionReminderEnabled: c } })}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>提前提醒天数</Label>
                      <Input
                        type="number" min="1" max="365"
                        value={form.notification.inspectionReminderDays}
                        onChange={(e) => setForm({ ...form, notification: { ...form.notification, inspectionReminderDays: e.target.value } })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="font-medium">同时通知客户销售</div>
                        <div className="text-sm text-muted-foreground">客户已关联销售且销售账号有邮箱时，会单独发送给销售。</div>
                      </div>
                      <Switch
                        checked={form.notification.inspectionReminderSalesNotifyEnabled}
                        onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, inspectionReminderSalesNotifyEnabled: c } })}
                      />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label>管理同步收件人</Label>
                    <RecipientPicker
                      value={form.notification.inspectionReminderRecipients}
                      users={recipientUsers}
                      onChange={(value) => setForm({ ...form, notification: { ...form.notification, inspectionReminderRecipients: value } })}
                      placeholder="supervisor@example.com"
                    />
                  </div>
                </NotificationRule>

                <NotificationRule
                  title="巡检日期待完善提醒"
                  description="每周汇总已建立巡检但缺少起止日期的计划，只通知对应客户销售。"
                  checked={form.notification.inspectionScheduleDateMissingEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, inspectionScheduleDateMissingEnabled: c } })}
                />

                <NotificationRule
                  title="巡检待确认通知"
                  description="巡检计划生成待确认工单后，发送给指定确认人邮箱。"
                  checked={form.notification.inspectionConfirmationEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, inspectionConfirmationEnabled: c } })}
                >
                  <div className="space-y-2">
                    <Label>确认通知收件人</Label>
                    <RecipientPicker
                      value={form.notification.inspectionConfirmationRecipients}
                      users={recipientUsers}
                      onChange={(value) => setForm({ ...form, notification: { ...form.notification, inspectionConfirmationRecipients: value } })}
                      placeholder="supervisor@example.com"
                    />
                  </div>
                </NotificationRule>

                <NotificationRule
                  title="巡检逾期未提交"
                  description="巡检工单超过计划时间仍未提交时，发送每日汇总提醒。"
                  checked={form.notification.inspectionOverdueEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, inspectionOverdueEnabled: c } })}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>逾期天数阈值</Label>
                      <Input
                        type="number" min="1" max="365"
                        value={form.notification.inspectionOverdueDays}
                        onChange={(e) => setForm({ ...form, notification: { ...form.notification, inspectionOverdueDays: e.target.value } })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>逾期提醒收件人</Label>
                      <RecipientPicker
                        value={form.notification.inspectionOverdueRecipients}
                        users={recipientUsers}
                        onChange={(value) => setForm({ ...form, notification: { ...form.notification, inspectionOverdueRecipients: value } })}
                        placeholder="supervisor@example.com"
                      />
                    </div>
                  </div>
                </NotificationRule>
              </NotificationGroup>

              <NotificationGroup title="工单与营运" description="服务单流转和周期性经营信息汇总。">
                <NotificationRule
                  title="销售服务单通知"
                  description="工程师提交或修改服务单后，延迟发送给客户关联销售。"
                  checked={form.notification.serviceOrderSalesNotifyEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, serviceOrderSalesNotifyEnabled: c } })}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>延迟发送分钟数</Label>
                      <Input
                        type="number" min="5" max="1440"
                        value={form.notification.serviceOrderSalesDelayMinutes}
                        onChange={(e) => setForm({ ...form, notification: { ...form.notification, serviceOrderSalesDelayMinutes: e.target.value } })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>OMS 管理端地址</Label>
                      <Input
                        value={form.notification.serviceOrderAdminBaseUrl}
                        onChange={(e) => setForm({ ...form, notification: { ...form.notification, serviceOrderAdminBaseUrl: e.target.value } })}
                        placeholder="https://admin.example.com"
                      />
                    </div>
                  </div>
                </NotificationRule>

                <NotificationRule
                  title="月度营运总结"
                  description="每月 1 号发送上个月的营运摘要和基础统计，可使用 AI 生成摘要，邮件包含 AI 免责说明。"
                  checked={form.notification.monthlyOperationsSummaryEnabled}
                  onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, monthlyOperationsSummaryEnabled: c } })}
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>月度总结收件人</Label>
                      <RecipientPicker
                        value={form.notification.monthlyOperationsSummaryRecipients}
                        users={recipientUsers}
                        onChange={(value) => setForm({ ...form, notification: { ...form.notification, monthlyOperationsSummaryRecipients: value } })}
                        placeholder="ops@example.com, supervisor@example.com, sales@example.com"
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex min-h-16 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
                        <span>
                          <span className="block font-medium">推送给客户销售</span>
                          <span className="block text-sm text-muted-foreground">按客户销售归属发送各自客户月度总结。</span>
                        </span>
                        <Switch
                          checked={form.notification.monthlyOperationsSummarySalesEnabled}
                          onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, monthlyOperationsSummarySalesEnabled: c } })}
                        />
                      </label>
                      <label className="flex min-h-16 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
                        <span>
                          <span className="block font-medium">推送给参与工程师</span>
                          <span className="block text-sm text-muted-foreground">按参与或负责工单发送各自月度工单总结。</span>
                        </span>
                        <Switch
                          checked={form.notification.monthlyOperationsSummaryEngineersEnabled}
                          onCheckedChange={(c) => setForm({ ...form, notification: { ...form.notification, monthlyOperationsSummaryEngineersEnabled: c } })}
                        />
                      </label>
                    </div>
                  </div>
                </NotificationRule>
              </NotificationGroup>

              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                系统每天 07:00 检查巡检执行，08:00 检查维保到期，08:10 检查逾期巡检；每周一 08:30 检查维保信息待完善设备，08:35 检查客户缺少销售，08:40 检查巡检日期待完善；每月 1 号 08:20 发送月度总结；销售服务单通知每 5 分钟检查一次到期队列。
              </div>
            </CardContent>
          </Card>

          </section>
        </div>
      )}

      {!loading && (
        <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t bg-background/95 px-4 shadow-[0_-8px_22px_rgba(15,23,42,0.07)] backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:bottom-0 lg:left-[var(--admin-sidebar-width)]">
          <div className="mx-auto flex min-h-11 max-w-screen-2xl flex-col gap-1.5 py-1.5 sm:flex-row sm:items-center sm:justify-between lg:h-11 lg:py-0">
            <div className="text-xs text-muted-foreground">
              修改系统配置后，点击保存才会生效。
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button variant="outline" size="sm" onClick={load} disabled={loading || saving}>
                <RefreshCw className="mr-2 h-4 w-4" />
                刷新
              </Button>
              <Button size="sm" onClick={save} disabled={!canEditSettings || loading || saving}>
                {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" />}
                保存设置
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
