<script setup>
import { computed } from 'vue'
import { HugeiconsIcon } from '@hugeicons/vue'
import {
  Add01Icon,
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  ComputerIcon,
  Contact01Icon,
  Delete02Icon,
  Download01Icon,
  Edit01Icon,
  Home01Icon,
  LaptopCheckIcon,
  LanguageCircleIcon,
  ListViewIcon,
  Location01Icon,
  Logout03Icon,
  OfficeIcon,
  MailSend02Icon,
  PencilEdit02Icon,
  ReloadIcon,
  Rotate01Icon,
  SaveIcon,
  Share08Icon,
  TimeQuarter02Icon,
  Undo02Icon,
  UserIcon,
  UserMultiple02Icon,
  ViewIcon,
  Activity01Icon,
} from '@hugeicons/core-free-icons'

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
})

const iconMap = {
  list: ListViewIcon,
  new: Add01Icon,
  calendar: Calendar03Icon,
  user: UserIcon,
  logout: Logout03Icon,
  pin: Location01Icon,
  'onsite-service': Location01Icon,
  refresh: ReloadIcon,
  eye: ViewIcon,
  edit: Edit01Icon,
  download: Download01Icon,
  share: Share08Icon,
  save: SaveIcon,
  send: MailSend02Icon,
  history: TimeQuarter02Icon,
  trash: Delete02Icon,
  users: UserMultiple02Icon,
  monitor: ComputerIcon,
  'remote-service': LaptopCheckIcon,
  'office-service': OfficeIcon,
  'internal-service': OfficeIcon,
  contact: Contact01Icon,
  pen: PencilEdit02Icon,
  rotate: Rotate01Icon,
  undo: Undo02Icon,
  check: CheckmarkCircle01Icon,
  close: Cancel01Icon,
  language: LanguageCircleIcon,
  home: Home01Icon,
  status: Activity01Icon,
  assets: ComputerIcon,
  customers: UserMultiple02Icon,
  devices: ComputerIcon,
  maintenance: Contact01Icon,
}

const icon = computed(() => iconMap[props.name] || ListViewIcon)
</script>

<template>
  <HugeiconsIcon
    class="preview-icon"
    :icon="icon"
    :size="24"
    color="currentColor"
    :stroke-width="1.8"
    aria-hidden="true"
    focusable="false"
  />
</template>
