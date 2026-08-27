import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useLocation, useNavigationType } from "react-router-dom";
import { SHOW_ATTENDANCE } from "@/lib/feature-flags";
import {
  LayoutDashboard,
  ListTodo,
  ClipboardPenLine,
  FileText,
  FileSignature,
  ClipboardCheck,
  Users,
  Server,
  Building2,
  BarChart3,
  CalendarClock,
  Settings,
  Shield,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Languages,
  ChevronUp,
  TriangleAlert,
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
import { toast } from "sonner";
import { ADMIN_WORKSPACE_LABEL, ADMIN_WORKSPACE_LABEL_HANT, APP_VERSION, goToWorkspace } from "@/config/app";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, type AppLang } from "@/contexts/LanguageContext";
import { MarkdownContent } from "@/lib/markdown";
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
      "approval-tasks": "待办中心",
      "service-report": "工单填写",
      "service-orders": "工单处理",
      mr: "订购申请（MR）",
      "inspection-schedules": "巡检计划",
      customers: "客户档案",
      devices: "设备资产",
      "maintenance-parties": "维保方目录",
      attendance: "考勤管理",
      "attendance-duty": "工程值班",
      timesheets: "月报导出",
      users: "成员与角色",
      "audit-logs": "操作审计",
      settings: "系统设置",
    },
    roles: {
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
      "approval-tasks": "待辦中心",
      "service-report": "工單填寫",
      "service-orders": "工單處理",
      mr: "訂購申請（MR）",
      "inspection-schedules": "巡檢計畫",
      customers: "客戶檔案",
      devices: "設備資產",
      "maintenance-parties": "維保方目錄",
      attendance: "考勤管理",
      "attendance-duty": "工程值班",
      timesheets: "月報導出",
      users: "成員與角色",
      "audit-logs": "操作審計",
      settings: "系統設定",
    },
    roles: {
      admin: "管理員",
      assistant: "助理",
      assistant_supervisor: "助理主管",
      dispatcher: "調度",
      operations_director: "營運負責人",
      engineering_supervisor: "工程主管",
      administrative_supervisor: "行政主管",
      sales_supervisor: "業務主管",
      sales: "業務",
      engineer: "工程師",
      purchaser: "採購",
    },
  },
};

const NAV_CONFIG: Array<{ groupKey: string; items: NavConfigItem[] }> = [
  {
    groupKey: "workspace",
    items: [
      { labelKey: "dashboard", icon: LayoutDashboard, path: "dashboard", requiredPermissions: ["order.view", "order.engineer.own"] },
      { labelKey: "approval-tasks", icon: ListTodo, path: "approval-tasks" },
    ],
  },
  {
    groupKey: "orders",
    items: [
      { labelKey: "service-report", icon: ClipboardPenLine, path: "service-report", requiredPermissions: ["order.engineer.own"] },
      { labelKey: "service-orders", icon: FileText, path: "service-orders", requiredPermissions: ["order.view"] },
      { labelKey: "mr", icon: FileSignature, path: "mr", requiredPermissions: ["mr.view"] },
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
      { labelKey: "attendance", icon: CalendarClock, path: "attendance", requiredPermissions: ["attendance.apply", "attendance.approve", "attendance.view", "attendance.report.export", "attendance.admin.approve", "attendance.manage"] },
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
    ],
  },
];

/** 暗启动隐藏入口：考勤（SHOW_ATTENDANCE=false 时从导航剔除，桌面与移动端共用 navGroups 过滤点）；MR/待办已点亮常驻 */
const FEATURE_FLAG_HIDDEN_NAV_PATHS = new Set(["attendance"]);

const MOBILE_NAV_LABELS: Record<string, string> = {
  dashboard: "首页",
  "service-orders": "工单",
  "service-report": "填写",
  attendance: "考勤",
  "approval-tasks": "待办",
};

/** 移动端底栏入口按角色排序（无权限项会被 allNavItems 访问过滤自动去掉） */
const MOBILE_NAV_PRIORITY_BY_ROLE: Record<string, string[]> = {
  engineer: ["dashboard", "service-report", "service-orders", "attendance"],
};
const MOBILE_NAV_PRIORITY_DEFAULT = ["dashboard", "service-orders", "service-report", "attendance", "approval-tasks"];

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface Announcement {
  id: number;
  title: string;
  contentMarkdown: string;
  kind: "info" | "warning" | "success";
}

