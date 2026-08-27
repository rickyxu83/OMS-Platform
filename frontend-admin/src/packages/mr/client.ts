import { api } from '@/services/api'
import type { ApprovalTask, AssistantSetting, CustomerOption, MrConstants, MrLayoutRule, MrOrder, QuotationFile, QuotationImportResult, SalesPreferences, UserOption, VendorOption } from './types'

function pathId(id: string | number) {
  return encodeURIComponent(String(id).replace(/^\/+|\/+$/g, ''))
}
export async function listMr(params: { q?: string; status?: string; purchaseStatus?: string; customerId?: string; salesOwnerId?: string; dateFrom?: string; dateTo?: string; pendingMine?: boolean } = {}) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status) search.set('status', params.status)
  if (params.purchaseStatus) search.set('purchaseStatus', params.purchaseStatus)
  if (params.customerId) search.set('customerId', params.customerId)
  if (params.salesOwnerId) search.set('salesOwnerId', params.salesOwnerId)
  if (params.dateFrom) search.set('dateFrom', params.dateFrom)
  if (params.dateTo) search.set('dateTo', params.dateTo)
  if (params.pendingMine) search.set('pendingMine', '1')
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
export const submitMrContractNo = (id: string | number, body: { contractNo: string }) => api.put(`/mr/${pathId(id)}/contract-no`, body) as Promise<MrOrder>
export const submitMrPurchase = (id: string | number, body: { items: Array<{ id: string | number; companyPartNo: string; purchaseOrderNo: string; shipmentNo: string }>; note?: string }) => api.put(`/mr/${pathId(id)}/purchase`, body) as Promise<MrOrder>
export const deleteMr = (id: string | number) => api.delete(`/mr/${pathId(id)}`)
export const getMrConstants = () => api.get('/mr/constants') as Promise<MrConstants>
export const getAssistantSetting = () => api.get('/mr/assistant-setting') as Promise<AssistantSetting>
export const setAssistantSetting = (assistantUserId: string | number) => api.put('/mr/assistant-setting', { assistantUserId }) as Promise<AssistantSetting>
export const listApprovalTasks = (view: 'pending' | 'initiated' | 'completed') => api.get(`/approval-tasks?view=${view}`) as Promise<{ items: ApprovalTask[]; pendingCount: number; counts?: { pending: number; initiated: number; completed: number } }>
export const listSalespeople = () => api.get('/users/salespeople') as Promise<{ items: UserOption[] }>

// 识别版式规则（学习闭环 · 阶段B）：管理员维护候选/自学习规则
export const listMrLayoutRules = () => api.get('/mr/layout-rules') as Promise<{ items: MrLayoutRule[] }>
export const createMrLayoutRule = (body: { filePattern: string; vendor: string }) => api.post('/mr/layout-rules', body) as Promise<{ ok: boolean }>
export const updateMrLayoutRule = (id: string | number, body: { enabled?: boolean; vendor?: string; filePattern?: string }) => api.put(`/mr/layout-rules/${pathId(id)}`, body) as Promise<{ ok: boolean }>
export const deleteMrLayoutRule = (id: string | number) => api.delete(`/mr/layout-rules/${pathId(id)}`)

export async function importQuotations(id: string | number, files: File[], persist = false, roles?: Array<'sales' | 'purchase'>, cleanupStoredFiles = false, taskId = '', includeStored = false) {
  const body = new FormData()
  for (const file of files) body.append('files', file)
  if (roles?.length) body.set('sourceRoles', JSON.stringify(roles))
  if (persist) body.set('persist', '1')
  if (cleanupStoredFiles) body.set('cleanupStoredFiles', '1')
  if (taskId) body.set('taskId', taskId)
  if (includeStored) body.set('includeStored', '1')
  return api.postForm(`/mr/${pathId(id)}/import`, body) as Promise<QuotationImportResult>
}

export async function persistQuotations(id: string | number, files: File[], roles?: Array<'sales' | 'purchase'>, corrections?: { correctedItems?: object[]; sourceHashes?: Record<string, string> }, includeStored = false) {
  const body = new FormData()
  for (const file of files) body.append('files', file)
  if (roles?.length) body.set('sourceRoles', JSON.stringify(roles))
  if (includeStored) body.set('includeStored', '1')
  body.set('persist', '1')
  body.set('persistOnly', '1')
  // 学习回写：确认导入时把人工修正后的品项与来源文件 hash 一并提交，供后端回写识别缓存与纠错样本库
  if (corrections?.correctedItems?.length) body.set('correctedItems', JSON.stringify(corrections.correctedItems))
  if (corrections?.sourceHashes && Object.keys(corrections.sourceHashes).length) body.set('sourceHashes', JSON.stringify(corrections.sourceHashes))
  return api.postForm(`/mr/${pathId(id)}/import`, body) as Promise<{ files: QuotationFile[]; corrections?: { applied: number; feedback: number } }>
}

/** MR 通用附件上传（底部附件区）：不做报价识别，直接留存。 */
export async function uploadMrAttachments(id: string | number, files: File[]) {
  const body = new FormData()
  for (const file of files) body.append('files', file)
  return api.postForm(`/mr/${pathId(id)}/attachments`, body) as Promise<{ files: QuotationFile[] }>
}

/** 拉取附件 Blob（预览或自定义下载用）。 */
export async function fetchQuotationBlob(id: string | number, fileId: string | number) {
  return api.download(`/mr/${pathId(id)}/quotation?fileId=${fileId}`)
}

export async function getImportProgress(taskId: string) {
  return api.get(`/mr/import-progress?taskId=${encodeURIComponent(taskId)}`) as Promise<{ done: number; total: number; current: string; stage?: string; stagePercent?: number; itemCount?: number }>
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

export async function deleteQuotationFile(id: string | number, fileId: string | number) {
  return api.delete(`/mr/${pathId(id)}/quotation?fileId=${fileId}`) as Promise<{ files: QuotationFile[]; removedItems?: number }>
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

export async function loadMrReferences(lang?: string) {
  const sortLocale = encodeURIComponent(lang || 'zh-CN')
  const [customers, salespeople, vendors, salesPreferences] = await Promise.all([
    api.get(`/customers?pageSize=200&sortLocale=${sortLocale}`) as Promise<{ items?: CustomerOption[] }>,
    api.get('/users/salespeople') as Promise<{ items?: UserOption[] }>,
    api.get('/mr/vendor-suggestions') as Promise<{ items?: VendorOption[] }>,
    api.get('/mr/sales-preferences') as Promise<SalesPreferences>,
  ])
  return {
    customers: customers.items || [],
    salespeople: (salespeople.items || []).filter((user) => ['sales', 'sales_supervisor'].includes(user.role || '')),
    vendors: vendors.items || [],
    salesPreferences: salesPreferences || { customers: [], vendors: [] },
  }
}

export async function loadCustomer(id: string | number) {
  const data = await api.get(`/customers/${pathId(id)}`)
  return (data?.item || data) as CustomerOption
}
export const createCustomerContact = (customerId: string | number, body: { name: string; phone?: string; email?: string }) => api.post(`/customers/${pathId(customerId)}/contacts`, body) as Promise<{ id: string | number; name: string; phone?: string | null; email?: string | null }>
