import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Send, WandSparkles } from "lucide-react";
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
        },
        mail: {
          ...form.mail,
          enabled: form.mail.enabled,
          secure: form.mail.secure,
          assignNotifyEnabled: form.mail.assignNotifyEnabled,
        },
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
          <p className="mt-1 text-muted-foreground">配置 AI 总结和派单邮件通知</p>
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
                  <div className="font-medium">启用 AI 营运总结</div>
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
                  <Input value={form.mail.from} onChange={(e) => setForm({ ...form, mail: { ...form.mail, from: e.target.value } })} placeholder="敦阳科技服务表电子化系统 <service@example.com>" />
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
        </div>
      )}
    </div>
  );
}
