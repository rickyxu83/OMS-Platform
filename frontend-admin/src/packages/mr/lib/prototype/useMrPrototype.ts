import { useCallback, useEffect, useMemo, useState } from 'react'
import { getMr, getMrConstants, loadCustomer, loadMrReferences } from '../../client'
import type { CustomerOption, MrConstants, MrItem, MrOrder, QuotationImportResult, VendorOption } from '../../types'
import { blankItem, calculateForm, defaultCostTaxRate, normalizeCostTaxRates, singleIntegrationItems } from '../form-logic'
import { SAMPLE_CONSTANTS, SAMPLE_CUSTOMERS, SAMPLE_ORDER, SAMPLE_VENDORS, demoFetchCustomer } from './demoData'

export const PRICING_LABELS: Record<number, string> = { 1: '多项系统集成', 2: '单项系统集成', 3: '开明细' }

export type Contact = NonNullable<CustomerOption['contacts']>[number]

export function asNumber(value: string) {
  return value === '' ? null : Number(value)
}

function syncInstallOptions(items: MrItem[], previous: string[], next: string[]) {
  const oldDefaults = new Set(previous.filter((value) => value !== 'NO'))
  const newDefaults = next.filter((value) => value !== 'NO')
  return items.map((item) => {
    const existing = String(item.installBy || '').split(/[,，、]/).map((value) => value.trim()).filter(Boolean)
    const manual = existing.filter((value) => !oldDefaults.has(value))
    return { ...item, installBy: [...new Set([...newDefaults, ...manual])].join('、') }
  })
}

function normalizeLookup(value?: string | null) {
  return String(value || '').toLowerCase().replace(/[\s（）()\-—_,，。]/g, '')
}

function contactByName(contacts: Contact[], value?: string | null) {
  const target = normalizeLookup(value)
  return (contacts || []).find((contact) => target && normalizeLookup(contact.name) === target)
}

function paymentFromQuotation(text?: string) {
  const source = String(text || '')
  for (const days of [30, 60, 90, 120]) if (source.includes(String(days))) return `月结${days}天`
  return undefined
}

/**
 * PROTOTYPE — shared editable MR state for the UI variants. In demo mode it
 * seeds from embedded sample data (offline, no login); otherwise it loads a
 * real MR plus constants/references. Edits are local-only, never saved.
 */
