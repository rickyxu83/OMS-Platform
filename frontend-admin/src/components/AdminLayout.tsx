import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  Users,
  Server,
  Building2,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  MessageSquare,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Languages,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { toast } from "sonner";
import { ADMIN_WORKSPACE_LABEL, ADMIN_WORKSPACE_LABEL_HANT, APP_VERSION, goToWorkspace } from "@/config/app";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, type AppLang } from "@/contexts/LanguageContext";
import { api } from "@/services/api";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  requiredRoles?: string[];
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

interface NavConfigItem {
  labelKey: string;
  icon: any;
  path: string;
  requiredRoles?: string[];
}

const STRINGS: Record<AppLang, {
  brand: { title: string; subtitle: string; version: string }
  common: {
    systemName: string
    quickNav: string
    quickNavTitle: string
    quickNavPlaceholder: string
    quickNavEmpty: string
    langShort: string
    switchedToCn: string
    switchedToTw: string
    switchEngineer: string
    feedback: string
    feedbackTitle: string
    feedbackType: string
    feedbackProblem: string
    feedbackSuggestion: string
    feedbackContent: string
    feedbackPlaceholder: string
    feedbackSubmit: string
    feedbackSuccess: string
    feedbackEmpty: string
  }
  groups: Record<string, string>
  pages: Record<string, string>
  roles: Record<string, string>
}> = {
  "zh-CN": {
    brand: {
      title: "OMS Platform",
      subtitle: "运维智管",
      version: "系统版本",
    },
    common: {
      systemName: ADMIN_WORKSPACE_LABEL,
      quickNav: "快速跳转",
      quickNavTitle: "快速跳转",
      quickNavPlaceholder: "搜索模块名称…",
      quickNavEmpty: "未找到匹配的模块",
      langShort: "简体",
      switchedToCn: "已切换至简体中文",
      switchedToTw: "已切换至繁體中文",
      switchEngineer: "工程师工作台",
      feedback: "反馈",
      feedbackTitle: "反馈",
      feedbackType: "类型",
      feedbackProblem: "遇到问题",
      feedbackSuggestion: "功能建议",
      feedbackContent: "内容",
      feedbackPlaceholder: "简单写一下遇到的问题或想法…",
      feedbackSubmit: "提交",
      feedbackSuccess: "反馈已提交",
      feedbackEmpty: "请填写反馈内容",
    },
    groups: {
      workspace: "工作台",
      orders: "工单与巡检",
      assets: "客户与资产",
      reports: "报表中心",
      system: "系统与权限",
    },
    pages: {
      dashboard: "运营总览",
      "service-orders": "工单处理",
      "inspection-schedules": "巡检计划",
      customers: "客户档案",
      devices: "设备资产",
      "maintenance-parties": "维保方目录",
      timesheets: "月报导出",
      users: "成员与角色",
      "audit-logs": "操作审计",
      settings: "系统设置",
      feedback: "反馈",
    },
    roles: {
      admin: "管理员",
      assistant: "助理",
      dispatcher: "调度",
      operations_director: "运营负责人",
      engineering_supervisor: "工程主管",
      administrative_supervisor: "行政主管",
      sales_supervisor: "业务主管",
      sales: "业务",
      engineer: "工程师",
    },
  },
  "zh-TW": {
    brand: {
      title: "OMS Platform",
      subtitle: "運維智管",
      version: "系統版本",
    },
    common: {
      systemName: ADMIN_WORKSPACE_LABEL_HANT,
      quickNav: "快速跳轉",
      quickNavTitle: "快速跳轉",
      quickNavPlaceholder: "搜尋模組名稱…",
      quickNavEmpty: "未找到匹配的模組",
      langShort: "繁體",
      switchedToCn: "已切換至简体中文",
      switchedToTw: "已切換至繁體中文",
      switchEngineer: "工程師工作臺",
      feedback: "回饋",
      feedbackTitle: "回饋",
      feedbackType: "類型",
      feedbackProblem: "遇到問題",
      feedbackSuggestion: "功能建議",
      feedbackContent: "內容",
      feedbackPlaceholder: "簡單寫一下遇到的問題或想法…",
      feedbackSubmit: "提交",
      feedbackSuccess: "回饋已提交",
      feedbackEmpty: "請填寫回饋內容",
    },
    groups: {
      workspace: "工作臺",
      orders: "工單與巡檢",
      assets: "客戶與資產",
      reports: "報表中心",
      system: "系統與權限",
    },
    pages: {
      dashboard: "運營總覽",
      "service-orders": "工單處理",
      "inspection-schedules": "巡檢計畫",
      customers: "客戶檔案",
      devices: "設備資產",
      "maintenance-parties": "維保方目錄",
      timesheets: "月報導出",
      users: "成員與角色",
      "audit-logs": "操作審計",
      settings: "系統設定",
      feedback: "回饋",
    },
    roles: {
      admin: "管理員",
      assistant: "助理",
      dispatcher: "調度",
      operations_director: "營運負責人",
      engineering_supervisor: "工程主管",
      administrative_supervisor: "行政主管",
      sales_supervisor: "業務主管",
      sales: "業務",
      engineer: "工程師",
    },
  },
};

