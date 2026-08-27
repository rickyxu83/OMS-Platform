import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, RefreshCw, Search, Loader2, Plus, Trash2, CheckCircle, Download, FileDown, ChevronDown, FileSpreadsheet, Send, RotateCcw, Pencil, Clock3, Hourglass, PenLine, Upload, CircleCheck, Archive, CircleSlash, CircleCheckBig, Wrench, Radio, Building2, PackagePlus, Settings, SearchCheck, BookOpen, MoreHorizontal, Play, Square, CircleDot, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorToast } from "@/components/ErrorToast";
import { ServiceOrderDetailDialog } from "@/components/ServiceOrderDetailDialog";
import { HelpTooltip } from "@/components/HelpTooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { serviceItemsLabel, serviceItemsSearchText, servicePartActionLabel } from "@/lib/service-items";
import { displayServiceOrderParts, displayServiceOrderWorkContent } from "@/lib/service-order-detail-view";
import { api } from "@/services/api";
import { Skeleton } from "@/components/Skeleton";
import { formatCount, formatDate, formatDateTime, formatDateRange, formatFileSize } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { ResponsiveCard, ResponsiveList } from "@/components/ResponsiveList";

interface ServiceOrder {
  id: string | number;
  orderNo?: string;
  displayId?: string;
  displayTitle?: string;
  displayStatus?: string;
  workflowStatus?: string;
  status: string;
  customerName?: string;
  customerAddress?: string;
  contactName?: string;
  contactPhone?: string;
  deviceName?: string;
  deviceModel?: string;
  devicePn?: string;
  deviceSerialNo?: string;
  deviceRemark?: string;
  serviceType?: string;
  serviceModules?: string[];
  serviceMode?: string;
  timesheetCategory?: string;
  timesheetSalesperson?: string;
  priority?: string;
  engineerName?: string;
  engineers?: Array<{ id?: string | number; realName?: string; name?: string; username?: string }>;
  serviceAt?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  issueDescription?: string;
  internalNote?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewComment?: string;
  report?: ServiceReport | null;
  parts?: ServicePart[];
  installedDevices?: InstalledDevice[];
  targetDevices?: DeviceOption[];
  files?: OrderFile[];
  deletePreview?: ServiceOrderDeletePreview;
  customerSignatureRequest?: CustomerSignatureRequest | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ServiceReport {
  departureAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  returnAt?: string;
  workContent?: string;
  workEntries?: ServiceReportWorkEntry[];
  result?: string;
  resultDescription?: string;
  customerConfirmName?: string;
  customerName?: string;
  customerSignatureFileId?: string | number;
  customerSignature?: string;
}

interface ServiceReportWorkEntry {
  engineerId?: string | number;
  engineerName?: string;
  engineer_name?: string;
  engineerUsername?: string;
  engineer_username?: string;
  workContent?: string;
  work_content?: string;
}

interface ServicePart {
  id?: string | number;
  deviceName?: string;
  device_name?: string;
  actionType?: string;
  action_type?: string;
  partName?: string;
  part_name?: string;
  partNo?: string;
  part_no?: string;
  quantity?: string | number;
  unit?: string;
  remark?: string;
}

interface InstalledDevice {
  id?: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  remark?: string;
  willDelete?: boolean;
  blockedReasons?: string[];
}

interface OrderFile {
  id: string | number;
  ownerType?: string;
  ownerId?: string | number;
  purpose?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  uploadedBy?: string | number;
  createdAt?: string;
}

interface EngineerOption {
  id: string | number;
  realName?: string;
  username?: string;
}

interface CustomerOption {
  id: string | number;
  name?: string;
}

interface DeviceOption {
  id: string | number;
  name?: string;
  model?: string;
  pn?: string;
  serialNo?: string;
  customerId?: string | number;
}

interface CustomerSignatureRequest {
  id?: string | number;
  recipientEmail?: string;
  status?: string;
  createdAt?: string;
}

interface ServiceOrderDeletePreview {
  editDraftCount?: number;
  customerSignatureRequestCount?: number;
}

const ORDER_ATTACHMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.heic,.heif,.zip";
const ORDER_ATTACHMENT_EXTENSIONS = new Set(ORDER_ATTACHMENT_ACCEPT.split(","));
const ORDER_ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024;

function deviceOptionLabel(device: DeviceOption, df: DeleteFlowStrings) {
  return device.model || device.name || device.serialNo || fill(df.deviceFallback, { id: device.id });
}

function validateOrderFiles(files: File[], attachment: AttachmentStrings) {
  const invalidType = files.find((file) => {
    const name = file.name || "";
    const dotIndex = name.lastIndexOf(".");
    const extension = dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
    return !ORDER_ATTACHMENT_EXTENSIONS.has(extension);
  });
  if (invalidType) return `${fill(attachment.invalidType, { name: invalidType.name })}${attachment.hint}`;
  const oversized = files.find((file) => file.size > ORDER_ATTACHMENT_MAX_SIZE);
  if (oversized) return fill(attachment.tooLarge, { name: oversized.name });
  return "";
}

const I18N = {
  "zh-CN": {
    title: "工单处理",
    subtitle: "管理和查看服务工单",
    actions: {
      refresh: "刷新",
      retry: "重试",
      reset: "重置",
      export: "导出",
      exportExcel: "导出 Excel",
      exportPdf: "导出 PDF",
      exporting: "导出中…",
      saving: "保存中…",
      cancel: "取消",
      create: "新增工单",
      confirmInspection: "确认巡检",
      assign: "派单 / 改派",
    },
    filters: {
      searchPlaceholder: "搜索工单编号、客户、工程师、描述，可用空格组合…",
      statusPlaceholder: "全部状态",
      all: "全部状态",
      allCustomers: "全部客户",
      customerPlaceholder: "全部客户",
      startDate: "开始日期",
      endDate: "结束日期",
    },
    stats: {
      all: "全部工单",
      pending: "待确认",
      processing: "进行中",
      completed: "已结案",
    },
    list: {
      title: "工单列表",
      help: "工单状态流转：草稿 → 已派发 → 进行中 → 待确认 → 待客户签署 → 已结案；审批通过后为已审核，归档后为已归档。工程师提交或修改工单后，系统按设置的延迟分钟数邮件通知客户关联销售（系统设置中可开关）。",
      loading: "正在加载…",
      empty: "暂无工单",
      colCaseCustomer: "Case ID / 客户",
      colServiceItems: "服务事项",
      colMainContent: "主要内容",
      colEngineer: "工程师",
      colServiceTime: "服务时间",
      colStatus: "状态",
      colActions: "操作",
      selectOrder: "选择工单",
      filterByCustomer: "按客户过滤",
      filterByEngineer: "按工程师过滤",
      startShort: "开始",
      endShort: "结束",
      fieldCustomer: "客户",
      fieldEngineer: "工程师",
      fieldServiceItems: "服务事项",
      fieldServiceTime: "服务时间",
    },
    detail: {
      orderNo: "工单编号",
      customerName: "客户名称",
      contactName: "联系人",
      serviceType: "服务事项",
      serviceMode: "服务方式",
      currentStatus: "当前状态",
      engineer: "工程师",
      serviceTime: "服务时间",
      issueDescription: "详细描述",
      internalNote: "内部备注",
      descriptionPlaceholder: "服务描述",
      notePlaceholder: "添加内部备注…",
      unnamedEngineer: "未指定",
      unnamedContact: "未维护联系人",
    },
    priority: {
      low: "低",
      normal: "普通",
      high: "高",
      urgent: "紧急",
      help: "优先级用于提示工程师和调度处理顺序：普通按常规安排，高和紧急需要优先关注；它不会改变工单状态，也不代表审批结果。",
    },
    attachment: {
      hint: "支持 PDF、Word、Excel、CSV、TXT、JPG/PNG/WebP/HEIC 图片、ZIP，单个文件不超过 20MB。",
      invalidType: "附件类型不支持：{name}。",
      tooLarge: "附件超过 20MB：{name}",
    },
    exportData: {
      sheetName: "工单导出",
      fileName: "工单导出",
      unlimited: "不限",
      pdfFileName: "服务记录",
      pdfTo: "-至",
      pdfSelected: "-已选{count}张",
      colOrderNo: "工单编号",
      colCustomerName: "客户名称",
      colContactName: "联系人",
      colContactPhone: "联系电话",
      colCustomerAddress: "客户地址",
      colDeviceName: "设备",
      colServiceMode: "服务方式",
      colServiceType: "服务事项",
      colPriority: "优先级",
      colEngineerName: "工程师",
      colPlannedStartAt: "计划开始",
      colPlannedEndAt: "计划结束",
      colStatus: "状态",
      colCreatedAt: "创建时间",
      colUpdatedAt: "更新时间",
      colIssueDescription: "问题描述",
      colWorkContent: "处理记录",
      colPartRecords: "备件与硬件部件",
      colInternalNote: "内部备注",
    },
    bulk: {
      delete: "批量删除",
      selectAll: "全选当前列表",
      selectAllAria: "全选当前工单列表",
      selectedHint: "已勾选 {count} 张；导出（Excel / PDF）仅包含勾选的工单。",
      matchedHint: "当前条件匹配 {count} 张工单；未勾选时，导出会包含所有匹配记录，不只当前页。",
    },
    dialogs: {
      createDesc: "可先保存为草稿；选择工程师后会立即派发到对应工程师的工作台。",
      customer: "客户",
      customerFallback: "客户 #{id}",
      selectCustomer: "选择客户",
      device: "设备",
      noDevice: "不指定设备",
      serviceModeLabel: "服务方式",
      serviceModeHelp: "现场服务需选择服务类型并可关联设备；远程服务、内勤工作不关联设备，改为填写工时类别，提交后计入工时统计与月度汇总。",
      serviceTypeLabel: "服务类型",
      timesheetCategoryLabel: "工时类别",
      timesheetRemotePlaceholder: "排障 / 调配 / 协调 / 会议 / 其他",
      timesheetOfficePlaceholder: "方案准备 / 文档整理 / 网络会议 / 培训学习 / 其他",
      priorityLabel: "优先级",
      assignEngineer: "派发工程师",
      engineerFallback: "工程师 #{id}",
      noAssign: "创建后暂不派发",
      plannedStart: "计划开始",
      plannedEnd: "计划结束",
      issueDescription: "问题描述",
      internalNote: "内部备注",
      attachments: "附件",
      createAttachmentNote: "选择工程师后可随工单派发给工程师查看；未派发时附件会先保存到工单中。",
      createRequired: "请选择客户、服务类型并填写问题描述",
      creating: "创建中…",
      createSubmit: "创建工单",
      assignDesc: "选择工程师后，工单会进入已派发状态并同步到工程师端。",
      engineerLabel: "工程师",
      primaryBadge: "主",
      assignMultiHint: "可选择多位工程师；第一位选中的工程师作为主工程师。",
      assignRequired: "请至少选择一位派发工程师",
      assignNote: "派单说明",
      assignAttachmentNote: "可上传装机设备清单、报错截图、客户资料等，工程师可在工单详情中下载查看。",
      assigning: "派单中…",
      assignSubmit: "确认派单",
      transitionTitle: "状态流转",
      transitionDesc: "后台状态变更会写入操作审计。",
      targetStatus: "目标状态",
      transitionReason: "流转原因 / 备注",
      transitioning: "流转中…",
      transitionSubmit: "确认流转",
    },
    deleteFlow: {
      title: "删除工单",
      desc: "删除后工单主体及下列关联内容不可恢复；目标设备只会解除关联，安装来源设备会按下方预览处理。",
      confirmHint: "请确认这些工单及关联内容都不再需要。删除操作会写入审计日志。",
      loading: "正在加载删除影响明细…",
      empty: "未加载到删除影响明细。",
      loadDetailFailed: "未能加载所选工单的删除影响明细",
      loadFailed: "删除影响明细加载失败",
      deleting: "删除中…",
      confirmDelete: "确认删除 {count} 张工单",
      sumReports: "服务记录",
      sumParts: "部件记录",
      sumFiles: "附件",
      sumTargetDevices: "目标设备关联",
      sumInstalledDelete: "将删除安装设备",
      sumInstalledKeep: "保留安装设备",
      sumSignatures: "签署请求",
      sumDrafts: "编辑草稿",
      secReport: "服务记录",
      reportBody: "服务记录正文、处理结果、客户确认信息",
      workEntryEngineer: "工程师",
      workEntryContent: "工时明细",
      secParts: "备件与硬件部件记录",
      unnamedPart: "未命名部件",
      partDevice: "（设备：{name}）",
      secFiles: "附件文件",
      fileFallback: "附件 #{id}",
      secTargetDevices: "目标设备关联",
      secTargetDevicesDesc: "只解除工单与设备的关联，不删除这些既有设备。",
      secInstalled: "安装来源设备",
      secInstalledDesc: "没有被其他工单、部件记录或巡检计划引用的安装设备会随工单删除；仍被引用的设备会保留。",
      secEngineers: "派单工程师关联",
      engineerFallback: "工程师 #{id}",
      unnamedEngineer: "未命名工程师",
      secSignatures: "客户签署请求",
      sigNoEmail: "未填写邮箱",
      sigLatest: "最新请求：{email} / {status}",
      sigCount: "客户签署请求 {count} 条",
      secDrafts: "工程师编辑草稿",
      draftsCount: "编辑草稿 {count} 份",
      secOrder: "工单主体",
      orderOnly: "仅删除工单主体记录",
      deviceFallback: "设备 #{id}",
      unnamedDevice: "未命名设备",
      keepReasons: "仍关联：{reasons}",
      keepGeneric: "仍有关联数据",
      keepLabel: "（保留，{reasons}）",
      willDeleteLabel: "（将删除）",
      recheckLabel: "（删除时再次检查是否有关联）",
      sigCreated: "已创建",
      sigSent: "已发送",
      sigSigned: "已签署",
      sigRevoked: "已撤销",
      sigExpired: "已过期",
      sigUnknown: "未知状态",
    },
    errors: {
      loadFailed: "加载失败",
      saveFailed: "保存失败",
      exportFailed: "导出失败",
      exportEmpty: "当前筛选条件下暂无可导出的工单",
      downloadFailed: "附件下载失败",
      pdfExportFailed: "PDF 导出失败",
      createNoOrderNo: "工单创建后未返回编号，附件未上传",
      postCreateFailed: "附件上传或派单失败",
      rollbackFailed: "自动删除失败",
      createRollbackFailed: "{postCreate}；工单已创建但自动删除失败：{rollback}",
      createRolledBack: "{postCreate}；工单已自动取消创建",
      createFailed: "创建工单失败",
      confirmInspectionFailed: "确认巡检失败",
      bulkDeleteFailed: "批量删除失败",
      assignFailed: "派单失败",
      transitionFailed: "状态流转失败",
    },
    status: {
      draft: "草稿",
      assigned: "已派发",
      in_progress: "进行中",
      pending_confirmation: "待确认",
      awaiting_customer_signature: "待客户签署",
      submitted: "已结案",
      approved: "已审核",
      archived: "已归档",
      cancelled: "已作废",
      completed: "已完成",
    },
    type: {
      install: "安装",
      repair: "排障",
      maintain: "调优",
      inspect: "巡检",
      training: "培训",
      remote: "远程支持",
      other: "其他",
    },
    mode: {
      onsite: "现场服务",
      remote: "远程服务",
      office: "内勤工作",
    },
  },
  "zh-TW": {
    title: "工單處理",
    subtitle: "管理和查看服務工單",
    actions: {
      refresh: "刷新",
      retry: "重試",
      reset: "重置",
      export: "匯出",
      exportExcel: "匯出 Excel",
      exportPdf: "匯出 PDF",
      exporting: "匯出中…",
      saving: "儲存中…",
      cancel: "取消",
      create: "新增工單",
      confirmInspection: "確認巡檢",
      assign: "派單 / 改派",
    },
    filters: {
      searchPlaceholder: "搜尋工單編號、客戶、工程師、描述，可用空格組合…",
      statusPlaceholder: "全部狀態",
      all: "全部狀態",
      allCustomers: "全部客戶",
      customerPlaceholder: "全部客戶",
      startDate: "開始日期",
      endDate: "結束日期",
    },
    stats: {
      all: "全部工單",
      pending: "待確認",
      processing: "進行中",
      completed: "已結案",
    },
    list: {
      title: "工單列表",
      help: "工單狀態流轉：草稿 → 已派發 → 進行中 → 待確認 → 待客戶簽署 → 已結案；審批通過後為已審核，歸檔後為已歸檔。工程師提交或修改工單後，系統按設定的延遲分鐘數郵件通知客戶關聯銷售（系統設定中可開關）。",
      loading: "正在載入…",
      empty: "暫無工單",
      colCaseCustomer: "Case ID / 客戶",
      colServiceItems: "服務事項",
      colMainContent: "主要內容",
      colEngineer: "工程師",
      colServiceTime: "服務時間",
      colStatus: "狀態",
      colActions: "操作",
      selectOrder: "選擇工單",
      filterByCustomer: "按客戶過濾",
      filterByEngineer: "按工程師過濾",
      startShort: "開始",
      endShort: "結束",
      fieldCustomer: "客戶",
      fieldEngineer: "工程師",
      fieldServiceItems: "服務事項",
      fieldServiceTime: "服務時間",
    },
    detail: {
      orderNo: "工單編號",
      customerName: "客戶名稱",
      contactName: "聯絡人",
      serviceType: "服務事項",
      serviceMode: "服務方式",
      currentStatus: "當前狀態",
      engineer: "工程師",
      serviceTime: "服務時間",
      issueDescription: "詳細描述",
      internalNote: "內部備註",
      descriptionPlaceholder: "服務描述",
      notePlaceholder: "新增內部備註…",
      unnamedEngineer: "未指定",
      unnamedContact: "未維護聯絡人",
    },
    priority: {
      low: "低",
      normal: "普通",
      high: "高",
      urgent: "緊急",
      help: "優先級用於提示工程師和調度處理順序：普通按常規安排，高和緊急需要優先關注；它不會改變工單狀態，也不代表審批結果。",
    },
    attachment: {
      hint: "支援 PDF、Word、Excel、CSV、TXT、JPG/PNG/WebP/HEIC 圖片、ZIP，單個檔案不超過 20MB。",
      invalidType: "附件類型不支援：{name}。",
      tooLarge: "附件超過 20MB：{name}",
    },
    exportData: {
      sheetName: "工單匯出",
      fileName: "工單匯出",
      unlimited: "不限",
      pdfFileName: "服務記錄",
      pdfTo: "-至",
      pdfSelected: "-已選{count}張",
      colOrderNo: "工單編號",
      colCustomerName: "客戶名稱",
      colContactName: "聯絡人",
      colContactPhone: "聯絡電話",
      colCustomerAddress: "客戶地址",
      colDeviceName: "設備",
      colServiceMode: "服務方式",
      colServiceType: "服務事項",
      colPriority: "優先級",
      colEngineerName: "工程師",
      colPlannedStartAt: "計畫開始",
      colPlannedEndAt: "計畫結束",
      colStatus: "狀態",
      colCreatedAt: "建立時間",
      colUpdatedAt: "更新時間",
      colIssueDescription: "問題描述",
      colWorkContent: "處理紀錄",
      colPartRecords: "備件與硬體部件",
      colInternalNote: "內部備註",
    },
    bulk: {
      delete: "批量刪除",
      selectAll: "全選當前列表",
      selectAllAria: "全選當前工單列表",
      selectedHint: "已勾選 {count} 張；匯出（Excel / PDF）僅包含勾選的工單。",
      matchedHint: "當前條件匹配 {count} 張工單；未勾選時，匯出會包含所有匹配記錄，不只當前頁。",
    },
    dialogs: {
      createDesc: "可先儲存為草稿；選擇工程師後會立即派發到對應工程師的工作台。",
      customer: "客戶",
      customerFallback: "客戶 #{id}",
      selectCustomer: "選擇客戶",
      device: "設備",
      noDevice: "不指定設備",
      serviceModeLabel: "服務方式",
      serviceModeHelp: "現場服務需選擇服務類型並可關聯設備；遠端服務、內勤工作不關聯設備，改為填寫工時類別，提交後計入工時統計與月度彙總。",
      serviceTypeLabel: "服務類型",
      timesheetCategoryLabel: "工時類別",
      timesheetRemotePlaceholder: "排障 / 調配 / 協調 / 會議 / 其他",
      timesheetOfficePlaceholder: "方案準備 / 文件整理 / 網路會議 / 培訓學習 / 其他",
      priorityLabel: "優先級",
      assignEngineer: "派發工程師",
      engineerFallback: "工程師 #{id}",
      noAssign: "建立後暫不派發",
      plannedStart: "計畫開始",
      plannedEnd: "計畫結束",
      issueDescription: "問題描述",
      internalNote: "內部備註",
      attachments: "附件",
      createAttachmentNote: "選擇工程師後可隨工單派發給工程師查看；未派發時附件會先儲存到工單中。",
      createRequired: "請選擇客戶、服務類型並填寫問題描述",
      creating: "建立中…",
      createSubmit: "建立工單",
      assignDesc: "選擇工程師後，工單會進入已派發狀態並同步到工程師端。",
      engineerLabel: "工程師",
      primaryBadge: "主",
      assignMultiHint: "可選擇多位工程師；第一位選中的工程師作為主工程師。",
      assignRequired: "請至少選擇一位派發工程師",
      assignNote: "派單說明",
      assignAttachmentNote: "可上傳裝機設備清單、報錯截圖、客戶資料等，工程師可在工單詳情中下載查看。",
      assigning: "派單中…",
      assignSubmit: "確認派單",
      transitionTitle: "狀態流轉",
      transitionDesc: "後台狀態變更會寫入操作稽核。",
      targetStatus: "目標狀態",
      transitionReason: "流轉原因 / 備註",
      transitioning: "流轉中…",
      transitionSubmit: "確認流轉",
    },
    deleteFlow: {
      title: "刪除工單",
      desc: "刪除後工單主體及下列關聯內容不可恢復；目標設備只會解除關聯，安裝來源設備會依下方預覽處理。",
      confirmHint: "請確認這些工單及關聯內容都不再需要。刪除操作會寫入稽核日誌。",
      loading: "正在載入刪除影響明細…",
      empty: "未載入到刪除影響明細。",
      loadDetailFailed: "未能載入所選工單的刪除影響明細",
      loadFailed: "刪除影響明細載入失敗",
      deleting: "刪除中…",
      confirmDelete: "確認刪除 {count} 張工單",
      sumReports: "服務記錄",
      sumParts: "部件記錄",
      sumFiles: "附件",
      sumTargetDevices: "目標設備關聯",
      sumInstalledDelete: "將刪除安裝設備",
      sumInstalledKeep: "保留安裝設備",
      sumSignatures: "簽署請求",
      sumDrafts: "編輯草稿",
      secReport: "服務記錄",
      reportBody: "服務記錄正文、處理結果、客戶確認資訊",
      workEntryEngineer: "工程師",
      workEntryContent: "工時明細",
      secParts: "備件與硬體部件記錄",
      unnamedPart: "未命名部件",
      partDevice: "（設備：{name}）",
      secFiles: "附件檔案",
      fileFallback: "附件 #{id}",
      secTargetDevices: "目標設備關聯",
      secTargetDevicesDesc: "只解除工單與設備的關聯，不刪除這些既有設備。",
      secInstalled: "安裝來源設備",
      secInstalledDesc: "沒有被其他工單、部件記錄或巡檢計畫引用的安裝設備會隨工單刪除；仍被引用的設備會保留。",
      secEngineers: "派單工程師關聯",
      engineerFallback: "工程師 #{id}",
      unnamedEngineer: "未命名工程師",
      secSignatures: "客戶簽署請求",
      sigNoEmail: "未填寫郵箱",
      sigLatest: "最新請求：{email} / {status}",
      sigCount: "客戶簽署請求 {count} 條",
      secDrafts: "工程師編輯草稿",
      draftsCount: "編輯草稿 {count} 份",
      secOrder: "工單主體",
      orderOnly: "僅刪除工單主體記錄",
      deviceFallback: "設備 #{id}",
      unnamedDevice: "未命名設備",
      keepReasons: "仍關聯：{reasons}",
      keepGeneric: "仍有關聯資料",
      keepLabel: "（保留，{reasons}）",
      willDeleteLabel: "（將刪除）",
      recheckLabel: "（刪除時再次檢查是否有關聯）",
      sigCreated: "已建立",
      sigSent: "已發送",
      sigSigned: "已簽署",
      sigRevoked: "已撤銷",
      sigExpired: "已過期",
      sigUnknown: "未知狀態",
    },
    errors: {
      loadFailed: "載入失敗",
      saveFailed: "儲存失敗",
      exportFailed: "匯出失敗",
      exportEmpty: "當前篩選條件下暫無可匯出的工單",
      downloadFailed: "附件下載失敗",
      pdfExportFailed: "PDF 匯出失敗",
      createNoOrderNo: "工單建立後未返回編號，附件未上傳",
      postCreateFailed: "附件上傳或派發失敗",
      rollbackFailed: "自動刪除失敗",
      createRollbackFailed: "{postCreate}；工單已建立但自動刪除失敗：{rollback}",
      createRolledBack: "{postCreate}；工單已自動取消建立",
      createFailed: "建立工單失敗",
      confirmInspectionFailed: "確認巡檢失敗",
      bulkDeleteFailed: "批量刪除失敗",
      assignFailed: "派單失敗",
      transitionFailed: "狀態流轉失敗",
    },
    status: {
      draft: "草稿",
      assigned: "已派發",
      in_progress: "進行中",
      pending_confirmation: "待確認",
      awaiting_customer_signature: "待客戶簽署",
      submitted: "已結案",
      approved: "已審核",
      archived: "已歸檔",
      cancelled: "已作廢",
      completed: "已完成",
    },
    type: {
      install: "安裝",
      repair: "排障",
      maintain: "調優",
      inspect: "巡檢",
      training: "培訓",
      remote: "遠端支援",
      other: "其他",
    },
    mode: {
      onsite: "現場服務",
      remote: "遠端服務",
      office: "內勤工作",
    },
  },
} as const;

type DeleteFlowStrings = { [K in keyof (typeof I18N)["zh-CN"]["deleteFlow"]]: string };
type AttachmentStrings = { [K in keyof (typeof I18N)["zh-CN"]["attachment"]]: string };

/** 用 {key} 占位符填充 i18n 模板（如 "确认删除 {count} 张工单"） */
function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template);
}