export function useMrPrototype(opts: { id?: string; demo?: boolean } = {}) {
  const { id, demo } = opts
  const [form, setForm] = useState<MrOrder | null>(null)
  const [constants, setConstants] = useState<MrConstants | null>(null)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchCustomer = useCallback(async (customerId: string | number) => {
    return demo ? demoFetchCustomer(customerId) : loadCustomer(customerId)
  }, [demo])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let order: MrOrder
      let optionData: MrConstants
      let customer: CustomerOption | null
      if (demo) {
        order = SAMPLE_ORDER as unknown as MrOrder
        optionData = SAMPLE_CONSTANTS
        customer = demoFetchCustomer(order.customerId!)
      } else {
        const orderId = id
        if (!orderId) { setLoading(false); return }
        ;[order, optionData] = await Promise.all([getMr(orderId), getMrConstants()])
        const [references] = await Promise.all([loadMrReferences()])
        setCustomers(references.customers)
        setVendors(references.vendors)
        customer = order.customerId ? await loadCustomer(order.customerId) : null
      }
      const customerContacts = customer?.contacts || []
      const defaultContact = (order.customerContactId
        ? customerContacts.find((item) => String(item.id) === String(order.customerContactId))
        : undefined)
        || contactByName(customerContacts, order.contactName || order.purchaser || order.recipient || customer?.contactName)
        || contactByName(customerContacts, customer?.contactName)
        || customerContacts[0]
      const hydratedOrder = !order.customerContactId && defaultContact ? {
        ...order,
        customerContactId: defaultContact.id || null,
        contactName: defaultContact.name || order.contactName || '',
        purchaser: order.purchaser || defaultContact.name || '',
        purchaserTel: order.purchaserTel || defaultContact.phone || '',
        recipient: order.recipient || defaultContact.name || '',
        recipientTel: order.recipientTel || defaultContact.phone || '',
        invoiceRecipient: order.invoiceRecipient || defaultContact.name || '',
      } : order
      setForm(hydratedOrder)
      setConstants(optionData)
      if (demo) {
        setCustomers(SAMPLE_CUSTOMERS)
        setVendors(SAMPLE_VENDORS)
      }
      setContacts(customerContacts)
    } catch (err) {
      setError((err as Error).message || 'MR 单加载失败')
    } finally {
      setLoading(false)
    }
  }, [demo, id])

  useEffect(() => {
    void load()
  }, [load])

  const calculated = useMemo(() => (form ? calculateForm(form) : null), [form])

  const patch = useCallback((value: Partial<MrOrder>) => {
    setForm((current) => (current ? { ...current, ...value } : current))
  }, [])

  const changePricingMode = useCallback((nextMode: number) => {
    setForm((current) => {
      if (!current) return current
      const currentMode = Number(current.pricingMode || 0)
      if (currentMode === nextMode) return current
      const currentItems = calculateForm(current).items || []
      const warnings: string[] = []
      if (currentMode === 3 && nextMode !== 3 && currentItems.some((item) => item.unitPrice != null)) {
        warnings.push('开明细中的手填销售单价会改为系统自动计算。')
      }
      const secondIsService = Boolean(currentItems[1] && `${currentItems[1].name || ''}${currentItems[1].description || ''}`.includes('服务'))
      if (nextMode === 2 && (currentItems.length > 2 || (currentItems.length === 2 && !secondIsService))) {
        warnings.push('单项系统集成只保留第一项作为主项，并重建第二项“技术服务”；其余品项会删除。')
      }
      if (warnings.length && !window.confirm(`${warnings.join('\n')}\n\n确定切换计价模式吗？`)) return current
      if (nextMode === 3) return { ...current, pricingMode: 3, items: currentItems.map((item) => ({ ...item, unitPrice: item.unitPrice ?? null })) }
      if (nextMode === 2) return { ...current, pricingMode: 2, items: singleIntegrationItems(currentItems, current.invoiceType, current.installOptions || []) }
      return { ...current, pricingMode: nextMode }
    })
  }, [])

  const changeInvoiceType = useCallback((invoiceType: string) => {
    setForm((current) => (current ? { ...current, invoiceType, items: normalizeCostTaxRates(current.items || [], invoiceType) } : current))
  }, [])

  const setInstallOptions = useCallback((next: string[]) => {
    setForm((current) => (current ? { ...current, installOptions: next, items: syncInstallOptions(current.items || [], current.installOptions || [], next) } : current))
  }, [])

  /** Typing a contact role name auto-fills the phone when it matches the customer archive. */
  const patchContactField = useCallback((field: 'purchaser' | 'recipient' | 'invoiceRecipient', value: string) => {
    setForm((current) => {
      if (!current) return current
      const contact = contactByName(contacts, value)
      const next: Partial<MrOrder> = { [field]: value }
      if (field === 'purchaser' && contact) next.purchaserTel = contact.phone || ''
      if (field === 'recipient' && contact) next.recipientTel = contact.phone || ''
      return { ...current, ...next }
    })
  }, [contacts])

  const chooseCustomer = useCallback(async (value: string) => {
    const customer = customers.find((item) => String(item.id) === value)
    patch({
      customerId: value,
      customerName: customer?.name || '',
      customerCode: customer?.code || '',
      customerContactId: null,
      contactName: '', purchaser: '', purchaserTel: '', recipient: '', recipientTel: '', invoiceRecipient: '',
    })
    try {
      const detail = await fetchCustomer(value)
      setContacts(detail.contacts || [])
      const defaultContact = contactByName(detail.contacts || [], detail.contactName) || detail.contacts?.[0]
      if (defaultContact) {
        patch({
          customerContactId: defaultContact.id || null,
          contactName: defaultContact.name || '',
          purchaser: defaultContact.name || '',
          purchaserTel: defaultContact.phone || '',
          recipient: defaultContact.name || '',
          recipientTel: defaultContact.phone || '',
          invoiceRecipient: defaultContact.name || '',
        })
      }
    } catch (err) {
      setError((err as Error).message || '联系人加载失败')
    }
  }, [customers, fetchCustomer, patch])

  const chooseContact = useCallback((value: string) => {
    const contact = contacts?.find((item) => String(item.id) === value)
    patch({
      customerContactId: value,
      contactName: contact?.name || '',
      purchaser: contact?.name || '',
      purchaserTel: contact?.phone || '',
      recipient: contact?.name || '',
      recipientTel: contact?.phone || '',
      invoiceRecipient: contact?.name || '',
    })
  }, [contacts, patch])

  const applyImport = useCallback((result: QuotationImportResult) => {
    setForm((current) => {
      if (!current) return current
      const calc = calculateForm(current)
      const salesFile = result.files[result.salesSourceIndex]
      const salesTotal = result.sources.find((source) => source.role === 'sales')?.total
      const imported = normalizeCostTaxRates(result.items, calc.invoiceType)
      const items = Number(calc.pricingMode) === 2
        ? singleIntegrationItems(imported, calc.invoiceType, calc.installOptions || [])
        : imported
      const metadataCustomer = result.metadata?.customer?.trim() || ''
      const matchedCustomer = !calc.customerId
        ? result.metadata?.matchedCustomer || customers.find((customer) => [customer.name, customer.code].some((value) => normalizeLookup(value) === normalizeLookup(metadataCustomer)))
        : undefined
      const importedContacts = matchedCustomer?.contacts || contacts
      const importedContact = contactByName(importedContacts, result.metadata?.attn)
        || contactByName(importedContacts, matchedCustomer?.contactName)
        || importedContacts[0]
      const importedName = importedContact?.name || result.metadata?.attn || ''
      const importedPhone = importedContact?.phone || ''
      return {
        ...current,
        items: syncInstallOptions(items, [], calc.installOptions || []),
        totalExcludingTax: Number(calc.pricingMode) === 3 ? calc.totalExcludingTax : calc.totalExcludingTax || salesTotal || null,
        quotationFileId: salesFile?.id || null,
        quotationFiles: result.files,
        customerId: calc.customerId || matchedCustomer?.id || current.customerId || null,
        customerName: calc.customerId ? calc.customerName : matchedCustomer?.name || metadataCustomer || calc.customerName || '',
        customerContactId: calc.customerContactId || importedContact?.id || current.customerContactId || null,
        contactName: calc.customerContactId ? calc.contactName : importedName || calc.contactName || '',
        purchaser: calc.purchaser || importedName,
        purchaserTel: calc.purchaserTel || importedPhone,
        recipient: calc.recipient || importedName,
        recipientTel: calc.recipientTel || importedPhone,
        invoiceRecipient: calc.invoiceRecipient || importedName,
        paymentTerms: calc.paymentTerms || paymentFromQuotation(result.metadata?.payment),
      }
    })
  }, [customers, contacts])

  const addItems = useCallback((count = 1) => {
    setForm((current) => {
      if (!current) return current
      const rate = defaultCostTaxRate(current.invoiceType)
      const installBy = (current.installOptions || []).filter((value) => value !== 'NO').join('、')
      return { ...current, items: [...(current.items || []), ...Array.from({ length: count }, () => ({ ...blankItem(rate), installBy }))] }
    })
  }, [])

  const setItems = useCallback((items: MrItem[]) => {
    setForm((current) => (current ? { ...current, items } : current))
  }, [])

  return {
    form, constants, customers, contacts, vendors, loading, error, calculated,
    patch, changePricingMode, changeInvoiceType, setInstallOptions,
    patchContactField, chooseCustomer, chooseContact, applyImport,
    addItems, setItems,
  }
}

export type MrPrototype = ReturnType<typeof useMrPrototype>
