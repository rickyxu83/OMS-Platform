<script setup>
import { onMounted } from 'vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import PreviewControls from '../components/PreviewControls.vue'
import { APP_NAME, ENGINEER_WORKSPACE_LABEL, unifiedLoginUrl } from '../config/app'
import { usePreviewI18n } from '../composables/usePreviewI18n'

const { zh } = usePreviewI18n()
const assetBase = import.meta.env.BASE_URL || '/'

function goUnifiedLogin() {
  window.location.assign(unifiedLoginUrl('/'))
}

onMounted(() => {
  const target = new URL(unifiedLoginUrl('/'), window.location.origin)
  if (target.href !== window.location.href) {
    window.location.replace(target.href)
  }
})
</script>

<template>
  <main class="login-shell">
    <PreviewControls class="global-preview-controls login-preview-controls" />
    <section class="login-stage" aria-label="unified login redirect">
      <div class="login-card rich-login">
        <div class="login-form-head">
          <div class="login-brand-mark" :aria-label="APP_NAME">
            <img :src="`${assetBase}dunyang-mark.png`" alt="" aria-hidden="true" />
            <strong>{{ APP_NAME }}</strong>
          </div>
          <div>
            <h1>{{ zh(ENGINEER_WORKSPACE_LABEL) }}</h1>
            <p>{{ zh('正在前往统一登录入口') }}</p>
          </div>
        </div>
        <button class="primary login-link" type="button" @click="goUnifiedLogin">
          {{ zh('进入统一登录') }}<span aria-hidden="true">→</span>
        </button>
      </div>
      <aside class="login-visual" aria-hidden="true">
        <div class="visual-card ghost one"></div>
        <div class="visual-card ghost two"></div>
        <div class="phone-illustration">
          <span class="phone-notch"></span>
          <span class="phone-user"></span>
          <span class="phone-line wide"></span>
          <span class="phone-line"></span>
          <span class="phone-line short"></span>
          <span class="phone-button"></span>
        </div>
        <div class="lock-chip"></div>
        <div class="person-mark"></div>
      </aside>
    </section>
    <footer class="login-license-footer">
      <p>{{ zh('本软件依据 GNU GPL v3.0（GPL-3.0）发布。') }}</p>
    </footer>
  </main>
</template>
