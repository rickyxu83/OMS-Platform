<script setup>
import { computed, onMounted, ref } from 'vue'
import BrandEyebrow from '../components/BrandEyebrow.vue'
import PreviewIcon from '../components/PreviewIcon.vue'
import { usePreviewI18n } from '../composables/usePreviewI18n'
import { api } from '../services/api'

const { zh } = usePreviewI18n()
const customers = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const searchQuery = ref('')
const dialogOpen = ref(false)
const editingId = ref(null)
const form = ref(emptyForm())

const filteredCustomers = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) return customers.value
  return customers.value.filter((item) => [
    item.name,
    item.code,
    item.address,
    item.contactName,
    item.contactPhone,
    item.salesperson,
    ...(Array.isArray(item.contacts) ? item.contacts.flatMap((contact) => [contact.name, contact.phone]) : []),
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)))
})

function emptyForm() {
  return {
    name: '',
    code: '',
    address: '',
    contactName: '',
    contactPhone: '',
    salesperson: '',
    level: 'normal',
    remark: '',
    contacts: [{ name: '', phone: '' }],
  }
}

function contactsFor(customer) {
  const contacts = Array.isArray(customer?.contacts) ? customer.contacts : []
  if (contacts.length) return contacts
  if (customer?.contactName || customer?.contactPhone) {
    return [{ name: customer.contactName || '联系人', phone: customer.contactPhone || '' }]
  }
  return []
}

async function loadCustomers() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ pageSize: '200' })
    const keyword = searchQuery.value.trim()
    if (keyword) params.set('keyword', keyword)
    const data = await api.get(`/customers?${params.toString()}`)
    customers.value = data?.items || []
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

function openEdit(customer) {
  const contacts = contactsFor(customer)
  editingId.value = customer.id
  form.value = {
    name: customer.name || '',
    code: customer.code || '',
    address: customer.address || '',
    contactName: customer.contactName || contacts[0]?.name || '',
    contactPhone: customer.contactPhone || contacts[0]?.phone || '',
    salesperson: customer.salesperson || '',
    level: customer.level || 'normal',
    remark: customer.remark || '',
    contacts: contacts.length ? contacts.map((contact) => ({ id: contact.id, name: contact.name || '', phone: contact.phone || '' })) : [{ name: '', phone: '' }],
  }
  dialogOpen.value = true
}

function closeDialog() {
  if (saving.value) return
  dialogOpen.value = false
}

function addContact() {
  form.value.contacts.push({ name: '', phone: '' })
}

function removeContact(index) {
  if (form.value.contacts.length <= 1) {
    form.value.contacts = [{ name: '', phone: '' }]
    return
  }
  form.value.contacts.splice(index, 1)
}

async function saveCustomer() {
  if (!form.value.name.trim()) {
    error.value = '请输入客户名称'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const contacts = form.value.contacts
      .map((contact) => ({ id: contact.id, name: contact.name.trim(), phone: contact.phone.trim() }))
      .filter((contact) => contact.name || contact.phone)
    const firstContact = contacts[0] || { name: form.value.contactName.trim(), phone: form.value.contactPhone.trim() }
    const payload = {
      name: form.value.name.trim(),
      code: form.value.code.trim(),
      address: form.value.address.trim(),
      contactName: form.value.contactName.trim() || firstContact.name || '',
      contactPhone: form.value.contactPhone.trim() || firstContact.phone || '',
      contacts,
      salesperson: form.value.salesperson.trim(),
      level: form.value.level,
      remark: form.value.remark.trim(),
    }
    if (editingId.value) await api.put(`/customers/${editingId.value}`, payload)
    else await api.post('/customers', payload)
    dialogOpen.value = false
    await loadCustomers()
  } catch (err) {
    error.value = err.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadCustomers()
})
</script>

