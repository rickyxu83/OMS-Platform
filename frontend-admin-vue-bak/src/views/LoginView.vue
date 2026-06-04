<script setup>
import { reactive, ref } from 'vue'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Globe, LayoutDashboard } from '@lucide/vue'
import { api } from '../services/api'
import { ADMIN_ACCESS_ROLES } from '../config/navigation'
import { clearSession, loadRememberedCredentials, saveRememberedCredentials, saveSession } from '../services/auth'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const allowedAdminRoles = new Set(ADMIN_ACCESS_ROLES)
const form = reactive({
  username: '',
  password: '',
  remember: true,
  rememberUsername: true,
})

const features = ['服务记录', '客户资料', '设备资产', '月报导出', '操作审计']

onMounted(() => {
  const credentials = loadRememberedCredentials()
  if (credentials.username) {
    form.username = credentials.username
    form.rememberUsername = true
  }
})

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.post('/auth/login', form)
    if (!allowedAdminRoles.has(data.user?.role)) {
      clearSession()
      throw new Error('请使用管理端账号登录')
    }
    saveSession(data, form.remember)
    saveRememberedCredentials(
      {
        username: form.username,
      },
      form.rememberUsername,
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
  <main class="make-login-v2">
    <div class="make-login-orb make-login-orb-purple"></div>
    <div class="make-login-orb make-login-orb-blue"></div>
    <div class="make-login-orb make-login-orb-green"></div>

    <div class="make-login-language-v2">
      <Globe :size="16" :stroke-width="2" />
      <strong>简体中文</strong>
    </div>

    <section class="make-login-card-v2" aria-label="登录管理端">
      <header class="make-login-head-v2">
        <span class="make-login-mark-v2"><LayoutDashboard :size="32" :stroke-width="2" /></span>
        <h1>运维管理系统</h1>
        <p>欢迎回来</p>
      </header>

      <form class="make-auth-form-v2" @submit.prevent="submit">
        <p v-if="error" class="make-login-error-v2">{{ error }}</p>

        <label>
          <span>账号</span>
          <input v-model.trim="form.username" autocomplete="username" required placeholder="请输入账号" />
        </label>

        <label>
          <span>密码</span>
          <input v-model="form.password" type="password" autocomplete="current-password" required placeholder="请输入密码" />
        </label>

        <div class="make-auth-options-v2">
          <label><input v-model="form.rememberUsername" type="checkbox" /> 记住账号</label>
          <label><input v-model="form.remember" type="checkbox" /> 保持登录</label>
        </div>

        <button class="make-login-submit-v2" type="submit" :disabled="loading">
          {{ loading ? '正在鉴权...' : '登录' }}
        </button>
      </form>

      <footer class="make-login-demo-v2">
        <div>
          <strong>系统功能</strong>
          <p>{{ features.join(' / ') }}</p>
        </div>
        <span>系统版本 <b>v2.4.8</b></span>
      </footer>
    </section>
  </main>
</template>
