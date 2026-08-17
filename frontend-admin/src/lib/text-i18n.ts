import { useEffect } from "react"
import OpenCC from "opencc-js"
import type { AppLang } from "@/contexts/LanguageContext"

const phraseMap: Record<string, string> = {
  "OMS Platform 运维智管": "OMS Platform 運維智管",
  "管理工作台": "管理工作臺",
  "工单填写": "工單填寫",
  "快速跳转": "快速跳轉",
  "系统版本": "系統版本",
  "简体中文": "簡體中文",
  "繁体中文": "繁體中文",
  "运营总览": "營運總覽",
  "AI营运总结": "AI 營運總結",
  "AI 营运总结": "AI 營運總結",
  "AI运营总结": "AI 營運總結",
  "AI 运营总结": "AI 營運總結",
  "AI 營運總結": "AI 營運總結",
  "营运总结": "營運總結",
  "运营总结": "營運總結",
  "系统运行状态": "系統運行狀態",
  "后台搜索": "後臺搜尋",
  "服务工单": "服務工單",
  "工单处理": "工單處理",
  "工单列表": "工單列表",
  "工单详情": "工單詳情",
  "新增工单": "新增工單",
  "巡检工单": "巡檢工單",
  "工单编号": "工單編號",
  "服务记录": "服務記錄",
  "工单": "工單",
  "客户档案": "客戶檔案",
  "客户资产": "客戶資產",
  "客户地理分布": "客戶地理分佈",
  "客户名称": "客戶名稱",
  "客户地址": "客戶地址",
  "客户总数": "客戶總數",
  "客户数量": "客戶數量",
  "重点客户": "重點客戶",
  "普通客户": "普通客戶",
  "潜在客户": "潛在客戶",
  "客户概况": "客戶概況",
  "设备资产": "設備資產",
  "设备清单": "設備清單",
  "设备总数": "設備總數",
  "设备型号": "設備型號",
  "设备位置": "設備位置",
  "设备详情": "設備詳情",
  "设备基础信息": "設備基礎資訊",
  "巡检计划": "巡檢計畫",
  "巡检状态": "巡檢狀態",
  "巡检周期": "巡檢週期",
  "巡检工程师": "巡檢工程師",
  "巡检设备": "巡檢設備",
  "生成到期巡检单": "產生到期巡檢單",
  "维保方目录": "維保方目錄",
  "维保方详情": "維保方詳情",
  "维保方名称": "維保方名稱",
  "合作维保方": "合作維保方",
  "原厂联系人": "原廠聯絡人",
  "原厂维保": "原廠維保",
  "我方维保": "我方維保",
  "无维保": "無維保",
  "维保类型": "維保類型",
  "维保信息": "維保資訊",
  "维保周期": "維保週期",
  "维保中": "維保中",
  "维保到期": "維保到期",
  "维保结束": "維保結束",
  "维保开始": "維保開始",
  "维保截止": "維保截止",
  "联系电话": "聯絡電話",
  "联系人": "聯絡人",
  "联系方式": "聯絡方式",
  "官网地址": "官網地址",
  "成员与角色": "成員與角色",
  "系统管理员": "系統管理員",
  "系统用户": "系統使用者",
  "用户": "使用者",
  "操作审计": "操作審計",
  "审计日志": "審計日誌",
  "审计摘要": "審計摘要",
  "操作类型": "操作類型",
  "操作记录": "操作記錄",
  "风险操作": "風險操作",
  "系统设置": "系統設定",
  "邮件通知": "郵件通知",
  "通知提醒": "通知提醒",
  "地图服务": "地圖服務",
  "报表中心": "報表中心",
  "月报导出": "月報匯出",
  "批量导入": "批量匯入",
  "批量导出": "批量匯出",
  "下载导入模板": "下載匯入模板",
  "上传已填模板": "上傳已填模板",
  "导入设备资产": "匯入設備資產",
  "确认纠正并导入": "確認糾正並匯入",
  "按原内容导入": "按原內容匯入",
  "开始导入": "開始匯入",
  "导入中": "匯入中",
  "导入模板": "匯入模板",
  "导入": "匯入",
  "导出 Excel": "匯出 Excel",
  "导出中": "匯出中",
  "导出": "匯出",
  "上传": "上傳",
  "下载": "下載",
  "模板": "模板",
  "纠正": "糾正",
  "质保": "質保",
  "加载失败": "載入失敗",
  "正在加载": "正在載入",
  "无法连接服务器": "無法連接伺服器",
  "服务器": "伺服器",
  "服务端": "伺服端",
  "浏览器": "瀏覽器",
  "软件": "軟體",
  "网络": "網路",
  "签核": "簽核",
  "会签": "會簽",
  "结账": "結帳",
  "操作台": "操作臺",
  "文档": "文件",
  "配置文件": "設定檔",
  "日志文件": "日誌檔",
  "附件文件": "附件檔案",
  "文件名": "檔案名稱",
  "文件": "檔案",
  "页面资源": "頁面資源",
  "刷新页面": "重新整理頁面",
  "页面": "頁面",
  "重新生成": "重新產生",
  "自动生成": "自動產生",
  "生成失败": "產生失敗",
  "生成中": "產生中",
  "生成": "產生",
  "自动发送": "自動發送",
  "自动取消": "自動取消",
  "自动压缩": "自動壓縮",
  "自动忽略": "自動忽略",
  "自动": "自動",
  "配置": "設定",
  "保存设置": "儲存設定",
  "保存修改": "儲存修改",
  "保存失败": "儲存失敗",
  "保存中": "儲存中",
  "设置已保存": "設定已儲存",
  "保存": "儲存",
  "新增": "新增",
  "编辑": "編輯",
  "删除": "刪除",
  "批量删除": "批量刪除",
  "强制删除": "強制刪除",
  "删除中": "刪除中",
  "清空选择": "清空選擇",
  "关闭": "關閉",
  "刷新": "刷新",
  "重试": "重試",
  "重置": "重置",
  "取消": "取消",
  "启用": "啟用",
  "停用": "停用",
  "在岗": "在崗",
  "离岗": "離崗",
  "登录": "登入",
  "登出": "登出",
  "重新登录": "重新登入",
  "别名登录": "別名登入",
  "账号不存在": "帳號不存在",
  "账号": "帳號",
  "密码": "密碼",
  "暂无": "暫無",
  "未找到": "未找到",
  "未维护": "未維護",
  "未指定": "未指定",
  "未命名": "未命名",
  "已启用": "已啟用",
  "已停用": "已停用",
  "已完成": "已完成",
  "已作废": "已作廢",
  "已归档": "已歸檔",
  "已审核": "已審核",
  "已派发": "已派發",
  "进行中": "進行中",
  "待确认": "待確認",
  "创建时间": "建立時間",
  "创建后": "建立後",
  "创建中": "建立中",
  "创建": "建立",
  "更新时间": "更新時間",
  "结案时间": "結案時間",
  "开始日期": "開始日期",
  "结束日期": "結束日期",
  "计划时间": "計畫時間",
  "计划名称": "計畫名稱",
  "计划信息": "計畫資訊",
  "启用计划": "啟用計畫",
  "下次生成": "下次產生",
  "最近更新": "最近更新",
  "最近工单": "最近工單",
  "查看全部": "查看全部",
  "查看完整工单": "查看完整工單",
  "当前": "目前",
  "当前页": "目前頁",
  "当前筛选": "目前篩選",
  "当前列表": "目前列表",
  "当前条件": "目前條件",
  "当前状态": "目前狀態",
  "当前账号": "目前帳號",
  "当前密码": "目前密碼",
  "筛选": "篩選",
  "搜索": "搜尋",
  "选择": "選擇",
  "输入": "輸入",
  "信息": "資訊",
  "数据": "資料",
  "记录": "記錄",
  "详情": "詳情",
  "预览": "預覽",
  "统计": "統計",
  "实时": "即時",
  "状态": "狀態",
  "来源": "來源",
  "成功": "成功",
  "异常": "異常",
  "耗时": "耗時",
  "业务": "業務",
  "销售": "銷售",
  "权限": "權限",
  "邮箱": "信箱",
  "电话": "電話",
  "地址": "地址",
  "备注": "備註",
  "描述": "描述",
  "内部": "內部",
  "现场": "現場",
  "远程": "遠端",
  "内勤": "內勤",
  "安装": "安裝",
  "保养": "保養",
  "培训": "培訓",
  "支持": "支援",
  "发送": "發送",
  "测试": "測試",
  "开启": "開啟",
  "默认": "預設",
  "安全": "安全",
}