<template>
  <main class="engineer-shell asset-shell">
    <header class="topbar asset-topbar">
      <div>
        <BrandEyebrow text="客户与资产 / 客户档案" title="客户档案" />
        <p class="asset-page-lead">{{ zh('维护客户地址、联系人和联系电话。') }}</p>
      </div>
      <RouterLink class="ghost asset-refresh" to="/assets"><PreviewIcon name="assets" />{{ zh('客户资产') }}</RouterLink>
    </header>

    <section class="asset-toolbar">
      <label class="asset-search-box">
        <PreviewIcon name="eye" />
        <input v-model="searchQuery" type="search" :placeholder="zh('搜索客户、联系人、电话、地址')" @keydown.enter="loadCustomers" />
      </label>
      <button class="ghost" type="button" :disabled="loading" @click="loadCustomers"><PreviewIcon name="refresh" />{{ zh('刷新') }}</button>
      <button class="primary" type="button" @click="openCreate"><PreviewIcon name="new" />{{ zh('新增客户') }}</button>
    </section>

    <p v-if="error" class="form-error">{{ zh(error) }}</p>
    <p v-if="loading" class="muted">{{ zh('正在载入客户档案...') }}</p>

    <section class="asset-card-list">
      <article
        v-for="customer in filteredCustomers"
        :key="customer.id"
        class="asset-record-card asset-clickable-card"
        role="link"
        tabindex="0"
        @click="$router.push(`/assets/customers/${customer.id}`)"
        @keydown.enter="$router.push(`/assets/customers/${customer.id}`)"
        @keydown.space.prevent="$router.push(`/assets/customers/${customer.id}`)"
      >
        <header>
          <div>
            <span class="asset-record-kicker">{{ customer.code || zh('未维护编码') }}</span>
            <h2>{{ zh(customer.name || '未命名客户') }}</h2>
          </div>
          <button class="ghost" type="button" @click.stop="openEdit(customer)"><PreviewIcon name="edit" />{{ zh('编辑') }}</button>
        </header>
        <p class="asset-record-line"><PreviewIcon name="pin" />{{ zh(customer.address || '未维护地址') }}</p>
        <div class="asset-contact-list">
          <span v-for="contact in contactsFor(customer)" :key="`${customer.id}-${contact.id || contact.name}`">
            <PreviewIcon name="contact" />{{ zh(contact.name || '联系人') }}<b>{{ contact.phone || zh('未维护电话') }}</b>
          </span>
          <span v-if="!contactsFor(customer).length"><PreviewIcon name="contact" />{{ zh('未维护联系人') }}</span>
        </div>
      </article>
      <p v-if="!loading && !filteredCustomers.length" class="empty-state">{{ zh('暂无客户档案') }}</p>
    </section>

    <div v-if="dialogOpen" class="signature-modal" role="dialog" aria-modal="true" :aria-label="zh(editingId ? '编辑客户' : '新增客户')">
      <div class="signature-modal-shell asset-editor-shell">
        <header class="signature-modal-head">
          <div>
            <p>{{ zh('客户档案') }}</p>
            <h2>{{ zh(editingId ? '编辑客户' : '新增客户') }}</h2>
          </div>
        </header>
        <div class="asset-editor-form">
          <label>{{ zh('客户名称') }}<input v-model="form.name" type="text" /></label>
          <label>{{ zh('客户编码') }}<input v-model="form.code" type="text" :placeholder="zh('留空自动生成或沿用')" /></label>
          <label>{{ zh('客户地址') }}<textarea v-model="form.address" rows="2"></textarea></label>
          <label>{{ zh('默认联系人') }}<input v-model="form.contactName" type="text" /></label>
          <label>{{ zh('默认电话') }}<input v-model="form.contactPhone" type="tel" /></label>
          <label>{{ zh('业务归属') }}<input v-model="form.salesperson" type="text" /></label>
          <label>{{ zh('备注') }}<textarea v-model="form.remark" rows="2"></textarea></label>
          <section class="asset-editor-nested">
            <div class="asset-editor-nested-head">
              <strong>{{ zh('联系人列表') }}</strong>
              <button class="ghost" type="button" @click="addContact"><PreviewIcon name="new" />{{ zh('新增') }}</button>
            </div>
            <div v-for="(contact, index) in form.contacts" :key="index" class="asset-contact-row">
              <input v-model="contact.name" type="text" :placeholder="zh('联系人')" />
              <input v-model="contact.phone" type="tel" :placeholder="zh('电话')" />
              <button class="ghost danger-lite" type="button" @click="removeContact(index)"><PreviewIcon name="trash" /></button>
            </div>
          </section>
        </div>
        <footer class="signature-modal-actions">
          <button class="ghost" type="button" @click="closeDialog">{{ zh('取消') }}</button>
          <button class="primary" type="button" :disabled="saving" @click="saveCustomer"><PreviewIcon name="save" />{{ zh(saving ? '保存中...' : '保存') }}</button>
        </footer>
      </div>
    </div>
  </main>
</template>
