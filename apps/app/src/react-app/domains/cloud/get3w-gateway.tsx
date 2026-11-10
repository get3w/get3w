import { t, useLocale } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWorkspaceMaybe } from "@/react-app/shell/workspace-provider";
import { settingsErrorMessage } from "./get3w-settings-policy";

export function Get3wGateway({userId,sessionId,workspaceId:explicitWorkspaceId}:{userId:string;sessionId?:string;workspaceId?:string}) {
  useLocale();
  const workspace=useWorkspaceMaybe();
  const workspaceId=explicitWorkspaceId || workspace?.workspaceId;
  return <GatewayConnection key={`${userId}:${workspaceId??"none"}:${sessionId??""}`} userId={userId} sessionId={sessionId} workspaceId={workspaceId}/>;
}

function GatewayConnection({userId,sessionId,workspaceId}:{userId:string;sessionId?:string;workspaceId?:string}) {
  const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const active=useRef(true);
  async function run(action:"status"|"enable"|"disable") {
    const bridge=window.__GET3W_ACCOUNT__;if(!bridge||!workspaceId)return;
    setBusy(true);setError(null);
    try {
      const next=await bridge.managedMcp({userId,workspaceId,...(sessionId ? {sessionId} : {}),action});
      if(active.current)setEnabled(next.enabled);
    }catch(e){if(active.current)setError(settingsErrorMessage(e));}
    finally{if(active.current)setBusy(false);}
  }
  useEffect(()=>{active.current=true;void run("status");return()=>{active.current=false;};},[userId,workspaceId,sessionId]);
  return <div className="space-y-2 border-t pt-3">
    <div className="flex items-center justify-between gap-3"><span className="text-sm">{t("ui.06faeb0780a2")}</span>
      <Button variant="outline" disabled={busy||!workspaceId} onClick={()=>void run(enabled?"disable":"enable")}>{enabled?t("ui.f13500dbdd80"):t("ui.3dbaf78b6b8a")}</Button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{error??(!workspaceId?t("ui.362f928a8f09"):enabled?t("ui.0a3aa1917150"):t("ui.9e3264c23ab2"))}</p>
    {error?<Button variant="ghost" disabled={busy} onClick={()=>void run("status")}>{t("ui.be5dff52eeb0")}</Button>:null}
  </div>;
}
