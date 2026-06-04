import { useEffect, useMemo, useState } from "react";
import { Search, Plus, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/services/api";

interface Customer {
  id: string | number;
  code?: string;
  name?: string;
  contactName?: string;
  contactPhone?: string;
  phone?: string;
  address?: string;
  level?: string;
  levelText?: string;
  serviceOrderCount?: number;
  salesperson?: string;
  updatedAt?: string;
  createdAt?: string;
}

const LEVEL_LABELS: Record<string, string> = {
  key: "重点客户",
  normal: "普通客户",
  potential: "潜在客户",
  vip: "VIP 客户",
};

const LEVEL_VARIANT: Record<string, "default" | "secondary" | "purple" | "warning" | "info"> = {
  key: "purple",
  vip: "warning",
  normal: "secondary",
  potential: "info",
};

function levelOf(c: Customer): string {
  if (c.level) return c.level;
  const count = Number(c.serviceOrderCount || 0);
  if (count >= 20) return "key";
  if (count >= 5) return "normal";
  return "potential";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 10);
}

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    contactName: "",
    contactPhone: "",
    address: "",
    level: "normal",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        pageSize: "100",
        sortBy: "name",
        sortDir: "asc",
      });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const data = await api.get(`/customers?${params.toString()}`);
      setCustomers((data?.items || []) as Customer[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return customers;
    return customers.filter((c) => {
      return [c.name, c.code, c.contactName, c.contactPhone, c.address, c.salesperson]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [customers, searchQuery]);

  const stats = useMemo(() => {
    const total = customers.length;
    const key = customers.filter((c) => levelOf(c) === "key" || levelOf(c) === "vip").length;
    const serviceCount = customers.reduce((sum, c) => sum + Number(c.serviceOrderCount || 0), 0);
    return [
      { label: "客户总数", value: total },
      { label: "重点客户", value: key },
      { label: "累计服务次数", value: serviceCount },
    ];
  }, [customers]);

  function openCreate() {
    setForm({
      name: "",
      code: "",
      contactName: "",
      contactPhone: "",
      address: "",
      level: "normal",
    });
    setDialogOpen(true);
  }

  async function submitCreate() {
    if (!form.name.trim()) {
      setError("请输入客户名称");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        address: form.address.trim() || undefined,
        level: form.level,
        contacts: form.contactName.trim()
          ? [{ name: form.contactName.trim(), phone: form.contactPhone.trim() || undefined }]
          : [],
      };
      await api.post("/customers", payload);
      setDialogOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "新增失败";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">客户档案</h1>
          <p className="text-muted-foreground mt-1">管理客户信息、联系方式及资产概况</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            新增客户
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
        <CardHeader className="pb-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle>客户列表</CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索名称、地址、联系人..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">编码</TableHead>
                  <TableHead>客户名称</TableHead>
                  <TableHead>联系人</TableHead>
                  <TableHead>联系电话</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>地址</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> 加载中…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      未找到相关客户数据
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c) => {
                    const lv = levelOf(c);
                    const lvLabel = c.levelText || LEVEL_LABELS[lv] || "普通客户";
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.code || "-"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{c.name || "-"}</div>
                          {c.salesperson && (
                            <div className="text-xs text-muted-foreground">业务：{c.salesperson}</div>
                          )}
                        </TableCell>
                        <TableCell>{c.contactName || "-"}</TableCell>
                        <TableCell>{c.contactPhone || c.phone || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={LEVEL_VARIANT[lv] || "secondary"}>{lvLabel}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[300px] truncate">
                          {c.address || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>新增客户</DialogTitle>
            <DialogDescription>填写客户基础信息，提交后保存到系统</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cust-name">客户名称 *</Label>
                <Input
                  id="cust-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="请输入企业全称"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-code">客户编码</Label>
                <Input
                  id="cust-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="例如 SZGY-001（可留空）"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-contact">联系人</Label>
                <Input
                  id="cust-contact"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  placeholder="联系人姓名"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-phone">联系电话</Label>
                <Input
                  id="cust-phone"
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  placeholder="手机号或座机"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="cust-address">客户地址</Label>
                <Input
                  id="cust-address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="详细至街道门牌号"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submitCreate} disabled={saving}>
              {saving ? "保存中…" : "立即创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
