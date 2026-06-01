<script setup>
import { computed } from 'vue'
import { HugeiconsIcon } from '@hugeicons/vue'
import {
  Activity01Icon,
  Alert02Icon,
  Clock01Icon,
  DashboardSquareIcon,
  File01Icon,
  HelpCircleIcon,
  Location01Icon,
  Logout03Icon,
  MapsIcon,
  Search01Icon,
  Shield01Icon,
  TaskDaily01Icon,
  Ticket01Icon,
  UserGroupIcon,
  UserMultiple02Icon,
  CheckmarkCircle01Icon,
} from '@hugeicons/core-free-icons'

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
})

const iconMap = {
  dashboard: DashboardSquareIcon,
  service: TaskDaily01Icon,
  customer: UserGroupIcon,
  member: UserMultiple02Icon,
  audit: Shield01Icon,
  report: File01Icon,
  search: Search01Icon,
  help: HelpCircleIcon,
  logout: Logout03Icon,
  ticket: Ticket01Icon,
  activity: Activity01Icon,
  duration: Clock01Icon,
  'map-pin': Location01Icon,
  'map-action': MapsIcon,
  done: CheckmarkCircle01Icon,
  warn: Alert02Icon,
  asset: File01Icon,
}

const icon = computed(() => iconMap[props.name] || DashboardSquareIcon)
</script>

<template>
  <HugeiconsIcon
    :icon="icon"
    :size="24"
    color="currentColor"
    :stroke-width="1.8"
    aria-hidden="true"
    focusable="false"
  />
</template>
