<script setup>
import StatusBadge from './StatusBadge.vue'

defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  statusLabel: {
    type: String,
    default: '',
  },
  statusTone: {
    type: String,
    default: 'default',
  },
})
</script>

<template>
  <aside class="glass-panel drawer make-detail-panel">
    <div class="drawer-head make-detail-head">
      <div>
        <p>{{ subtitle }}</p>
        <h2>{{ title }}</h2>
      </div>
      <StatusBadge v-if="statusLabel" :label="statusLabel" :tone="statusTone" compact />
    </div>
    <slot />
    <div v-if="$slots.footer" class="make-detail-footer">
      <slot name="footer" />
    </div>
  </aside>
</template>