const toTraditionalConverter = OpenCC.Converter({ from: "cn", to: "tw" })
const toSimplifiedConverter = OpenCC.Converter({ from: "tw", to: "cn" })
const japaneseToSimplifiedConverter = OpenCC.Converter({ from: "jp", to: "cn" })
const phrases = (Object.entries(phraseMap) as Array<[string, string]>).sort((left, right) => right[0].length - left[0].length)
const oneWayTraditionalPhrases = new Set(["文档", "配置", "文件"])
const searchPhraseMap: Record<string, string> = {
  "儲存": "保存",
  "資訊": "信息",
  "資料": "数据",
  "登入": "登录",
  "帳號": "账号",
  "信箱": "邮箱",
  "伺服器": "服务器",
  "預設": "默认",
  "遠端": "远程",
  "搜尋": "搜索",
  "匯入": "导入",
  "匯出": "导出",
  "檔案名稱": "文件名",
  "附件檔案": "附件文件",
  "日誌檔": "日志文件",
  "設定檔": "配置文件",
  "檔案": "文件",
  "文檔": "文件",
  "文档": "文件",
  "頁面": "页面",
  "重新整理": "刷新",
  "建立": "创建",
  "目前": "当前",
  "產生": "生成",
  "設定": "设置",
  "配置": "设置",
  "軟體": "软件",
  "網路": "网络",
  "使用者": "用户",
}
const simplifiedPhrases = (Object.entries(phraseMap) as Array<[string, string]>)
  .filter(([source]) => !oneWayTraditionalPhrases.has(source))
  .flatMap(([source, target]) => [
    [target, source] as [string, string],
    [toSimplifiedConverter(target), source] as [string, string],
  ])
  .sort((left, right) => right[0].length - left[0].length)
