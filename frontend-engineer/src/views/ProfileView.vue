<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { clearSession, saveUser } from '../services/auth'
import { aiDraftEnabled, setAiDraftEnabled } from '../services/engineer-preferences'

const { zh } = usePreviewI18n()
const router = useRouter()
const loading = ref(false)
const savingPassword = ref(false)
const savingSignature = ref(false)
const savingAvatar = ref(false)
const savingAlias = ref(false)
const error = ref('')
const message = ref('')
const user = ref(null)
const avatarInput = ref(null)
const signatureCanvas = ref(null)
const savedSignatureData = ref('')
const signatureData = ref('')
const signatureEditorOpen = ref(false)
const signaturePreviewOpen = ref(false)
let drawing = false
let lastPoint = null
let lastMidPoint = null
let signaturePaintToken = 0
let signaturePaintPromise = Promise.resolve()
let signaturePaintPending = false
const hasSavedSignature = computed(() => Boolean(String(savedSignatureData.value || '').trim()))
const onboardingRequired = computed(() => Boolean(user.value?.requiresOnboarding))
const mustChangePassword = computed(() => Boolean(user.value?.mustChangePassword))
const avatarPreviewUrl = computed(() => user.value?.avatarUrl || '')
const avatarInitial = computed(() => String(user.value?.realName || user.value?.username || '工').slice(0, 1))
const onboardingItems = computed(() => [
  { label: '修改初始密码', done: !mustChangePassword.value },
  { label: '补充手写签名', done: hasSavedSignature.value },
])

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const aliasForm = reactive({
  loginAlias: '',
})

function passwordComplex(value) {
  return String(value || '').length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)
}

function canvasPoint(event) {
  const canvas = signatureCanvas.value
  const rect = canvas.getBoundingClientRect()
  const point = event.touches?.[0] || event
  return {
    x: ((point.clientX - rect.left) / rect.width) * canvas.width,
    y: ((point.clientY - rect.top) / rect.height) * canvas.height,
  }
}

function paintSignature(dataUrl) {
  const canvas = signatureCanvas.value
  signaturePaintToken += 1
  const token = signaturePaintToken
  if (!canvas) {
    signaturePaintPending = false
    signaturePaintPromise = Promise.resolve()
    return signaturePaintPromise
  }

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!dataUrl) {
    signaturePaintPending = false
    signaturePaintPromise = Promise.resolve()
    return signaturePaintPromise
  }

  signaturePaintPending = true
  signaturePaintPromise = new Promise((resolve) => {
    const finish = () => {
      if (token === signaturePaintToken) signaturePaintPending = false
      resolve()
    }

    const image = new Image()
    image.onload = () => {
      if (token !== signaturePaintToken) return finish()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      finish()
    }
    image.onerror = finish
    image.src = dataUrl
  })

  return signaturePaintPromise
}

function invalidatePendingSignaturePaint() {
  if (!signaturePaintPending) return
  signaturePaintToken += 1
  signaturePaintPending = false
  signaturePaintPromise = Promise.resolve()
}

function isCanvasBlank(canvas) {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 0) return false
  }
  return true
}

function beginSignature(event) {
  event.preventDefault()
  if (!signatureCanvas.value) return
  invalidatePendingSignaturePaint()
  drawing = true
  lastPoint = canvasPoint(event)
  lastMidPoint = lastPoint
}

function drawSignature(event) {
  if (!drawing || !signatureCanvas.value || !lastPoint) return
  event.preventDefault()
  const canvas = signatureCanvas.value
  const ctx = canvas.getContext('2d')
  const point = canvasPoint(event)
  const dx = point.x - lastPoint.x
  const dy = point.y - lastPoint.y
  if (Math.hypot(dx, dy) < 1.5) return
  const midPoint = {
    x: (lastPoint.x + point.x) / 2,
    y: (lastPoint.y + point.y) / 2,
  }
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(lastMidPoint?.x ?? lastPoint.x, lastMidPoint?.y ?? lastPoint.y)
  ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midPoint.x, midPoint.y)
  ctx.stroke()
  lastPoint = point
  lastMidPoint = midPoint
}

function endSignature() {
  const shouldCapture = drawing && signatureCanvas.value
  drawing = false
  lastPoint = null
  lastMidPoint = null
  if (shouldCapture) signatureData.value = signatureCanvas.value.toDataURL('image/png')
}

