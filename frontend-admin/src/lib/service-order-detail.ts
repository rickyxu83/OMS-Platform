import type { ServiceOrderPartLike, WorkEntryLike } from "@/lib/service-order-detail-view";

export interface ServiceOrderReportDetail {
  departureAt?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  returnAt?: string | null;
  workContent?: string | null;
  workEntries?: WorkEntryLike[];
  result?: string | null;
  resultDescription?: string | null;
  customerConfirmName?: string | null;
  customerName?: string | null;
  customerSignatureFileId?: string | number | null;
  customerSignature?: string | null;
}

export interface ServiceOrderDetailFile {
  id: string | number;
  purpose?: string;
  originalName?: string;
  size?: number;
}

export interface ServiceOrderDetailItem {
  id: string | number;
  orderNo?: string | null;
  displayId?: string;
  displayTitle?: string;
  displayStatus?: string;
  workflowStatus?: string;
  status?: string;
  customerName?: string | null;
  customerAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  deviceName?: string | null;
  deviceModel?: string | null;
  devicePn?: string | null;
  deviceSerialNo?: string | null;
  deviceRemark?: string | null;
  serviceType?: string | null;
  serviceModules?: string[];
  serviceMode?: string | null;
  timesheetCategory?: string | null;
  timesheetSalesperson?: string | null;
  priority?: string | null;
  engineerName?: string | null;
  engineers?: Array<{ realName?: string; name?: string; username?: string }>;
  issueDescription?: string | null;
  serviceAt?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewComment?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  departureAt?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  returnAt?: string | null;
  reportedDepartureAt?: string | null;
  reportedReturnAt?: string | null;
  report?: ServiceOrderReportDetail | null;
  parts?: ServiceOrderPartLike[];
  installedDevices?: Array<{
    id?: string | number;
    name?: string;
    model?: string;
    pn?: string;
    serialNo?: string;
    remark?: string;
  }>;
  files?: ServiceOrderDetailFile[];
}

export type ApprovalOrderSnapshot = Pick<ServiceOrderDetailItem,
  | "id"
  | "orderNo"
  | "customerName"
  | "contactName"
  | "contactPhone"
  | "deviceName"
  | "serviceMode"
  | "serviceType"
  | "issueDescription"
  | "serviceAt"
  | "departureAt"
  | "actualStartAt"
  | "actualEndAt"
  | "returnAt"
  | "reportedDepartureAt"
  | "reportedReturnAt"
>;

function snapshotTime(
  snapshot: ApprovalOrderSnapshot,
  key: "departureAt" | "actualStartAt" | "actualEndAt" | "returnAt",
  fallback: string | null | undefined,
) {
  return Object.prototype.hasOwnProperty.call(snapshot, key) ? snapshot[key] : fallback;
}

export function mergeServiceOrderApprovalDetail(
  snapshot: ApprovalOrderSnapshot,
  detail: ServiceOrderDetailItem,
): ServiceOrderDetailItem & ApprovalOrderSnapshot {
  const liveReport = detail.report || {};
  return {
    ...detail,
    ...snapshot,
    report: {
      ...liveReport,
      departureAt: snapshotTime(snapshot, "departureAt", liveReport.departureAt),
      actualStartAt: snapshotTime(snapshot, "actualStartAt", liveReport.actualStartAt),
      actualEndAt: snapshotTime(snapshot, "actualEndAt", liveReport.actualEndAt),
      returnAt: snapshotTime(snapshot, "returnAt", liveReport.returnAt),
    },
  };
}
