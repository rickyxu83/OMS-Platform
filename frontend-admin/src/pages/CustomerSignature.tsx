import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, PenLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignatureCapture } from "@/components/SignatureCapture";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/lib/markdown";
import { api } from "@/services/api";
import { formatDateTime } from "@/lib/format";

interface CustomerSignatureItem {
  orderNo?: string;
  customerName?: string;
  contactName?: string;
  deviceName?: string;
  serviceMode?: string;
  serviceType?: string;
  issueDescription?: string;
  expiresAt?: string;
  signed?: boolean;
  signedAt?: string;
  engineers?: Array<{ realName?: string; name?: string; username?: string }>;
  report?: {
    actualStartAt?: string;
    actualEndAt?: string;
    workContent?: string;
    result?: string;
    resultDescription?: string;
  };
}

const COMPANY_NAME = "敦阳（宁波）科技有限公司";
const ICP_NOTICE = "浙ICP备2026045692号";
const logoSrc = `${import.meta.env.BASE_URL}dunyang-mark.png`;

function serviceModeLabel(value?: string) {
  if (value === "remote") return "远程服务";
  if (value === "office") return "内勤";
  return "现场服务";
}

function serviceTypeLabel(value?: string) {
  return {
    install: "安装",
    repair: "技术处理",
    maintain: "调优",
    inspect: "巡检",
    training: "培训",
    other: "其他",
  }[String(value || "")] || value || "-";
}

function resultLabel(value?: string) {
  return {
    resolved: "已完成",
    unresolved: "未完成",
    follow_up_required: "待跟进",
  }[String(value || "")] || value || "-";
}

function engineerNames(item: CustomerSignatureItem) {
  return item.engineers?.map((engineer) => engineer.realName || engineer.name || engineer.username).filter(Boolean).join("、") || "-";
}

/** 公函信头：品牌标识 + 公司名 + 文档标题 + 签署状态徽章 */
function Letterhead({ orderNo, signed }: { orderNo?: string; signed?: boolean }) {
  return (
    <div className="border-b bg-gradient-to-r from-primary/[0.06] to-transparent px-5 py-5 sm:px-8">
      <div className="flex items-center gap-3">
        <img
          src={logoSrc}
          alt="敦阳科技标识"
          className="h-11 w-11 rounded-xl border border-primary/15 bg-white object-contain p-1 shadow-sm"
        />
        <div className="min-w-0">
          <div title={COMPANY_NAME} className="truncate text-sm font-semibold">{COMPANY_NAME}</div>
          <div className="text-xs text-muted-foreground">OMS Platform · 运维智管</div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">客户服务确认函</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">Case ID：{orderNo || "-"}</p>
        </div>
        {signed ? (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-50 text-emerald-700">已签署</Badge>
        ) : (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-50 text-amber-700">待客户签署</Badge>
        )}
      </div>
    </div>
  );
}

