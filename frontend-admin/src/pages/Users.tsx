import { useEffect, useMemo, useState } from "react";
import { Plus, Search, UserCheck, UserX, RefreshCw, Pencil, Shield, Check, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorToast } from "@/components/ErrorToast";
import { HelpTooltip } from "@/components/HelpTooltip";
import { api } from "@/services/api";
import { Skeleton } from "@/components/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { matchesSearchText } from "@/lib/text-i18n";
import { useUrlParam } from "@/lib/use-url-param";

interface User {
  id: string | number;
  username?: string;
  loginAlias?: string;
  realName?: string;
  name?: string;
  role?: string;
  status?: string;
  phone?: string;
  email?: string;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PermissionRole {
  key: string;
  label: string;
}

interface PermissionItem {
  key: string;
  label: string;
}

interface PermissionPayload {
  roles: PermissionRole[];
  permissions: PermissionItem[];
  matrix: Record<string, Record<string, boolean>>;
  rolePermissions?: Record<string, { label: string; permissions: PermissionItem[] }>;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  assistant: "助理",
  assistant_supervisor: "助理主管",
  dispatcher: "调度",
  operations_director: "运营负责人",
  engineering_supervisor: "工程主管",
  administrative_supervisor: "行政主管",
  sales_supervisor: "业务主管",
  sales: "业务",
  engineer: "工程师",
  purchaser: "采购",
};

const ROLE_VARIANT: Record<string, "default" | "info" | "purple" | "success" | "warning" | "secondary" | "rose" | "cyan" | "teal" | "orange" | "lime" | "fuchsia"> = {
  admin: "rose",
  assistant: "info",
  assistant_supervisor: "cyan",
  dispatcher: "purple",
  operations_director: "success",
  engineering_supervisor: "info",
  administrative_supervisor: "lime",
  sales_supervisor: "warning",
  sales: "orange",
  engineer: "fuchsia",
  purchaser: "teal",
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
  const { user: currentUser, hasPermission } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useUrlParam("role", "all");
  const [statusFilter, setStatusFilter] = useUrlParam("status", "all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [permData, setPermData] = useState<PermissionPayload | null>(null);
  const [permDraft, setPermDraft] = useState<Record<string, Record<string, boolean>>>({});
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | number | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    username: "",
    loginAlias: "",
    realName: "",
    password: "",
    role: "engineer",
    phone: "",
    email: "",
    status: "active",
  });
  const canCreateUsers = hasPermission("user.create");
  const canEditUsers = hasPermission("user.edit");
  const canDeleteUsers = hasPermission("user.delete");
  const canManagePermissions = hasPermission("permission.manage");

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
    const keyword = searchQuery.trim();
    return users.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!keyword) return true;
      const roleLabel = ROLE_LABELS[u.role || ""] || u.role || "";
      return [displayName(u), u.username, u.loginAlias, u.phone, u.email, roleLabel]
        .filter(Boolean)
        .some((v) => matchesSearchText(v, keyword));
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

  const permissionRows = useMemo(() => {
    return permData?.permissions || [];
  }, [permData]);

  async function loadPermissions(openAfterLoad = false) {
    setLoadingPerms(true);
    try {
      const data = await api.get("/roles/permissions");
      const payload = data as PermissionPayload;
      setPermData(payload);
      setPermDraft(JSON.parse(JSON.stringify(payload.matrix || {})));
      if (openAfterLoad) setPermDialogOpen(true);
    } catch {
      setError("加载权限目录失败");
    } finally {
      setLoadingPerms(false);
    }
  }

  function togglePermission(role: string, permission: string, checked: boolean | "indeterminate") {
    if (!canManagePermissions || role === "admin") return;
    setPermDraft((current) => ({
      ...current,
      [role]: {
        ...(current[role] || {}),
        [permission]: checked === true,
      },
    }));
  }

  async function savePermissions() {
    if (!canManagePermissions || savingPerms) return;
    setSavingPerms(true);
    setError("");
    try {
      const payload = await api.put("/roles/permissions", { matrix: permDraft }) as PermissionPayload;
      setPermData(payload);
      setPermDraft(JSON.parse(JSON.stringify(payload.matrix || {})));
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存权限失败");
    } finally {
      setSavingPerms(false);
    }
  }

  const selectableFilteredUserIds = useMemo(() => (
    filtered
      .filter((user) => user.status === "active" && String(currentUser?.id) !== String(user.id))
      .map((user) => String(user.id))
  ), [filtered, currentUser?.id]);

  const allFilteredUsersSelected = selectableFilteredUserIds.length > 0
    && selectableFilteredUserIds.every((id) => selectedUserIds.includes(id));

  useEffect(() => {
    const selectableIds = new Set(selectableFilteredUserIds);
    setSelectedUserIds((ids) => {
      const next = ids.filter((id) => selectableIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [selectableFilteredUserIds]);

  function toggleUserSelection(userId: string | number, checked: boolean | "indeterminate") {
    const id = String(userId);
    setSelectedUserIds((ids) => {
      if (checked === true) return ids.includes(id) ? ids : [...ids, id];
      return ids.filter((item) => item !== id);
    });
  }

  function toggleAllFilteredUsers(checked: boolean | "indeterminate") {
    setSelectedUserIds((current) => {
      if (checked === true) return Array.from(new Set([...current, ...selectableFilteredUserIds]));
      const visible = new Set(selectableFilteredUserIds);
      return current.filter((id) => !visible.has(id));
    });
  }

  function openCreate() {
    setEditingUserId(null);
    setForm({
      username: "",
      loginAlias: "",
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
      loginAlias: user.loginAlias || "",
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
      setError("请输入邮箱账号");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.username.trim())) {
      setError("请输入有效的邮箱账号");
      return;
    }
    if (form.loginAlias.trim() && !/^[A-Za-z0-9._-]{2,32}$/.test(form.loginAlias.trim())) {
      setError("别名仅支持 2-32 位字母、数字、点、下划线或短横线");
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
        email: form.username.trim(),
        loginAlias: form.loginAlias.trim() || null,
        realName: form.realName.trim(),
        role: form.role,
        phone: form.phone.trim() || null,
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

  async function bulkDisableUsers() {
    const ids = selectedUserIds.filter((id) => selectableFilteredUserIds.includes(id));
    if (!ids.length) return;
    if (!window.confirm(`确认停用选中的 ${ids.length} 名成员？当前登录账号不会被停用。`)) return;
    setSaving(true);
    setError("");
    try {
      for (const id of ids) {
        await api.delete(`/users/${id}`);
      }
      setSelectedUserIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量停用失败");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">成员与角色</h1>
          <p className="text-muted-foreground mt-1">管理系统用户、邮箱账号和权限</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button variant="outline" onClick={async () => {
            if (permData) { setPermDialogOpen(true); return }
            await loadPermissions(true);
          }}>
            <Shield className="w-4 h-4 mr-2" />
            权限配置
          </Button>
          {canCreateUsers ? (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              新增成员
            </Button>
          ) : null}
        </div>
      </div>

      <ErrorToast message={error} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, statIndex) => (
          <Card key={stat.label} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-bold mt-1">
                                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span className="stat-value-enter inline-block" style={{ animationDelay: `${Math.min(statIndex * 120, 480)}ms` }}>{stat.value}</span>
                )}
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
                placeholder="搜索姓名、邮箱账号、别名、角色、电话…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="全部角色" />
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
              <SelectTrigger className="w-full md:w-[140px]">
                <SelectValue placeholder="全部状态" />
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
              <RotateCcw className="w-4 h-4 mr-2" />
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>成员列表 ({filtered.length})</CardTitle>
            {canDeleteUsers ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={allFilteredUsersSelected}
                    onCheckedChange={toggleAllFilteredUsers}
                    disabled={saving || selectableFilteredUserIds.length === 0}
                    aria-label="全选当前可停用成员"
                  />
                  全选当前可停用成员
                </label>
                {selectedUserIds.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedUserIds([])} disabled={saving}>
                    清空选择
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={bulkDisableUsers}
                  disabled={saving || !selectedUserIds.length}
                >
                  <UserX className="w-4 h-4 mr-2" />
                  批量停用{selectedUserIds.length ? ` (${selectedUserIds.length})` : ""}
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-y-auto pr-1">
            {loading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <span className="btn-loader mr-2" aria-hidden="true" /> 正在加载…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无用户</div>
            ) : (
              <div className="space-y-3">
              {filtered.map((user) => {
                const roleLabel = ROLE_LABELS[user.role || ""] || user.role || "-";
                const selectable = user.status === "active" && String(currentUser?.id) !== String(user.id);
                const selected = selectedUserIds.includes(String(user.id));
                return (
                  <div
                    key={user.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border border-border rounded-lg hover:border-primary transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {canDeleteUsers ? (
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => toggleUserSelection(user.id, checked)}
                          disabled={saving || !selectable}
                          aria-label={`选择成员 ${displayName(user)}`}
                        />
                      ) : null}
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
                          <div className="text-sm text-muted-foreground truncate">{user.email || user.username || "-"}</div>
                          {user.loginAlias ? (
                            <div className="text-xs text-muted-foreground">别名：{user.loginAlias}</div>
                          ) : null}
                        </div>
                        <div>
                          <Badge variant={ROLE_VARIANT[user.role || ""] || "secondary"}>
                            {roleLabel}
                          </Badge>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">联系方式</div>
                          <div className="text-sm">{user.phone || "-"}</div>
                          <div className="text-xs text-muted-foreground truncate">{user.loginAlias ? `可用别名登录：${user.loginAlias}` : "未设置别名"}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">上次登录时间</div>
                          <div className="text-sm">{formatDateTime(user.lastLoginAt)}</div>
                        </div>
                        <div>
                          <Badge variant={STATUS_VARIANT[user.status || "active"] || "secondary"}>
                            {user.status === "active" ? "在岗" : "离岗"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {canEditUsers || canDeleteUsers ? (
                      <div className="flex flex-wrap gap-2">
                        {canEditUsers ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => openEdit(user)}
                            disabled={saving}
                          >
                            <Pencil className="w-4 h-4 mr-1" />
                            编辑
                          </Button>
                        ) : null}
                        {(user.status === "active" ? canDeleteUsers : canEditUsers) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="bg-slate-50 text-slate-900 hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => toggleStatus(user)}
                            disabled={saving || String(currentUser?.id) === String(user.id)}
                          >
                            {user.status === "active" ? (
                              <UserX className="w-4 h-4 mr-1" />
                            ) : (
                              <UserCheck className="w-4 h-4 mr-1" />
                            )}
                            {user.status === "active" ? "停用" : "启用"}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingUserId ? "编辑成员" : "新增成员"}</DialogTitle>
            <DialogDescription>{editingUserId ? "修改成员资料、角色、状态；填写密码则同步重置初始密码" : "使用邮箱作为账号；成员首次登录后必须修改初始密码"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>邮箱账号 *</Label>
                <Input
                  type="email"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="name@company.com"
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
                <Label>{editingUserId ? "重置初始密码（留空不修改）" : "初始密码 *"}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingUserId ? "填写则重置为初始密码" : "首次登录使用的初始密码"}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>角色</Label>
                  <HelpTooltip label="角色决定菜单可见范围与数据权限：管理员拥有全部权限；工程主管可派单与审批；运营负责人可见全部工单；行政主管对业务数据只读；工程师仅能处理派给自己的工单。更细颗粒度的权限可在成员列表的「角色权限配置」中逐项调整。" />
                </div>
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
                <Label>登录别名</Label>
                <Input
                  value={form.loginAlias}
                  onChange={(e) => setForm({ ...form, loginAlias: e.target.value })}
                  placeholder="可选，2-32 位字母/数字/._-"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Check className="w-4 h-4 mr-2" />}
              {saving ? "保存中…" : editingUserId ? "保存修改" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="sm:max-w-[960px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>角色权限配置</DialogTitle>
            <DialogDescription>
              管理员为内置超管，管理端权限固定开启；工单填写入口仅开放给工程师和工程主管
            </DialogDescription>
          </DialogHeader>
          {loadingPerms ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <span className="btn-loader mr-2" aria-hidden="true" /> 正在加载…
            </div>
          ) : permData ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">功能模块</th>
                    {permData.roles.map((role) => (
                      <th key={role.key} className="text-center py-2 px-2 font-medium text-muted-foreground text-xs">
                        {role.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionRows.map((permission) => {
                    const permKey = permission.key;
                    const permLabel = permission.label;
                    return (
                      <tr key={permKey} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-3 text-sm">{permLabel}</td>
                        {permData.roles.map((role) => {
                          const checked = Boolean(permDraft[role.key]?.[permKey]);
                          const disabled = !canManagePermissions || role.key === "admin" || savingPerms;
                          return (
                            <td key={role.key} className="text-center py-2 px-2">
                              <Checkbox
                                checked={checked}
                                disabled={disabled}
                                aria-label={`${role.label} ${permLabel}`}
                                onCheckedChange={(value) => togglePermission(role.key, permKey, value)}
                              />
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
          {canManagePermissions ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => loadPermissions(false)} disabled={loadingPerms || savingPerms}>
                <RefreshCw className="w-4 h-4 mr-2" />
                重新加载
              </Button>
              <Button onClick={savePermissions} disabled={savingPerms || loadingPerms}>
                {savingPerms ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Check className="w-4 h-4 mr-2" />}
                {savingPerms ? "保存中…" : "保存权限"}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
