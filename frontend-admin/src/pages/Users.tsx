import { useEffect, useMemo, useState } from "react";
import { Plus, Search, UserCheck, UserX, RefreshCw, Loader2, Pencil, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

interface User {
  id: string | number;
  username?: string;
  realName?: string;
  name?: string;
  role?: string;
  status?: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  assistant: "助理",
  dispatcher: "调度",
  supervisor: "主管",
  engineering_supervisor: "工程主管",
  sales_supervisor: "业务主管",
  sales: "业务",
  engineer: "工程师",
};

const ROLE_VARIANT: Record<string, "default" | "info" | "purple" | "success" | "warning" | "secondary"> = {
  admin: "default",
  assistant: "info",
  dispatcher: "purple",
  supervisor: "success",
  engineering_supervisor: "success",
  sales_supervisor: "warning",
  sales: "info",
  engineer: "secondary",
};

const STATUS_VARIANT: Record<string, "success" | "secondary"> = {
  active: "success",
  disabled: "secondary",
  inactive: "secondary",
};

function displayName(u: User) {
  return u.realName || u.name || u.username || `用户 #${u.id}`;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

export function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [permData, setPermData] = useState<Record<string, { label: string; permissions: { key: string; label: string }[] }> | null>(null);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | number | null>(null);
  const [form, setForm] = useState({
    username: "",
    realName: "",
    password: "",
    role: "engineer",
    phone: "",
    email: "",
    status: "active",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const query = params.toString();
      const data = await api.get(`/users${query ? `?${query}` : ""}`);
      setUsers((data?.items || []) as User[]);
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
  }, [roleFilter, statusFilter]);

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!keyword) return true;
      const roleLabel = ROLE_LABELS[u.role || ""] || u.role || "";
      return [displayName(u), u.username, u.phone, u.email, roleLabel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [users, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === "active").length;
    const admin = users.filter((u) => u.role === "admin").length;
    return [
      { label: "总人数", value: total },
      { label: "在岗人数", value: active },
      { label: "系统管理员", value: admin },
    ];
  }, [users]);

  function openCreate() {
    setEditingUserId(null);
    setForm({
      username: "",
      realName: "",
      password: "",
      role: "engineer",
      phone: "",
      email: "",
      status: "active",
    });
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingUserId(user.id);
    setForm({
      username: user.username || "",
      realName: user.realName || user.name || "",
      password: "",
      role: user.role || "engineer",
      phone: user.phone || "",
      email: user.email || "",
      status: user.status || "active",
    });
    setDialogOpen(true);
  }

  async function submit() {
    if (!form.username.trim()) {
      setError("请输入账号");
      return;
    }
    if (!form.realName.trim()) {
      setError("请输入姓名");
      return;
    }
    if (!editingUserId && !form.password) {
      setError("请输入密码");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        username: form.username.trim(),
        realName: form.realName.trim(),
        role: form.role,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        status: form.status,
      };
      if (form.password) payload.password = form.password;
      if (editingUserId) {
        await api.put(`/users/${editingUserId}`, payload);
      } else {
        await api.post("/users", payload);
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : editingUserId ? "保存失败" : "新增失败";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(user: User) {
    if (!user.id) return;
    if (String(currentUser?.id) === String(user.id)) {
      setError("不能停用或恢复当前登录账号");
      return;
    }
    const action = user.status === "active" ? "停用" : "启用";
    if (!window.confirm(`确认${action}成员「${displayName(user)}」？`)) return;
    setSaving(true);
    setError("");
    try {
      if (user.status === "active") {
        await api.delete(`/users/${user.id}`);
      } else {
        await api.post(`/users/${user.id}/restore`, {});
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "操作失败";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">成员与角色</h1>
          <p className="text-muted-foreground mt-1">管理系统用户和权限</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button variant="outline" onClick={async () => {
            if (permData) { setPermDialogOpen(true); return }
            setLoadingPerms(true);
            try {
              const data = await api.get("/roles/permissions");
              setPermData(data as Record<string, { label: string; permissions: { key: string; label: string }[] }>);
              setPermDialogOpen(true);
            } catch { setError("加载权限目录失败") }
            finally { setLoadingPerms(false) }
          }}>
            <Shield className="w-4 h-4 mr-2" />
            权限说明
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            新增成员
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
                placeholder="搜索姓名、账号、角色、电话、邮箱..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="角色筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部角色</SelectItem>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">在岗</SelectItem>
                <SelectItem value="disabled">离岗</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setRoleFilter("all");
                setStatusFilter("all");
              }}
            >
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>成员列表 ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">暂无用户</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((user) => {
                const roleLabel = ROLE_LABELS[user.role || ""] || user.role || "-";
                return (
                  <div
                    key={user.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border border-border rounded-lg hover:border-primary transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        {user.status === "active" ? (
                          <UserCheck className="w-5 h-5 text-primary" />
                        ) : (
                          <UserX className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                        <div>
                          <div className="font-medium">{displayName(user)}</div>
                          <div className="text-sm text-muted-foreground">@{user.username || "-"}</div>
                        </div>
                        <div>
                          <Badge variant={ROLE_VARIANT[user.role || ""] || "secondary"}>
                            {roleLabel}
                          </Badge>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">联系方式</div>
                          <div className="text-sm">{user.phone || "-"}</div>
                          <div className="text-xs text-muted-foreground truncate">{user.email || "-"}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">创建时间</div>
                          <div className="text-sm">{formatDateTime(user.createdAt)}</div>
                        </div>
                        <div>
                          <Badge variant={STATUS_VARIANT[user.status || "active"] || "secondary"}>
                            {user.status === "active" ? "在岗" : "离岗"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(user)}
                        disabled={saving}
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus(user)}
                        disabled={saving || String(currentUser?.id) === String(user.id)}
                      >
                        {user.status === "active" ? "停用" : "启用"}
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
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingUserId ? "编辑成员" : "新增成员"}</DialogTitle>
            <DialogDescription>{editingUserId ? "修改成员资料、角色、状态；填写密码则同步重置密码" : "填写账号基础信息，保存后状态默认为在岗"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>账号 *</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="登录账号"
                />
              </div>
              <div className="space-y-2">
                <Label>姓名 *</Label>
                <Input
                  value={form.realName}
                  onChange={(e) => setForm({ ...form, realName: e.target.value })}
                  placeholder="真实姓名"
                />
              </div>
              <div className="space-y-2">
                <Label>{editingUserId ? "重置密码（留空不修改）" : "密码 *"}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingUserId ? "填写则重置登录密码" : "登录密码"}
                />
              </div>
              <div className="space-y-2">
                <Label>角色</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择角色" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">在岗</SelectItem>
                    <SelectItem value="disabled">离岗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>电话</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="联系电话（可选）"
                />
              </div>
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="派单通知邮箱（可选）"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "保存中…" : editingUserId ? "保存修改" : "立即创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>角色权限目录</DialogTitle>
            <DialogDescription>
              各角色可访问的功能模块对照表
            </DialogDescription>
          </DialogHeader>
          {loadingPerms ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中…
            </div>
          ) : permData ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">功能模块</th>
                    {Object.values(permData).map((role) => (
                      <th key={role.label} className="text-center py-2 px-2 font-medium text-muted-foreground text-xs">
                        {role.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.values(permData)[0]?.permissions.map((_, idx) => {
                    const permKey = Object.values(permData)[0]?.permissions[idx]?.key || "";
                    const permLabel = Object.values(permData)[0]?.permissions[idx]?.label || "";
                    return (
                      <tr key={permKey} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-3 text-sm">{permLabel}</td>
                        {Object.values(permData).map((role) => {
                          const has = role.permissions.some((p) => p.key === permKey);
                          return (
                            <td key={role.label} className="text-center py-2 px-2">
                              {has ? (
                                <span className="text-emerald-600 font-bold">✓</span>
                              ) : (
                                <span className="text-muted-foreground/30">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
