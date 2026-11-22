import { AlwaysOnResult } from "./always-on-result";
import { alwaysOnErrorText } from "./always-on-error";
import { useEffect, useState } from "react";
import type { AlwaysOnOverview } from "@get3w/types/workspace";
import type { Get3wServerClient } from "../../../app/lib/get3w-server";
import { ArrowLeft, ArrowUpRight, Check, Clock3, SlidersHorizontal, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "../../../i18n";

function summaryText(value: string) {
  return value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*`#]/g, "").replace(/\s+/g, " ").trim();
}

export function AlwaysOnOverviewPage({ client, workspaceId, onOpenSettings, onClose, onOpenSession }: { client: Pick<Get3wServerClient, "alwaysOnOverview" | "reviewAlwaysOnResult"> | null; workspaceId: string; onOpenSettings: () => void; onClose: () => void; onOpenSession: (sessionId: string, messageId: string) => void }) {
  const [data, setData] = useState<AlwaysOnOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    let fetching = false;
    setData(null); setError(null);
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        if (!client) throw new Error(t("workspace.settings_unavailable"));
        const result = await client.alwaysOnOverview(workspaceId, offset);
        if (active) { setData(result); setError(null); }
      } catch (error) { if (active) setError(alwaysOnErrorText(error)); }
      finally { fetching = false; }
    }
    void load(); const timer = setInterval(() => void load(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [client, workspaceId, offset, refresh]);
  const status = data?.status;
  const currentLabel = status ? t(`workspace.${status.paused ? "paused" : status.event?.phase === "done" && status.event.verification?.status === "needs_review" ? "result.blocked" : status.retryAt ? "retrying" : status.phase}`) : "";
  const statusColor = error || !status ? "text-muted-foreground"
    : status.paused ? "text-amber-500"
    : status.retryAt ? "text-amber-500"
    : status.phase === "running" ? "text-emerald-500"
    : status.phase === "queued" ? "text-blue-500"
    : status.phase === "waiting" ? "text-violet-500"
    : status.phase === "error" || status.phase === "interrupted" ? "text-destructive"
    : "text-muted-foreground";
  const nextTime = status && !status.paused ? status.retryAt ?? status.nextRunAt : null;
  const runs = data?.runs ?? [];
  const progressRows = [
    { key: "active", value: data?.progress?.active ?? 0, color: "text-blue-500" },
    { key: "waiting", value: data?.progress?.waiting ?? 0, color: "text-amber-500" },
    { key: "completed", value: data?.progress?.completed ?? 0, color: "text-emerald-500" },
    { key: "paused", value: data?.progress?.paused ?? 0, color: "text-muted-foreground" },
    { key: "failed", value: data?.progress?.failed ?? 0, color: "text-red-500" },
  ];
  return <section className="mx-auto w-full max-w-4xl space-y-8 px-5 py-6 sm:px-8" aria-label={t("workspace.menu_overview")}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span />
      <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-4" />{t("workspace.overview.back")}</Button>
    </div>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{error}<Button size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>{t("workspace.overview.reload")}</Button></div> : null}
    {!data && !error ? <p role="status" className="text-sm text-muted-foreground">{t("workspace.overview.loading")}</p> : null}
    {status ? <>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Target className="size-4" />{t("workspace.goal")}</h2><Button variant="outline" size="sm" onClick={onOpenSettings}><SlidersHorizontal className="size-4" />{t("workspace.overview.edit")}</Button></div>
      <p className="max-w-2xl whitespace-pre-wrap break-words text-xl font-medium leading-relaxed">{status.settings.goal}</p>
    </div>
    <div className="grid gap-6 border-y border-border py-5 sm:grid-cols-3">
      <div className="space-y-2"><p className="text-xs text-muted-foreground">{t("workspace.overview.status")}</p><p className={`flex items-center gap-2 text-sm font-medium ${statusColor}`}><span className="size-2 rounded-full bg-current" />{error ? t("workspace.unverified") : currentLabel}</p></div>
      <div className="space-y-2"><p className="text-xs text-muted-foreground">{t(status.retryAt ? "workspace.next_retry" : "workspace.next_check")}</p><p className="flex items-center gap-2 text-sm font-medium"><Clock3 className="size-4 text-muted-foreground" />{nextTime ? new Date(nextTime).toLocaleString() : "—"}<span className="text-xs font-normal text-muted-foreground">{status.settings.intervalMinutes} {t("workspace.minutes")}</span></p></div>
      <div className="space-y-2"><p className="text-xs text-muted-foreground">{t("workspace.overview.latest")}</p><p className="line-clamp-2 text-sm font-medium">{summaryText(runs.find(run => run.finishedAt)?.summary ?? "") || t("workspace.overview.noResult")}</p></div>
    </div>
    <section aria-label={t("workspace.overview.progress")} className="rounded-xl border border-border p-5">
      <h2 className="text-sm font-medium">{t("workspace.overview.progress")}</h2>
      <div className="mt-5 flex flex-wrap items-center gap-8">
        <div className="relative size-40 shrink-0">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={`${t("workspace.overview.total")}: ${data?.progress?.total ?? 0}`}>
            <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" className="text-muted" strokeWidth="12" />
            {(() => { let offset = 0; return progressRows.map(row => { const length = (data?.progress?.total ? row.value / data.progress.total : 0) * 289.027; const segment = <circle key={row.key} cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="12" className={row.color} strokeDasharray={`${length} ${289.027 - length}`} strokeDashoffset={-offset} />; offset += length; return segment; }); })()}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-3xl tabular-nums">{data?.progress?.total ?? 0}</strong><span className="mt-1 text-xs text-muted-foreground">{t("workspace.overview.total")}</span></div>
        </div>
        <ul className="grid min-w-40 flex-1 grid-cols-2 gap-x-8 gap-y-4">{progressRows.map(row => <li key={row.key} className="flex items-center gap-2 text-sm"><span className={`size-2 rounded-full bg-current ${row.color}`} /><span className="text-muted-foreground">{t(`workspace.overview.chart_${row.key}`)}</span><strong className="ml-auto tabular-nums">{row.value}</strong></li>)}</ul>
      </div>
    </section>
    <div><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium">{t("workspace.overview.runs")}</h2><span className="text-xs text-muted-foreground">{t("workspace.overview.newest")}</span></div>
      {runs.length === 0 ? <p className="py-8 text-sm text-muted-foreground">{t("workspace.overview.empty")}</p> : null}
      <ol className="divide-y divide-border">{runs.map(run => <li key={run.id} className="flex flex-wrap items-start gap-3 py-4"><time className="w-20 shrink-0 sm:w-28 pt-0.5 text-xs tabular-nums text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</time>{run.phase === "done" ? <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : run.phase === "error" ? <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" /> : <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}<div className="min-w-0 flex-1"><p className="text-sm font-medium">{t(`workspace.overview.phase_${run.phase}`)}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{summaryText(run.summary) || t(`workspace.overview.trigger_${run.kind}`)}</p><AlwaysOnResult run={run} client={client} workspaceId={workspaceId} canReview={status.event?.id === run.id} onUpdated={() => setRefresh(value => value + 1)} /></div><Button size="sm" variant="ghost" disabled={!run.sessionId} onClick={() => { if (run.sessionId) onOpenSession(run.sessionId, run.messageId); }}><ArrowUpRight className="size-4" />{t("workspace.overview.chat")}</Button></li>)}</ol>
      {data?.unreadableCount ? <p role="status" className="text-xs text-destructive">{t("workspace.overview.unreadable")} ({data.unreadableCount})</p> : null}
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>{t("workspace.overview.previous")}</Button><Button variant="outline" size="sm" disabled={data?.nextOffset == null} onClick={() => { if (data?.nextOffset != null) setOffset(data.nextOffset); }}>{t("workspace.overview.next")}</Button></div>
    </div>
    {status.lastError ? <p className="break-words text-sm text-destructive">{alwaysOnErrorText(status.lastError)}</p> : null}
    </> : null}
  </section>;
}
