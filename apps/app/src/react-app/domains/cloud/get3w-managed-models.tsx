import { t, useLocale } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { settingsErrorMessage } from "./get3w-settings-policy";

export function Get3wManagedModels({userId}:{userId:string}) {
  useLocale();
  const [state,setState]=useState("unchecked");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const active=useRef(true);
  async function run() {
    const bridge=window.__GET3W_ACCOUNT__;if(!bridge)return;
    setBusy(true);setError(null);
    try {
      const next=await bridge.managedModels({userId,action:"status"});
      if(active.current){setState(next.state);}
    }catch(failure){if(active.current)setError(settingsErrorMessage(failure));}
    finally{if(active.current)setBusy(false);}
  }
  useEffect(()=>{active.current=true;void run();return()=>{active.current=false;};},[]);
  return <div className="space-y-2 border-t pt-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{t("ui.a20002a1da9a")}</span>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{error ?? (state==="connected"?t("ui.6db179a68676"):state==="pending"?t("ui.1ac979a8e0de"):state==="unavailable"?t("ui.b4f791594866"):t("ui.964078572a2a"))}</p>
    {error||state==="pending"||state==="unavailable"?<Button variant="ghost" disabled={busy} onClick={()=>void run()}>{t("ui.be5dff52eeb0")}</Button>:null}
  </div>;
}
