<script setup>
import { usePreviewI18n } from '../composables/usePreviewI18n'

defineProps({
  text: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
})

const { zh } = usePreviewI18n()
const assetBase = import.meta.env.BASE_URL || '/'
</script>

<template>
  <div class="brand-heading">
    <span class="brand-eyebrow-mark" aria-hidden="true">
      <img :src="`${assetBase}dunyang-mark.png`" alt="" />
    </span>
    <div class="brand-heading-copy">
      <p class="brand-eyebrow">{{ zh(text) }}</p>
      <h1>{{ zh(title) }}</h1>
    </div>
  </div>
</template>
