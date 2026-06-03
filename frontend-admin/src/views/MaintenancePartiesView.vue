<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../services/api'
import EmptyState from '../components/admin/EmptyState.vue'
import FilterBar from '../components/admin/FilterBar.vue'
import KpiCard from '../components/admin/KpiCard.vue'
import PageHeader from '../components/admin/PageHeader.vue'
import StatusBadge from '../components/admin/StatusBadge.vue'

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const parties = ref([])
const selectedPartyId = ref('')
const keyword = ref('')
const partyTypeFilter = ref('')
const createForm = reactive({
  name: '',
  phone: '',
  partyType: 'our_maintenance',
})
const detailForm = reactive({
  name: '',
  phone: '',
  partyType: 'our_maintenance',
})

const partyTypeOptions = [
  ['', '全部类型'],
  ['original_manufacturer', '原厂联系人'],
  ['our_maintenance', '合作维保方'],
]

const partyTypeMeta = {
  original_manufacturer: { label: '原厂联系人', tone: '原厂服务资源' },
  our_maintenance: { label: '合作维保方', tone: '共享维保目录' },
}

function normalizeParty(party) {
  const partyType = party.partyType || 'our_maintenance'
  return {
    raw: party,
    id: party.id,
    name: party.name || '-',
    phone: party.phone || '',
    partyType,
    partyTypeLabel: partyTypeMeta[partyType]?.label || partyType,
    partyTypeTone: partyTypeMeta[partyType]?.tone || '维保资料',
    initial: String(party.name || '?').slice(0, 1),
    createdAt: formatDate(party.createdAt),
    updatedAt: formatDate(party.updatedAt),
  }
}

function formatDate(value) {
  return String(value || '').replace('T', ' ').slice(0, 10) || '-'
}

function cleanText(value) {
  return String(value || '').trim()
}

