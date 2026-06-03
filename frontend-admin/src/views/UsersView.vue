<script setup>
import { computed, reactive, onMounted, ref } from 'vue'
import { api } from '../services/api'
import { getCurrentUser } from '../services/auth'
import EmptyState from '../components/admin/EmptyState.vue'
import FilterBar from '../components/admin/FilterBar.vue'
import KpiCard from '../components/admin/KpiCard.vue'
import PageHeader from '../components/admin/PageHeader.vue'
import StatusBadge from '../components/admin/StatusBadge.vue'
import { downloadText, toCsv } from '../utils/download'

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const users = ref([])
const keyword = ref('')
const form = reactive({
  username: '',
  password: '',
  realName: '',
  phone: '',
  role: 'engineer',
})
const roleOptions = [
  ['admin', '管理员'],
  ['assistant', '助理'],
  ['dispatcher', '调度'],
  ['supervisor', '主管'],
  ['engineering_supervisor', '工程主管'],
  ['sales_supervisor', '业务主管'],
  ['sales', '业务'],
  ['engineer', '工程师'],
]
const roleMap = Object.fromEntries(roleOptions)
const currentUser = getCurrentUser()
const canEdit = computed(() => currentUser?.role === 'admin')

async function createUser() {
  if (!canEdit.value) {
    error.value = '当前账号没有新增成员权限'
    return
  }
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await api.post('/users', { ...form, status: 'active' })
    Object.assign(form, { username: '', password: '', realName: '', phone: '', role: 'engineer' })
    message.value = '用户已新增'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ status: '' })
    if (keyword.value.trim()) params.set('keyword', keyword.value.trim())
    const data = await api.get(`/users?${params}`)
    users.value = (data.items || []).map((user) => ({
      id: user.id,
      username: user.username,
      name: user.realName || user.username,
      roleValue: user.role,
      role: roleMap[user.role] || user.role,
      statusValue: user.status,
      status: user.status === 'active' ? '启用' : '停用',
      phone: user.phone || user.username,
      initial: String(user.realName || user.username || '?').slice(0, 1),
    }))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function toggleUser(user) {
  if (!canEdit.value) {
    error.value = '当前账号没有成员管理权限'
    return
  }
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    if (user.statusValue === 'active') {
      await api.delete(`/users/${user.id}`)
      message.value = '成员已停用'
    } else {
      await api.post(`/users/${user.id}/restore`, {})
      message.value = '成员已启用'
    }
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function exportCsv() {
  const rows = [
    ['姓名', '账号', '角色', '电话', '状态'],
    ...filteredUsers.value.map((user) => [user.name, user.username, user.role, user.phone, user.status]),
  ]
  downloadText(`users-${new Date().toISOString().slice(0, 10)}.csv`, `\ufeff${toCsv(rows)}`, 'text/csv;charset=utf-8')
}

const filteredUsers = computed(() => {
  if (!keyword.value.trim()) return users.value
  const text = keyword.value.trim()
  return users.value.filter((user) => [user.name, user.username, user.role, user.phone].some((value) => String(value || '').includes(text)))
})
const activeCount = computed(() => users.value.filter((user) => user.statusValue === 'active').length)
const adminCount = computed(() => users.value.filter((user) => user.roleValue === 'admin').length)

onMounted(load)
</script>

<template>
  <section class="figma-page">
    <PageHeader kicker="MEMBER CENTER" title="工程师管理" description="授权工程师与管理人员目录。">
      <template #actions>
        <button class="ghost-button" type="button" @click="exportCsv">导出 CSV</button>
        <button v-if="canEdit" class="primary" type="submit" form="user-create-form" :disabled="saving">新增成员</button>
      </template>
    </PageHeader>

    <FilterBar v-model:query="keyword" search-placeholder="搜索姓名、账号、角色或电话..." @submit="load" />

    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-if="message" class="form-success">{{ message }}</p>
    <p v-else-if="loading" class="muted">正在加载用户...</p>

    <form v-if="canEdit" id="user-create-form" class="inline-form" @submit.prevent="createUser">
      <label class="field"><span>账号</span><input v-model.trim="form.username" required /></label>
      <label class="field"><span>姓名</span><input v-model.trim="form.realName" required /></label>
      <label class="field"><span>密码</span><input v-model="form.password" type="password" required /></label>
      <label class="field"><span>角色</span><select v-model="form.role"><option v-for="[value, label] in roleOptions" :key="value" :value="value">{{ label }}</option></select></label>
    </form>

    <section class="glass-panel table-card">
      <div class="table-head member-head">
        <span>成员</span>
        <span>角色</span>
        <span>部门</span>
        <span>状态</span>
        <span>操作</span>
      </div>
      <article v-for="user in filteredUsers" :key="user.id" class="member-row">
        <div class="member-identity">
          <span class="member-avatar">{{ user.initial }}</span>
          <div>
            <strong>{{ user.name }}</strong>
            <small>{{ user.phone }}</small>
          </div>
        </div>
        <span>{{ user.role }}</span>
        <span>基础设施运维</span>
        <span><StatusBadge :label="user.status" :tone="user.status === '启用' ? 'success' : 'default'" compact /></span>
        <button v-if="canEdit" class="row-action-button" type="button" :disabled="saving" @click="toggleUser(user)">
          {{ user.status === '启用' ? '停用' : '启用' }}
        </button>
      </article>
      <EmptyState v-if="!filteredUsers.length && !loading" title="暂无用户" description="没有找到匹配的成员，请调整搜索条件或新增成员。" />
    </section>

    <section class="kpi-grid">
      <KpiCard title="总人数" :value="users.length" subtitle="当前列表" icon="customer" />
      <KpiCard title="在岗" :value="activeCount" subtitle="已启用成员" icon="activity" />
      <KpiCard title="系统管理员" :value="adminCount" subtitle="管理员角色" icon="ticket" />
    </section>
  </section>
</template>
