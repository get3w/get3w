import type { AlwaysOnRun } from "@get3w/types/workspace";
import type { Get3wServerClient } from "@/app/lib/get3w-server";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "../../../i18n";
import { alwaysOnErrorText } from "./always-on-error";

export function AlwaysOnResult({ run, client, workspaceId, canReview, onUpdated }: {
  run: AlwaysOnRun; client: Pick<Get3wServerClient, "reviewAlwaysOnResult"> | null;
  workspaceId: string; canReview: boolean; onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const verification = run.verification;
  if (run.phase !== "done" && !(run.phase === "interrupted" && verification?.status === "needs_review")) return null;
  async function review(action: "verify" | "repair") {
    if (!client || busy) return; setBusy(true); setError("");
    try { await client.reviewAlwaysOnResult(workspaceId, run.id, action); onUpdated(); }
    catch (error) { setError(alwaysOnErrorText(error)); }
    finally { setBusy(false); }
  }
  return <div className="mt-2 space-y-2 text-xs">
    <p className={verification?.status === "needs_review" ? "text-amber-600" : "text-muted-foreground"}>{t(`workspace.result.${verification?.status ?? "legacy"}`)}</p>
    {verification ? <details className="text-muted-foreground"><summary className="cursor-pointer">{t("workspace.result.evidence")}</summary><div className="mt-2 space-y-2">
      {verification.outcome ? <p>{t(`workspace.result.${verification.outcome}`)}</p> : null}
      {verification.issues.map(issue => <p key={issue}>{t(`workspace.result.${issue}`)}</p>)}
      {verification.artifacts?.map(path => <p key={path} className="break-all">{path}</p>)}
      <time>{new Date(verification.checkedAt).toLocaleString()}</time>
      <p>{t("workspace.result.scope")}</p>
    </div></details> : null}
    {verification?.status === "needs_review" && canReview ? <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy || !client} onClick={() => void review("verify")}>{t("workspace.result.verify")}</Button>
      <Button size="sm" variant="outline" disabled={busy || !client} onClick={() => void review("repair")}>{t("workspace.result.repair")}</Button>
    </div> : null}
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
  </div>;
}