const STATUS_BADGE_VARIANT: Record<string, "draft" | "secondary" | "purple" | "success" | "warning" | "destructive"> = {
  draft: "draft",
  assigned: "warning",
  in_progress: "purple",
  pending_confirmation: "warning",
  awaiting_customer_signature: "warning",
  submitted: "success",
  approved: "success",
  archived: "secondary",
  cancelled: "destructive",
  completed: "success",
};

const TYPE_BADGE_VARIANT: Record<string, "success" | "warning" | "info" | "purple" | "secondary"> = {
  install: "success",
  repair: "warning",
  maintain: "info",
  inspect: "purple",
  training: "info",
  remote: "info",
  other: "secondary",
};

const PRIORITY_BADGE_VARIANT: Record<string, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  normal: "secondary",
  high: "warning",
  urgent: "destructive",
};

const MODE_BADGE_VARIANT: Record<string, "success" | "info" | "purple" | "secondary"> = {
  onsite: "success",
  remote: "info",
  office: "purple",
};

// —— 考勤风格扩散：状态/模式/类型 徽章 → 图标+文字（去 Badge 大色块的刺眼感）——
const STATUS_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  draft: { icon: Pencil, color: "text-slate-400" },
  assigned: { icon: Send, color: "text-sky-600" },
  in_progress: { icon: Clock3, color: "text-indigo-600" },
  pending_confirmation: { icon: Hourglass, color: "text-amber-600" },
  awaiting_customer_signature: { icon: PenLine, color: "text-amber-600" },
  submitted: { icon: Upload, color: "text-emerald-600" },
  approved: { icon: CircleCheck, color: "text-emerald-600" },
  archived: { icon: Archive, color: "text-slate-400" },
  cancelled: { icon: CircleSlash, color: "text-rose-500" },
  completed: { icon: CircleCheckBig, color: "text-emerald-600" },
};
const MODE_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  onsite: { icon: Wrench, color: "text-sky-600" },
  remote: { icon: Radio, color: "text-purple-600" },
  office: { icon: Building2, color: "text-indigo-600" },
};
const TYPE_INDICATOR: Record<string, { icon: LucideIcon; color: string }> = {
  install: { icon: PackagePlus, color: "text-sky-600" },
  repair: { icon: Wrench, color: "text-amber-600" },
  maintain: { icon: Settings, color: "text-teal-600" },
  inspect: { icon: SearchCheck, color: "text-indigo-600" },
  training: { icon: BookOpen, color: "text-purple-600" },
  remote: { icon: Radio, color: "text-purple-600" },
  other: { icon: MoreHorizontal, color: "text-slate-400" },
};
const STATIC_FALLBACK = { icon: Send, color: "text-slate-400" };
function indicatorSpan(icon: LucideIcon, color: string, label: string) {
  const Icon = icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      {label}
    </span>
  );
}

