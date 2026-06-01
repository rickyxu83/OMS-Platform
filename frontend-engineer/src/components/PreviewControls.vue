<script setup>
import { usePreviewI18n } from '../composables/usePreviewI18n'

const { language, setLanguage } = usePreviewI18n()
</script>

<template>
  <div class="preview-controls" aria-label="界面工具">
    <div class="language-toggle" aria-label="语言切换">
      <button :class="{ active: language === 'hans' }" type="button" @click="setLanguage('hans')">简</button>
      <button :class="{ active: language === 'hant' }" type="button" @click="setLanguage('hant')">繁</button>
    </div>
  </div>
</template>