const searchPhrases = Object.entries(searchPhraseMap)
  .flatMap(([source, target]) => [
    [source, target] as [string, string],
    [toSimplifiedConverter(source), target] as [string, string],
  ])
  .sort((left, right) => right[0].length - left[0].length)
const textNodeOriginals = new WeakMap<Text, string>()
const attrOriginals = new WeakMap<Element, Record<string, string>>()
const displayAttrs = ["placeholder", "title", "aria-label", "alt"]

function applyPhrases(value: string, replacements: Array<[string, string]>) {
  let output = value
  for (const [source, target] of replacements) {
    output = output.split(source).join(target)
  }
  return output
}

// OpenCC 字符级映射会把业务词“签核/会签”转成“籤核/會籤”（竹籤的籤），词组级兜底掰回“簽”。
// 只按词组替换，不误伤抽籤/竹籤等正确用法；前置简体词组表（phraseMap）已含签核/会签。
const traditionalPostFixes: Array<[string, string]> = [["籤核", "簽核"], ["會籤", "會簽"]]

export function toTraditional(value: unknown) {
  const normalized = applyPhrases(String(value ?? "").split("...").join("…"), phrases)
  const converted = toTraditionalConverter(japaneseToSimplifiedConverter(normalized))
  return applyPhrases(applyPhrases(converted, phrases), traditionalPostFixes)
}

export function toSimplified(value: unknown) {
  const normalizedTerms = applyPhrases(String(value ?? ""), simplifiedPhrases)
  const converted = japaneseToSimplifiedConverter(toSimplifiedConverter(normalizedTerms))
  return applyPhrases(converted, simplifiedPhrases)
}

export function normalizeSearchText(value: unknown) {
  return applyPhrases(toSimplified(value), searchPhrases)
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim()
}

function searchTextVariants(value: unknown) {
  return Array.from(new Set([
    String(value ?? ""),
    applyPhrases(toSimplified(value), searchPhrases),
    toTraditional(value),
    toTraditional(toSimplified(value)),
    toSimplified(toTraditional(value)),
  ].map((item) => String(item || "").toLowerCase().replace(/\s+/g, "").trim()).filter(Boolean)))
}

export function matchesSearchText(value: unknown, keyword: unknown) {
  const keywordVariants = searchTextVariants(keyword)
  if (!keywordVariants.length) return true
  const valueVariants = searchTextVariants(value)
  return valueVariants.some((valueVariant) => keywordVariants.some((keywordVariant) => (
    valueVariant.includes(keywordVariant) || keywordVariant.includes(valueVariant)
  )))
}

export function matchesSearchTerms(values: unknown[], keyword: unknown) {
  const terms = String(keyword ?? "").trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  return terms.every((term) => values.some((value) => matchesSearchText(value, term)))
}

function hasHan(value: string) {
  return /[\p{Script=Han}]/u.test(value)
}

function shouldSkipTextElement(element: Element | null) {
  return Boolean(element?.closest("script, style, textarea, input, code, pre, [data-no-i18n]"))
}

