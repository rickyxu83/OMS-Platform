/**
 * 客户索引下拉共享工具（A-Z 首字母分组 + 搜索匹配）。
 *
 * 统一自原先 service-report 与 devices 两处近乎相同的实现（customerMatches / customerInitial /
 * customerSortKey / customerName / customerMeta / mergeCustomers / groupCustomersByInitial /
 * CUSTOMER_INDEX_LETTERS）。devices 版 groupCustomersByInitial 曾硬编码 zh-Hans-CN 导致繁体排序错误，
 * 本共享版按界面语言 lang 区分简/繁。供 工单填写 / 设备资产 / MR 等页面的客户选择下拉复用。
 */
import type { AppLang } from "@/contexts/LanguageContext";
import { matchesSearchText } from "@/lib/text-i18n";

/** 客户索引下拉使用的公共客户类型（service-report CustomerOption 与 devices Customer 的公共字段超集） */
export interface IndexedCustomer {
  id: string | number;
  name?: string;
  nameKey?: string;
  code?: string;
  address?: string;
  mapAddress?: string;
  contactName?: string;
  contactPhone?: string;
  contacts?: Array<{
    id?: string | number;
    name?: string;
    phone?: string;
    contactName?: string;
    contactPhone?: string;
  }>;
  sortInitial?: string;
  sortKey?: string;
}

export const CUSTOMER_INDEX_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

export function customerName(customer?: IndexedCustomer | null) {
  if (!customer) return "";
  return customer.name || `客户 #${customer.id}`;
}

export function customerMeta(customer: IndexedCustomer) {
  return [customer.address || customer.mapAddress, customer.contactName, customer.contactPhone]
    .filter(Boolean)
    .join(" · ") || customer.code || "系统客户";
}

export function customerMatches(customer: IndexedCustomer, keyword: string) {
  const text = keyword.trim();
  if (!text) return true;
  return [
    customer.name,
    customer.code,
    customer.address,
    customer.mapAddress,
    customer.contactName,
    customer.contactPhone,
    customer.id,
    ...(customer.contacts || []).flatMap((contact) => [contact.name, contact.phone, contact.contactName, contact.contactPhone]),
  ].filter(Boolean).some((value) => matchesSearchText(value, text));
}

export function customerInitial(customer: IndexedCustomer) {
  const initial = String(customer.sortInitial || "").toUpperCase();
  if (/^[A-Z]$/.test(initial)) return initial;
  const first = customerName(customer).trim()[0]?.toUpperCase() || "";
  return /^[A-Z]$/.test(first) ? first : "#";
}

export function customerSortKey(customer: IndexedCustomer) {
  return customer.sortKey || `${customerInitial(customer)}|${customerName(customer).trim().toLowerCase()}`;
}

export function mergeCustomers<T extends IndexedCustomer>(current: T[], next: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of current) map.set(String(item.id || item.name || ""), item);
  for (const item of next) {
    const key = String(item.id || item.name || "");
    if (!key) continue;
    map.set(key, { ...(map.get(key) || ({} as T)), ...item });
  }
  return [...map.values()];
}

/** 按拼音首字母分组。lang 区分简/繁（zh-TW 用繁体排序），修复 devices 原硬编码简体导致的繁体排序错误。 */
export function groupCustomersByInitial<T extends IndexedCustomer>(items: T[], lang: AppLang | string) {
  const collator = new Intl.Collator(lang === "zh-TW" ? "zh-TW" : "zh-Hans-CN", { numeric: true, sensitivity: "base" });
  const groups = new Map<string, T[]>();
  const sortedItems = [...items].sort((a, b) => {
    const groupA = CUSTOMER_INDEX_LETTERS.indexOf(customerInitial(a));
    const groupB = CUSTOMER_INDEX_LETTERS.indexOf(customerInitial(b));
    const rankA = groupA >= 0 ? groupA : CUSTOMER_INDEX_LETTERS.length;
    const rankB = groupB >= 0 ? groupB : CUSTOMER_INDEX_LETTERS.length;
    if (rankA !== rankB) return rankA - rankB;
    return collator.compare(customerSortKey(a), customerSortKey(b));
  });
  for (const customer of sortedItems) {
    const letter = customerInitial(customer);
    groups.set(letter, [...(groups.get(letter) || []), customer]);
  }
  return CUSTOMER_INDEX_LETTERS
    .filter((letter) => groups.has(letter))
    .map((letter) => ({ letter, items: groups.get(letter) || [] }));
}
