<script setup>
import { reactive, ref } from 'vue'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { clearSession, loadRememberedCredentials, saveRememberedCredentials, saveSession } from '../services/auth'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const allowedAdminRoles = new Set(['admin', 'assistant', 'dispatcher', 'supervisor', 'engineering_supervisor', 'sales_supervisor', 'sales'])
const form = reactive({
  username: '',
  password: '',
  remember: true,
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
    if (!allowedAdminRoles.has(data.user?.role)) {
      clearSession()
      throw new Error('请使用管理端账号登录')
    }
    saveSession(data, form.remember)
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
  <main class="auth-shell">
    <section class="auth-stage">
      <aside class="auth-hero">
        <div class="auth-brand">
          <span class="auth-mark">TS</span>
          <div>
            <strong>TechService</strong>
            <small>技服表电子化管理端</small>
          </div>
        </div>

        <div class="auth-copy">
          <p class="auth-kicker">SERVICE SHEET ADMIN</p>
          <h1>技服表电子化<br /><span>管理端</span></h1>
          <p>用于管理服务记录、客户资料、成员权限、操作日志与月报导出。</p>
        </div>

        <div class="auth-metrics">
          <article>
            <span>数据来源</span>
            <strong>后端服务</strong>
            <small>连接已部署系统</small>
          </article>
          <article>
            <span>版本范围</span>
            <strong>正式管理端</strong>
            <small>独立交付系统</small>
          </article>
          <article>
            <span>权限校验</span>
            <strong>JWT</strong>
            <small>按角色进入后台</small>
          </article>
        </div>
      </aside>

      <section class="auth-card">
        <div class="auth-card-head">
          <div>
            <p class="auth-kicker">ADMIN SIGN IN</p>
            <h2>管理端登录</h2>
          </div>
          <span>正式版</span>
        </div>

        <form class="auth-form" @submit.prevent="submit">
          <label>
            <span>账号 / 邮箱</span>
            <input v-model.trim="form.username" autocomplete="username" required placeholder="请输入管理端账号" />
          </label>
          <label>
            <span>密码</span>
            <input v-model="form.password" type="password" autocomplete="current-password" required placeholder="请输入密码" />
          </label>

          <div class="auth-options">
            <label><input v-model="form.remember" type="checkbox" /> 保持登录状态</label>
            <label><input v-model="form.rememberPassword" type="checkbox" /> 记住密码</label>
            <span>请联系系统管理员开通账号</span>
          </div>

          <p v-if="error" class="form-error">{{ error }}</p>

          <button class="auth-submit" type="submit" :disabled="loading">
            {{ loading ? '正在鉴权...' : '授权登录' }}
          </button>
        </form>

        <div class="auth-system-list">
          <article>
            <span>接口模式</span>
            <strong>后端服务</strong>
          </article>
          <article>
            <span>可访问模块</span>
            <strong>服务记录 / 客户资料 / 月报 / 审计</strong>
          </article>
          <article>
            <span>登录要求</span>
            <strong>仅限已开通管理端权限账号</strong>
          </article>
        </div>
      </section>
    </section>
  </main>
</template>
