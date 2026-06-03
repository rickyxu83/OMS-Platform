<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: {
    type: String,
    required: true,
  },
  tone: {
    type: String,
    default: 'default',
  },
  compact: {
    type: Boolean,
    default: false,
  },
})

const toneClass = computed(() => ({
  pending: props.tone === 'pending',
  processing: props.tone === 'processing',
  success: props.tone === 'success',
  warning: props.tone === 'warning',
  danger: props.tone === 'danger',
  info: props.tone === 'info',
  default: props.tone === 'default',
  compact: props.compact,
}))
</script>

<template>
  <span class="status-badge" :class="toneClass">{{ label }}</span>
</template>