/** 分区标题：编号 + 标题 + 分隔线 */
function SectionTitle({ index, title, description }: { index: string; title: string; description?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs font-bold text-primary">{index}</span>
        <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      {description ? <p className="mt-1.5 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium leading-6">{children}</dd>
    </div>
  );
}

/** 服务信息 + 服务报告只读正文，未签署与已签署视图共用 */
function DocumentSections({ item }: { item: CustomerSignatureItem }) {
  return (
    <>
      <section className="grid gap-4">
        <SectionTitle index="01" title="服务信息" />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <InfoField label="客户">{item.customerName || "-"}</InfoField>
          <InfoField label="联系人">{item.contactName || "-"}</InfoField>
          {item.deviceName ? <InfoField label="设备">{item.deviceName}</InfoField> : null}
          <InfoField label="服务方式 / 类型">{serviceModeLabel(item.serviceMode)} / {serviceTypeLabel(item.serviceType)}</InfoField>
          <InfoField label="服务时间">{formatDateTime(item.report?.actualStartAt)} 至 {formatDateTime(item.report?.actualEndAt)}</InfoField>
          <InfoField label="确认有效期">{formatDateTime(item.expiresAt)}</InfoField>
        </dl>
      </section>

      <section className="grid gap-4">
        <SectionTitle index="02" title="服务报告" />
        <div className="grid gap-4">
          <div>
            <div className="text-xs text-muted-foreground">问题 / 事项</div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.issueDescription || "-"}</p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">处理记录</div>
            {item.report?.workContent ? (
              <MarkdownContent content={item.report.workContent} className="mt-1" />
            ) : (
              <p className="mt-1 text-sm leading-6">-</p>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">服务结论</div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
              {resultLabel(item.report?.result)}{item.report?.resultDescription ? `：${item.report.resultDescription}` : ""}
            </p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">服务工程师</div>
            <p className="mt-1 text-sm leading-6">{engineerNames(item)}</p>
          </div>
        </div>
      </section>
    </>
  );
}

/** 签署完成独立视图：成功标识 + 签署时间 + 摘要，不再渲染签署表单 */
function CompletedHero({ item, message }: { item: CustomerSignatureItem; message: string }) {
  return (
    <section className="grid justify-items-center gap-3 border-b bg-emerald-500/[0.05] px-5 py-8 text-center sm:px-8">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10 ring-8 ring-emerald-500/5">
        <CheckCircle className="h-9 w-9 text-emerald-600" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold text-emerald-800">{message || "确认函已完成签署"}</h2>
      <p className="text-sm text-muted-foreground">
        {item.signedAt ? `签署时间：${formatDateTime(item.signedAt)}` : "已完成客户签署"}
        {item.contactName ? `　签署人：${item.contactName}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">工单 {item.orderNo || "-"} · {item.customerName || "-"}</p>
    </section>
  );
}

function PageFooter() {
  return (
    <footer className="mx-auto w-full max-w-2xl pb-2 pt-6 text-center text-xs text-muted-foreground">
      <p>
        © 2026 {COMPANY_NAME}
        <span className="mx-1.5 text-border">│</span>
        <a className="underline-offset-2 hover:underline" href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          {ICP_NOTICE}
        </a>
      </p>
    </footer>
  );
}

export function CustomerSignature() {
  const { token = "" } = useParams();
  const [item, setItem] = useState<CustomerSignatureItem | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api.get(`/customer-signature-requests/${encodeURIComponent(token)}`);
        if (cancelled) return;
        const nextItem = (data?.item || null) as CustomerSignatureItem | null;
        setItem(nextItem);
        setSignerName(nextItem?.contactName || "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "签署链接无法打开");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /** 静默重拉：提交成功后获取权威 signedAt，失败时保留本地 signed 状态 */
  async function refreshItem() {
    try {
      const data = await api.get(`/customer-signature-requests/${encodeURIComponent(token)}`);
      setItem((data?.item || null) as CustomerSignatureItem | null);
    } catch {
      // 忽略：本地已切换完成视图，仅缺少权威签署时间
    }
  }

  async function submitSignature() {
    if (!signature) {
      setError("请先在签名区完成手写签名");
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await api.post(`/customer-signature-requests/${encodeURIComponent(token)}`, {
        signerName,
        customerSignature: signature,
      });
      setItem((current) => current ? { ...current, signed: true } : current);
      setMessage("签署已提交，感谢确认。");
      await refreshItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : "签名提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-primary/10 via-muted/20 to-muted/40 px-4 py-6 text-foreground sm:py-10">
      <div className="mx-auto w-full max-w-2xl flex-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border bg-background p-10 text-sm text-muted-foreground shadow-xl shadow-primary/5">
            <span className="btn-loader" aria-hidden="true" />
            正在读取确认函…
          </div>
        ) : error && !item ? (
          <div className="grid justify-items-center gap-4 rounded-2xl border bg-background px-6 py-12 text-center shadow-xl shadow-primary/5">
            <img
              src={logoSrc}
              alt="敦阳科技标识"
              className="h-14 w-14 rounded-2xl border border-primary/15 bg-white object-contain p-1.5 shadow-sm"
            />
            <div className="grid gap-1.5">
              <h1 className="text-lg font-semibold">签署链接无法打开</h1>
              <p role="alert" className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground">请联系您的服务工程师重新获取签署链接。</p>
            </div>
          </div>
        ) : item ? (
          <article className="overflow-hidden rounded-2xl border bg-background shadow-xl shadow-primary/5">
            <Letterhead orderNo={item.orderNo} signed={item.signed} />
            {item.signed ? <CompletedHero item={item} message={message} /> : null}
            <div className="grid gap-8 px-5 py-6 sm:px-8 sm:py-8">
              <DocumentSections item={item} />
              {!item.signed ? (
                <section className="grid gap-4">
                  <SectionTitle index="03" title="签字确认" description="请确认以上服务内容无误后签署，提交后不可修改。" />
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">签署人</span>
                    <Input
                      value={signerName}
                      onChange={(event) => setSignerName(event.target.value)}
                      placeholder="请输入签署人姓名"
                      autoComplete="name"
                    />
                  </label>
                  <SignatureCapture value={signature} onChange={setSignature} />
                  {error ? (
                    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
                  ) : null}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => setSignature("")}>
                      <Trash2 className="h-4 w-4" />
                      清除
                    </Button>
                    <Button type="button" onClick={submitSignature} disabled={submitting}>
                      {submitting ? <span className="btn-loader" aria-hidden="true" /> : <PenLine className="h-4 w-4" />}
                      {submitting ? "提交中" : "确认签署"}
                    </Button>
                  </div>
                </section>
              ) : null}
            </div>
          </article>
        ) : null}
      </div>
      <PageFooter />
    </main>
  );
}
