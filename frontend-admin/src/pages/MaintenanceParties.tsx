import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Building2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/services/api";

interface Party {
  id: string | number;
  name?: string;
  phone?: string;
  contact?: string;
  partyType?: string;
  serviceScope?: string;
  remark?: string;
  updatedAt?: string;
  createdAt?: string;
}

const TYPE_LABELS: Record<string, string> = {
  vendor_contact: "原厂联系人",
  our_maintenance: "合作维保方",
  partner: "合作维保方",
  vendor: "原厂联系人",
  original_manufacturer: "原厂联系人",
  our: "我方维护",
};

const TYPE_VARIANT: Record<string, "default" | "info" | "secondary" | "purple"> = {
  vendor_contact: "info",
  original_manufacturer: "info",
  vendor: "info",
  our_maintenance: "purple",
  partner: "purple",
  our: "purple",
};

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

export function MaintenanceParties() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contact: "",
    phone: "",
    partyType: "our_maintenance",
    serviceScope: "",
    remark: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.get("/maintenance-parties");
      setParties((data?.items || []) as Party[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return parties.filter((p) => {
      if (typeFilter !== "all" && p.partyType !== typeFilter) return false;
      if (!keyword) return true;
      return [p.name, p.phone, p.contact, p.serviceScope]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [parties, searchQuery, typeFilter]);

  const stats = useMemo(() => {
    const total = parties.length;
    const vendor = parties.filter(
      (p) => p.partyType === "vendor_contact" || p.partyType === "vendor" || p.partyType === "original_manufacturer",
    ).length;
    const partner = parties.filter(
      (p) => p.partyType === "our_maintenance" || p.partyType === "partner" || p.partyType === "our",
    ).length;
    return [
      { label: "维保方总数", value: total },
      { label: "原厂联系人", value: vendor },
      { label: "合作维保方", value: partner },
    ];
  }, [parties]);

  function openCreate() {
    setEditingId(null);
    setForm({
      name: "",
      contact: "",
      phone: "",
      partyType: "our_maintenance",
      serviceScope: "",
      remark: "",
    });
    setDialogOpen(true);
  }

  function openEdit(party: Party) {
    setEditingId(party.id);
    setForm({
      name: party.name || "",
      contact: party.contact || "",
      phone: party.phone || "",
      partyType: party.partyType || "our_maintenance",
      serviceScope: party.serviceScope || "",
      remark: party.remark || "",
    });
    setDialogOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) {
      setError("请输入维保方名称");
      return;
    }
    if (form.phone.trim()) {
      const phoneRe = /^[0-9+()\-\s]{7,32}$/;
      if (!phoneRe.test(form.phone.trim())) {
        setError("联系电话格式不正确");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        contact: form.contact.trim() || undefined,
        phone: form.phone.trim() || undefined,
        partyType: form.partyType,
        serviceScope: form.serviceScope.trim() || undefined,
        remark: form.remark.trim() || undefined,
      };
      if (editingId) {
        await api.put(`/maintenance-parties/${editingId}`, payload);
      } else {
        await api.post("/maintenance-parties", payload);
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "保存失败";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">维保方目录</h1>
          <p className="text-muted-foreground mt-1">管理原厂联系人和合作维保方</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            新增维保方
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>重试</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-bold mt-1">
                {loading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索名称、电话、服务范围..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="类型筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="vendor_contact">原厂联系人</SelectItem>
                <SelectItem value="our_maintenance">合作维保方</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setTypeFilter("all");
              }}
            >
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>维保方列表 ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">暂无维保方资料</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((p) => {
                const typeLabel = TYPE_LABELS[p.partyType || ""] || p.partyType || "-";
                return (
                  <div
                    key={p.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border border-border rounded-lg hover:border-primary transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <Building2 className="w-5 h-5 text-primary" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium">{p.name || "-"}</span>
                          <Badge variant={TYPE_VARIANT[p.partyType || ""] || "secondary"}>
                            {typeLabel}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          联系人：{p.contact || "-"} · 电话：{p.phone || "-"}
                        </div>
                        {p.serviceScope && (
                          <div className="text-xs text-muted-foreground mt-1">
                            服务范围：{p.serviceScope}
                          </div>
                        )}
                      </div>
                      <div className="text-right hidden md:block">
                        <div className="text-xs text-muted-foreground">最近更新</div>
                        <div className="text-sm">{formatDate(p.updatedAt)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                        编辑
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑维保方" : "新增维保方"}</DialogTitle>
            <DialogDescription>填写维保方基础信息，提交后保存到系统</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>维保方名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如 Dell EMC 原厂技术支持"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>联系人</Label>
                <Input
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  placeholder="联系人姓名"
                />
              </div>
              <div className="space-y-2">
                <Label>联系电话</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="支持数字、加号、括号、横线、空格，长度 7-32"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>类型</Label>
              <Select
                value={form.partyType}
                onValueChange={(v) => setForm({ ...form, partyType: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor_contact">原厂联系人</SelectItem>
                  <SelectItem value="our_maintenance">合作维保方</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>服务范围</Label>
              <Input
                value={form.serviceScope}
                onChange={(e) => setForm({ ...form, serviceScope: e.target.value })}
                placeholder="例如 服务器、存储、网络设备"
              />
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
                placeholder="补充说明"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "保存中…" : editingId ? "保存修改" : "保存维保方"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