function shouldSkipAttrElement(element: Element | null) {
  return Boolean(element?.closest("script, style, code, pre, [data-no-i18n]"))
}

function localizedText(value: string, lang: AppLang) {
  return lang === "zh-TW" ? toTraditional(value) : toSimplified(value)
}

function translateTextNode(node: Text, lang: AppLang) {
  const current = node.nodeValue ?? ""
  const hasStoredOriginal = textNodeOriginals.has(node)
  const storedOriginal = textNodeOriginals.get(node)
  const original = hasStoredOriginal ? storedOriginal ?? "" : current
  if (shouldSkipTextElement(node.parentElement)) return
  const translated = localizedText(original, lang)
  if (hasStoredOriginal) {
    if (current === translated) return
    textNodeOriginals.set(node, current)
    const nextTranslated = localizedText(current, lang)
    if (current !== nextTranslated) node.nodeValue = nextTranslated
    return
  }
  if (!hasHan(original)) return
  textNodeOriginals.set(node, original)
  if (current !== translated) node.nodeValue = translated
}

function translateElementAttrs(element: Element, lang: AppLang) {
  const originals = attrOriginals.get(element)
  if (shouldSkipAttrElement(element)) return
  const nextOriginals = originals ?? {}
  for (const attr of displayAttrs) {
    const current = element.getAttribute(attr)
    const hasStoredOriginal = Object.prototype.hasOwnProperty.call(nextOriginals, attr)
    const original = hasStoredOriginal ? nextOriginals[attr] ?? "" : current ?? ""
    if (!current) continue
    if (hasStoredOriginal) {
      const translatedOriginal = localizedText(original, lang)
      if (current === translatedOriginal) continue
      nextOriginals[attr] = current
      const translatedCurrent = localizedText(current, lang)
      if (current !== translatedCurrent) element.setAttribute(attr, translatedCurrent)
      continue
    }
    if (!hasHan(original)) continue
    nextOriginals[attr] = current
    attrOriginals.set(element, nextOriginals)
    const translated = localizedText(original, lang)
    if (current !== translated) element.setAttribute(attr, translated)
  }
}

function translateInputValue(element: HTMLInputElement | HTMLTextAreaElement, lang: AppLang) {
  if (shouldSkipAttrElement(element)) return
  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase()
    if (["number", "password", "hidden", "email", "tel", "url", "date", "time"].includes(type)) return
  }
  const current = element.value
  if (!hasHan(current)) return
  const translated = localizedText(current, lang)
  if (current !== translated) element.value = translated
}

function translateTree(root: ParentNode, lang: AppLang) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    translateTextNode(node as Text, lang)
    node = walker.nextNode()
  }

  if (root instanceof Element) translateElementAttrs(root, lang)
  root.querySelectorAll?.("*").forEach((element) => translateElementAttrs(element, lang))
  // 输入框/文本域 value 做展示型转换（切换语言时一次性；用户输入不实时转换，避免打断编辑）
  root.querySelectorAll?.("input, textarea").forEach((element) => {
    translateInputValue(element as HTMLInputElement | HTMLTextAreaElement, lang)
  })
}

function restoreOriginalTree(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const original = textNodeOriginals.get(node as Text)
    if (original !== undefined) (node as Text).nodeValue = original
    textNodeOriginals.delete(node as Text)
    node = walker.nextNode()
  }
  if (root instanceof Element) {
    const originals = attrOriginals.get(root)
    if (originals) Object.entries(originals).forEach(([attr, value]) => root.setAttribute(attr, value))
    attrOriginals.delete(root)
  }
  root.querySelectorAll?.("*").forEach((element) => {
    const originals = attrOriginals.get(element)
    if (originals) Object.entries(originals).forEach(([attr, value]) => element.setAttribute(attr, value))
    attrOriginals.delete(element)
  })
}

export function setupAdminDomTextI18n(lang: AppLang) {
  translateTree(document.body, lang)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData" && mutation.target instanceof Text) {
        translateTextNode(mutation.target, lang)
        continue
      }
      if (mutation.type === "attributes" && mutation.target instanceof Element) {
        translateElementAttrs(mutation.target, lang)
        continue
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Text) translateTextNode(node, lang)
        if (node instanceof Element) translateTree(node, lang)
      })
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: displayAttrs,
  })

  return () => {
    observer.disconnect()
    restoreOriginalTree(document.body)
  }
}

export function useAdminDomTextI18n(lang: AppLang) {
  useEffect(() => {
    return setupAdminDomTextI18n(lang)
  }, [lang])
}
