<script setup>
import AdminIcon from '../AdminIcon.vue'

defineProps({
  title: {
    type: String,
    required: true,
  },
  value: {
    type: [String, Number],
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  icon: {
    type: String,
    default: '',
  },
  trend: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <article class="metric-card make-kpi-card">
    <div class="metric-top">
      <AdminIcon v-if="icon" :name="icon" class="metric-icon" />
      <em v-if="trend" class="metric-change">{{ trend }}</em>
    </div>
    <span>{{ title }}</span>
    <strong>{{ value }}</strong>
    <small v-if="subtitle">{{ subtitle }}</small>
  </article>
</template>
