<script setup>
import { reactive, ref } from 'vue'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
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
  <main class="auth-shell make-login-shell">
    <aside class="make-login-brand-panel">
      <div class="make-login-deco make-login-deco-top"></div>
      <div class="make-login-deco make-login-deco-bottom"></div>

      <div class="make-login-brand-content">
        <div class="make-login-logo-row">
          <span class="make-login-logo">技</span>
          <div>
            <strong>技服表管理端</strong>
            <small>电子化服务管理平台</small>
          </div>
        </div>

        <section class="make-login-copy">
          <h1>专业的技术服务<br />管理解决方案</h1>
          <p>全方位管理服务记录、客户关系、设备资产、报表导出和操作审计。</p>
        </section>

        <div class="make-login-feature-grid">
          <article v-for="feature in features" :key="feature">
            <span>{{ feature.slice(0, 1) }}</span>
            <strong>{{ feature }}</strong>
          </article>
        </div>
      </div>

      <p class="make-login-copyright">© 2026 技服表管理系统</p>
    </aside>

    <section class="make-login-form-panel">
      <div class="make-login-mobile-brand">
        <span class="make-login-logo">技</span>
        <strong>技服表管理端</strong>
      </div>

      <div class="make-login-card">
        <header class="make-login-card-head">
          <h2>登录管理端</h2>
          <p>请输入您的账号和密码</p>
        </header>

        <form class="auth-form make-auth-form" @submit.prevent="submit">
          <label>
            <span>账号</span>
            <input v-model.trim="form.username" autocomplete="username" required placeholder="请输入账号" />
          </label>
          <label>
            <span>密码</span>
            <input v-model="form.password" type="password" autocomplete="current-password" required placeholder="请输入密码" />
          </label>

          <div class="auth-options make-auth-options">
            <label><input v-model="form.rememberUsername" type="checkbox" /> 记住账号</label>
            <label><input v-model="form.remember" type="checkbox" /> 保持登录</label>
          </div>

          <p v-if="error" class="form-error">{{ error }}</p>

          <button class="auth-submit make-login-submit" type="submit" :disabled="loading">
            {{ loading ? '正在鉴权...' : '登录' }}
          </button>
        </form>

        <aside class="make-login-security-notice">
          <span>安</span>
          <div>
            <strong>安全提示</strong>
            <p>请勿在公共设备上保存登录状态，定期修改密码以确保账户安全。</p>
          </div>
        </aside>
      </div>
    </section>
  </main>
</template>
