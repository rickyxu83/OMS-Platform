<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'
import { saveUser } from '../services/auth'

const { zh } = usePreviewI18n()
const loading = ref(false)
const savingPassword = ref(false)
const savingSignature = ref(false)
const savingAvatar = ref(false)
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
}

function drawSignature(event) {
  if (!drawing || !signatureCanvas.value) return
  event.preventDefault()
  const canvas = signatureCanvas.value
  const ctx = canvas.getContext('2d')
  const point = canvasPoint(event)
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(lastPoint.x, lastPoint.y)
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
  lastPoint = point
  signatureData.value = canvas.toDataURL('image/png')
}

function endSignature() {
  drawing = false
  lastPoint = null
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

onMounted(load)
</script>

<template>
  <main class="engineer-shell">
    <header class="topbar">
      <div>
        <BrandEyebrow text="工程师端 / 我的" title="我的" />
      </div>
      <RouterLink class="ghost profile-login" to="/login"><PreviewIcon name="user" />{{ zh('切换账号') }}</RouterLink>
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
    <p v-else-if="loading" class="muted">{{ zh('正在加载个人资料...') }}</p>

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
      <form class="form-section profile-form profile-setting-card" :class="{ required: mustChangePassword }" @submit.prevent="changePassword">
        <div class="profile-section-head">
          <div>
            <p>{{ zh('SECURITY') }}</p>
            <h2>{{ zh('修改密码') }}</h2>
          </div>
          <span :class="{ done: !mustChangePassword }">{{ zh(mustChangePassword ? '必做' : '已完成') }}</span>
        </div>
        <p v-if="mustChangePassword" class="required-hint">{{ zh('请修改初始密码后继续使用系统。') }}</p>
        <label class="field"><span>{{ zh('当前密码') }}</span><input v-model="passwordForm.currentPassword" type="password" required /></label>
        <label class="field"><span>{{ zh('新密码') }}</span><input v-model="passwordForm.newPassword" type="password" required /></label>
        <label class="field"><span>{{ zh('确认新密码') }}</span><input v-model="passwordForm.confirmPassword" type="password" required /></label>
        <p class="muted compact">{{ zh('至少 8 位，包含大小写字母、数字和特殊符号。') }}</p>
        <button class="primary" type="submit" :disabled="savingPassword"><PreviewIcon name="save" />{{ zh(savingPassword ? '保存中' : '更新密码') }}</button>
      </form>

      <article class="form-section signature-card profile-setting-card" :class="{ required: !hasSavedSignature }">
        <div class="signature-head">
          <div>
            <p>{{ zh('SIGNATURE') }}</p>
            <h2>{{ zh('个人手写签名') }}</h2>
            <p class="signature-state">{{ zh(hasSavedSignature ? '已保存签名' : '尚未保存签名') }}</p>
          </div>
          <div class="signature-action-panel">
            <button
              class="primary signature-primary-action"
              type="button"
              :disabled="savingSignature"
              @click="signatureEditorOpen ? cancelSignatureEditor() : openSignatureEditor()"
            >
              <PreviewIcon name="pen" />{{ zh(signatureEditorOpen ? '取消编辑' : hasSavedSignature ? '重新签名' : '创建签名') }}
            </button>
            <button
              v-if="hasSavedSignature"
              class="ghost"
              type="button"
              :disabled="savingSignature"
              @click="signaturePreviewOpen = true"
            >
              <PreviewIcon name="share" />{{ zh('预览签名') }}
            </button>
            <button
              v-if="hasSavedSignature"
              class="ghost danger-soft"
              type="button"
              :disabled="savingSignature"
              @click="removeSignature"
            >
              <PreviewIcon name="trash" />{{ zh('清除已存签名') }}
            </button>
          </div>
        </div>
        <p v-if="!hasSavedSignature" class="required-hint">{{ zh('请补充手写签名，导出服务表时将使用此签名。') }}</p>
        <div class="signature-summary-card" :class="{ empty: !hasSavedSignature }">
          <img v-if="hasSavedSignature" :src="savedSignatureData" :alt="zh('签名缩略图')" />
          <span v-else><PreviewIcon name="pen" />{{ zh('签名将用于服务表导出') }}</span>
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
        <p>{{ zh('默认只显示缩略图；需要时再预览或重新签名。') }}</p>
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
