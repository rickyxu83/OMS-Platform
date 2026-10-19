// 客户天眼查资讯弹窗
// 展示缓存的工商资料 + 风险总览 + 舆情；查看 0 消耗，手动刷新走免费额度（risk 1 次 / full 3 次）
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TycLogo } from "@/components/TycLogo";
import { api } from "@/services/api";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

type Profile = {
  companyName?: string | null;
  creditCode?: string | null;
  legalPerson?: string | null;
  registeredCapital?: string | null;
  actualCapital?: string | null;
  foundDate?: string | null;
  businessTerm?: string | null;
  regStatus?: string | null;
  companyType?: string | null;
  industry?: string | null;
  socialStaffNum?: number | null;
  staffRange?: string | null;
  tags?: string | null;
  parentCompany?: string | null;
  regInstitute?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  businessScope?: string | null;
  profileText?: string | null;
  tycUrl?: string | null;
  risk?: { toolRisks?: { level: string; type: string; count: number }[]; warnings?: { level: string; type: string; count: number }[]; fetchedAt?: string } | null;
  changedFields?: string[];
  fetchedAt?: string | null;
};

type NewsItem = { id: number; title: string; url?: string | null; sourceName?: string | null; publishedAt?: string | null };

function Field({ label, value, highlight }: { label: string; value?: string | number | null; highlight?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={`flex gap-2 ${highlight ? "bg-amber-50 ring-1 ring-amber-200 rounded px-1 -mx-1" : ""}`}>
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

export function CustomerProfileDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
}: {
  customerId: number | null;
  customerName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<null | "risk" | "full">(null);
  const [quotaBlocked, setQuotaBlocked] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const [p, n] = await Promise.all([
        api.get(`/customers/${customerId}/profile`).catch(() => null),
        api.get(`/customers/news?customerId=${customerId}&days=90&limit=5`).catch(() => null),
      ]);
      setProfile(p?.profile || null);
      setNews(n?.items || []);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (open && customerId) {
      setQuotaBlocked(false);
      load();
    }
    if (!open) {
      setProfile(null);
      setNews([]);
    }
  }, [open, customerId, load]);

  const refresh = async (mode: "risk" | "full") => {
    if (!customerId) return;
    setRefreshing(mode);
    try {
      const res = await api.post(`/customers/${customerId}/profile/refresh`, { mode });
      toast.success(mode === "risk" ? "风险总览已刷新" : "客户资讯已全量刷新");
      if (res?.profile) {
        await load();
      }
    } catch (err: any) {
      const msg = err?.message || "刷新失败";
      if (/额度|quota/i.test(msg)) setQuotaBlocked(true);
      toast.error(msg);
    } finally {
      setRefreshing(null);
    }
  };

  const cf = new Set(profile?.changedFields || []);
  const toolRisks = profile?.risk?.toolRisks || [];
  const warnings = profile?.risk?.warnings || [];
  const hasHighRisk = toolRisks.some((r) => r.level === "高风险");
  const tagList = (profile?.tags || "").split(";").map((s) => s.trim()).filter(Boolean);
  const tycSearchUrl = profile?.tycUrl || `https://www.tianyancha.com/search?key=${encodeURIComponent(customerName || "")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TycLogo className="h-5 w-5" hasData={!!profile} />
            <span className="truncate">{customerName || "客户资讯"}</span>
          </DialogTitle>
          <DialogDescription>
            天眼查企业资讯{profile?.fetchedAt ? ` · 更新于 ${formatDate(profile.fetchedAt)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <span className="btn-loader mr-2" aria-hidden="true" />加载中…
            </div>
          ) : !profile ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              暂无缓存数据。点击下方「全量刷新」实时查询（消耗 3 次免费额度）。
            </div>
          ) : (
            <>
              {/* 风险总览 */}
              <div className={`rounded-lg border p-3 ${hasHighRisk ? "border-red-200 bg-red-50/60" : toolRisks.length ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50"}`}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {hasHighRisk ? <ShieldAlert className="h-4 w-4 text-red-600" /> : toolRisks.length ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />}
                  风险总览
                  {profile.risk?.fetchedAt ? <span className="ml-auto text-xs font-normal text-muted-foreground">{formatDate(profile.risk.fetchedAt)}</span> : null}
                </div>
                {toolRisks.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {toolRisks.map((r, i) => (
                      <Badge key={i} variant={r.level === "高风险" ? "destructive" : "secondary"} className={r.level === "高风险" ? "" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                        {r.type} × {r.count}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {profile.risk ? "暂无实质风险记录" : "尚未查询过风险，点「刷风险」获取（1 次额度）"}
                  </div>
                )}
                {warnings.length ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    预警提醒：{warnings.map((w) => `${w.type}×${w.count}`).join("、")}（多为股东工商变更，供参考）
                  </div>
                ) : null}
              </div>

              {/* 工商信息 */}
              <div className="space-y-1.5 text-sm">
                <Field label="注册名" value={profile.companyName} highlight={cf.has("company_name")} />
                <Field label="信用代码" value={profile.creditCode} />
                <Field label="法定代表人" value={profile.legalPerson} highlight={cf.has("legal_person")} />
                <Field label="注册资本" value={profile.registeredCapital} highlight={cf.has("registered_capital")} />
                <Field label="实缴资本" value={profile.actualCapital} />
                <Field label="成立日期" value={profile.foundDate} highlight={cf.has("found_date")} />
                <Field label="营业期限" value={profile.businessTerm} />
                <Field label="登记状态" value={profile.regStatus} highlight={cf.has("reg_status")} />
                <Field label="企业类型" value={profile.companyType} highlight={cf.has("company_type")} />
                <Field label="行业" value={profile.industry} highlight={cf.has("industry")} />
                <Field label="社保人数" value={profile.socialStaffNum != null ? `${profile.socialStaffNum} 人${profile.staffRange ? `（${profile.staffRange}）` : ""}` : null} highlight={cf.has("social_staff_num")} />
                <Field label="母公司/集团" value={profile.parentCompany} />
                <Field label="登记机关" value={profile.regInstitute} />
                <Field label="电话" value={profile.phone} highlight={cf.has("phone")} />
                <Field label="邮箱" value={profile.email} />
                <Field label="注册地址" value={profile.address} highlight={cf.has("address")} />
                {profile.website ? (
                  <div className="flex gap-2">
                    <span className="w-24 shrink-0 text-muted-foreground">网址</span>
                    <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{profile.website}</a>
                  </div>
                ) : null}
                {tagList.length ? (
                  <div className="flex gap-2">
                    <span className="w-24 shrink-0 text-muted-foreground">企业标签</span>
                    <span className="flex flex-wrap gap-1">
                      {tagList.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* 经营范围 */}
              {profile.businessScope ? (
                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  <span className="font-medium text-slate-700">经营范围：</span>{profile.businessScope}
                </div>
              ) : null}

              {/* 企业简介 */}
              {profile.profileText ? (
                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  <span className="font-medium text-slate-700">企业简介：</span>{profile.profileText}
                </div>
              ) : null}

              {/* 舆情 */}
              {news.length ? (
                <div>
                  <div className="mb-1.5 text-sm font-medium">近期舆情（90 天）</div>
                  <div className="space-y-1.5">
                    {news.map((n) => (
                      <div key={n.id} className="text-xs">
                        {n.url ? (
                          <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{n.title}</a>
                        ) : (
                          <span>{n.title}</span>
                        )}
                        <span className="ml-2 text-muted-foreground">{n.sourceName || ""}{n.publishedAt ? ` · ${formatDate(n.publishedAt)}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <a href={tycSearchUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1 h-3.5 w-3.5" />官网看完整信息
            </Button>
          </a>
          <div className="ml-auto flex items-center gap-2">
            {quotaBlocked ? <span className="text-xs text-amber-600">今日额度已用完</span> : null}
            <Button variant="outline" size="sm" disabled={refreshing !== null || quotaBlocked || !profile} onClick={() => refresh("risk")} title="只刷新风险总览（1 次免费额度）">
              {refreshing === "risk" ? <span className="btn-loader btn-loader-sm mr-1" aria-hidden="true" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              刷风险（1 次）
            </Button>
            <Button size="sm" disabled={refreshing !== null || quotaBlocked} onClick={() => refresh("full")} title="工商登记 + 企业简介 + 风险总览（3 次免费额度）">
              {refreshing === "full" ? <span className="btn-loader btn-loader-sm mr-1" aria-hidden="true" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              全量刷新（3 次）
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
