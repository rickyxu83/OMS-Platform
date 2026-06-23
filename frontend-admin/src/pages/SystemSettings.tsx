import { useEffect, useState } from "react";
import { Loader2, MapPinned, RefreshCw, Save, Send, WandSparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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

function toBool(value: unknown) {
  return value === true || value === "true";
}

export function SystemSettings() {
  const [form, setForm] = useState<SettingsForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [testRecipient, setTestRecipient] = useState("");

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">系统设置</h1>
          <p className="mt-1 text-muted-foreground">配置 AI 总结、地图服务和派单邮件通知</p>
        </div>
        <div className="flex gap-2">
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
            加载中…
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
                  <div className="text-sm text-muted-foreground">465 通常开启，587 通常关闭。</div>
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
                  placeholder="保存后会以星号显示"
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
                  <Label>额外收件人（留空则仅发送默认收件人）</Label>
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
                <Label>高德 Web 服务 API Key（绑定服务 = Web 服务）</Label>
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
                  <Label>高德 JSAPI Key（绑定服务 = Web 端）</Label>
                  <Input
                    type="password"
                    value={form.map.amapJsapiKey}
                    onChange={(e) => setForm({ ...form, map: { ...form.map, amapJsapiKey: e.target.value } })}
                    placeholder="用于管理端地图展示"
                  />
                </div>
                <div className="space-y-2">
                  <Label>高德 JSAPI 安全密钥（同一 Web 端 Key）</Label>
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
