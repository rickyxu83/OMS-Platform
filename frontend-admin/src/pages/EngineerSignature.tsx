import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignatureCapture } from "@/components/SignatureCapture";
import { api } from "@/services/api";

interface EngineerSignatureItem {
  realName?: string;
  username?: string;
  signed?: boolean;
  signedAt?: string;
  expiresAt?: string;
}

function formatDateTime(value?: string) {
  return String(value || "").replace("T", " ").slice(0, 16) || "-";
}

export function EngineerSignature() {
  const { token = "" } = useParams();
  const [item, setItem] = useState<EngineerSignatureItem | null>(null);
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
        const data = await api.get(`/user-signature/${encodeURIComponent(token)}`);
        if (cancelled) return;
        setItem((data?.item || null) as EngineerSignatureItem | null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "签名链接无法打开");
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
      const data = await api.post(`/user-signature/${encodeURIComponent(token)}`, { signature });
      setItem((current) => current
        ? { ...current, signed: true, signedAt: String(data?.signedAt || "") }
        : current);
      setMessage("签名已保存，感谢确认。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "签名提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const signerName = item?.realName || item?.username || "";

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-5 text-foreground">
      <div className="mx-auto grid w-full max-w-xl gap-4">
        <header className="space-y-1 py-2">
          <div className="text-sm font-semibold text-muted-foreground">OMS Platform 运维智管</div>
          <h1 className="text-3xl font-semibold tracking-normal">工程师签名</h1>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取签名信息…
          </div>
        ) : error && !item ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
        ) : item ? (
          <>
            {item.signed ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-700">
                <CheckCircle className="h-4 w-4 shrink-0" />
                {message || `已于 ${formatDateTime(item.signedAt)} 完成签名，如不满意可在有效期内重新签署。`}
              </div>
            ) : null}

            <section className="grid gap-3 rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">正在为 {signerName || "本人"} 设置系统签名</div>
                  <div className="mt-1 text-sm text-muted-foreground">确认无误后，在下方手写签署。本次签名将作为该账号在系统中的电子签名，提交后立即生效。</div>
                </div>
                <Badge variant="outline">工程师签署</Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md border bg-slate-50 px-2 py-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  无需登录，链接有效期至 {formatDateTime(item.expiresAt)}
                </span>
              </div>
            </section>

            <section className="grid gap-4 rounded-lg border bg-background p-4">
              <SignatureCapture value={signature} onChange={setSignature} />
              {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
              <div className="flex justify-end">
                <Button type="button" onClick={submitSignature} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                  {submitting ? "提交中" : item.signed ? "重新签署" : "确认签署"}
                </Button>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
