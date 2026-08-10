import { api } from '@/services/api'
import type { ApprovalTask, AssistantSetting, CustomerOption, MrConstants, MrOrder, QuotationImportResult, UserOption, VendorOption } from './types'

function pathId(id: string | number) {
  return encodeURIComponent(String(id).replace(/^\/+|\/+$/g, ''))
}
export async function listMr(params: { q?: string; status?: string } = {}) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status) search.set('status', params.status)
  return api.get(`/mr${search.size ? `?${search}` : ''}`) as Promise<{ items: MrOrder[] }>
}

export const getMr = (id: string | number) => api.get(`/mr/${pathId(id)}`) as Promise<MrOrder>
export const createMr = (body: Partial<MrOrder> = {}) => api.post('/mr', body) as Promise<MrOrder>
export const updateMr = (id: string | number, body: Partial<MrOrder>) => api.put(`/mr/${pathId(id)}`, body) as Promise<MrOrder>
export const submitMr = (id: string | number) => api.post(`/mr/${pathId(id)}/submit`) as Promise<MrOrder>
export const approveMr = (id: string | number) => api.post(`/mr/${pathId(id)}/approve`) as Promise<MrOrder>
export const rejectMr = (id: string | number, reason: string, target: 'sales' | 'assistant') => api.post(`/mr/${pathId(id)}/reject`, { reason, target }) as Promise<MrOrder>
export const reassignMrSales = (id: string | number, salesOwnerId: string | number) => api.post(`/mr/${pathId(id)}/reassign-sales`, { salesOwnerId }) as Promise<MrOrder>
export const withdrawMr = (id: string | number, reason: string) => api.post(`/mr/${pathId(id)}/withdraw`, { reason }) as Promise<MrOrder>
export const voidMr = (id: string | number, reason: string) => api.post(`/mr/${pathId(id)}/void`, { reason }) as Promise<MrOrder>
export const deleteMr = (id: string | number) => api.delete(`/mr/${pathId(id)}`)
export const getMrConstants = () => api.get('/mr/constants') as Promise<MrConstants>
export const getAssistantSetting = () => api.get('/mr/assistant-setting') as Promise<AssistantSetting>
export const setAssistantSetting = (assistantUserId: string | number) => api.put('/mr/assistant-setting', { assistantUserId }) as Promise<AssistantSetting>
export const listApprovalTasks = (view: 'pending' | 'initiated' | 'completed') => api.get(`/approval-tasks?view=${view}`) as Promise<{ items: ApprovalTask[]; pendingCount: number }>
export const listSalespeople = () => api.get('/users/salespeople') as Promise<{ items: UserOption[] }>

export async function importQuotations(id: string | number, files: File[], persist = false, roles?: Array<'sales' | 'purchase'>, cleanupStoredFiles = false, taskId = '') {
  const body = new FormData()
  for (const file of files) body.append('files', file)
  if (roles?.length) body.set('sourceRoles', JSON.stringify(roles))
  if (persist) body.set('persist', '1')
  if (cleanupStoredFiles) body.set('cleanupStoredFiles', '1')
  if (taskId) body.set('taskId', taskId)
  return api.postForm(`/mr/${pathId(id)}/import`, body) as Promise<QuotationImportResult>
}

export async function getImportProgress(taskId: string) {
  return api.get(`/mr/import-progress?taskId=${encodeURIComponent(taskId)}`) as Promise<{ done: number; total: number; current: string; stage?: string }>
}

export async function downloadQuotation(id: string | number, fileId: string | number, name: string) {
  const blob = await api.download(`/mr/${pathId(id)}/quotation?fileId=${fileId}`)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function downloadMrDocument(id: string | number, type?: 'approved' | 'voided') {
  const blob = await api.download(`/mr/${pathId(id)}/document${type ? `?type=${type}` : ''}`)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `MR-${id}-${type || '正式'}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function loadMrReferences() {
  const [customers, salespeople, vendors] = await Promise.all([
    api.get('/customers?pageSize=200') as Promise<{ items?: CustomerOption[] }>,
    api.get('/users/salespeople') as Promise<{ items?: UserOption[] }>,
    api.get('/mr/vendor-suggestions') as Promise<{ items?: VendorOption[] }>,
  ])
  return {
    customers: customers.items || [],
    salespeople: (salespeople.items || []).filter((user) => ['sales', 'sales_supervisor'].includes(user.role || '')),
    vendors: vendors.items || [],
  }
}

export async function loadCustomer(id: string | number) {
  const data = await api.get(`/customers/${pathId(id)}`)
  return (data?.item || data) as CustomerOption
}
export const createCustomerContact = (customerId: string | number, body: { name: string; phone?: string; email?: string }) => api.post(`/customers/${pathId(customerId)}/contacts`, body) as Promise<{ id: string | number; name: string; phone?: string | null; email?: string | null }>
