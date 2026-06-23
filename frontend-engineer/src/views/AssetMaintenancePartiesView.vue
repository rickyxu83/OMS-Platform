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

function isOriginalManufacturer(type) {
  return type === 'original_manufacturer' || type === 'vendor_contact' || type === 'vendor'
}

const filteredParties = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return parties.value.filter((item) => {
    if (typeFilter.value && item.partyType !== typeFilter.value) return false
    if (!keyword) return true
    return [item.name, item.contact, item.phone, item.officialWebsite, item.remark]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})

const stats = computed(() => {
  const total = parties.value.length
  const vendor = parties.value.filter((item) => isOriginalManufacturer(item.partyType)).length
  const partner = parties.value.filter((item) => !isOriginalManufacturer(item.partyType)).length
  return [
    { label: '维保方总数', value: total },
    { label: '原厂联系人', value: vendor },
    { label: '合作维保方', value: partner },
  ]
})

function emptyForm() {
  return {
    name: '',
    contact: '',
    phone: '',
    partyType: 'our_maintenance',
    officialWebsite: '',
    remark: '',
  }
}

function partyTypeLabel(value) {
  return typeLabels[value] || value || '未分类'
}

function officialWebsiteHref(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function telHref(phone) {
  const normalized = String(phone || '').trim().replace(/[\s()-]/g, '')
  return normalized ? `tel:${normalized}` : ''
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
    partyType: party.partyType || 'our_maintenance',
    officialWebsite: party.officialWebsite || '',
    remark: party.remark || '',
  }
  dialogOpen.value = true
}

function closeDialog() {
  if (saving.value) return
  dialogOpen.value = false
}

function onPartyTypeChange() {
  if (isOriginalManufacturer(form.value.partyType)) {
    form.value.contact = ''
  }
}

function resetFilters() {
  searchQuery.value = ''
  typeFilter.value = ''
  loadParties()
}

