<script setup>
import { reactive, ref } from 'vue'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PreviewIcon from '../components/PreviewIcon.vue'
import PreviewControls from '../components/PreviewControls.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { loadRememberedCredentials, saveRememberedCredentials, saveSession } from '../services/auth'

const { zh } = usePreviewI18n()
const router = useRouter()
const assetBase = import.meta.env.BASE_URL || '/'
const loading = ref(false)
const error = ref('')
const form = reactive({
  username: '',
  password: '',
  rememberPassword: true,
})

onMounted(() => {
  const credentials = loadRememberedCredentials()
  if (credentials.username || credentials.password) {
    form.username = credentials.username
    form.password = credentials.password
    form.rememberPassword = true
  }
})

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.post('/auth/login', form)
    if (data.user?.role !== 'engineer') throw new Error('当前账号不是工程师账号')
    saveSession(data)
    saveRememberedCredentials(
      {
        username: form.username,
        password: form.password,
      },
      form.rememberPassword,
    )
    router.push('/')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-shell">
    <PreviewControls class="global-preview-controls login-preview-controls" />
    <section class="login-stage" aria-label="engineer login">
      <form class="login-card rich-login" @submit.prevent="submit">
        <div class="login-form-head">
          <div class="login-brand-mark" aria-label="敦阳服务表电子化系统">
            <img :src="`${assetBase}dunyang-mark.png`" alt="" aria-hidden="true" />
            <strong>敦阳科技服务表电子化系统</strong>
          </div>
          <div>
            <h1>{{ zh('工程师端登录') }}</h1>
          </div>
        </div>
        <label class="field">
          <span>{{ zh('账号') }}</span>
          <input v-model.trim="form.username" autocomplete="username" required :placeholder="zh('请输入账号')" />
          <PreviewIcon name="user" class="login-field-icon" />
        </label>
        <label class="field">
          <span>{{ zh('密码') }}</span>
          <input v-model="form.password" type="password" autocomplete="current-password" required placeholder="••••••••" />
          <PreviewIcon name="contact" class="login-field-icon" />
        </label>
        <label class="login-options">
          <input v-model="form.rememberPassword" type="checkbox" />
          <span>{{ zh('记住密码') }}</span>
        </label>
        <p v-if="error" class="form-error">{{ zh(error) }}</p>
        <button class="primary login-link" type="submit" :disabled="loading">{{ zh(loading ? '登录中' : '进入服务表') }}<span aria-hidden="true">→</span></button>
      </form>
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
  </main>
</template>