function clearSignature() {
  const canvas = signatureCanvas.value
  signaturePaintToken += 1
  signaturePaintPending = false
  signaturePaintPromise = Promise.resolve()
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  signatureData.value = ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get('/users/me')
    user.value = data.user
    try {
      saveUser(data.user)
    } catch {
      // Profile page must stay usable even if browser storage is full.
    }
    savedSignatureData.value = data.user.engineerSignature || ''
    signatureData.value = savedSignatureData.value
    aliasForm.loginAlias = data.user.loginAlias || ''
    if (signatureEditorOpen.value) {
      await nextTick()
      await paintSignature(signatureData.value)
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function saveAlias() {
  error.value = ''
  message.value = ''
  const loginAlias = String(aliasForm.loginAlias || '').trim()
  if (loginAlias && !/^[A-Za-z0-9._-]{2,32}$/.test(loginAlias)) {
    error.value = '别名仅支持 2-32 位字母、数字、点、下划线或短横线'
    return
  }
  savingAlias.value = true
  try {
    await api.put('/users/me', { loginAlias })
    message.value = loginAlias ? '登录别名已保存' : '登录别名已清除'
    await load()
  } catch (err) {
    error.value = err?.message || '别名保存失败'
  } finally {
    savingAlias.value = false
  }
}

async function openSignatureEditor() {
  signatureEditorOpen.value = true
  signatureData.value = savedSignatureData.value
  await nextTick()
  await paintSignature(signatureData.value)
}

function cancelSignatureEditor() {
  signatureEditorOpen.value = false
  signatureData.value = savedSignatureData.value
  clearSignature()
}

function clearEditorSignature() {
  clearSignature()
}

async function changePassword() {
  error.value = ''
  message.value = ''
  if (!passwordComplex(passwordForm.newPassword)) {
    error.value = '新密码至少 8 位，且需要包含大小写字母、数字和特殊符号'
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    error.value = '两次输入的新密码不一致'
    return
  }
  savingPassword.value = true
  try {
    await api.put('/users/me', {
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
    Object.assign(passwordForm, { currentPassword: '', newPassword: '', confirmPassword: '' })
    message.value = '密码已更新'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    savingPassword.value = false
  }
}

async function saveSignature() {
  error.value = ''
  message.value = ''
  savingSignature.value = true
  try {
    await signaturePaintPromise
    const canvas = signatureCanvas.value
    const canvasSignature = canvas && !isCanvasBlank(canvas) ? canvas.toDataURL('image/png') : ''
    const engineerSignature = canvasSignature || signatureData.value || ''
    await api.put('/users/me', { engineerSignature })
    savedSignatureData.value = engineerSignature
    signatureData.value = engineerSignature
    signatureEditorOpen.value = false
    message.value = '签名已保存'
    await load()
  } catch (err) {
    error.value = err?.message || '签名保存失败'
  } finally {
    savingSignature.value = false
  }
}

async function removeSignature() {
  error.value = ''
  message.value = ''
  savingSignature.value = true
  try {
    clearSignature()
    await api.put('/users/me', { engineerSignature: '' })
    savedSignatureData.value = ''
    signatureData.value = ''
    signaturePreviewOpen.value = false
    signatureEditorOpen.value = false
    message.value = '签名已清除'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    savingSignature.value = false
  }
}

function triggerAvatarUpload() {
  avatarInput.value?.click()
}

async function uploadAvatar(event) {
  const file = event.target.files?.[0]
  if (!file) return
  error.value = ''
  message.value = ''
  savingAvatar.value = true
  try {
    const formData = new FormData()
    formData.append('avatar', file)
    await api.postForm('/users/me/avatar', formData)
    message.value = '头像已更新'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    savingAvatar.value = false
    if (event.target) event.target.value = ''
  }
}

async function removeAvatar() {
  error.value = ''
  message.value = ''
  savingAvatar.value = true
  try {
    await api.delete('/users/me/avatar')
    message.value = '头像已删除'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    savingAvatar.value = false
  }
}

function toggleAiDraftEnabled() {
  setAiDraftEnabled(!aiDraftEnabled.value)
  message.value = aiDraftEnabled.value ? 'AI 填单已开启' : 'AI 填单已关闭'
}

function switchAccount() {
  api.post('/auth/logout').catch(() => {})
  clearSession()
  router.push('/login')
}

onMounted(load)
</script>

<template>
  <main class="engineer-shell profile-shell">
    <header class="topbar">
      <div>
        <BrandEyebrow text="工程师工作台 / 我的" title="我的" />
      </div>
      <button class="ghost profile-login" type="button" @click="switchAccount"><PreviewIcon name="logout" />{{ zh('切换账号') }}</button>
    </header>

    <section v-if="onboardingRequired" class="onboarding-card">
      <div>
        <p>{{ zh('首次登录设置') }}</p>
        <h2>{{ zh('请先完成账号安全设置') }}</h2>
        <span>{{ zh('完成前无法使用其他工程师功能。') }}</span>
      </div>
      <div class="onboarding-checklist">
        <span v-for="item in onboardingItems" :key="item.label" :class="{ done: item.done }">
          {{ zh(item.done ? '已完成' : '待完成') }} · {{ zh(item.label) }}
        </span>
      </div>
    </section>

    <p v-if="error" class="form-error">{{ zh(error) }} <button type="button" @click="load">{{ zh('重试') }}</button></p>
    <p v-if="message" class="form-success">{{ zh(message) }}</p>
    <p v-else-if="loading" class="muted">{{ zh('正在加载个人资料…') }}</p>

    <section class="profile-card profile-hero-card">
      <div class="profile-hero-main">
        <div class="avatar profile-avatar-preview profile-hero-avatar">
          <img v-if="avatarPreviewUrl" :src="avatarPreviewUrl" :alt="zh('头像')" />
          <span v-else>{{ avatarInitial }}</span>
        </div>
        <div class="profile-card-info">
          <p class="profile-kicker">{{ zh('ENGINEER PROFILE') }}</p>
          <h2>{{ user?.realName || user?.username || zh('工程师') }}</h2>
          <div class="profile-meta-row">
            <span>{{ user?.phone || user?.username || zh('真实 API 个人资料') }}</span>
            <span>{{ zh(user?.status === 'active' ? '账号启用' : '账号停用') }}</span>
          </div>
          <div class="profile-status-row">
            <span :class="{ done: !mustChangePassword }">{{ zh(mustChangePassword ? '待修改密码' : '密码已更新') }}</span>
            <span :class="{ done: hasSavedSignature }">{{ zh(hasSavedSignature ? '签名已保存' : '待补充签名') }}</span>
            <span :class="{ done: avatarPreviewUrl }">{{ zh(avatarPreviewUrl ? '头像已设置' : '头像可选') }}</span>
          </div>
        </div>
      </div>
      <div class="profile-avatar-actions">
        <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadAvatar" />
        <button class="ghost" type="button" :disabled="savingAvatar" @click="triggerAvatarUpload"><PreviewIcon name="upload" />{{ zh(savingAvatar ? '上传中' : avatarPreviewUrl ? '更换头像' : '上传头像') }}</button>
        <button v-if="avatarPreviewUrl" class="ghost danger-soft" type="button" :disabled="savingAvatar" @click="removeAvatar"><PreviewIcon name="trash" />{{ zh('删除头像') }}</button>
      </div>
    </section>

    <section class="profile-grid profile-settings-grid">
      <article class="form-section profile-setting-card profile-ai-card">
        <div class="profile-section-head">
          <div>
            <p>{{ zh('EXPERIMENTAL') }}</p>
            <h2>{{ zh('AI 填单') }}</h2>
          </div>
          <span :class="{ done: aiDraftEnabled }">{{ zh(aiDraftEnabled ? '已开启' : '已关闭') }}</span>
        </div>
        <p class="profile-setting-copy">{{ zh('开启后，新增服务记录页面会显示 AI 语音填写入口。关闭后，该区域会隐藏。') }}</p>
        <button
          class="preference-toggle"
          type="button"
          :aria-pressed="aiDraftEnabled ? 'true' : 'false'"
          :class="{ active: aiDraftEnabled }"
          @click="toggleAiDraftEnabled"
        >
          <span class="preference-toggle-track"><span class="preference-toggle-thumb" /></span>
          <span>{{ zh(aiDraftEnabled ? '关闭 AI 填单' : '开启 AI 填单') }}</span>
        </button>
      </article>

      <form class="form-section profile-form profile-setting-card" :class="{ required: mustChangePassword }" @submit.prevent="changePassword">
        <div class="profile-section-head">
          <div>
            <p>{{ zh('SECURITY') }}</p>
            <h2>{{ zh('修改密码') }}</h2>
          </div>
          <span :class="{ done: !mustChangePassword }">{{ zh(mustChangePassword ? '必做' : '已完成') }}</span>
        </div>
        <label class="field"><span>{{ zh('当前密码') }}</span><input v-model="passwordForm.currentPassword" type="password" required :placeholder="zh('输入当前密码')" /></label>
        <label class="field"><span>{{ zh('新密码') }}</span><input v-model="passwordForm.newPassword" type="password" required :placeholder="zh('至少 8 位，包含大小写字母、数字和特殊符号')" /></label>
        <label class="field"><span>{{ zh('确认新密码') }}</span><input v-model="passwordForm.confirmPassword" type="password" required :placeholder="zh('再次输入新密码')" /></label>
        <button class="primary" type="submit" :disabled="savingPassword"><PreviewIcon name="save" />{{ zh(savingPassword ? '保存中' : '更新密码') }}</button>
      </form>

      <form class="form-section profile-form profile-setting-card" @submit.prevent="saveAlias">
        <div class="profile-section-head">
          <div>
            <p>{{ zh('ACCOUNT') }}</p>
            <h2>{{ zh('登录别名') }}</h2>
          </div>
          <span :class="{ done: aliasForm.loginAlias }">{{ zh(aliasForm.loginAlias ? '已设置' : '可选') }}</span>
        </div>
        <label class="field"><span>{{ zh('邮箱账号') }}</span><input :value="user?.email || user?.username || ''" type="text" disabled /></label>
        <label class="field"><span>{{ zh('登录别名') }}</span><input v-model="aliasForm.loginAlias" type="text" :placeholder="zh('可选，2-32 位字母/数字/._-')" /></label>
        <button class="primary" type="submit" :disabled="savingAlias"><PreviewIcon name="save" />{{ zh(savingAlias ? '保存中' : '保存别名') }}</button>
      </form>

      <article class="form-section signature-card profile-setting-card" :class="{ required: !hasSavedSignature }">
        <div class="signature-head">
          <div>
            <p>{{ zh('SIGNATURE') }}</p>
            <h2>{{ zh('个人手写签名') }}</h2>
          </div>
        </div>
        <div class="signature-summary-card" :class="{ empty: !hasSavedSignature }">
          <img v-if="hasSavedSignature" :src="savedSignatureData" :alt="zh('签名缩略图')" />
          <span v-else><PreviewIcon name="pen" />{{ zh('请补充手写签名') }}</span>
        </div>
        <div class="signature-toolbar">
          <button
            class="primary signature-primary-action"
            type="button"
            :disabled="savingSignature"
            @click="signatureEditorOpen ? cancelSignatureEditor() : openSignatureEditor()"
          >
            <PreviewIcon name="pen" />{{ zh(signatureEditorOpen ? '取消编辑' : hasSavedSignature ? '重新签名' : '创建签名') }}
          </button>
          <div v-if="hasSavedSignature" class="signature-secondary-actions">
            <button
              class="ghost"
              type="button"
              :disabled="savingSignature"
              @click="signaturePreviewOpen = true"
            >
              <PreviewIcon name="share" />{{ zh('预览签名') }}
            </button>
            <button
              class="ghost danger-soft"
              type="button"
              :disabled="savingSignature"
              @click="removeSignature"
            >
              <PreviewIcon name="trash" />{{ zh('清除已存签名') }}
            </button>
          </div>
        </div>
        <div v-if="signatureEditorOpen" class="signature-editor-panel">
          <canvas
            ref="signatureCanvas"
            class="signature-pad"
            width="1200"
            height="420"
            @mousedown="beginSignature"
            @mousemove="drawSignature"
            @mouseup="endSignature"
            @mouseleave="endSignature"
            @touchstart="beginSignature"
            @touchmove="drawSignature"
            @touchend="endSignature"
          />
          <div class="signature-editor-actions">
            <button class="ghost" type="button" :disabled="savingSignature" @click="clearEditorSignature"><PreviewIcon name="trash" />{{ zh('清空画布') }}</button>
            <button class="primary" type="button" :disabled="savingSignature" @click="saveSignature"><PreviewIcon name="save" />{{ zh(savingSignature ? '保存中' : '保存签名') }}</button>
          </div>
        </div>
      </article>
    </section>

    <div v-if="signaturePreviewOpen && hasSavedSignature" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh('签名预览')">
      <div class="signature-modal-shell profile-signature-preview-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('SIGNATURE PREVIEW') }}</p>
            <h2>{{ zh('签名预览') }}</h2>
          </div>
          <button class="ghost" type="button" @click="signaturePreviewOpen = false">{{ zh('关闭') }}</button>
        </header>
        <div class="profile-signature-preview-card">
          <img :src="savedSignatureData" :alt="zh('签名预览')" />
        </div>
      </div>
    </div>
  </main>
</template>
