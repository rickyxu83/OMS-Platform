import { useState, useEffect } from "react";
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
  Search,
  ChevronDown,
  Menu,
  X,
  Languages,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

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

const navGroups: NavGroup[] = [
  {
    group: "工作台",
    items: [
      { label: "运营总览", icon: LayoutDashboard, path: "dashboard" },
    ],
  },
  {
    group: "工单与巡检",
    items: [
      { label: "工单处理", icon: FileText, path: "service-orders" },
      { label: "巡检计划", icon: ClipboardCheck, path: "inspection-schedules" },
    ],
  },
  {
    group: "客户与资产",
    items: [
      { label: "客户档案", icon: Users, path: "customers" },
      { label: "设备资产", icon: Server, path: "devices" },
      { label: "维保方目录", icon: Building2, path: "maintenance-parties" },
    ],
  },
  {
    group: "报表中心",
    items: [
      { label: "月报导出", icon: BarChart3, path: "timesheets" },
    ],
  },
  {
    group: "系统与权限",
    items: [
      {
        label: "成员与角色",
        icon: Settings,
        path: "users",
        requiredRoles: ["admin", "assistant", "dispatcher", "supervisor", "engineering_supervisor", "sales_supervisor"],
      },
      {
        label: "操作审计",
        icon: Shield,
        path: "audit-logs",
        requiredRoles: ["admin", "supervisor", "engineering_supervisor"],
      },
    ],
  },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const currentUser = user || { name: "", role: "" };
  const currentPage = location.pathname.replace(/^\//, "") || "dashboard";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isTraditional, setIsTraditional] = useState(false);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLangToggle = () => {
    setIsTraditional(!isTraditional);
    toast.success(`已切换至${!isTraditional ? "繁体中文" : "简体中文"}`);
  };

  const roleLabels: Record<string, string> = {
    admin: "管理员",
    assistant: "助理",
    dispatcher: "调度",
    supervisor: "主管",
    engineering_supervisor: "工程主管",
    sales_supervisor: "业务主管",
    sales: "业务",
    engineer: "工程师",
  };

  const pageLabels: Record<string, string> = {
    dashboard: "运营总览",
    "service-orders": "工单处理",
    "inspection-schedules": "巡检计划",
    customers: "客户档案",
    devices: "设备资产",
    "maintenance-parties": "维保方目录",
    timesheets: "月报导出",
    users: "成员与角色",
    "audit-logs": "操作审计",
  };

  const hasAccess = (requiredRoles?: string[]) => {
    if (!requiredRoles) return true;
    return requiredRoles.includes(currentUser.role);
  };

  const allNavItems = navGroups.flatMap(g => g.items).filter(item => hasAccess(item.requiredRoles));

  const filteredNavItems = searchQuery
    ? allNavItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allNavItems;

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } transition-all duration-300 bg-sidebar border-r border-sidebar-border flex-shrink-0 overflow-hidden`}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-sidebar-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                <LayoutDashboard className="w-6 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-base block text-sidebar-foreground tracking-tight">运维智管</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">OMS System</span>
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
                          onClick={() => navigate(`/${item.path}`)}
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
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">System Version</span>
              <Badge variant="outline" className="text-[10px] h-4 py-0 px-1.5 font-mono opacity-70 border-sidebar-border/50">v2.4.8</Badge>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f9fafb] relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
        
        {/* Top Bar */}
        <header className="h-16 bg-card/80 backdrop-blur-md sticky top-0 z-10 border-b border-border flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>运维管理系统</span>
              <span>/</span>
              <span className="text-foreground font-medium">{pageLabels[currentPage]}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Quick Nav */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickNavOpen(true)}
              className="gap-2"
            >
              <Search className="w-4 h-4" />
              快速跳转
            </Button>

            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLangToggle}
              className="gap-2 px-2 hover:bg-primary/5 hover:text-primary transition-colors"
            >
              <Languages className="w-4 h-4" />
              <span className="text-xs font-medium">{isTraditional ? "繁体" : "简体"}</span>
            </Button>

            {/* Current Time */}
            <div className="text-sm text-muted-foreground">
              {currentTime.toLocaleString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>

            <Separator orientation="vertical" className="h-8" />

            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium">{currentUser.name}</div>
                <div className="text-xs text-muted-foreground">
                  {roleLabels[currentUser.role] || currentUser.role}
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
        <main className="flex-1 overflow-auto bg-transparent relative z-0">
          {children}
        </main>
      </div>

      {/* Quick Navigation Dialog */}
      <Dialog open={quickNavOpen} onOpenChange={setQuickNavOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>快速跳转</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="搜索模块名称..."
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
                      navigate(`/${item.path}`);
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
                  未找到匹配的模块
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
