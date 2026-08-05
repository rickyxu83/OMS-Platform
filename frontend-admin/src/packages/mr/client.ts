import { api } from '@/services/api'
import type { CustomerOption, MrConstants, MrOrder, QuotationImportResult, UserOption, VendorOption } from './types'

export async function listMr(params: { q?: string; status?: string } = {}) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status) search.set('status', params.status)
  return api.get(`/mr${search.size ? `?${search}` : ''}`) as Promise<{ items: MrOrder[] }>
}

export const getMr = (id: string | number) => api.get(`/mr/${id}`) as Promise<MrOrder>
export const createMr = (body: Partial<MrOrder> = {}) => api.post('/mr', body) as Promise<MrOrder>
export const updateMr = (id: string | number, body: Partial<MrOrder>) => api.put(`/mr/${id}`, body) as Promise<MrOrder>
export const submitMr = (id: string | number) => api.post(`/mr/${id}/submit`) as Promise<MrOrder>
export const approveMr = (id: string | number) => api.post(`/mr/${id}/approve`) as Promise<MrOrder>
export const rejectMr = (id: string | number, reason: string) => api.post(`/mr/${id}/reject`, { reason }) as Promise<MrOrder>
export const voidMr = (id: string | number, reason: string) => api.post(`/mr/${id}/void`, { reason }) as Promise<MrOrder>
export const deleteMr = (id: string | number) => api.delete(`/mr/${id}`)
export const getMrConstants = () => api.get('/mr/constants') as Promise<MrConstants>

export async function importQuotations(id: string | number, files: File[], persist = false) {
  const body = new FormData()
  for (const file of files) body.append('files', file)
  if (persist) body.set('persist', '1')
  return api.postForm(`/mr/${id}/import`, body) as Promise<QuotationImportResult>
}

export async function downloadQuotation(id: string | number, fileId: string | number, name: string) {
  const blob = await api.download(`/mr/${id}/quotation?fileId=${fileId}`)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function loadMrReferences() {
  const [customers, salespeople, vendors] = await Promise.all([
    api.get('/customers?pageSize=200') as Promise<{ items?: CustomerOption[] }>,
    api.get('/users/salespeople') as Promise<{ items?: UserOption[] }>,
    api.get('/maintenance-parties?partyType=original_manufacturer&limit=1000') as Promise<{ items?: VendorOption[] }>,
  ])
  return {
    customers: customers.items || [],
    salespeople: (salespeople.items || []).filter((user) => user.role === 'sales'),
    vendors: vendors.items || [],
  }
}

export const loadCustomer = (id: string | number) => api.get(`/customers/${id}`) as Promise<CustomerOption>