/** 导航待办角标：三处入口（考勤/MR/待办中心）统一红色胶囊样式 */
function NavCountBadge({ count }: { count: number }) {
  return (
    <span className="min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function displayUserName(user: Record<string, any> | null | undefined) {
  return String(user?.realName || user?.name || user?.username || "用户");
}

const IS_TEST_SERVER = String(import.meta.env.VITE_APP_ENVIRONMENT || "").toLowerCase() === "test";

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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const [mySettingsOpen, setMySettingsOpen] = useState(false);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [mrPendingCount, setMrPendingCount] = useState(0);
  const strings = STRINGS[lang];
  const logoSrc = `${import.meta.env.BASE_URL}dunyang-mark.png`;
  const appVersion = APP_VERSION;
  const layoutStyle = { "--admin-sidebar-width": sidebarOpen ? "16rem" : "0px" } as CSSProperties;
  const lastMobileScrollTopRef = useRef(0);
  const canSwitchEngineer = user?.role !== "engineer"
    && Array.isArray(user?.availableWorkspaces)
    && user.availableWorkspaces.some((workspace: { key?: string }) => workspace.key === "engineer");

  // 考勤待审批数量：给左侧「考勤管理」入口显示徽标。口径与考勤页 approvalTodos 一致（后端接口保证）。
  const canApproveAttendance = hasPermission(
    "attendance.approve", "attendance.view", "attendance.manage",
    "attendance.admin.approve", "attendance.hr.approve", "attendance.vp.approve",
  );
  const [attendancePendingCount, setAttendancePendingCount] = useState(0);
  useEffect(() => {
    if (!SHOW_ATTENDANCE || !canApproveAttendance) return;
    let cancelled = false;
    async function loadPendingCount() {
      try {
        const data = await api.get("/attendance/requests/pending-count");
        if (!cancelled) setAttendancePendingCount(Number(data?.count || 0));
      } catch {
        // 徽标是辅助提示，拉取失败静默处理，不打断页面
      }
    }
    loadPendingCount();
    return () => {
      cancelled = true;
    };
    // location.key 变化时重新拉取，保证审批后切换页面能刷新徽标
  }, [canApproveAttendance, location.key]);

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

  useEffect(() => {
    let active = true;
    const load = () => api.get("/approval-tasks?view=pending")
      .then((data) => {
        if (!active) return;
        setPendingTaskCount(Number(data?.pendingCount || 0));
        // MR 系待办（签核/采购/合同）计数：给左侧「订购申请 MR」入口挂角标
        const taskItems = Array.isArray(data?.items) ? data.items : [];
        setMrPendingCount(taskItems.filter((task: { businessType?: string }) => String(task?.businessType || "").startsWith("mr")).length);
      })
      .catch(() => {});
    void load();
    const timer = window.setInterval(load, 60000);
    const onApprovalChanged = () => void load();
    window.addEventListener("mr:approval-changed", onApprovalChanged);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("mr:approval-changed", onApprovalChanged); };
  }, [user?.id, location.pathname]);

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
      items: group.items
        .filter((item) => SHOW_ATTENDANCE || !FEATURE_FLAG_HIDDEN_NAV_PATHS.has(item.path))
        .map((item) => ({
          label: strings.pages[item.labelKey],
          icon: item.icon,
          path: item.path,
          requiredPermissions: item.requiredPermissions,
        })),
    }))
  ), [strings]);

  const allNavItems = navGroups.flatMap(g => g.items).filter(item => hasAccess(item.requiredPermissions));

  const mobileNavPriority = MOBILE_NAV_PRIORITY_BY_ROLE[user?.role || ""] || MOBILE_NAV_PRIORITY_DEFAULT;
  const mobileNavItems = mobileNavPriority
    .map((path) => allNavItems.find((item) => item.path === path))
    .filter(Boolean) as NavItem[];

  const navigateTo = (path: string) => {
    if (typeof window !== "undefined") {
      const event = new CustomEvent("oms:before-navigate", { cancelable: true, detail: { path } });
      if (!window.dispatchEvent(event)) return false;
    }
    navigate(`/${path}`);
    setMobileNavVisible(true);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
    return true;
  };

  const logoutToLogin = () => {
    setAnnouncementOpen(false);
    setMySettingsOpen(false);
    logout();
    window.setTimeout(() => {
      window.location.replace(`${import.meta.env.BASE_URL}login`);
    }, 0);
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
        <style>{`
          @keyframes admin-test-banner-sweep {
            0% { transform: translateX(-180%) skewX(-18deg); }
            55%, 100% { transform: translateX(340%) skewX(-18deg); }
          }
          .admin-test-banner {
            background-color: #fbbf24;
            background-image: repeating-linear-gradient(
              -45deg,
              rgba(0, 0, 0, 0.13) 0,
              rgba(0, 0, 0, 0.13) 3px,
              transparent 3px,
              transparent 16px
            );
          }
          .admin-test-banner::after {
            content: "";
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: 38%;
            background: linear-gradient(105deg, transparent, rgba(255,255,255,.5), transparent);
            animation: admin-test-banner-sweep 3s ease-in-out infinite;
            pointer-events: none;
          }
          @media (prefers-reduced-motion: reduce) {
            .admin-test-banner::after {
              animation: none;
            }
          }
        `}</style>
        <div className="h-full flex flex-col">
          {/* Logo */}
          {/* 顶部：测试服时替换为黄色提示，否则显示品牌 */}
          {IS_TEST_SERVER ? (
            <div className="admin-test-banner relative flex h-16 shrink-0 items-center justify-between gap-2 overflow-hidden border-b-2 border-amber-700 bg-amber-300 px-3 text-amber-950">
              <div className="flex min-w-0 items-center gap-2.5">
                <TriangleAlert className="h-6 w-6 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold leading-tight">测试开发服务器</p>
                  <p className="truncate text-[11px] font-medium leading-snug text-amber-900/90">
                    仅供测试，请勿录入正式业务数据
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
                className="h-8 w-8 shrink-0 text-amber-900 hover:bg-amber-200/70 hover:text-amber-950"
                aria-label="收起侧边栏"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border/50 px-4">
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
                className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="收起侧边栏"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          )}

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
                          onClick={() => navigateTo(item.path === "mr" && mrPendingCount > 0 ? "mr?pendingMine=1" : item.path)}
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
                          {item.path === "attendance" && attendancePendingCount > 0 ? (
                            <NavCountBadge count={attendancePendingCount} />
                          ) : item.path === "mr" && mrPendingCount > 0 ? (
                            <NavCountBadge count={mrPendingCount} />
                          ) : item.path === "approval-tasks" && pendingTaskCount > 0 ? (
                            <NavCountBadge count={pendingTaskCount} />
                          ) : isActive ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border/50 bg-sidebar-accent/10 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  aria-label="打开我的账号菜单"
                >
                  <UserAvatar user={currentUser} className="h-9 w-9 shrink-0" textClassName="text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-sidebar-foreground">{currentDisplayName}</div>
                    <div className="truncate text-xs text-muted-foreground">{currentRoleLabel}</div>
                  </div>
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-56">
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
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLangToggle}
                className="h-8 gap-2 px-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label={`切换语言，当前${strings.common.langShort}`}
              >
                <Languages className="h-4 w-4" />
                <span className="text-xs font-medium">{strings.common.langShort}</span>
              </Button>
              <span className="font-mono text-xs text-muted-foreground" title={strings.brand.version}>{appVersion}</span>
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

      {!sidebarOpen ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-0 top-1/2 z-40 h-12 w-8 -translate-y-1/2 rounded-l-none rounded-r-xl border-l-0 bg-background/95 text-muted-foreground shadow-md backdrop-blur hover:text-foreground"
          aria-label="展开侧边栏"
          title="展开侧边栏"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      ) : null}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f9fafb] relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Page Content：key 随 pathname 变化触发进入动画，PUSH 右滑入、POP（返回）左滑入 */}
        <main
          ref={contentRef}
          className={`mobile-admin-content relative z-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-transparent lg:pb-0 ${hideMobileChrome ? "pb-0" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"}`}
        >
          <div key={location.pathname} className={navigationType === "POP" ? "route-enter-pop" : "route-enter-push"}>
            {children}
          </div>
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
                    onClick={() => navigateTo(item.path === "mr" && mrPendingCount > 0 ? "mr?pendingMine=1" : item.path)}
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
