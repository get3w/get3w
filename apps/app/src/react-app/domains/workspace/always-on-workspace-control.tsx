import { alwaysOnErrorText } from "./always-on-error";
import { useEffect, useRef, useState } from "react";
import { Clock3, Pause, Play } from "lucide-react";
import type { AlwaysOnStatus } from "@get3w/types/workspace";
import { Get3wServerError } from "@/app/lib/get3w-server";
import { Button } from "@/components/ui/button";
import { useWorkspaceMaybe } from "../../shell/workspace-provider";
import { t } from "../../../i18n";

export function AlwaysOnWorkspaceControl({ workspaceId, onStatus, onOpenAttention }: { workspaceId: string; onOpenAttention?: () => void; onStatus?: (status: AlwaysOnStatus) => void }) {
  const client = useWorkspaceMaybe()?.get3wServerClient;
  const [status, setStatus] = useState<AlwaysOnStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<"data_missing" | "data_invalid" | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  function reportError(error: unknown) {
    setError(alwaysOnErrorText(error));
    setDataError(error instanceof Get3wServerError && error.code === "always_on_state_missing" ? "data_missing"
      : error instanceof Get3wServerError && error.code === "always_on_state_invalid" ? "data_invalid" : null);
  }
  useEffect(() => {
    let current = true;
    revision.current++;
    setStatus(null); setError(null); setDataError(null); setBusy(false);
    const refresh = async () => {
      if (!client) return;
      const started = revision.current;
      try { const result = await client.alwaysOnStatus(workspaceId); if (current && started === revision.current) { setStatus(result); onStatus?.(result); setError(null); setDataError(null); } }
      catch (error) { if (current && started === revision.current) reportError(error); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 3000);
    return () => { current = false; revision.current++; clearInterval(timer); };
  }, [client, workspaceId, onStatus]);
  async function control(action: "pause" | "resume" | "run") {
    if (!client || busy) return;
    const started = ++revision.current;
    setBusy(true);
    try { const result = await client.controlAlwaysOn(workspaceId, action); if (started === revision.current) { setStatus(result); onStatus?.(result); setError(null); setDataError(null); } }
    catch (error) { if (started === revision.current) reportError(error); }
    finally { if (started === revision.current) setBusy(false); }
  }
  return <section aria-label={t("workspace.always_on")} className="mx-2 my-2 space-y-2 border-y border-border py-3 text-sm">
    <div className="flex items-center gap-2"><Clock3 className="size-4 shrink-0"/><span className="font-medium">{t("workspace.always_on")}</span><span role="status" className="ml-auto text-xs text-muted-foreground">{t(`workspace.${dataError ?? (error || !status ? "unverified" : status.paused ? "paused" : (status.event?.phase === "done" || status.event?.phase === "interrupted") && status.event.verification?.status === "needs_review" ? "result.blocked" : status.retryAt || (status.phase === "error" && status.nextRunAt) ? "retrying" : status.phase)}`)}</span></div>
    {status ? <>
      <p className="line-clamp-3 break-words" title={status.settings.goal}>{status.settings.goal}</p>
      {(status.retryAt || status.nextRunAt) && !status.paused ? <p className="text-xs text-muted-foreground">{t(status.retryAt || status.phase === "error" ? "workspace.next_retry" : "workspace.next_check")} {new Date(status.retryAt || status.nextRunAt || 0).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p> : null}
        <Button className="w-full" size="sm" variant={status.paused ? "default" : "secondary"} disabled={busy || Boolean(error)} title={t("workspace.pause_scope")} onClick={() => void control(status.paused ? "resume" : "pause")}>
          {status.paused ? <Play className="size-4"/> : <Pause className="size-4"/>}{t(status.paused ? "workspace.resume" : "workspace.pause")}
        </Button>
      {!status.paused && status.phase === "idle" && !status.retryAt && (!status.event || status.event.phase === "done") && status.event?.verification?.status !== "needs_review" ? <Button className="w-full" size="sm" variant="outline" disabled={busy || Boolean(error)} onClick={() => void control("run")}><Play className="size-4" />{t("workspace.run_now")}</Button> : null}
      {!status.paused && ["error", "interrupted"].includes(status.phase) && !status.nextRunAt && !status.retryAt && status.event?.verification?.status !== "needs_review" ? <Button className="w-full" size="sm" disabled={busy || Boolean(error)} onClick={() => void control("run")}><Play className="size-4" />{t("workspace.continue_run")}</Button> : null}
      {(status.event?.phase === "done" || status.event?.phase === "interrupted") && status.event.verification?.status === "needs_review" && onOpenAttention ? <Button className="w-full" size="sm" variant="outline" onClick={onOpenAttention}>{t("workspace.menu_attention")}</Button> : null}
      {status.lastError ? <p className="break-words text-xs text-destructive">{status.lastErrorCode === "mcp_tools_not_ready" || status.lastError.includes("This connection is saved, but its tools are not ready yet") ? t(status.retryAt ? "workspace.tools_retrying" : "workspace.tools_unavailable") : alwaysOnErrorText(status.lastError)}</p> : null}
    </> : null}
    {error ? <p role="alert" className="break-words text-xs text-destructive">{error}</p> : null}
  </section>;
}
