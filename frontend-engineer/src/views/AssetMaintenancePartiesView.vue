<script setup>
import { computed, onMounted, ref } from 'vue'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'

const { zh } = usePreviewI18n()
const parties = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const searchQuery = ref('')
const typeFilter = ref('')
const dialogOpen = ref(false)
const editingId = ref(null)
const form = ref(emptyForm())

const typeLabels = {
  original_manufacturer: '原厂联系人',
  vendor_contact: '原厂联系人',
  vendor: '原厂联系人',
  our_maintenance: '合作维保方',
  partner: '合作维保方',
  our: '合作维保方',
}

const filteredParties = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return parties.value.filter((item) => {
    if (typeFilter.value && item.partyType !== typeFilter.value) return false
    if (!keyword) return true
    return [item.name, item.contact, item.phone, item.serviceScope, item.remark]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})

function emptyForm() {
  return {
    name: '',
    contact: '',
    phone: '',
    partyType: 'original_manufacturer',
    serviceScope: '',
    remark: '',
  }
}

function partyTypeLabel(value) {
  return typeLabels[value] || value || '未分类'
}

async function loadParties() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (searchQuery.value.trim()) params.set('keyword', searchQuery.value.trim())
    if (typeFilter.value) params.set('partyType', typeFilter.value)
    const data = await api.get(`/maintenance-parties${params.toString() ? `?${params.toString()}` : ''}`)
    parties.value = data?.items || []
  } catch (err) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = emptyForm()
  dialogOpen.value = true
}

function openEdit(party) {
  editingId.value = party.id
  form.value = {
    name: party.name || '',
    contact: party.contact || '',
    phone: party.phone || '',
    partyType: party.partyType || 'original_manufacturer',
    serviceScope: party.serviceScope || '',
    remark: party.remark || '',
  }
  dialogOpen.value = true
}

function closeDialog() {
  if (saving.value) return
  dialogOpen.value = false
}

async function saveParty() {
  if (!form.value.name.trim()) {
    error.value = '请输入维保方名称'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = {
      name: form.value.name.trim(),
      contact: form.value.contact.trim(),
      phone: form.value.phone.trim(),
      partyType: form.value.partyType,
      serviceScope: form.value.serviceScope.trim(),
      remark: form.value.remark.trim(),
    }
    if (editingId.value) await api.put(`/maintenance-parties/${editingId.value}`, payload)
    else await api.post('/maintenance-parties', payload)
    dialogOpen.value = false
    await loadParties()
  } catch (err) {
    error.value = err.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadParties()
})
</script>

<template>
  <main class="engineer-shell asset-shell">
    <header class="topbar asset-topbar">
      <div>
        <BrandEyebrow text="客户与资产 / 维保方目录" title="维保方目录" />
        <p class="asset-page-lead">{{ zh('维护原厂联系人、合作维保方电话和服务范围。') }}</p>
      </div>
      <RouterLink class="ghost asset-refresh" to="/assets"><PreviewIcon name="assets" />{{ zh('总览') }}</RouterLink>
    </header>

    <section class="asset-toolbar">
      <label class="asset-search-box">
        <PreviewIcon name="eye" />
        <input v-model="searchQuery" type="search" :placeholder="zh('搜索厂商、联系人、电话、范围')" @keydown.enter="loadParties" />
      </label>
      <select v-model="typeFilter" class="asset-select" @change="loadParties">
        <option value="">{{ zh('全部类型') }}</option>
        <option value="original_manufacturer">{{ zh('原厂联系人') }}</option>
        <option value="our_maintenance">{{ zh('合作维保方') }}</option>
      </select>
      <button class="ghost" type="button" :disabled="loading" @click="loadParties"><PreviewIcon name="refresh" />{{ zh('刷新') }}</button>
      <button class="primary" type="button" @click="openCreate"><PreviewIcon name="new" />{{ zh('新增维保方') }}</button>
    </section>

    <p v-if="error" class="form-error">{{ zh(error) }}</p>
    <p v-if="loading" class="muted">{{ zh('正在载入维保方目录...') }}</p>

    <section class="asset-card-list">
      <article v-for="party in filteredParties" :key="party.id" class="asset-record-card">
        <header>
          <div>
            <span class="asset-record-kicker">{{ zh(partyTypeLabel(party.partyType)) }}</span>
            <h2>{{ zh(party.name || '未命名维保方') }}</h2>
          </div>
          <button class="ghost" type="button" @click="openEdit(party)"><PreviewIcon name="edit" />{{ zh('编辑') }}</button>
        </header>
        <div class="asset-contact-list">
          <span><PreviewIcon name="contact" />{{ zh(party.contact || '未维护联系人') }}<b>{{ party.phone || zh('未维护电话') }}</b></span>
        </div>
        <p class="asset-record-line"><PreviewIcon name="maintenance" />{{ zh(party.serviceScope || '未维护服务范围') }}</p>
        <p v-if="party.remark" class="asset-record-note">{{ zh(party.remark) }}</p>
      </article>
      <p v-if="!loading && !filteredParties.length" class="empty-state">{{ zh('暂无维保方资料') }}</p>
    </section>

    <div v-if="dialogOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh(editingId ? '编辑维保方' : '新增维保方')">
      <div class="signature-modal-shell asset-editor-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('维保方目录') }}</p>
            <h2>{{ zh(editingId ? '编辑维保方' : '新增维保方') }}</h2>
          </div>
        </header>
        <div class="asset-editor-form">
          <label>{{ zh('维保方名称') }}<input v-model="form.name" type="text" /></label>
          <label>{{ zh('类型') }}
            <select v-model="form.partyType">
              <option value="original_manufacturer">{{ zh('原厂联系人') }}</option>
              <option value="our_maintenance">{{ zh('合作维保方') }}</option>
            </select>
          </label>
          <label>{{ zh('联系人') }}<input v-model="form.contact" type="text" /></label>
          <label>{{ zh('联系电话') }}<input v-model="form.phone" type="tel" /></label>
          <label>{{ zh('服务范围') }}<input v-model="form.serviceScope" type="text" :placeholder="zh('例如服务器、存储、网络设备')" /></label>
          <label>{{ zh('备注') }}<textarea v-model="form.remark" rows="3"></textarea></label>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" @click="closeDialog">{{ zh('取消') }}</button>
          <button class="primary" type="button" :disabled="saving" @click="saveParty"><PreviewIcon name="save" />{{ zh(saving ? '保存中...' : '保存') }}</button>
        </footer>
      </div>
    </div>
  </main>
</template>
