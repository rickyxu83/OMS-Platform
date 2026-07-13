import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useLocation, useNavigationType } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardPenLine,
  FileText,
  ClipboardCheck,
  Users,
  Server,
  Building2,
  BarChart3,
  CalendarClock,
  Settings,
  Shield,
  LogOut,
  MessageSquare,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Languages,
  ChevronUp,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Separator } from "./ui/separator";
import { toast } from "sonner";
import { ADMIN_WORKSPACE_LABEL, ADMIN_WORKSPACE_LABEL_HANT, APP_VERSION, goToWorkspace } from "@/config/app";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, type AppLang } from "@/contexts/LanguageContext";
import { MarkdownContent } from "@/lib/markdown";
import { matchesSearchText } from "@/lib/text-i18n";
import { api } from "@/services/api";
import { MySettingsDialog, UserAvatar } from "./MySettingsDialog";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  requiredPermissions?: string[];
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

interface NavConfigItem {
  labelKey: string;
  icon: any;
  path: string;
  requiredPermissions?: string[];
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
      title: "OMS · 运维智管",
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
      switchEngineer: "工单填写",
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
      "service-report": "工单填写",
      "service-orders": "工单处理",
      "inspection-schedules": "巡检计划",
      customers: "客户档案",
      devices: "设备资产",
      "maintenance-parties": "维保方目录",
      attendance: "考勤管理",
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
      title: "OMS · 運維智管",
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
      switchEngineer: "工單填寫",
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
      "service-report": "工單填寫",
      "service-orders": "工單處理",
      "inspection-schedules": "巡檢計畫",
      customers: "客戶檔案",
      devices: "設備資產",
      "maintenance-parties": "維保方目錄",
      attendance: "考勤管理",
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
      { labelKey: "dashboard", icon: LayoutDashboard, path: "dashboard", requiredPermissions: ["order.view", "order.engineer.own"] },
    ],
  },
  {
    groupKey: "orders",
    items: [
      { labelKey: "service-report", icon: ClipboardPenLine, path: "service-report", requiredPermissions: ["order.engineer.own"] },
      { labelKey: "service-orders", icon: FileText, path: "service-orders", requiredPermissions: ["order.view"] },
      { labelKey: "inspection-schedules", icon: ClipboardCheck, path: "inspection-schedules", requiredPermissions: ["inspection.view"] },
    ],
  },
  {
    groupKey: "assets",
    items: [
      { labelKey: "customers", icon: Users, path: "customers", requiredPermissions: ["customer.view"] },
      { labelKey: "devices", icon: Server, path: "devices", requiredPermissions: ["device.view"] },
      { labelKey: "maintenance-parties", icon: Building2, path: "maintenance-parties", requiredPermissions: ["maintenance-party.view"] },
    ],
  },
  {
    groupKey: "reports",
    items: [
      { labelKey: "attendance", icon: CalendarClock, path: "attendance", requiredPermissions: ["attendance.apply", "attendance.view", "attendance.admin.approve", "attendance.manage"] },
      { labelKey: "timesheets", icon: BarChart3, path: "timesheets", requiredPermissions: ["timesheet.view"] },
    ],
  },
  {
    groupKey: "system",
    items: [
      {
        labelKey: "users",
        icon: Settings,
        path: "users",
        requiredPermissions: ["user.view"],
      },
      {
        labelKey: "audit-logs",
        icon: Shield,
        path: "audit-logs",
        requiredPermissions: ["audit-log.view"],
      },
      {
        labelKey: "settings",
        icon: Settings,
        path: "settings",
        requiredPermissions: ["settings.view"],
      },
      {
        labelKey: "feedback",
        icon: MessageSquare,
        path: "feedback",
        requiredPermissions: ["feedback.manage"],
      },
    ],
  },
];

const MOBILE_NAV_LABELS: Record<string, string> = {
  dashboard: "首页",
  "service-orders": "工单",
  "service-report": "填写",
};

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface Announcement {
  id: number;
  title: string;
  contentMarkdown: string;
  kind: "info" | "warning" | "success";
}

