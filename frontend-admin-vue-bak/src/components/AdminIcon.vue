<script setup>
import { computed } from 'vue'
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  Edit,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Globe,
  Languages,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  UserX,
  Users,
  Wrench,
  X,
} from '@lucide/vue'

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
})

const iconMap = {
  dashboard: LayoutDashboard,
  'layout-dashboard': LayoutDashboard,
  service: FileText,
  'service-orders': FileText,
  inspect: ClipboardCheck,
  'inspection-schedules': ClipboardCheck,
  customer: Users,
  customers: Users,
  member: Settings,
  users: Settings,
  audit: Shield,
  'audit-logs': Shield,
  report: BarChart3,
  timesheets: BarChart3,
  search: Search,
  logout: LogOut,
  asset: Server,
  devices: Server,
  'maintenance-parties': Building2,
  ticket: FileText,
  activity: TrendingUp,
  duration: Clock,
  'map-pin': MapPin,
  done: CheckCircle2,
  warn: AlertTriangle,
  menu: Menu,
  close: X,
  language: Languages,
  globe: Globe,
  download: Download,
  refresh: RefreshCw,
  plus: Plus,
  edit: Edit,
  trash: Trash2,
  external: ExternalLink,
  user: User,
  phone: User,
  mail: Mail,
  calendar: Calendar,
  server: Server,
  spreadsheet: FileSpreadsheet,
  'user-check': UserCheck,
  'user-x': UserX,
  wrench: Wrench,
  power: Power,
  'power-off': PowerOff,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
}

const icon = computed(() => iconMap[props.name] || LayoutDashboard)
</script>

<template>
  <component
    :is="icon"
    :size="24"
    :stroke-width="2"
    aria-hidden="true"
    focusable="false"
  />
</template>