async function saveParty() {
  if (!form.value.name.trim()) {
    error.value = '请输入维保方名称'
    return
  }
  if (form.value.phone.trim()) {
    const phoneRe = /^[0-9+()\-\s]{7,32}$/
    if (!phoneRe.test(form.value.phone.trim())) {
      error.value = '联系电话格式不正确'
      return
    }
  }
  saving.value = true
  error.value = ''
  try {
    const payload = {
      name: form.value.name.trim(),
      contact: isOriginalManufacturer(form.value.partyType) ? undefined : form.value.contact.trim() || undefined,
      phone: form.value.phone.trim() || undefined,
      partyType: form.value.partyType,
      officialWebsite: form.value.officialWebsite.trim() || undefined,
      remark: form.value.remark.trim() || undefined,
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
        <p class="asset-page-lead">{{ zh('维护原厂联系人、合作维保方电话和官网地址。') }}</p>
        <div class="asset-inline-nav">
          <RouterLink class="ghost asset-refresh" to="/assets"><PreviewIcon name="assets" />{{ zh('返回客户资产') }}</RouterLink>
        </div>
      </div>
    </header>

    <section class="asset-toolbar">
      <label class="asset-search-box">
        <PreviewIcon name="eye" />
        <input v-model="searchQuery" type="search" :placeholder="zh('搜索维保方、联系人、电话、官网地址')" @keydown.enter="loadParties" />
      </label>
      <select v-model="typeFilter" class="asset-select" @change="loadParties">
        <option value="">{{ zh('全部类型') }}</option>
        <option value="original_manufacturer">{{ zh('原厂联系人') }}</option>
        <option value="our_maintenance">{{ zh('合作维保方') }}</option>
      </select>
      <button class="ghost" type="button" @click="resetFilters"><PreviewIcon name="refresh" />{{ zh('重置') }}</button>
      <button class="ghost" type="button" :disabled="loading" @click="loadParties"><PreviewIcon name="refresh" />{{ zh('刷新') }}</button>
      <button class="primary" type="button" @click="openCreate"><PreviewIcon name="new" />{{ zh('新增维保方') }}</button>
    </section>

    <section class="asset-stats-row">
      <div v-for="stat in stats" :key="stat.label" class="asset-stat-card">
        <span class="asset-stat-value">{{ stat.value }}</span>
        <span class="asset-stat-label">{{ zh(stat.label) }}</span>
      </div>
    </section>

    <p v-if="error" class="form-error">{{ zh(error) }}</p>
    <p v-if="loading" class="muted">{{ zh('正在载入维保方目录…') }}</p>

    <section class="asset-card-list">
      <article
        v-for="party in filteredParties"
        :key="party.id"
        class="asset-record-card asset-clickable-card"
        role="link"
        tabindex="0"
        @click="$router.push(`/assets/maintenance-parties/${party.id}`)"
        @keydown.enter="$router.push(`/assets/maintenance-parties/${party.id}`)"
        @keydown.space.prevent="$router.push(`/assets/maintenance-parties/${party.id}`)"
      >
        <header>
          <div>
            <span class="asset-record-kicker">{{ zh(partyTypeLabel(party.partyType)) }}</span>
            <h2>{{ zh(party.name || '未命名维保方') }}</h2>
          </div>
          <button class="ghost" type="button" @click.stop="openEdit(party)"><PreviewIcon name="edit" />{{ zh('编辑') }}</button>
        </header>
        <div class="asset-contact-list">
          <span v-if="isOriginalManufacturer(party.partyType)"><PreviewIcon name="contact" />{{ zh('联系电话') }}<b><a v-if="party.phone" :href="telHref(party.phone)" @click.stop>{{ party.phone }}</a><template v-else>{{ zh('未维护电话') }}</template></b></span>
          <span v-else><PreviewIcon name="contact" />{{ zh(party.contact || '未维护联系人') }}<b><a v-if="party.phone" :href="telHref(party.phone)" @click.stop>{{ party.phone }}</a><template v-else>{{ zh('未维护电话') }}</template></b></span>
        </div>
        <p v-if="party.officialWebsite" class="asset-record-line">
          <PreviewIcon name="maintenance" />
          <a :href="officialWebsiteHref(party.officialWebsite)" target="_blank" rel="noreferrer" @click.stop>{{ zh(party.officialWebsite) }}</a>
        </p>
        <p v-if="party.remark" class="asset-record-note">{{ zh(party.remark) }}</p>
      </article>
      <p v-if="!loading && !filteredParties.length" class="empty-state">{{ zh('暂无维保方资料') }}</p>
    </section>

    <div v-if="dialogOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh(editingId ? '编辑维保方' : '新增维保方')" @click.self="closeDialog">
      <div class="signature-modal-shell asset-editor-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('维保方目录') }}</p>
            <h2>{{ zh(editingId ? '编辑维保方' : '新增维保方') }}</h2>
          </div>
        </header>
        <div class="asset-editor-form">
          <label>{{ zh('维保方名称 *') }}<input v-model="form.name" type="text" :placeholder="zh('例如 Dell EMC 原厂技术支持')" /></label>
          <label>{{ zh('类型') }}
            <select v-model="form.partyType" @change="onPartyTypeChange">
              <option value="original_manufacturer">{{ zh('原厂联系人') }}</option>
              <option value="our_maintenance">{{ zh('合作维保方') }}</option>
            </select>
          </label>
          <label v-if="!isOriginalManufacturer(form.partyType)">{{ zh('联系人') }}<input v-model="form.contact" type="text" :placeholder="zh('联系人姓名')" /></label>
          <label>{{ zh('联系电话') }}<input v-model="form.phone" type="tel" :placeholder="zh('支持数字、加号、括号、横线、空格，长度 7-32')" /></label>
          <label>{{ zh('官网地址') }}<input v-model="form.officialWebsite" type="url" :placeholder="zh('例如 https://www.example.com')" /></label>
          <label>{{ zh('备注') }}<textarea v-model="form.remark" rows="3" :placeholder="zh('补充说明')"></textarea></label>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" @click="closeDialog">{{ zh('取消') }}</button>
          <button class="primary" type="button" :disabled="saving" @click="saveParty"><PreviewIcon name="save" />{{ zh(saving ? '保存中…' : '保存') }}</button>
        </footer>
      </div>
    </div>
  </main>
</template>
