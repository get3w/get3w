import { t, useLocale } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { resolveExtensionIconSrc } from "@/react-app/design-system/extension-icon-src";
import { Button } from "@/components/ui/button";
import { settingsErrorMessage } from "./get3w-settings-policy";
import type { ConnectorProvider, ConnectorSnapshot } from "./get3w-account";

const names = {google:"Google Drive",microsoft:"Microsoft OneDrive"};
export function Get3wConnectors({userId}:{userId:string}) {
  useLocale();
  const [snapshot,setSnapshot] = useState<ConnectorSnapshot|null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [failed,setFailed] = useState(false);
  const [confirmed,setConfirmed] = useState<string|null>(null);
  const generation = useRef(0);
  useEffect(()=>{generation.current++;setSnapshot(null);setConfirmed(null);setMessage("");setBusy(false);return()=>{generation.current++;};},[userId]);
  async function run(action:"status"|"authorize"|"disconnect",provider?:ConnectorProvider) {
    const bridge=window.__GET3W_ACCOUNT__;if(!bridge)return;
    const current=generation.current;
    setBusy(true);setMessage("");setFailed(false);
    try {
      if(action === "status") {
        const next=await bridge.connectors({userId,action});
        if(current!==generation.current)return;
        setSnapshot(next);setConfirmed(new Date().toLocaleTimeString());
      } else if(provider) {
        await bridge.connectors({userId,action,provider});
        if(current!==generation.current)return;
        if(action === "authorize") setMessage(t("ui.a6043402f437"));
        else {
          setSnapshot(previous=>previous?{connectors:previous.connectors.map(row=>row.provider===provider?{...row,connected:false}:row)}:null);
          setMessage(t("ui.aacbb0799dc8"));
        }
      }
    } catch(error) {if(current===generation.current){setFailed(true);setMessage(settingsErrorMessage(error));}}
    finally {if(current===generation.current)setBusy(false);}
  }
  return <details className="border-t pt-3">
    <summary className="cursor-pointer text-sm">{t("ui.dc273117482b")}</summary>
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{failed?t("ui.85f8736a4c4b"):confirmed?t("personal.connections.verified",{time:confirmed}):t("ui.018b0356e3c0")}</span>
        <Button variant="outline" disabled={busy} onClick={()=>void run("status")}>{t("ui.a1089053c1f7")}</Button>
      </div>
      {(["google","microsoft"] satisfies ConnectorProvider[]).map(provider=>{
        const row=snapshot?.connectors.find(item=>item.provider===provider);
        return <div key={provider} className="flex items-center justify-between gap-3 border-b py-2 text-sm">
          <span className="flex items-center gap-2"><img className="size-4" alt="" src={resolveExtensionIconSrc(provider==="google"?"/ext-google-workspace.svg":"/ext-microsoft-365.svg")}/>{names[provider]}</span>
          <span className="text-muted-foreground">{row?.connected?t("ui.22965568d22a"):row&&!row.configured?t("ui.42e6f9672a1f"):row?t("ui.0303e1824670"):t("ui.151339072593")}</span>
          <Button variant="outline" disabled={busy||!row||(!row.connected&&(!row.configured||failed))} onClick={()=>void run(row?.connected?"disconnect":"authorize",provider)}>{row?.connected?t("ui.acfc5be785a9"):t("ui.1a2303ede074")}</Button>
        </div>;
      })}
      <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">{t("ui.9dd109ed0351")}</summary>
        <p className="pt-2">{t("ui.1101e1156be3")}</p>
      </details>
      {message?<p className="text-sm text-muted-foreground" role={failed?"alert":"status"}>{message}</p>:null}
    </div>
  </details>;
}
