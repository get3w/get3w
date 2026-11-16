import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { t, useLocale } from "@/i18n";
import { formatMoney, USD_TO_CNY } from "@/i18n/money";
import type { CostPolicy, TaskPermissionSnapshot } from "../../cloud/get3w-account";

export function TaskCostControl({workspaceId,sessionId}:{workspaceId?:string;sessionId?:string}){
 const locale=useLocale();
 const currency=locale==="zh"?"CNY":"USD";
 const [snapshot,setSnapshot]=useState<TaskPermissionSnapshot|null>(null);
 const [enabled,setEnabled]=useState(false);
 const [amount,setAmount]=useState("");
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(false);
 const reads=useRef(0);const generation=useRef(0);const editing=useRef(false);
 const bridge=window.__GET3W_ACCOUNT__?.taskPermissions;
 function display(policy:CostPolicy){
  if(policy.amount===null)return "";
  if(policy.currency===currency)return policy.amount;
  const converted=policy.currency==="USD"?Number(policy.amount)*USD_TO_CNY:Number(policy.amount)/USD_TO_CNY;
  return converted.toFixed(2);
 }
 useEffect(()=>{
  const current=++generation.current;editing.current=false;setSnapshot(null);setDirty(false);setBusy(false);setError(false);
  const refresh=async()=>{const read=++reads.current;try{const value=await bridge?.({action:"read",workspaceId,sessionId});if(value&&generation.current===current&&read===reads.current&&!editing.current){setSnapshot(value);setEnabled(value.cost?.policy.enabled??false);setAmount(display(value.cost?.policy??{enabled:false,amount:null,currency:"USD"}));setError(false);}}catch{if(generation.current===current&&read===reads.current&&!editing.current)setError(true);}};
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},3000);
  return()=>{generation.current++;clearInterval(timer);};
 },[bridge,workspaceId,sessionId,currency]);
 const valid=/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(amount)&&Number(amount)>0;
 const change=()=>{reads.current++;editing.current=true;setDirty(true);setError(false);};
 async function save(){
  if(!bridge||busy||(enabled&&!valid))return;
  reads.current++;const current=generation.current;setBusy(true);setError(false);
  try{
   // A language change can round the display. Preserve the saved exact value
   // unless the user actually changes the amount.
   const old=snapshot?.cost?.policy;
   const policy:CostPolicy=old&&amount===display(old)?{...old,enabled}:{enabled,amount:valid?amount:null,currency};
   const value=await bridge({action:"cost-set",workspaceId,sessionId,policy});
   if(current===generation.current){setSnapshot(value);setEnabled(value.cost?.policy.enabled??false);setAmount(value.cost?display(value.cost.policy):"");setDirty(false);editing.current=false;}
  }catch{if(current===generation.current)setError(true);}finally{if(current===generation.current)setBusy(false);}
 }
 function cancel(){const policy=snapshot?.cost?.policy;setEnabled(policy?.enabled??false);setAmount(policy?display(policy):"");setDirty(false);setError(false);editing.current=false;}
 return <section aria-label={t("cost.section")} className="space-y-3 border-t border-border pt-3">
  <h3 className="text-sm font-medium">{t("cost.section")}</h3>
  <label className="flex items-center justify-between gap-4"><span>{t("cost.auto")}</span><Switch aria-label={t("cost.auto")} checked={enabled} disabled={busy||!snapshot?.cost} onCheckedChange={value=>{change();setEnabled(value);}}/></label>
  <label className="block space-y-2 py-2"><span className="block text-muted-foreground">{t("cost.limit")}</span><div className="flex items-center gap-2"><Input aria-label={t("cost.limit")} inputMode="decimal" value={amount} placeholder={t("cost.unset")} disabled={busy||!snapshot?.cost} onInput={event=>{change();setAmount(event.currentTarget.value);if(event.currentTarget.value)setEnabled(true);}} aria-invalid={dirty&&enabled&&!valid}/><span className="text-muted-foreground">{currency}</span></div></label>
  <p className="text-xs text-muted-foreground">{t("cost.scope")}</p>
  {snapshot?.costRun?<p className="text-xs text-muted-foreground">{t("cost.usage",{amount:formatMoney(snapshot.costRun.committedUsd,"USD"),limit:snapshot.costRun.policy.enabled&&snapshot.costRun.policy.amount?formatMoney(snapshot.costRun.policy.amount,snapshot.costRun.policy.currency):t("cost.always")})}</p>:null}
  {dirty&&enabled&&!valid?<p role="alert" className="text-xs text-destructive">{t("cost.invalid")}</p>:null}
  {snapshot&&!snapshot.cost?<p role="status" className="text-xs text-muted-foreground">{t("cost.unavailable")}</p>:null}
  {error?<p role="alert" className="text-xs text-destructive">{t("cost.error")}</p>:null}
  {dirty?<div className="flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={cancel}>{t("permissions.cancel")}</Button><Button size="sm" disabled={busy||(enabled&&!valid)} onClick={()=>void save()}>{t(error?"cost.retry_save":"cost.save")}</Button></div>:null}
  {!snapshot?.cost&&error?<Button size="sm" variant="outline" onClick={()=>{const current=generation.current;editing.current=false;setError(false);void bridge?.({action:"read",workspaceId,sessionId}).then(value=>{if(current!==generation.current)return;setSnapshot(value);setEnabled(value.cost?.policy.enabled??false);setAmount(value.cost?display(value.cost.policy):"");}).catch(()=>{if(current===generation.current)setError(true);});}}>{t("permissions.retry")}</Button>:null}
 </section>;
}
