import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Loader2, MessageSquare, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorToast } from "@/components/ErrorToast";
import { api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { matchesSearchText } from "@/lib/text-i18n";

interface FeedbackItem {
  id: string | number;
  type: "problem" | "suggestion";
  content: string;
  pagePath?: string;
  status: "open" | "resolved";
  submitterName?: string;
  submitterUsername?: string;
  submitterRole?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  createdAt?: string;
}

const TYPE_LABEL: Record<FeedbackItem["type"], string> = {
  problem: "遇到问题",
  suggestion: "功能建议",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  assistant: "助理",
  dispatcher: "调度",
  operations_director: "运营负责人",
  engineering_supervisor: "工程主管",
  administrative_supervisor: "行政主管",
  sales_supervisor: "业务主管",
  sales: "业务",
  engineer: "工程师",
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 19);
}

function submitterName(item: FeedbackItem) {
  return item.submitterName || item.submitterUsername || "-";
}

export function Feedback() {
  const { hasPermission } = useAuth();
  const canManageFeedback = hasPermission("feedback.manage");
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        status,
        pageSize: "100",
      });
      const data = await api.get(`/feedback?${params.toString()}`);
      setItems((data?.items || []) as FeedbackItem[]);
      setTotal(Number(data?.total || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return items;
    return items.filter((item) => [
      item.content,
      item.pagePath,
      submitterName(item),
      ROLE_LABEL[item.submitterRole || ""] || item.submitterRole,
      TYPE_LABEL[item.type],
    ]
      .filter(Boolean)
      .some((value) => matchesSearchText(value, keyword)));
  }, [items, query]);

  async function updateStatus(item: FeedbackItem, nextStatus: "open" | "resolved") {
    setUpdatingId(item.id);
    setError("");
    try {
      await api.put(`/feedback/${item.id}/status`, { status: nextStatus });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">反馈</h1>
          <p className="text-muted-foreground mt-1">查看用户随手提交的问题和建议</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          刷新
        </Button>
      </div>

      <ErrorToast message={error} />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索内容、提交人、页面…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">未处理</SelectItem>
                <SelectItem value="resolved">已处理</SelectItem>
                <SelectItem value="all">全部</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            共 {total} 条，当前显示 {filtered.length} 条
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          正在加载…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-3 h-8 w-8" />
            暂无反馈
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.type === "problem" ? "destructive" : "secondary"}>
                        {TYPE_LABEL[item.type]}
                      </Badge>
                      <Badge variant={item.status === "open" ? "warning" : "default"}>
                        {item.status === "open" ? "未处理" : "已处理"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                      {item.content}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>提交人：{submitterName(item)}</span>
                      <span>角色：{ROLE_LABEL[item.submitterRole || ""] || item.submitterRole || "-"}</span>
                      <span>页面：{item.pagePath || "-"}</span>
                      {item.status === "resolved" && (
                        <span>处理：{item.resolvedByName || "-"} · {formatDateTime(item.resolvedAt)}</span>
                      )}
                    </div>
                  </div>
                  {canManageFeedback ? (
                    <Button
                      variant={item.status === "open" ? "default" : "outline"}
                      disabled={updatingId === item.id}
                      onClick={() => updateStatus(item, item.status === "open" ? "resolved" : "open")}
                    >
                      {updatingId === item.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : item.status === "open" ? (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      ) : (
                        <Circle className="mr-2 h-4 w-4" />
                      )}
                      {item.status === "open" ? "标记已处理" : "改回未处理"}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
