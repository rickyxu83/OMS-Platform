import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, Loader2, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/lib/markdown";
import { api } from "@/services/api";

interface CustomerSignatureItem {
  orderNo?: string;
  customerName?: string;
  contactName?: string;
  serviceMode?: string;
  serviceType?: string;
  issueDescription?: string;
  expiresAt?: string;
  signed?: boolean;
  engineers?: Array<{ realName?: string; name?: string; username?: string }>;
  report?: {
    actualStartAt?: string;
    actualEndAt?: string;
    workContent?: string;
    result?: string;
    resultDescription?: string;
  };
}

function formatDateTime(value?: string) {
  return String(value || "").replace("T", " ").slice(0, 16) || "-";
}

function serviceModeLabel(value?: string) {
  if (value === "remote") return "远程服务";
  if (value === "office") return "内勤";
  return "现场服务";
}

function serviceTypeLabel(value?: string) {
  return {
    install: "安装",
    repair: "排障",
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

function SignatureCapture({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#111827";
    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = value;
    }
  }, [value]);

  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);
    return () => window.removeEventListener("resize", setupCanvas);
  }, [setupCanvas]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function begin(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const context = canvasRef.current?.getContext("2d");
    const last = lastPointRef.current;
    const next = point(event);
    if (!context || !last) return;
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastPointRef.current = next;
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onChange(canvasRef.current?.toDataURL("image/png") || "");
  }

  function clear() {
    onChange("");
    window.requestAnimationFrame(setupCanvas);
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-dashed bg-white">
        <canvas
          ref={canvasRef}
          className="block h-56 w-full touch-none"
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {!value ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-medium text-slate-400">
            请在此处手写签名
          </div>
        ) : null}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={clear}>
        <RotateCcw className="h-4 w-4" />
        清除签名
      </Button>
    </div>
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "签名提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-5 text-foreground">
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <header className="space-y-1 py-2">
          <div className="text-sm font-semibold text-muted-foreground">OMS Platform 运维智管</div>
          <h1 className="text-3xl font-semibold tracking-normal">客户服务确认函</h1>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取确认函…
          </div>
        ) : error && !item ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
        ) : item ? (
          <>
            {item.signed ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-700">
                <CheckCircle className="h-4 w-4" />
                {message || "该服务记录已完成客户签署。"}
              </div>
            ) : null}
            <section className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Case ID</div>
                <div className="mt-1 break-all font-semibold">{item.orderNo || "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">客户</div>
                <div className="mt-1 font-semibold">{item.customerName || "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">联系人</div>
                <div className="mt-1 font-semibold">{item.contactName || "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">服务类型</div>
                <div className="mt-1 font-semibold">{serviceModeLabel(item.serviceMode)} / {serviceTypeLabel(item.serviceType)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">服务时间</div>
                <div className="mt-1 font-semibold">{formatDateTime(item.report?.actualStartAt)} 至 {formatDateTime(item.report?.actualEndAt)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">有效期</div>
                <div className="mt-1 font-semibold">{formatDateTime(item.expiresAt)}</div>
              </div>
            </section>

            <section className="grid gap-4 rounded-lg border bg-background p-4">
              <div>
                <div className="text-xs font-medium text-muted-foreground">问题 / 事项</div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.issueDescription || "-"}</p>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">处理记录</div>
                {item.report?.workContent ? (
                  <MarkdownContent content={item.report.workContent} className="mt-1" />
                ) : (
                  <p className="mt-1 text-sm leading-6">-</p>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">服务结论</div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                  {resultLabel(item.report?.result)}{item.report?.resultDescription ? `：${item.report.resultDescription}` : ""}
                </p>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">服务工程师</div>
                <p className="mt-1 text-sm leading-6">{item.engineers?.map((engineer) => engineer.realName || engineer.name || engineer.username).filter(Boolean).join("、") || "-"}</p>
              </div>
            </section>

            {!item.signed ? (
              <section className="grid gap-4 rounded-lg border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">签字确认</div>
                    <div className="text-sm text-muted-foreground">请确认以上服务内容后签署。</div>
                  </div>
                  <Badge variant="outline">客户签署</Badge>
                </div>
                <label className="grid gap-2">
                  <span className="text-sm font-medium">签署人</span>
                  <Input value={signerName} onChange={(event) => setSignerName(event.target.value)} placeholder="请输入签署人姓名" />
                </label>
                <SignatureCapture value={signature} onChange={setSignature} />
                {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setSignature("")}>
                    <Trash2 className="h-4 w-4" />
                    清除
                  </Button>
                  <Button type="button" onClick={submitSignature} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                    {submitting ? "提交中" : "确认签署"}
                  </Button>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