const SERVICE_TYPE_SEARCH_ALIASES: Record<string, string> = {
  install: "安装 install",
  repair: "技术处理 故障排查 配置修改 调整优化 排障 维修 repair",
  maintain: "调优 保养 维护 maintain",
  inspect: "巡检 巡检类 inspect",
  training: "培训 training",
  remote: "远程 远程支持 remote",
  other: "其他 other",
};

const SERVICE_MODE_SEARCH_ALIASES: Record<string, string> = {
  onsite: "现场 现场服务 onsite",
  remote: "远程 远程服务 remote",
  office: "内勤 内勤工作 office",
};

function CompactDateFilterInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden">
      <input
        id={id}
        aria-label={label}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-base text-slate-900 shadow-sm transition-[background-color,border-color,color,box-shadow] peer-focus-visible:border-primary peer-focus-visible:ring-primary/20 peer-focus-visible:ring-[3px] md:text-sm"
      >
        <span className={value ? "min-w-0 truncate tabular-nums" : "min-w-0 truncate text-slate-400"}>
          {value || "YYYY-MM-DD"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}

function cleanDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizedDateRange(startDate: string, endDate: string) {
  const start = cleanDate(startDate);
  const end = cleanDate(endDate);
  if (start && end && start > end) return { startDate: end, endDate: start };
  return { startDate: start, endDate: end };
}

function safeSheetName(value: string, fallback: string) {
  const cleaned = value.replace(/[\\/?*\[\]:]/g, " ").trim() || fallback;
  return cleaned.slice(0, 31);
}

function safeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "").slice(0, 40);
}

function displayId(order: ServiceOrder) {
  return order.orderNo || order.displayId || `SR-${order.id}`;
}

function getWorkflowStatus(order: ServiceOrder) {
  return order.workflowStatus || order.status;
}

