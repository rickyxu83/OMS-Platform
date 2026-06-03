<script setup>
defineProps({
  kicker: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <header class="page-header make-page-header">
    <div>
      <p v-if="kicker" class="page-kicker">{{ kicker }}</p>
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-actions make-page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>