function validatePhone(phone) {
  const text = cleanText(phone)
  if (!text) return ''
  if (!/^[0-9+()\-\s]{7,32}$/.test(text)) {
    throw new Error('联系电话格式不正确')
  }
  return text
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (keyword.value.trim()) params.set('keyword', keyword.value.trim())
    if (partyTypeFilter.value) params.set('partyType', partyTypeFilter.value)
    const query = params.toString()
    const data = await api.get(`/maintenance-parties${query ? `?${query}` : ''}`)
    parties.value = (data.items || []).map(normalizeParty)
    selectedPartyId.value = parties.value.some((party) => party.id === selectedPartyId.value)
      ? selectedPartyId.value
      : parties.value[0]?.id || ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function createParty() {
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const payload = {
      name: cleanText(createForm.name),
      phone: validatePhone(createForm.phone) || null,
      partyType: createForm.partyType || 'our_maintenance',
    }
    if (!payload.name) {
      throw new Error('维保方名称不能为空')
    }
    const data = await api.post('/maintenance-parties', payload)
    Object.assign(createForm, { name: '', phone: '', partyType: 'our_maintenance' })
    message.value = '维保方已新增'
    await load()
    if (data?.id) selectedPartyId.value = data.id
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function updateSelectedParty() {
  if (!selectedParty.value) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const payload = {
      name: cleanText(detailForm.name),
      phone: validatePhone(detailForm.phone) || null,
      partyType: detailForm.partyType || 'our_maintenance',
    }
    if (!payload.name) {
      throw new Error('维保方名称不能为空')
    }
    await api.put(`/maintenance-parties/${selectedParty.value.id}`, payload)
    message.value = '维保方资料已保存'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function resetFilters() {
  keyword.value = ''
  partyTypeFilter.value = ''
  load()
}

const filteredCount = computed(() => parties.value.length)
const manufacturerCount = computed(() => parties.value.filter((party) => party.partyType === 'original_manufacturer').length)
const partnerCount = computed(() => parties.value.filter((party) => party.partyType === 'our_maintenance').length)
const selectedParty = computed(() => parties.value.find((party) => party.id === selectedPartyId.value) || parties.value[0] || null)

watch(selectedParty, (party) => {
  Object.assign(detailForm, {
    name: party?.name || '',
    phone: party?.phone || '',
    partyType: party?.partyType || 'our_maintenance',
  })
}, { immediate: true })

watch(() => [keyword.value, partyTypeFilter.value], () => {
  load()
})

onMounted(load)
</script>

<template>
  <section class="figma-page">
    <PageHeader kicker="MAINTENANCE DIRECTORY" title="维保方管理" description="原厂联系人与合作维保方共用同一目录，供设备维护归属复用与统一维护。">
      <template #actions>
        <button class="ghost-button" type="button" @click="resetFilters">重置筛选</button>
        <button class="primary" type="button" @click="load">刷新目录</button>
      </template>
    </PageHeader>

    <section class="kpi-grid">
      <KpiCard title="维保方总数" :value="filteredCount" subtitle="共享目录" icon="customer" />
      <KpiCard title="原厂联系人" :value="manufacturerCount" subtitle="原厂服务资源" icon="ticket" />
      <KpiCard title="合作维保方" :value="partnerCount" subtitle="共享维保目录" icon="activity" />
    </section>

    <section class="page-stack">
      <FilterBar v-model:query="keyword" search-placeholder="搜索名称或电话..." @submit="load">
        <select v-model="partyTypeFilter" class="select-chip">
          <option v-for="[value, label] in partyTypeOptions" :key="value" :value="value">{{ label }}</option>
        </select>
        <span class="chip">共用目录：原厂联系人 / 合作维保方</span>
      </FilterBar>

      <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
      <p v-if="message" class="form-success">{{ message }}</p>
      <p v-else-if="loading" class="muted">正在加载维保方目录...</p>

      <form class="inline-form maintenance-party-create" @submit.prevent="createParty">
        <label class="field"><span>维保方名称</span><input v-model.trim="createForm.name" required placeholder="输入原厂联系人或合作维保方名称" /></label>
        <label class="field"><span>联系电话</span><input v-model.trim="createForm.phone" placeholder="输入联系电话" /></label>
        <label class="field"><span>类型</span><select v-model="createForm.partyType"><option v-for="[value, label] in partyTypeOptions.slice(1)" :key="value" :value="value">{{ label }}</option></select></label>
        <button class="primary maintenance-submit" type="submit" :disabled="saving">{{ saving ? '新增中...' : '新增维保方' }}</button>
      </form>

      <section class="detail-layout">
        <div class="glass-panel table-card party-table">
          <div class="table-head">
            <span>名称</span>
            <span>类型</span>
            <span>联系电话</span>
            <span>最近更新</span>
          </div>
          <button
            v-for="party in parties"
            :key="party.id"
            class="table-row"
            :class="{ selected: selectedParty?.id === party.id }"
            type="button"
            @click="selectedPartyId = party.id"
          >
            <span>
              <strong>{{ party.name }}</strong>
              <small>{{ party.partyTypeTone }}</small>
            </span>
            <span><StatusBadge :label="party.partyTypeLabel" :tone="party.partyType === 'original_manufacturer' ? 'info' : 'default'" compact /></span>
            <span>{{ party.phone || '未填写' }}</span>
            <span class="muted-text">{{ party.updatedAt }}</span>
          </button>
          <EmptyState v-if="!parties.length && !loading" title="暂无维保方资料" description="当前还没有维保方记录，请新建维保方或调整筛选。" />
        </div>

        <aside class="glass-panel drawer" v-if="selectedParty">
          <div class="drawer-head">
            <div>
              <p>维保方资料</p>
              <h2>{{ selectedParty.name }}</h2>
            </div>
            <StatusBadge :label="selectedParty.partyTypeLabel" :tone="selectedParty.partyType === 'original_manufacturer' ? 'info' : 'default'" compact />
          </div>

          <div class="drawer-stats">
            <article><span>目录定位</span><strong>{{ selectedParty.partyTypeTone }}</strong></article>
            <article><span>最近更新</span><strong>{{ selectedParty.updatedAt }}</strong></article>
          </div>

          <form class="drawer-form" @submit.prevent="updateSelectedParty">
            <label class="field"><span>维保方名称</span><input v-model.trim="detailForm.name" required /></label>
            <label class="field"><span>联系电话</span><input v-model.trim="detailForm.phone" placeholder="输入联系电话" /></label>
            <label class="field"><span>类型</span><select v-model="detailForm.partyType"><option v-for="[value, label] in partyTypeOptions.slice(1)" :key="value" :value="value">{{ label }}</option></select></label>
            <p class="drawer-note">同一目录同时维护原厂联系人与合作维保方，设备页会从这里读取可复用的维护方选项。</p>
            <p v-if="error" class="form-error">{{ error }}</p>
            <div class="page-actions">
              <button class="ghost-button" type="button" :disabled="saving" @click="selectedPartyId = parties[0]?.id || ''">切换首条</button>
              <button class="primary" type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存维保方' }}</button>
            </div>
          </form>
        </aside>

        <aside v-else class="glass-panel drawer">
          <h2>请选择维保方</h2>
          <p class="empty-state">从左侧列表选择一条记录后，可在这里编辑名称、电话和类型。</p>
        </aside>
      </section>
    </section>
  </section>
</template>