function textValue(value?: string, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function compactText(value?: string, fallback = "-") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function orderMainContent(order: ServiceOrder, fallback = "-") {
  if (order.serviceMode === "office") {
    return compactText(
      order.issueDescription || order.displayTitle || order.deviceName || order.internalNote || order.report?.workContent,
      fallback,
    );
  }
  return compactText(order.issueDescription || order.displayTitle || order.deviceName, fallback);
}




function installedDeviceLabel(device: InstalledDevice | DeviceOption, df: DeleteFlowStrings) {
  return [
    device.model || device.name || (device.id ? fill(df.deviceFallback, { id: device.id }) : df.unnamedDevice),
    device.serialNo ? `SN ${device.serialNo}` : "",
    "pn" in device && device.pn ? `PN ${device.pn}` : "",
  ].filter(Boolean).join(" / ");
}

function fileDeleteLabel(file: OrderFile, df: DeleteFlowStrings) {
  return `${file.originalName || fill(df.fileFallback, { id: file.id })}${file.size ? `（${formatFileSize(file.size)}）` : ""}`;
}

async function loadDeleteConfirmationOrders(ids: Array<string | number>) {
  const details = await Promise.all(ids.map(async (id) => {
    const data = await api.get(`/service-orders/${id}`);
    return (data?.item || data) as ServiceOrder;
  }));
  return details.filter(Boolean);
}

function signatureRequestStatusLabel(value: string | undefined, df: DeleteFlowStrings) {
  const labels: Record<string, string> = {
    created: df.sigCreated,
    sent: df.sigSent,
    signed: df.sigSigned,
    revoked: df.sigRevoked,
    expired: df.sigExpired,
  };
  return labels[value || ""] || value || df.sigUnknown;
}

function engineerDeleteLabel(engineer: NonNullable<ServiceOrder["engineers"]>[number], df: DeleteFlowStrings) {
  return engineer.realName || engineer.name || engineer.username || (engineer.id ? fill(df.engineerFallback, { id: engineer.id }) : df.unnamedEngineer);
}

function installedDeviceDeleteLabel(device: InstalledDevice, df: DeleteFlowStrings) {
  const label = installedDeviceLabel(device, df);
  if (device.willDelete === false) {
    const reasons = Array.isArray(device.blockedReasons) && device.blockedReasons.length
      ? fill(df.keepReasons, { reasons: device.blockedReasons.join("、") })
      : df.keepGeneric;
    return `${label}${fill(df.keepLabel, { reasons })}`;
  }
  if (device.willDelete === true) return `${label}${df.willDeleteLabel}`;
  return `${label}${df.recheckLabel}`;
}

function orderDeleteImpactSections(order: ServiceOrder, df: DeleteFlowStrings) {
  const sections: Array<{ key: string; title: string; count: number; description?: string; items: string[] }> = [];
  const reportItems = [
    order.report ? df.reportBody : "",
    ...(order.report?.workEntries || []).map((entry) => `${entry.engineerName || entry.engineer_name || entry.engineerUsername || entry.engineer_username || df.workEntryEngineer}：${compactText(entry.workContent || entry.work_content, df.workEntryContent)}`),
  ].filter(Boolean);
  if (reportItems.length) {
    sections.push({ key: "report", title: df.secReport, count: reportItems.length, items: reportItems });
  }
  const parts = order.parts || [];
  if (parts.length) {
    sections.push({
      key: "parts",
      title: df.secParts,
      count: parts.length,
      items: parts.map((part) => `${servicePartActionLabel(part.actionType || part.action_type)} ${part.partName || part.part_name || df.unnamedPart}${part.deviceName || part.device_name ? fill(df.partDevice, { name: part.deviceName || part.device_name || "" }) : ""}`),
    });
  }
  const files = order.files || [];
  if (files.length) {
    sections.push({ key: "files", title: df.secFiles, count: files.length, items: files.map((file) => fileDeleteLabel(file, df)) });
  }
  const targetDevices = order.targetDevices || [];
  if (targetDevices.length) {
    sections.push({
      key: "target-devices",
      title: df.secTargetDevices,
      count: targetDevices.length,
      description: df.secTargetDevicesDesc,
      items: targetDevices.map((device) => installedDeviceLabel(device, df)),
    });
  }
  const installedDevices = order.installedDevices || [];
  if (installedDevices.length) {
    sections.push({
      key: "installed-devices",
      title: df.secInstalled,
      count: installedDevices.length,
      description: df.secInstalledDesc,
      items: installedDevices.map((device) => installedDeviceDeleteLabel(device, df)),
    });
  }
  const engineers = order.engineers || [];
  if (engineers.length) {
    sections.push({ key: "engineers", title: df.secEngineers, count: engineers.length, items: engineers.map((engineer) => engineerDeleteLabel(engineer, df)) });
  }
  const signatureRequestCount = Number(order.deletePreview?.customerSignatureRequestCount || 0);
  if (signatureRequestCount > 0) {
    const latest = order.customerSignatureRequest;
    sections.push({
      key: "signature-requests",
      title: df.secSignatures,
      count: signatureRequestCount,
      items: latest
        ? [`${fill(df.sigLatest, { email: latest.recipientEmail || df.sigNoEmail, status: signatureRequestStatusLabel(latest.status, df) })}${latest.createdAt ? ` / ${formatDateTime(latest.createdAt)}` : ""}`]
        : [fill(df.sigCount, { count: signatureRequestCount })],
    });
  }
  const editDraftCount = Number(order.deletePreview?.editDraftCount || 0);
  if (editDraftCount > 0) {
    sections.push({ key: "drafts", title: df.secDrafts, count: editDraftCount, items: [fill(df.draftsCount, { count: editDraftCount })] });
  }
  if (!sections.length) {
    sections.push({ key: "order", title: df.secOrder, count: 1, items: [df.orderOnly] });
  }
  return sections;
}

function orderDeleteImpactSummary(orders: ServiceOrder[]) {
  const summary = {
    reports: 0,
    parts: 0,
    files: 0,
    targetDevices: 0,
    installedDevicesToDelete: 0,
    installedDevicesToKeep: 0,
    drafts: 0,
    signatureRequests: 0,
  };
  for (const order of orders) {
    if (order.report) summary.reports += 1;
    summary.parts += order.parts?.length || 0;
    summary.files += order.files?.length || 0;
    summary.targetDevices += order.targetDevices?.length || 0;
    for (const device of order.installedDevices || []) {
      if (device.willDelete === false) summary.installedDevicesToKeep += 1;
      else summary.installedDevicesToDelete += 1;
    }
    summary.drafts += Number(order.deletePreview?.editDraftCount || 0);
    summary.signatureRequests += Number(order.deletePreview?.customerSignatureRequestCount || 0);
  }
  return summary;
}

function splitSearchTerms(value: string) {
  return value
    .trim()
    .split(/[\s,，、]+/)
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function engineerText(order: ServiceOrder, fallback: string) {
  const names = (order.engineers || [])
    .map((engineer) => engineer.realName || engineer.name || engineer.username || "")
    .filter(Boolean);
  if (names.length) return names.join("、");
  return order.engineerName || fallback;
}

function serviceTimeRange(order: ServiceOrder) {
  const start = order.report?.actualStartAt || order.report?.departureAt || "";
  const end = order.report?.actualEndAt || order.report?.returnAt || "";
  return {
    start: formatDateTime(start),
    end: formatDateTime(end),
    full: formatDateRange(start, end),
  };
}


export function ServiceOrders() {
  const { lang } = useLanguage();
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = I18N[lang];
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const statusFilter = "all";
  const customerFilter = "all";
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("keyword") || searchParams.get("q") || "");
  // 搜索词防抖:输入框即时响应,列表与服务端请求在停顿后一起更新,避免逐字改动列表高度
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  // 请求序号守卫:慢请求的过期响应不再覆盖新结果
  const loadSeqRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePreviewOrders, setDeletePreviewOrders] = useState<ServiceOrder[]>([]);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deletePreviewError, setDeletePreviewError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createForm, setCreateForm] = useState({
    customerId: "",
    deviceId: "",
    serviceMode: "onsite",
    serviceType: "repair",
    timesheetCategory: "",
    engineerId: "none",
    plannedStartAt: "",
    plannedEndAt: "",
    priority: "normal",
    issueDescription: "",
    internalNote: "",
  });
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOrder, setAssignOrder] = useState<ServiceOrder | null>(null);
  const [assignForm, setAssignForm] = useState({ engineerIds: [] as string[], plannedStartAt: "", plannedEndAt: "", note: "" });
  const [assignFiles, setAssignFiles] = useState<File[]>([]);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitionOrder, setTransitionOrder] = useState<ServiceOrder | null>(null);
  const [transitionForm, setTransitionForm] = useState({ status: "assigned", reason: "" });
  const [detailOrder, setDetailOrder] = useState<ServiceOrder | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | number | null>(null);
  const canCreateOrders = hasPermission("order.create");
  const canEditOrders = hasPermission("order.edit");
  const canAssignOrders = hasPermission("order.assign");
  const canApproveOrders = hasPermission("order.approve");
  const canDeleteOrders = hasPermission("order.delete");
  const canBulkDeleteOrders = hasPermission("order.bulk-delete");
  const statusOptions = [
    { value: "all", label: t.filters.all },
    { value: "draft", label: t.status.draft },
    { value: "in_progress", label: t.status.in_progress },
    { value: "pending_confirmation", label: t.status.pending_confirmation },
    { value: "awaiting_customer_signature", label: t.status.awaiting_customer_signature },
    { value: "submitted", label: t.status.submitted },
    { value: "cancelled", label: t.status.cancelled },
  ];

  useEffect(() => {
    const keyword = searchParams.get("keyword") || searchParams.get("q") || "";
    setSearchQuery(keyword);
    setStartDate(searchParams.get("startDate") || "");
    setEndDate(searchParams.get("endDate") || "");
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      api.get("/customers?pageSize=200").then((data) => setCustomers(data?.items || [])).catch(() => setCustomers([])),
      api.get("/devices").then((data) => setDevices(data?.items || [])).catch(() => setDevices([])),
      api.get("/users/engineers").then((data) => setEngineers(data?.items || [])).catch(() => setEngineers([])),
    ]).catch(() => undefined);
  }, []);

  async function load() {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const range = normalizedDateRange(startDate, endDate);
      const params = new URLSearchParams({
        pageSize: "50",
        sortBy: "createdAt",
        sortDir: "desc",
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (customerFilter !== "all") params.set("customerId", customerFilter);
      if (range.startDate) params.set("startDate", range.startDate);
      if (range.endDate) params.set("endDate", range.endDate);
      if (debouncedSearch.trim()) params.set("keyword", debouncedSearch.trim());
      const data = await api.get(`/service-orders?${params.toString()}`);
      if (seq !== loadSeqRef.current) return; // 已有更新的请求,丢弃过期响应
      const items = (data?.items || []) as ServiceOrder[];
      setOrders(items);
      setTotal(Number(data?.total ?? items.length));
      setSelectedIds((ids) => ids.filter((id) => items.some((item) => String(item.id) === String(id))));
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      const msg = e instanceof Error ? e.message : t.errors.loadFailed;
      setError(msg);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // 防抖后的关键词写回 URL（replace 不刷历史），刷新/分享链接可恢复搜索态
  useEffect(() => {
    setSearchParams((prev) => {
      const keyword = debouncedSearch.trim();
      if ((prev.get("keyword") || "") === keyword) return prev;
      const next = new URLSearchParams(prev);
      if (keyword) next.set("keyword", keyword); else next.delete("keyword");
      return next;
    });
  }, [debouncedSearch, setSearchParams]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, customerFilter, startDate, endDate, debouncedSearch]);

  // 状态/客户/日期筛选写回 URL，刷新后保持当前筛选
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (statusFilter !== "all") next.set("status", statusFilter); else next.delete("status");
      if (customerFilter !== "all") next.set("customerId", customerFilter); else next.delete("customerId");
      if (startDate) next.set("startDate", startDate); else next.delete("startDate");
      if (endDate) next.set("endDate", endDate); else next.delete("endDate");
      if (next.toString() === prev.toString()) return prev;
      return next;
    });
  }, [statusFilter, customerFilter, startDate, endDate, setSearchParams]);

  useEffect(() => {
    const orderId = searchParams.get("orderId");
    if (!orderId) return;
    const matched = orders.find((order) => String(order.id) === orderId);
    if (matched && (!detailOrder || String(detailOrder.id) !== orderId)) {
      setDetailOrder(matched);
    }

    let cancelled = false;
    async function loadOrderDetail() {
      try {
        const data = await api.get(`/service-orders/${orderId}`);
        if (!cancelled) setDetailOrder((data?.item || data) as ServiceOrder);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t.errors.loadFailed);
      }
    }

    loadOrderDetail();
    return () => {
      cancelled = true;
    };
  }, [searchParams, orders, t.errors.loadFailed]);

  const filteredOrders = useMemo(() => {
    const terms = splitSearchTerms(debouncedSearch);
    if (!terms.length) return orders;
    return orders.filter((order) => {
      const workflowStatus = getWorkflowStatus(order);
      const searchText = [
        displayId(order),
        order.customerName,
        order.customerAddress,
        order.deviceName,
        engineerText(order, ""),
        order.issueDescription,
        order.internalNote,
        order.timesheetCategory,
        order.timesheetSalesperson,
        order.serviceType,
        t.type[order.serviceType as keyof typeof t.type],
        SERVICE_TYPE_SEARCH_ALIASES[order.serviceType || ""],
        serviceItemsSearchText(order),
        order.serviceMode,
        t.mode[order.serviceMode as keyof typeof t.mode],
        SERVICE_MODE_SEARCH_ALIASES[order.serviceMode || ""],
        workflowStatus,
        t.status[workflowStatus as keyof typeof t.status],
      ].filter(Boolean).join(" ").toLowerCase();
      return terms.every((term) => searchText.includes(term));
    });
  }, [orders, debouncedSearch, t.mode, t.status, t.type]);

  const allFilteredOrdersSelected = filteredOrders.length > 0
    && filteredOrders.every((order) => selectedIds.some((id) => String(id) === String(order.id)));

  const initialLoading = loading && orders.length === 0;
  const refreshing = loading && orders.length > 0;

  const selectedCustomerName = useMemo(() => {
    if (customerFilter === "all") return "";
    return customers.find((customer) => String(customer.id) === customerFilter)?.name || "";
  }, [customerFilter, customers]);

  const stats = useMemo(() => {
    const all = orders.length;
    const pending = orders.filter((o) => getWorkflowStatus(o) === "pending_confirmation").length;
    const processing = orders.filter((o) => getWorkflowStatus(o) === "in_progress").length;
    const submitted = orders.filter((o) => ["submitted", "approved", "archived", "completed"].includes(getWorkflowStatus(o))).length;
    return [
      { label: t.stats.all, value: all },
      { label: t.stats.pending, value: pending },
      { label: t.stats.processing, value: processing },
      { label: t.stats.completed, value: submitted },
    ];
  }, [orders, t.stats]);

  function openCreateOrder() {
    setCreateForm({
      customerId: "",
      deviceId: "",
      serviceMode: "onsite",
      serviceType: "repair",
      timesheetCategory: "",
      engineerId: "none",
      plannedStartAt: "",
      plannedEndAt: "",
      priority: "normal",
      issueDescription: "",
      internalNote: "",
    });
    setCreateFiles([]);
    setCreateOpen(true);
  }

  function applyNameFilter(value?: string) {
    const keyword = textValue(value, "").trim();
    if (!keyword) return;
    setSearchQuery(keyword);
    setSearchParams(() => {
      const range = normalizedDateRange(startDate, endDate);
      const next = new URLSearchParams();
      next.set("keyword", keyword);
      if (customerFilter !== "all") next.set("customerId", customerFilter);
      if (range.startDate) next.set("startDate", range.startDate);
      if (range.endDate) next.set("endDate", range.endDate);
      return next;
    });
  }

  function resetFilters() {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setSearchParams({});
  }

  function closeDetailOrder() {
    setDetailOrder(null);
    if (!searchParams.has("orderId")) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("orderId");
      return next;
    });
  }

  function toggleOrderSelection(orderId: string | number, checked: boolean | "indeterminate") {
    setSelectedIds((ids) => {
      if (checked === true) {
        return ids.some((id) => String(id) === String(orderId)) ? ids : [...ids, orderId];
      }
      return ids.filter((id) => String(id) !== String(orderId));
    });
  }

  function toggleAllFilteredOrders(checked: boolean | "indeterminate") {
    const ids = filteredOrders.map((order) => order.id);
    setSelectedIds((current) => {
      if (checked === true) {
        const merged = new Map<string, string | number>();
        [...current, ...ids].forEach((id) => merged.set(String(id), id));
        return [...merged.values()];
      }
      const visible = new Set(ids.map((id) => String(id)));
      return current.filter((id) => !visible.has(String(id)));
    });
  }

  async function openDetailOrder(order: ServiceOrder) {
    setDetailOrder(order);
    setError("");
    try {
      const data = await api.get(`/service-orders/${order.id}`);
      setDetailOrder((data?.item || data) as ServiceOrder);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.loadFailed);
    }
  }

  async function downloadOrderFile(file: OrderFile) {
    if (!file?.id || downloadingFileId) return;
    setDownloadingFileId(file.id);
    setError("");
    try {
      const blob = await api.download(`/files/${file.id}`);
      const { saveAs } = await import("file-saver");
      saveAs(blob, file.originalName || `attachment-${file.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.downloadFailed);
    } finally {
      setDownloadingFileId(null);
    }
  }

  async function exportOrdersPdf(orderIds: Array<ServiceOrder["id"]> = [], fileLabel?: string) {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const effectiveIds = orderIds.length ? orderIds : selectedIds;
      let queryString: string;
      if (effectiveIds.length) {
        // 有勾选：只导出选中的工单
        queryString = `ids=${effectiveIds.join(",")}`;
      } else {
        // 无勾选：按当前筛选导出全部匹配
        const params = buildListParams(1, 100);
        params.delete("page");
        params.delete("pageSize");
        queryString = params.toString();
      }
      const blob = await api.download(`/service-orders/export-pdf-batch?${queryString}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const datePart = `${t.exportData.pdfTo}${normalizedDateRange(startDate, endDate).endDate || new Date().toISOString().slice(0, 10)}`;
      const namePart = orderIds.length === 1
        ? `-${safeFilenamePart(fileLabel || String(orderIds[0]))}`
        : effectiveIds.length
        ? fill(t.exportData.pdfSelected, { count: effectiveIds.length })
        : selectedCustomerName ? `-${safeFilenamePart(selectedCustomerName)}` : "";
      link.download = `${t.exportData.pdfFileName}${namePart}${datePart}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.pdfExportFailed);
    } finally {
      setExporting(false);
    }
  }

  function buildListParams(page: number, pageSize: number) {
    const range = normalizedDateRange(startDate, endDate);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy: "createdAt",
      sortDir: "desc",
    });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (customerFilter !== "all") params.set("customerId", customerFilter);
    if (range.startDate) params.set("startDate", range.startDate);
    if (range.endDate) params.set("endDate", range.endDate);
    if (searchQuery.trim()) params.set("keyword", searchQuery.trim());
    return params;
  }

  async function fetchExportOrders(orderIds: Array<ServiceOrder["id"]> = []) {
    const fetchOrderDetails = async (ids: Array<ServiceOrder["id"]>) => {
      const chunks: Array<Array<ServiceOrder["id"]>> = [];
      for (let index = 0; index < ids.length; index += 8) chunks.push(ids.slice(index, index + 8));
      const details: ServiceOrder[] = [];
      for (const chunk of chunks) {
        const chunkDetails = await Promise.all(
          chunk.map(async (id) => {
            const data = await api.get(`/service-orders/${id}`);
            return (data?.item || data) as ServiceOrder;
          }),
        );
        details.push(...chunkDetails.filter(Boolean));
      }
      return details;
    };

    if (orderIds.length) {
      return fetchOrderDetails(orderIds);
    }
    const pageSize = 100;
    let page = 1;
    let totalCount = 0;
    const allItems: ServiceOrder[] = [];
    do {
      const data = await api.get(`/service-orders?${buildListParams(page, pageSize).toString()}`);
      const items = (data?.items || []) as ServiceOrder[];
      allItems.push(...items);
      totalCount = Number(data?.total ?? allItems.length);
      if (!items.length) break;
      page += 1;
    } while (allItems.length < totalCount);
    // 有勾选则只导出选中的工单，与 PDF 导出口径一致
    if (selectedIds.length) {
      const idSet = new Set(selectedIds.map((id) => String(id)));
      return fetchOrderDetails(allItems.filter((item) => idSet.has(String(item.id))).map((item) => item.id));
    }
    return fetchOrderDetails(allItems.map((item) => item.id));
  }

  async function exportOrders(orderIds: Array<ServiceOrder["id"]> = []) {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const items = await fetchExportOrders(orderIds);
      if (!items.length) {
        setError(t.errors.exportEmpty);
        return;
      }

      const [{ Workbook }, { saveAs }] = await Promise.all([
        import("exceljs"),
        import("file-saver"),
      ]);
      const workbook = new Workbook();
      workbook.creator = "Service Sheet RC";
      workbook.created = new Date();
      workbook.modified = new Date();
      const worksheet = workbook.addWorksheet(safeSheetName(selectedCustomerName || t.exportData.sheetName, t.exportData.sheetName), {
        views: [{ state: "frozen", ySplit: 1 }],
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      worksheet.columns = [
        { header: t.exportData.colOrderNo, key: "orderNo", width: 20 },
        { header: t.exportData.colCustomerName, key: "customerName", width: 26 },
        { header: t.exportData.colContactName, key: "contactName", width: 14 },
        { header: t.exportData.colContactPhone, key: "contactPhone", width: 16 },
        { header: t.exportData.colCustomerAddress, key: "customerAddress", width: 30 },
        { header: t.exportData.colDeviceName, key: "deviceName", width: 18 },
        { header: t.exportData.colServiceMode, key: "serviceMode", width: 12 },
        { header: t.exportData.colServiceType, key: "serviceType", width: 18 },
        { header: t.exportData.colPriority, key: "priority", width: 10 },
        { header: t.exportData.colEngineerName, key: "engineerName", width: 18 },
        { header: t.exportData.colPlannedStartAt, key: "plannedStartAt", width: 18 },
        { header: t.exportData.colPlannedEndAt, key: "plannedEndAt", width: 18 },
        { header: t.exportData.colStatus, key: "status", width: 12 },
        { header: t.exportData.colCreatedAt, key: "createdAt", width: 18 },
        { header: t.exportData.colUpdatedAt, key: "updatedAt", width: 18 },
        { header: t.exportData.colIssueDescription, key: "issueDescription", width: 42 },
        { header: t.exportData.colWorkContent, key: "workContent", width: 50 },
        { header: t.exportData.colPartRecords, key: "partRecords", width: 44 },
        { header: t.exportData.colInternalNote, key: "internalNote", width: 28 },
      ];

      items.forEach((order) => {
        worksheet.addRow({
          orderNo: displayId(order),
          customerName: order.customerName || "",
          contactName: order.contactName || "",
          contactPhone: order.contactPhone || "",
          customerAddress: order.customerAddress || "",
          deviceName: order.deviceName || "",
          serviceMode: t.mode[order.serviceMode as keyof typeof t.mode] || order.serviceMode || "",
          serviceType: serviceItemsLabel(order, ""),
          priority: (t.priority as Record<string, string>)[order.priority || ""] || order.priority || "",
          engineerName: engineerText(order, ""),
          plannedStartAt: formatDateTime(order.plannedStartAt),
          plannedEndAt: formatDateTime(order.plannedEndAt),
          status: order.displayStatus || t.status[getWorkflowStatus(order) as keyof typeof t.status] || getWorkflowStatus(order) || "",
          createdAt: formatDateTime(order.createdAt),
          updatedAt: formatDateTime(order.updatedAt),
          issueDescription: compactText(order.issueDescription, ""),
          workContent: displayServiceOrderWorkContent(order),
          partRecords: displayServiceOrderParts(order.parts),
          internalNote: compactText(order.internalNote, ""),
        });
      });

      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, worksheet.rowCount), column: worksheet.columns.length },
      };
      worksheet.getRow(1).height = 24;
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFB7C9D6" } },
          left: { style: "thin", color: { argb: "FFB7C9D6" } },
          bottom: { style: "thin", color: { argb: "FFB7C9D6" } },
          right: { style: "thin", color: { argb: "FFB7C9D6" } },
        };
      });
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 22;
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFD9E2EC" } },
            left: { style: "thin", color: { argb: "FFD9E2EC" } },
            bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
            right: { style: "thin", color: { argb: "FFD9E2EC" } },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: [11, 12, 14, 15].includes(colNumber) ? "center" : "left",
            wrapText: [5, 16, 17, 18, 19].includes(colNumber),
          };
          if (rowNumber % 2 === 0) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAFC" } };
          }
        });
      });

      const range = normalizedDateRange(startDate, endDate);
      const datePart = range.startDate || range.endDate ? `${range.startDate || t.exportData.unlimited}${t.exportData.pdfTo}${range.endDate || t.exportData.unlimited}` : new Date().toISOString().slice(0, 10);
      const customerPart = orderIds.length === 1
        ? `-${safeFilenamePart(displayId(items[0]))}`
        : selectedCustomerName ? `-${safeFilenamePart(selectedCustomerName)}` : "";
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${t.exportData.fileName}${customerPart}-${datePart}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  async function createOrder() {
    if (!createForm.customerId || !createForm.serviceType || !createForm.issueDescription.trim()) {
      setError(t.dialogs.createRequired);
      return;
    }
    const fileError = validateOrderFiles(createFiles, t.attachment);
    if (fileError) {
      setError(fileError);
      return;
    }
    setSaving(true);
    setError("");
    let createdOrderId: string | number | null = null;
    const shouldAssignAfterFiles = createFiles.length > 0 && createForm.engineerId && createForm.engineerId !== "none";
    try {
      const created = await api.post("/service-orders", {
        customerId: Number(createForm.customerId),
        deviceId: createForm.deviceId && createForm.deviceId !== "none" ? Number(createForm.deviceId) : null,
        serviceMode: createForm.serviceMode,
        serviceType: createForm.serviceMode === "onsite" ? createForm.serviceType : "other",
        timesheetCategory: createForm.serviceMode === "onsite" ? null : createForm.timesheetCategory || "其他",
        engineerId: shouldAssignAfterFiles ? undefined : createForm.engineerId && createForm.engineerId !== "none" ? Number(createForm.engineerId) : undefined,
        plannedStartAt: createForm.plannedStartAt || undefined,
        plannedEndAt: createForm.plannedEndAt || undefined,
        priority: createForm.priority,
        issueDescription: createForm.issueDescription.trim(),
        internalNote: createForm.internalNote.trim() || null,
      });
      createdOrderId = created?.id || null;
      if (createFiles.length && !createdOrderId) {
        throw new Error(t.errors.createNoOrderNo);
      }
      if (createdOrderId && (createFiles.length || shouldAssignAfterFiles)) {
        try {
          if (createFiles.length) await uploadOrderFiles(createdOrderId, createFiles);
          if (shouldAssignAfterFiles) {
            await api.post(`/service-orders/${createdOrderId}/assign`, {
              primaryEngineerId: Number(createForm.engineerId),
              engineerIds: [Number(createForm.engineerId)],
              plannedStartAt: createForm.plannedStartAt || undefined,
              plannedEndAt: createForm.plannedEndAt || undefined,
            });
          }
        } catch (postCreateError) {
          try {
            await api.delete(`/service-orders/${createdOrderId}`);
          } catch (rollbackError) {
            const postCreateMessage = postCreateError instanceof Error ? postCreateError.message : t.errors.postCreateFailed;
            const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : t.errors.rollbackFailed;
            throw new Error(fill(t.errors.createRollbackFailed, { postCreate: postCreateMessage, rollback: rollbackMessage }));
          }
          const postCreateMessage = postCreateError instanceof Error ? postCreateError.message : t.errors.postCreateFailed;
          throw new Error(fill(t.errors.createRolledBack, { postCreate: postCreateMessage }));
        }
      }
      setCreateOpen(false);
      setCreateFiles([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.createFailed);
    } finally {
      setSaving(false);
    }
  }

  async function confirmInspection(order: ServiceOrder) {
    if (!order.id) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${order.id}/confirm-inspection`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.confirmInspectionFailed);
    } finally {
      setSaving(false);
    }
  }

  async function bulkDeleteOrders() {
    if (!selectedIds.length) return;
    setError("");
    setDeletePreviewError("");
    setDeletePreviewOrders([]);
    setDeleteOpen(true);
    setDeletePreviewLoading(true);
    try {
      const confirmationOrders = await loadDeleteConfirmationOrders(selectedIds);
      setDeletePreviewOrders(confirmationOrders);
      if (!confirmationOrders.length) {
        setDeletePreviewError(t.deleteFlow.loadDetailFailed);
      }
    } catch (e) {
      setDeletePreviewError(e instanceof Error ? e.message : t.deleteFlow.loadFailed);
    } finally {
      setDeletePreviewLoading(false);
    }
  }

  function closeDeleteDialog() {
    if (saving) return;
    setDeleteOpen(false);
    setDeletePreviewOrders([]);
    setDeletePreviewError("");
  }

  async function confirmDeleteOrders() {
    if (!selectedIds.length || deletePreviewLoading || deletePreviewError) return;
    setSaving(true);
    setError("");
    setDeletePreviewError("");
    try {
      const canUseBulkDeleteEndpoint = canBulkDeleteOrders;
      if (canUseBulkDeleteEndpoint) {
        await api.post("/service-orders/bulk-delete", { ids: selectedIds });
      } else {
        for (const id of selectedIds) {
          await api.delete(`/service-orders/${id}`);
        }
      }
      setSelectedIds([]);
      setDeleteOpen(false);
      setDeletePreviewOrders([]);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : t.errors.bulkDeleteFailed;
      setDeletePreviewError(message);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function openAssign(order: ServiceOrder) {
    setAssignOrder(order);
    setAssignForm({
      engineerIds: (order.engineers || [])
        .map((engineer: any) => String(engineer.id || ""))
        .filter(Boolean),
      plannedStartAt: order.plannedStartAt ? String(order.plannedStartAt).replace(" ", "T").slice(0, 16) : "",
      plannedEndAt: order.plannedEndAt ? String(order.plannedEndAt).replace(" ", "T").slice(0, 16) : "",
      note: "",
    });
    setAssignFiles([]);
    setAssignOpen(true);
  }

  /** 移动端工单卡片（ResponsiveList renderCard 用），字段/操作与桌面行一致 */
  function renderOrderCard(order: ServiceOrder) {
    const workflowStatus = getWorkflowStatus(order);
    const statusLabel = order.displayStatus || t.status[workflowStatus as keyof typeof t.status] || workflowStatus || "-";
    const modeLabel = t.mode[order.serviceMode as keyof typeof t.mode] || order.serviceMode || "-";
    const itemsLabel = serviceItemsLabel(order);
    const serviceTime = serviceTimeRange(order);
    const canConfirmInspection = canAssignOrders && workflowStatus === "pending_confirmation" && order.serviceType === "inspect";
    const canAssign = canAssignOrders && !["cancelled", "submitted", "awaiting_customer_signature"].includes(workflowStatus);
    const canExport = ["submitted", "approved", "archived", "completed"].includes(workflowStatus);
    const engineerName = engineerText(order, t.detail.unnamedEngineer);
    return (
      <ResponsiveCard
        onClick={() => openDetailOrder(order)}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
              <Checkbox
                checked={selectedIds.some((id) => String(id) === String(order.id))}
                onCheckedChange={(checked) => toggleOrderSelection(order.id, checked)}
                aria-label={`${t.list.selectOrder} ${displayId(order)}`}
              />
            </span>
            <span className="truncate" title={displayId(order)}>{displayId(order)}</span>
          </span>
        }
        status={(() => { const conf = STATUS_INDICATOR[workflowStatus] || STATIC_FALLBACK; return indicatorSpan(conf.icon, conf.color, statusLabel); })()}
        subtitle={orderMainContent(order)}
        fields={[
          {
            label: t.list.fieldCustomer,
            value: (
              <button
                type="button"
                className="block max-w-full truncate text-left transition-colors hover:text-primary hover:underline"
                title={`${t.list.filterByCustomer}：${textValue(order.customerName)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  applyNameFilter(order.customerName);
                }}
              >
                {textValue(order.customerName)}
              </button>
            ),
          },
          {
            label: t.list.fieldEngineer,
            value: (
              <button
                type="button"
                className="block max-w-full truncate text-left transition-colors hover:text-primary hover:underline disabled:cursor-default disabled:text-current disabled:no-underline"
                title={`${t.list.filterByEngineer}：${engineerName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  applyNameFilter(engineerText(order, ""));
                }}
                disabled={!engineerText(order, "")}
              >
                {engineerName}
              </button>
            ),
          },
          {
            label: t.list.fieldServiceItems,
            value: (() => { const mc = MODE_INDICATOR[order.serviceMode || ""]; return mc ? indicatorSpan(mc.icon, mc.color, modeLabel) : <span className="text-xs text-muted-foreground">{modeLabel}</span>; })(),
          },
          {
            label: t.list.fieldServiceTime,
            value: (
              <span className="block space-y-0.5 text-xs">
                <span className="block"><span className="text-muted-foreground">{t.list.startShort}：</span>{serviceTime.start}</span>
                <span className="block"><span className="text-muted-foreground">{t.list.endShort}：</span>{serviceTime.end}</span>
              </span>
            ),
          },
        ]}
        actions={
          <>
            {canConfirmInspection && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-emerald-600 hover:bg-transparent"
                onClick={(event) => {
                  event.stopPropagation();
                  confirmInspection(order);
                }}
                disabled={saving}
              >
                <CheckCircle className="mr-1 h-4 w-4" />
                {t.actions.confirmInspection}
              </Button>
            )}
            {canAssign && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-sky-600 hover:bg-transparent"
                onClick={(event) => {
                  event.stopPropagation();
                  openAssign(order);
                }}
                disabled={saving}
              >
                <Send className="mr-1 h-4 w-4" />
                {t.actions.assign}
              </Button>
            )}
          </>
        }
      />
    );
  }

  function toggleAssignEngineer(engineerId: string | number, checked: boolean) {
    const id = String(engineerId);
    setAssignForm((form) => ({
      ...form,
      engineerIds: checked
        ? [...form.engineerIds, id].filter((value, index, values) => values.indexOf(value) === index)
        : form.engineerIds.filter((value) => value !== id),
    }));
  }

  async function uploadOrderFiles(orderId: string | number, files: File[]) {
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("ownerType", "service_order");
      formData.append("ownerId", String(orderId));
      await api.postForm("/files", formData);
    }
  }

  async function assignOrderToEngineer() {
    if (!assignOrder?.id || !assignForm.engineerIds.length) {
      setError(t.dialogs.assignRequired);
      return;
    }
    const fileError = validateOrderFiles(assignFiles, t.attachment);
    if (fileError) {
      setError(fileError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${assignOrder.id}/assign`, {
        primaryEngineerId: Number(assignForm.engineerIds[0]),
        engineerIds: assignForm.engineerIds.map(Number),
        plannedStartAt: assignForm.plannedStartAt || undefined,
        plannedEndAt: assignForm.plannedEndAt || undefined,
        note: assignForm.note || undefined,
      });
      if (assignFiles.length) {
        await uploadOrderFiles(assignOrder.id, assignFiles);
      }
      setAssignOpen(false);
      setAssignOrder(null);
      setAssignFiles([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.assignFailed);
    } finally {
      setSaving(false);
    }
  }

  function openTransition(order: ServiceOrder) {
    setTransitionOrder(order);
    setTransitionForm({ status: getWorkflowStatus(order) === "in_progress" ? "submitted" : "in_progress", reason: "" });
    setTransitionOpen(true);
  }

  async function transitionSelectedOrder() {
    if (!transitionOrder?.id || !transitionForm.status) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/service-orders/${transitionOrder.id}/transition`, {
        status: transitionForm.status,
        reason: transitionForm.reason || undefined,
      });
      setTransitionOpen(false);
      setTransitionOrder(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.transitionFailed);
    } finally {
      setSaving(false);
    }
  }

  const deviceOptions = createForm.customerId
    ? devices.filter((device) => String(device.customerId) === createForm.customerId)
    : devices;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={saving}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t.actions.refresh}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={saving || exporting || loading}>
                {exporting ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Download className="w-4 h-4 mr-2" />}
                {exporting ? t.actions.exporting : t.actions.export}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportOrders()} disabled={exporting || loading}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                {t.actions.exportExcel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportOrdersPdf()} disabled={exporting || loading}>
                <FileDown className="w-4 h-4 mr-2" />
                {t.actions.exportPdf}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canDeleteOrders ? (
            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={bulkDeleteOrders} disabled={saving || !selectedIds.length}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t.bulk.delete}{selectedIds.length ? ` (${selectedIds.length})` : ""}
            </Button>
          ) : null}
          {canCreateOrders ? (
            <Button onClick={openCreateOrder} disabled={saving}>
              <Plus className="w-4 h-4 mr-2" />
              {t.actions.create}
            </Button>
          ) : null}
        </div>
      </div>

      <ErrorToast message={error} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat, statIndex) => (
          <Card key={stat.label} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-bold mt-1">
                                {initialLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span className="stat-value-enter inline-block" style={{ animationDelay: `${Math.min(statIndex * 120, 480)}ms` }}>{formatCount(stat.value)}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.15fr)_minmax(170px,0.7fr)_minmax(260px,1fr)]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t.filters.searchPlaceholder}
                aria-label={t.filters.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  // 回车跳过防抖立即搜索(值未变时由 effect 去重,不会重复请求)
                  if (e.key === "Enter") setDebouncedSearch(searchQuery);
                }}
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 sm:gap-3 2xl:grid-cols-[minmax(184px,220px)_minmax(184px,220px)_auto]">
            <div className="min-w-0 overflow-hidden space-y-1.5">
              <Label htmlFor="service-orders-start-date" className="text-xs text-muted-foreground">
                {t.filters.startDate}
              </Label>
              <CompactDateFilterInput
                id="service-orders-start-date"
                label={t.filters.startDate}
                value={startDate}
                onChange={setStartDate}
              />
            </div>
            <div className="min-w-0 overflow-hidden space-y-1.5">
              <Label htmlFor="service-orders-end-date" className="text-xs text-muted-foreground">
                {t.filters.endDate}
              </Label>
              <CompactDateFilterInput
                id="service-orders-end-date"
                label={t.filters.endDate}
                value={endDate}
                onChange={setEndDate}
              />
            </div>
            <Button
              className="h-9 shrink-0 whitespace-nowrap px-2.5 sm:px-3"
              variant="outline"
              onClick={resetFilters}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t.actions.reset}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={allFilteredOrdersSelected}
                onCheckedChange={toggleAllFilteredOrders}
                disabled={saving || filteredOrders.length === 0}
                aria-label={t.bulk.selectAllAria}
              />
              {t.bulk.selectAll}
            </label>
            <span>
              {selectedIds.length
                ? fill(t.bulk.selectedHint, { count: selectedIds.length })
                : fill(t.bulk.matchedHint, { count: total })}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t.list.title} ({filteredOrders.length}/{total || filteredOrders.length})
            <HelpTooltip label={t.list.help} />
            {refreshing && <span className="btn-loader" aria-hidden="true" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[62vh] min-h-[360px] max-h-[680px] overflow-auto rounded-md border">
            {initialLoading ? (
              <div className="p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={`skeleton-${i}`} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            ) : filteredOrders.length === 0 ? (
              <EmptyState
                title={t.list.empty}
                {...(canCreateOrders ? { actionLabel: t.actions.create, onAction: openCreateOrder } : {})}
              />
            ) : (
              <ResponsiveList items={filteredOrders} keyExtractor={(order) => order.id} renderCard={renderOrderCard}>
            <table className="w-full table-fixed caption-bottom text-sm">
              <colgroup>
                <col className="w-10" />
                <col className="w-[24%]" />
                <col className="w-[32%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <TableHeader className="text-xs text-muted-foreground [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted/70 [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:backdrop-blur">
                <TableRow>
                  <TableHead className="w-11 text-center" />
                  <TableHead>{t.list.colCaseCustomer}</TableHead>
                  <TableHead>{t.list.colMainContent} / {t.list.colServiceItems}</TableHead>
                  <TableHead>{t.list.colEngineer} / {t.list.colServiceTime}</TableHead>
                  <TableHead>{t.list.colStatus}</TableHead>
                  <TableHead>{t.list.colActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order, rowIndex) => {
                    const statusLabel = order.displayStatus || t.status[getWorkflowStatus(order) as keyof typeof t.status] || getWorkflowStatus(order) || "-";
                    const modeLabel = t.mode[order.serviceMode as keyof typeof t.mode] || order.serviceMode || "-";
                    const itemsLabel = serviceItemsLabel(order);
                    const workflowStatus = getWorkflowStatus(order);
                    const serviceTime = serviceTimeRange(order);
                    const engineerName = engineerText(order, t.detail.unnamedEngineer);
                    const canConfirmInspection = canAssignOrders && workflowStatus === "pending_confirmation" && order.serviceType === "inspect";
                    const canAssign = canAssignOrders && !["cancelled", "submitted", "awaiting_customer_signature"].includes(workflowStatus);
                    const canExport = ["submitted", "approved", "archived", "completed"].includes(workflowStatus);
                    return (
                      <TableRow
                        key={order.id}
                        role="button"
                        tabIndex={0}
                        className="list-row-enter cursor-pointer hover:relative hover:z-10"
                        style={{ animationDelay: `${Math.min(rowIndex * 40, 400)}ms` }}
                        onClick={() => openDetailOrder(order)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDetailOrder(order);
                          }
                        }}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.some((id) => String(id) === String(order.id))}
                            onCheckedChange={(checked) => toggleOrderSelection(order.id, checked)}
                            aria-label={`${t.list.selectOrder} ${displayId(order)}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-0">
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="block max-w-full truncate text-left text-sm font-semibold transition-colors hover:text-primary hover:underline"
                              title={`${t.list.filterByCustomer}：${textValue(order.customerName)}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                applyNameFilter(order.customerName);
                              }}
                            >
                              {textValue(order.customerName)}
                            </button>
                            <button
                              type="button"
                              className="block max-w-full truncate text-left font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
                              title={displayId(order)}
                              onClick={(event) => {
                                event.stopPropagation();
                                openDetailOrder(order);
                              }}
                            >
                              {displayId(order)}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-0">
                          <div className="min-w-0">
                            <div className="truncate font-medium" title={orderMainContent(order)}>{orderMainContent(order) || "-"}</div>
                            <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              {(() => { const mc = MODE_INDICATOR[order.serviceMode || ""]; const Icon = mc ? mc.icon : null; return Icon ? <Icon className={`h-3 w-3 ${mc.color}`} /> : null; })()}
                              {modeLabel}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-0">
                          <div className="min-w-0 text-xs">
                            <button
                              type="button"
                              className="block max-w-full truncate text-left transition-colors hover:text-primary hover:underline disabled:cursor-default disabled:text-current disabled:no-underline"
                              title={`${t.list.filterByEngineer}：${engineerText(order, "")}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                applyNameFilter(engineerText(order, ""));
                              }}
                              disabled={!engineerText(order, "")}
                            >
                              {engineerName}
                            </button>
                            <div className="group relative inline-block max-w-full">
                              <div className="truncate text-muted-foreground cursor-default">{(() => {
                                const sd = (serviceTime.start || "").split(" ")[0] || "-";
                                const ed = (serviceTime.end || "").split(" ")[0];
                                return ed && ed !== sd ? `${sd} ~ ${ed}` : sd;
                              })()}</div>
                              {(serviceTime.start || serviceTime.end) ? (
                                <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden min-w-[190px] rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg group-hover:block dark:border-slate-700 dark:bg-slate-900">
                                  {([
                                    { key: "departure", label: "出发", at: order.report?.departureAt, dot: "bg-sky-100 text-sky-700" },
                                    { key: "arrive", label: "到达", at: order.report?.actualStartAt, dot: "bg-emerald-100 text-emerald-700" },
                                    { key: "leave", label: "完成", at: order.report?.actualEndAt, dot: "bg-amber-100 text-amber-700" },
                                    { key: "return", label: "返回", at: order.report?.returnAt, dot: "bg-slate-200 text-slate-600" },
                                  ] as const).filter((seg) => seg.at).map((seg, i, arr) => (
                                    <div key={seg.key}>
                                      <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${seg.dot}`}><CircleDot className="h-2.5 w-2.5" /></span>
                                        {seg.label} <span className="font-medium text-foreground">{formatDateTime(seg.at)}</span>
                                      </div>
                                      {i < arr.length - 1 ? <div className="my-1 ml-2 h-3 border-l border-dashed border-slate-300" /> : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => { const conf = STATUS_INDICATOR[getWorkflowStatus(order)] || STATIC_FALLBACK; return indicatorSpan(conf.icon, conf.color, statusLabel); })()}
                        </TableCell>
                        <TableCell>
                          {(canConfirmInspection || canAssign) ? (
                              <div className="flex items-center gap-1">
                                {canConfirmInspection && (
                                  <button
                                    type="button"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
                                    title={t.actions.confirmInspection}
                                    aria-label={t.actions.confirmInspection}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      confirmInspection(order);
                                    }}
                                    disabled={saving}
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {canAssign && (
                                  <button
                                    type="button"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sky-50 hover:text-sky-600 disabled:opacity-40"
                                    title={t.actions.assign}
                                    aria-label={t.actions.assign}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openAssign(order);
                                    }}
                                    disabled={saving}
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </table>
              </ResponsiveList>
            )}
          </div>
        </CardContent>
      </Card>

      <ServiceOrderDetailDialog
        order={detailOrder}
        downloadingFileId={downloadingFileId}
        onDownloadFile={downloadOrderFile}
        onClose={closeDetailOrder}
        statusLabels={t.status}
        modeLabels={t.mode}
        detailLabels={t.detail}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t.actions.create}</DialogTitle>
            <DialogDescription>{t.dialogs.createDesc}</DialogDescription>
          </DialogHeader>
          {error && createOpen ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t.dialogs.customer} *</Label>
              <Select value={createForm.customerId} onValueChange={(v) => setCreateForm({ ...createForm, customerId: v, deviceId: "" })}>
                <SelectTrigger><SelectValue placeholder={t.dialogs.selectCustomer} /></SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>{customer.name || fill(t.dialogs.customerFallback, { id: customer.id })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.dialogs.device}</Label>
              <Select value={createForm.deviceId} onValueChange={(v) => setCreateForm({ ...createForm, deviceId: v })}>
                <SelectTrigger><SelectValue placeholder={t.dialogs.noDevice} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.dialogs.noDevice}</SelectItem>
                  {deviceOptions.map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>{deviceOptionLabel(device, t.deleteFlow)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>{t.dialogs.serviceModeLabel}</Label>
                <HelpTooltip label={t.dialogs.serviceModeHelp} />
              </div>
              <Select value={createForm.serviceMode} onValueChange={(v) => setCreateForm({ ...createForm, serviceMode: v, deviceId: createForm.deviceId === "none" ? "" : createForm.deviceId })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onsite">{t.mode.onsite}</SelectItem>
                  <SelectItem value="remote">{t.mode.remote}</SelectItem>
                  <SelectItem value="office">{t.mode.office}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{createForm.serviceMode === "onsite" ? t.dialogs.serviceTypeLabel : t.dialogs.timesheetCategoryLabel}</Label>
              {createForm.serviceMode === "onsite" ? (
                <Select value={createForm.serviceType} onValueChange={(v) => setCreateForm({ ...createForm, serviceType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="install">{t.type.install}</SelectItem>
                    <SelectItem value="repair">{t.type.repair}</SelectItem>
                    <SelectItem value="maintain">{t.type.maintain}</SelectItem>
                    <SelectItem value="inspect">{t.type.inspect}</SelectItem>
                    <SelectItem value="training">{t.type.training}</SelectItem>
                    <SelectItem value="other">{t.type.other}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={createForm.timesheetCategory} onChange={(e) => setCreateForm({ ...createForm, timesheetCategory: e.target.value })} placeholder={createForm.serviceMode === "remote" ? t.dialogs.timesheetRemotePlaceholder : t.dialogs.timesheetOfficePlaceholder} />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>{t.dialogs.priorityLabel}</Label>
                <HelpTooltip label={t.priority.help} />
              </div>
              <Select value={createForm.priority} onValueChange={(v) => setCreateForm({ ...createForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t.priority.low}</SelectItem>
                  <SelectItem value="normal">{t.priority.normal}</SelectItem>
                  <SelectItem value="high">{t.priority.high}</SelectItem>
                  <SelectItem value="urgent">{t.priority.urgent}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.dialogs.assignEngineer}</Label>
              <Select value={createForm.engineerId} onValueChange={(v) => setCreateForm({ ...createForm, engineerId: v })}>
                <SelectTrigger><SelectValue placeholder={t.dialogs.noAssign} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.dialogs.noAssign}</SelectItem>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={String(engineer.id)}>
                      {engineer.realName || engineer.username || fill(t.dialogs.engineerFallback, { id: engineer.id })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.dialogs.plannedStart}</Label>
              <Input type="datetime-local" value={createForm.plannedStartAt} onChange={(e) => setCreateForm({ ...createForm, plannedStartAt: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t.dialogs.plannedEnd}</Label>
              <Input type="datetime-local" value={createForm.plannedEndAt} onChange={(e) => setCreateForm({ ...createForm, plannedEndAt: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t.dialogs.issueDescription} *</Label>
              <Textarea value={createForm.issueDescription} onChange={(e) => setCreateForm({ ...createForm, issueDescription: e.target.value })} rows={3} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t.dialogs.internalNote}</Label>
              <Textarea value={createForm.internalNote} onChange={(e) => setCreateForm({ ...createForm, internalNote: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t.dialogs.attachments}</Label>
              <Input
                type="file"
                multiple
                accept={ORDER_ATTACHMENT_ACCEPT}
                onChange={(event) => setCreateFiles(Array.from(event.target.files || []))}
              />
              <p className="text-xs text-muted-foreground">{t.dialogs.createAttachmentNote}{t.attachment.hint}</p>
              {createFiles.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  {createFiles.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="truncate">{file.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>{t.actions.cancel}</Button>
            <Button onClick={createOrder} disabled={saving}>
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Plus className="w-4 h-4 mr-2" />}
              {saving ? t.dialogs.creating : t.dialogs.createSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t.actions.assign}</DialogTitle>
            <DialogDescription>{t.dialogs.assignDesc}</DialogDescription>
          </DialogHeader>
          {error && assignOpen ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          <div className="min-h-0 space-y-4 overflow-y-auto py-2 pr-1">
            <div className="space-y-2">
              <Label>{t.dialogs.engineerLabel} *</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
                {engineers.map((engineer) => {
                  const checked = assignForm.engineerIds.includes(String(engineer.id));
                  return (
                    <label key={engineer.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleAssignEngineer(engineer.id, Boolean(value))}
                      />
                      <span>{engineer.realName || engineer.username || fill(t.dialogs.engineerFallback, { id: engineer.id })}</span>
                      {checked && assignForm.engineerIds[0] === String(engineer.id) && (
                        <Badge variant="secondary">{t.dialogs.primaryBadge}</Badge>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t.dialogs.assignMultiHint}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.dialogs.plannedStart}</Label>
                <Input type="datetime-local" value={assignForm.plannedStartAt} onChange={(e) => setAssignForm({ ...assignForm, plannedStartAt: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t.dialogs.plannedEnd}</Label>
                <Input type="datetime-local" value={assignForm.plannedEndAt} onChange={(e) => setAssignForm({ ...assignForm, plannedEndAt: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.dialogs.assignNote}</Label>
              <Textarea value={assignForm.note} onChange={(e) => setAssignForm({ ...assignForm, note: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t.dialogs.attachments}</Label>
              <Input
                type="file"
                multiple
                accept={ORDER_ATTACHMENT_ACCEPT}
                onChange={(event) => setAssignFiles(Array.from(event.target.files || []))}
              />
              <p className="text-xs text-muted-foreground">{t.dialogs.assignAttachmentNote}{t.attachment.hint}</p>
              {assignFiles.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  {assignFiles.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="truncate">{file.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background pt-4">
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={saving}>{t.actions.cancel}</Button>
            <Button onClick={assignOrderToEngineer} disabled={saving}>
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <Send className="w-4 h-4 mr-2" />}
              {saving ? t.dialogs.assigning : t.dialogs.assignSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              {t.deleteFlow.title}
            </DialogTitle>
            <DialogDescription>
              {t.deleteFlow.desc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-700">
              {t.deleteFlow.confirmHint}
            </div>
            {deletePreviewLoading ? (
              <div className="rounded-lg border bg-slate-50 p-3 text-muted-foreground">
                <span className="btn-loader mr-2" aria-hidden="true" />
                {t.deleteFlow.loading}
              </div>
            ) : deletePreviewError ? (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-600">
                {deletePreviewError}
              </div>
            ) : deletePreviewOrders.length ? (() => {
              const summary = orderDeleteImpactSummary(deletePreviewOrders);
              const summaryItems: Array<[string, number]> = [
                [t.deleteFlow.sumReports, summary.reports],
                [t.deleteFlow.sumParts, summary.parts],
                [t.deleteFlow.sumFiles, summary.files],
                [t.deleteFlow.sumTargetDevices, summary.targetDevices],
                [t.deleteFlow.sumInstalledDelete, summary.installedDevicesToDelete],
                [t.deleteFlow.sumInstalledKeep, summary.installedDevicesToKeep],
                [t.deleteFlow.sumSignatures, summary.signatureRequests],
                [t.deleteFlow.sumDrafts, summary.drafts],
              ];
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {summaryItems.map(([label, count]) => (
                      <div key={label} className="rounded-md border bg-white px-3 py-2">
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="text-base font-semibold text-slate-900">{count}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {deletePreviewOrders.map((order) => {
                      const sections = orderDeleteImpactSections(order, t.deleteFlow);
                      return (
                        <details key={`delete-preview-${order.id}`} className="rounded-lg border bg-white" open={deletePreviewOrders.length === 1}>
                          <summary className="cursor-pointer px-3 py-2 font-medium">
                            {displayId(order)} · {textValue(order.customerName)}
                          </summary>
                          <div className="space-y-3 px-3 pb-3">
                            {sections.map((section) => (
                              <div key={`${order.id}-${section.key}`} className="rounded-md bg-slate-50 px-3 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-medium text-slate-900">{section.title}</div>
                                  <Badge variant="secondary">{section.count}</Badge>
                                </div>
                                {section.description ? (
                                  <div className="mt-1 text-xs text-muted-foreground">{section.description}</div>
                                ) : null}
                                <div className="mt-2 space-y-1.5">
                                  {section.items.map((item, index) => (
                                    <div key={`${section.key}-${index}`} className="rounded bg-white px-2 py-1.5 text-xs leading-5 text-slate-700">
                                      {item}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              );
            })() : (
              <div className="rounded-lg border bg-slate-50 p-3 text-muted-foreground">
                {t.deleteFlow.empty}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog} disabled={saving}>{t.actions.cancel}</Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteOrders}
              disabled={saving || deletePreviewLoading || Boolean(deletePreviewError) || !deletePreviewOrders.length}
            >
              {saving ? <span className="btn-loader" aria-hidden="true" /> : <Trash2 className="h-4 w-4" />}
              {saving ? t.deleteFlow.deleting : fill(t.deleteFlow.confirmDelete, { count: deletePreviewOrders.length || selectedIds.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t.dialogs.transitionTitle}</DialogTitle>
            <DialogDescription>{t.dialogs.transitionDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t.dialogs.targetStatus}</Label>
              <Select value={transitionForm.status} onValueChange={(v) => setTransitionForm({ ...transitionForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t.status.draft}</SelectItem>
                  <SelectItem value="assigned">{t.status.assigned}</SelectItem>
                  <SelectItem value="in_progress">{t.status.in_progress}</SelectItem>
                  <SelectItem value="awaiting_customer_signature">{t.status.awaiting_customer_signature}</SelectItem>
                  <SelectItem value="submitted">{t.status.submitted}</SelectItem>
                  <SelectItem value="approved">{t.status.approved}</SelectItem>
                  <SelectItem value="archived">{t.status.archived}</SelectItem>
                  <SelectItem value="cancelled">{t.status.cancelled}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.dialogs.transitionReason}</Label>
              <Textarea value={transitionForm.reason} onChange={(e) => setTransitionForm({ ...transitionForm, reason: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionOpen(false)} disabled={saving}>{t.actions.cancel}</Button>
            <Button onClick={transitionSelectedOrder} disabled={saving}>
              {saving ? <span className="btn-loader mr-2" aria-hidden="true" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {saving ? t.dialogs.transitioning : t.dialogs.transitionSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