function displayUserName(user: Record<string, any> | null | undefined) {
  return String(user?.realName || user?.name || user?.username || "用户");
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const { user, logout, hasPermission } = useAuth();
  const { lang, setLang } = useLanguage();
  const contentRef = useRef<HTMLElement | null>(null);
  const previousLocationKeyRef = useRef(location.key);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const currentUser = user || { name: "", role: "" };
  const rawCurrentPage = location.pathname.replace(/^\//, "") || "dashboard";
  const currentPage = rawCurrentPage.startsWith("service-report") ? "service-report" : rawCurrentPage;
  const isServiceReportFormPage = /^\/service-report\/(?:new|[^/]+)/.test(location.pathname);
  const hideMobileChrome = isServiceReportFormPage;
  const [sidebarOpen, setSidebarOpen] = useState(() => (
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches
  ));
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"problem" | "suggestion">("problem");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const [mySettingsOpen, setMySettingsOpen] = useState(false);
  const strings = STRINGS[lang];
  const logoSrc = `${import.meta.env.BASE_URL}dunyang-mark.png`;
  const appVersion = APP_VERSION;
  const layoutStyle = { "--admin-sidebar-width": sidebarOpen ? "16rem" : "0px" } as CSSProperties;
  const lastMobileScrollTopRef = useRef(0);
  const canSwitchEngineer = user?.role !== "engineer"
    && Array.isArray(user?.availableWorkspaces)
    && user.availableWorkspaces.some((workspace: { key?: string }) => workspace.key === "engineer");

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const previousKey = previousLocationKeyRef.current;
    if (previousKey && previousKey !== location.key) {
      scrollPositionsRef.current.set(previousKey, content.scrollTop);
    }

    const nextTop = navigationType === "POP"
      ? scrollPositionsRef.current.get(location.key) ?? 0
      : 0;

    const restoreScroll = () => {
      contentRef.current?.scrollTo({ top: nextTop, left: 0, behavior: "auto" });
    };
    const frame = window.requestAnimationFrame(restoreScroll);
    const timers = [50, 150, 300].map((delay) => window.setTimeout(restoreScroll, delay));
    previousLocationKeyRef.current = location.key;
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [location.key, navigationType]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 1023px)");
    const handleScroll = () => {
      if (!media.matches) {
        setMobileNavVisible(true);
        return;
      }
      const currentTop = content.scrollTop;
      const previousTop = lastMobileScrollTopRef.current;
      const delta = currentTop - previousTop;
      lastMobileScrollTopRef.current = currentTop;

      if (currentTop < 24 || delta < -8) {
        setMobileNavVisible(true);
        return;
      }
      if (delta > 10 && currentTop > 80) {
        setMobileNavVisible(false);
      }
    };

    setMobileNavVisible(true);
    lastMobileScrollTopRef.current = content.scrollTop;
    content.addEventListener("scroll", handleScroll, { passive: true });
    return () => content.removeEventListener("scroll", handleScroll);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const syncSidebar = () => setSidebarOpen(media.matches);
    syncSidebar();
    media.addEventListener("change", syncSidebar);
    return () => media.removeEventListener("change", syncSidebar);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get("/announcements/unread")
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setAnnouncements(items);
        setAnnouncementOpen(items.length > 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleLangToggle = () => {
    const nextLang = lang === "zh-CN" ? "zh-TW" : "zh-CN";
    setLang(nextLang);
    toast.success(nextLang === "zh-TW" ? STRINGS[nextLang].common.switchedToTw : STRINGS[nextLang].common.switchedToCn);
  };

  const hasAccess = (requiredPermissions?: string[]) => {
    if (!requiredPermissions) return true;
    return hasPermission(...requiredPermissions);
  };

  const navGroups: NavGroup[] = useMemo(() => (
    NAV_CONFIG.map((group) => ({
      group: strings.groups[group.groupKey],
      items: group.items.map((item) => ({
        label: strings.pages[item.labelKey],
        icon: item.icon,
        path: item.path,
        requiredPermissions: item.requiredPermissions,
      })),
    }))
  ), [strings]);

  const allNavItems = navGroups.flatMap(g => g.items).filter(item => hasAccess(item.requiredPermissions));

  const filteredNavItems = searchQuery
    ? allNavItems.filter(item =>
        matchesSearchText(item.label, searchQuery)
      )
    : allNavItems;

  const mobileNavPriority = ["dashboard", "service-orders", "service-report"];
  const mobileNavItems = mobileNavPriority
    .map((path) => allNavItems.find((item) => item.path === path))
    .filter(Boolean) as NavItem[];

  const navigateTo = (path: string) => {
    navigate(`/${path}`);
    setMobileNavVisible(true);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  };

  const logoutToLogin = () => {
    setQuickNavOpen(false);
    setFeedbackOpen(false);
    setAnnouncementOpen(false);
    setMySettingsOpen(false);
    logout();
    window.setTimeout(() => {
      window.location.replace(`${import.meta.env.BASE_URL}login`);
    }, 0);
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

  const currentAnnouncement = announcements[0] || null;

  const acknowledgeAnnouncement = async () => {
    if (!currentAnnouncement || announcementSubmitting) return;
    setAnnouncementSubmitting(true);
    try {
      await api.post(`/announcements/${currentAnnouncement.id}/read`);
      setAnnouncements((items) => {
        const nextItems = items.filter((item) => item.id !== currentAnnouncement.id);
        setAnnouncementOpen(nextItems.length > 0);
        return nextItems;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "确认公告失败");
    } finally {
      setAnnouncementSubmitting(false);
    }
  };

  const announcementIcon = currentAnnouncement?.kind === "warning"
    ? "⚠️"
    : currentAnnouncement?.kind === "success"
      ? "✅"
      : "📣";
  const currentRoleLabel = strings.roles[currentUser.role] || currentUser.role || "";
  const currentDisplayName = displayUserName(currentUser);

  return (
    <div className="flex h-screen bg-background" style={layoutStyle}>
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0 lg:w-64" : "-translate-x-full lg:w-0 lg:translate-x-0"
        } fixed inset-y-0 left-0 z-40 w-[82vw] max-w-[320px] transition-transform duration-300 bg-sidebar border-r border-sidebar-border flex-shrink-0 overflow-hidden shadow-2xl lg:relative lg:z-auto lg:max-w-none lg:shadow-none lg:transition-all`}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-sidebar-border/50 px-5">
            <div className="flex items-center gap-2.5">
              <div className="admin-brand-mark">
                <img src={logoSrc} alt="" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <span className="block truncate text-sm font-bold leading-tight text-sidebar-foreground">
                  {strings.brand.title}
                </span>
                <span className="block truncate text-xs font-semibold uppercase text-muted-foreground">{strings.common.systemName}</span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            {navGroups.map((group) => {
              const visibleItems = group.items.filter(item => hasAccess(item.requiredPermissions));
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
          <div className="flex h-11 items-center border-t border-sidebar-border/50 bg-sidebar-accent/10 px-4">
            <div className="flex w-full items-center justify-between px-2">
              <span className="text-xs text-muted-foreground font-medium uppercase">{strings.brand.version}</span>
              <span className="text-xs font-mono text-muted-foreground">{appVersion}</span>
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
        <header className={`h-14 bg-card/90 backdrop-blur-md sticky top-0 z-10 border-b border-border items-center justify-between px-3 flex-shrink-0 lg:h-16 lg:px-4 xl:px-6 ${hideMobileChrome ? "hidden lg:flex" : "flex"}`}>
          <div className="flex min-w-0 items-center gap-2 lg:gap-3 xl:gap-4">
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
              <span className="hidden whitespace-nowrap sm:inline">{strings.common.systemName}</span>
              <span className="hidden sm:inline">/</span>
              <span className="min-w-0 max-w-[8rem] truncate text-base font-semibold text-foreground sm:text-sm sm:font-medium xl:max-w-none">{strings.pages[currentPage] || currentPage}</span>
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
              className="h-8 w-8 rounded-full p-0"
              onClick={() => setMySettingsOpen(true)}
              aria-label="我的设置"
            >
              <UserAvatar user={currentUser} className="h-8 w-8" textClassName="text-xs" />
            </Button>
          </div>

          <div className="hidden min-w-0 flex-shrink-0 items-center gap-3 lg:flex">
            <div className="flex items-center gap-2">
              {/* Quick Nav */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuickNavOpen(true)}
                className="gap-2"
                aria-label={strings.common.quickNav}
              >
                <Search className="w-4 h-4" />
                <span className="hidden xl:inline">{strings.common.quickNav}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFeedbackOpen(true)}
                className="gap-2 px-2 hover:bg-primary/5 hover:text-primary transition-colors"
                aria-label={strings.common.feedback}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden xl:inline">{strings.common.feedback}</span>
              </Button>

              {/* Language Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLangToggle}
                className="gap-2 px-2 hover:bg-primary/5 hover:text-primary transition-colors"
                aria-label={strings.common.langShort}
              >
                <Languages className="w-4 h-4" />
                <span className="hidden text-xs font-medium xl:inline">{strings.common.langShort}</span>
              </Button>

              {canSwitchEngineer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToWorkspace("engineer")}
                  className="hidden xl:inline-flex"
                >
                  {strings.common.switchEngineer}
                </Button>
              )}
            </div>

            <Separator orientation="vertical" className="hidden h-8 xl:block" />

            {/* User Info */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-3 rounded-full px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  aria-label="打开我的设置"
                >
                  <div className="hidden min-w-0 text-right xl:block">
                    <div className="max-w-[9rem] truncate whitespace-nowrap text-sm font-medium">{currentDisplayName}</div>
                    <div className="whitespace-nowrap text-xs text-muted-foreground">
                      {currentRoleLabel}
                    </div>
                  </div>
                  <UserAvatar user={currentUser} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="min-w-0">
                    <div className="truncate">{currentDisplayName}</div>
                    <div className="truncate text-xs font-normal text-muted-foreground">{currentRoleLabel}</div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setMySettingsOpen(true)}>
                  <Settings className="h-4 w-4" />
                  我的设置
                </DropdownMenuItem>
                {canSwitchEngineer ? (
                  <DropdownMenuItem onSelect={() => goToWorkspace("engineer")}>
                    <ClipboardPenLine className="h-4 w-4" />
                    工单填写
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={logoutToLogin} variant="destructive">
                  <LogOut className="h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main
          ref={contentRef}
          className={`mobile-admin-content relative z-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-transparent lg:pb-0 ${hideMobileChrome ? "pb-0" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"}`}
        >
          {children}
        </main>

        {!hideMobileChrome && mobileNavItems.length > 0 && (
          <nav
            className={`mobile-bottom-nav fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-3 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-md transition-transform duration-200 lg:hidden ${
              mobileNavVisible ? "translate-y-0" : "translate-y-[calc(100%-0.35rem)]"
            }`}
            onFocusCapture={() => setMobileNavVisible(true)}
          >
            <div
              className="mx-auto grid max-w-md gap-1.5"
              style={{ gridTemplateColumns: `repeat(${mobileNavItems.length}, minmax(0, 1fr))` }}
            >
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.path;
                const label = MOBILE_NAV_LABELS[item.path] || item.label;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigateTo(item.path)}
                    className={`flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
        {!hideMobileChrome && mobileNavItems.length > 0 && !mobileNavVisible && (
          <button
            type="button"
            className="fixed bottom-[calc(0.45rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-8 w-14 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-lg backdrop-blur-md lg:hidden"
            onClick={() => setMobileNavVisible(true)}
            aria-label="显示底部导航"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
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

      <Dialog
        open={announcementOpen && Boolean(currentAnnouncement)}
        onOpenChange={(open) => {
          if (!open) acknowledgeAnnouncement();
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <span aria-hidden="true" className="text-xl">{announcementIcon}</span>
              <span>{currentAnnouncement?.title || "公告"}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[56vh] overflow-y-auto rounded-lg border bg-slate-50/70 p-4">
            <MarkdownContent content={currentAnnouncement?.contentMarkdown || ""} />
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={acknowledgeAnnouncement} disabled={announcementSubmitting}>
              {announcementSubmitting ? "确认中…" : announcements.length > 1 ? `已读，下一条 (${announcements.length - 1})` : "已读并关闭"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MySettingsDialog
        open={mySettingsOpen}
        onOpenChange={setMySettingsOpen}
        roleLabel={currentRoleLabel}
      />
    </div>
  );
}