const NAV_CONFIG: Array<{ groupKey: string; items: NavConfigItem[] }> = [
  {
    groupKey: "workspace",
    items: [
      { labelKey: "dashboard", icon: LayoutDashboard, path: "dashboard" },
    ],
  },
  {
    groupKey: "orders",
    items: [
      { labelKey: "service-orders", icon: FileText, path: "service-orders" },
      { labelKey: "inspection-schedules", icon: ClipboardCheck, path: "inspection-schedules" },
    ],
  },
  {
    groupKey: "assets",
    items: [
      { labelKey: "customers", icon: Users, path: "customers" },
      { labelKey: "devices", icon: Server, path: "devices" },
      { labelKey: "maintenance-parties", icon: Building2, path: "maintenance-parties" },
    ],
  },
  {
    groupKey: "reports",
    items: [
      { labelKey: "timesheets", icon: BarChart3, path: "timesheets" },
    ],
  },
  {
    groupKey: "system",
    items: [
      {
        labelKey: "users",
        icon: Settings,
        path: "users",
        requiredRoles: ["admin", "dispatcher", "operations_director", "engineering_supervisor", "administrative_supervisor", "sales_supervisor"],
      },
      {
        labelKey: "audit-logs",
        icon: Shield,
        path: "audit-logs",
        requiredRoles: ["admin", "operations_director", "engineering_supervisor"],
      },
      {
        labelKey: "settings",
        icon: Settings,
        path: "settings",
        requiredRoles: ["admin", "operations_director", "engineering_supervisor"],
      },
      {
        labelKey: "feedback",
        icon: MessageSquare,
        path: "feedback",
      },
    ],
  },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

function formatHeaderTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { lang, toggleLang } = useLanguage();
  const currentUser = user || { name: "", role: "" };
  const currentPage = location.pathname.replace(/^\//, "") || "dashboard";
  const [sidebarOpen, setSidebarOpen] = useState(() => (
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches
  ));
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"problem" | "suggestion">("problem");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const strings = STRINGS[lang];
  const logoSrc = `${import.meta.env.BASE_URL}dunyang-mark.png`;
  const appVersion = APP_VERSION;
  const canSwitchEngineer = Array.isArray(user?.availableWorkspaces)
    && user.availableWorkspaces.some((workspace: { key?: string }) => workspace.key === "engineer");

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const syncSidebar = () => setSidebarOpen(media.matches);
    syncSidebar();
    media.addEventListener("change", syncSidebar);
    return () => media.removeEventListener("change", syncSidebar);
  }, []);

  const handleLangToggle = () => {
    const nextLang = lang === "zh-CN" ? "zh-TW" : "zh-CN";
    toggleLang();
    toast.success(nextLang === "zh-TW" ? STRINGS[nextLang].common.switchedToTw : STRINGS[nextLang].common.switchedToCn);
  };

  const hasAccess = (requiredRoles?: string[]) => {
    if (!requiredRoles) return true;
    return requiredRoles.includes(currentUser.role);
  };

  const navGroups: NavGroup[] = useMemo(() => (
    NAV_CONFIG.map((group) => ({
      group: strings.groups[group.groupKey],
      items: group.items.map((item) => ({
        label: strings.pages[item.labelKey],
        icon: item.icon,
        path: item.path,
        requiredRoles: item.requiredRoles,
      })),
    }))
  ), [strings]);

  const allNavItems = navGroups.flatMap(g => g.items).filter(item => hasAccess(item.requiredRoles));

  const filteredNavItems = searchQuery
    ? allNavItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allNavItems;

  const mobileNavItems = allNavItems.filter((item) => (
    ["dashboard", "service-orders", "inspection-schedules", "customers", "devices"].includes(item.path)
  ));

  const navigateTo = (path: string) => {
    navigate(`/${path}`);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  };

  const submitFeedback = async () => {
    const content = feedbackContent.trim();
    if (!content) {
      toast.error(strings.common.feedbackEmpty);
      return;
    }

    setFeedbackSubmitting(true);
    try {
      await api.post("/feedback", {
        type: feedbackType,
        content,
        pagePath: location.pathname,
      });
      toast.success(strings.common.feedbackSuccess);
      setFeedbackContent("");
      setFeedbackType("problem");
      setFeedbackOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0 lg:w-64" : "-translate-x-full lg:w-0 lg:translate-x-0"
        } fixed inset-y-0 left-0 z-40 w-[82vw] max-w-[320px] transition-transform duration-300 bg-sidebar border-r border-sidebar-border flex-shrink-0 overflow-hidden shadow-2xl lg:relative lg:z-auto lg:max-w-none lg:shadow-none lg:transition-all`}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-[76px] flex items-center px-6 border-b border-sidebar-border/50">
            <div className="flex items-center gap-3">
              <div className="admin-brand-mark">
                <img src={logoSrc} alt="" aria-hidden="true" />
              </div>
              <div>
                <span className="font-bold text-base leading-tight block text-sidebar-foreground">
                  <span className="block">{strings.brand.title}</span>
                  <span className="block">{strings.brand.subtitle}</span>
                </span>
                <span className="text-xs text-muted-foreground uppercase font-semibold">{strings.common.systemName}</span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            {navGroups.map((group) => {
              const visibleItems = group.items.filter(item => hasAccess(item.requiredRoles));
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.group} className="mb-6">
                  <div className="px-3 mb-2 text-xs font-medium text-muted-foreground">
                    {group.group}
                  </div>
                  <div className="space-y-1">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentPage === item.path;
                      return (
                        <button
                          key={item.path}
                          onClick={() => navigateTo(item.path)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                            isActive
                              ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className={`w-4 h-4 transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-110"}`} />
                            <span className="text-sm font-medium">{item.label}</span>
                          </div>
                          {isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Sidebar Footer - Version Info */}
          <div className="p-4 border-t border-sidebar-border/50 bg-sidebar-accent/10">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-muted-foreground font-medium uppercase">{strings.brand.version}</span>
              <Badge variant="outline" className="text-xs h-4 py-0 px-1.5 font-mono opacity-70 border-sidebar-border/50">{appVersion}</Badge>
            </div>
            <div className="mt-2 px-2">
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline-offset-2 hover:underline"
              >
                浙ICP备2026045692号
              </a>
            </div>
          </div>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] lg:hidden"
          aria-label="关闭导航菜单"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f9fafb] relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
        
        {/* Top Bar */}
        <header className="h-14 bg-card/90 backdrop-blur-md sticky top-0 z-10 border-b border-border flex items-center justify-between px-3 flex-shrink-0 lg:h-[76px] lg:px-6">
          <div className="flex min-w-0 items-center gap-2 lg:gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-8 w-8 border-border/70 bg-background/70 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">{strings.common.systemName}</span>
              <span className="hidden sm:inline">/</span>
              <span className="truncate text-base font-semibold text-foreground sm:text-sm sm:font-medium">{strings.pages[currentPage] || currentPage}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 lg:hidden">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuickNavOpen(true)}
              className="h-8 w-8"
              aria-label={strings.common.quickNav}
            >
              <Search className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFeedbackOpen(true)}
              className="h-8 w-8"
              aria-label={strings.common.feedback}
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLangToggle}
              className="h-8 px-2 text-xs"
            >
              {strings.common.langShort}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              aria-label="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

          <div className="hidden items-center gap-6 lg:flex">
            <div className="text-sm text-muted-foreground">
              {formatHeaderTime(currentTime)}
            </div>

            {/* Quick Nav */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickNavOpen(true)}
              className="gap-2"
            >
              <Search className="w-4 h-4" />
              {strings.common.quickNav}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFeedbackOpen(true)}
              className="gap-2 px-2 hover:bg-primary/5 hover:text-primary transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              {strings.common.feedback}
            </Button>

            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLangToggle}
              className="gap-2 px-2 hover:bg-primary/5 hover:text-primary transition-colors"
            >
              <Languages className="w-4 h-4" />
              <span className="text-xs font-medium">{strings.common.langShort}</span>
            </Button>

            {canSwitchEngineer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToWorkspace("engineer")}
              >
                {strings.common.switchEngineer}
              </Button>
            )}

            <Separator orientation="vertical" className="h-8" />

            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium">{currentUser.name}</div>
                <div className="text-xs text-muted-foreground">
                  {strings.roles[currentUser.role] || currentUser.role}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="mobile-admin-content flex-1 overflow-auto bg-transparent relative z-0 pb-20 lg:pb-0">
          {children}
        </main>

        {mobileNavItems.length > 0 && (
          <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-2 pt-1.5 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-md lg:hidden">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${mobileNavItems.length}, minmax(0, 1fr))` }}
            >
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigateTo(item.path)}
                    className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="w-full truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>

      {/* Quick Navigation Dialog */}
      <Dialog open={quickNavOpen} onOpenChange={setQuickNavOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{strings.common.quickNavTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={strings.common.quickNavPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigateTo(item.path);
                      setQuickNavOpen(false);
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    <Icon className="w-5 h-5 text-primary" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
              {filteredNavItems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {strings.common.quickNavEmpty}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{strings.common.feedbackTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">{strings.common.feedbackType}</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["problem", strings.common.feedbackProblem],
                  ["suggestion", strings.common.feedbackSuggestion],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={feedbackType === value ? "default" : "outline"}
                    onClick={() => setFeedbackType(value as "problem" | "suggestion")}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">{strings.common.feedbackContent}</div>
              <Textarea
                value={feedbackContent}
                onChange={(event) => setFeedbackContent(event.target.value)}
                placeholder={strings.common.feedbackPlaceholder}
                className="min-h-[120px]"
                maxLength={2000}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFeedbackOpen(false)} disabled={feedbackSubmitting}>
                取消
              </Button>
              <Button onClick={submitFeedback} disabled={feedbackSubmitting}>
                {feedbackSubmitting ? "提交中…" : strings.common.feedbackSubmit}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
