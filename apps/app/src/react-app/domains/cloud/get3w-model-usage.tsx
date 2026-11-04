import { t } from "@/i18n";
import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {settingsErrorMessage} from "./get3w-settings-policy";
type Money={amount:string;currency:string};
type Bucket={limit:number|null;used:number;remaining:number|null};
export type ModelUsageSnapshot={organization_id:string|null;billing:"personal";quota:{unit:"requests";period:string;organization:Bucket|null;member:Bucket|null};entries:{request_id:string;requested_model:string;actual_model:string;billing_model:string|null;task_id:string|null;status:string;created_at:number;charge:Money|null;balance_after:Money|null}[];next_cursor:string|null};
export function Get3wModelUsage({userId,organizationId,role}:{userId:string;organizationId?:string;role?:string}) {
 const [data,setData]=useState<ModelUsageSnapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [subject,setSubject]=useState("*"),[limit,setLimit]=useState("");
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setData(null);setError("");setBusy(false);setSubject("*");setLimit("");return()=>{generation.current++;};},[userId,organizationId,role]);
 async function read(after?:string){const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge)return;const current=generation.current;setBusy(true);setError("");
  try{const result=await bridge.modelUsage({userId,organizationId,action:"read",...(after?{after}:{})});if(current===generation.current)setData(previous=>after&&previous?{...result,entries:[...previous.entries,...result.entries]}:result);}
  catch(e){if(current===generation.current){setData(null);setError(settingsErrorMessage(e));}}finally{if(current===generation.current)setBusy(false);}}
 async function save(){const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge)return;const current=generation.current;setBusy(true);setError("");
  try{await bridge.modelUsage({userId,organizationId,action:"limit",memberId:subject.trim(),limit:Number(limit)});if(current===generation.current)await read();}
  catch(e){if(current===generation.current)setError(settingsErrorMessage(e));}finally{if(current===generation.current)setBusy(false);}}
 const bucket=(name:string,value:Bucket|null)=>value?<p>{name}: {value.used} {t("ui.9e43a59a5abc")} {value.limit===null?t("ui.452f946b7dbb"):`${value.remaining} of ${value.limit} remaining`}</p>:null;
 return <details className="border-t pt-3"><summary className="cursor-pointer text-sm">{t("ui.3e2d8350575b")}</summary><div className="space-y-3 pt-3 text-sm">
  <Button variant="outline" disabled={busy} onClick={()=>void read()}>{t("ui.55ad0e203a01")}</Button>
  <p className="text-muted-foreground">{t("ui.5398c16aa23a")}</p>
  {error?<p role="alert">{error}</p>:null}
  {data?<><p>{t("ui.d4ba2180987a")} {data.quota.period} UTC</p>{bucket("Organization",data.quota.organization)}{bucket("You",data.quota.member)}
   {data.entries.length===0?<p>{t("ui.c07d7a4008a9")}</p>:<ul className="divide-y">{data.entries.map(row=><li className="space-y-1 py-2" key={row.request_id}>
    <p>{row.actual_model} · {row.status}</p><p className="text-muted-foreground">{t("ui.65d7deb02f4b")} {row.requested_model} {t("ui.d44f5c2dbed1")} {row.billing_model??t("ui.62711b006714")}</p>
    <p>{row.charge?`${row.charge.currency} ${row.charge.amount}`:t("ui.b4985ddc537b")}{row.balance_after?` · Balance after: ${row.balance_after.currency} ${row.balance_after.amount}`:""}</p>
    <details><summary>{t("ui.c13142f7eeca")}</summary><p className="break-all">{row.task_id??row.request_id}</p><p>{new Date(row.created_at*1000).toISOString()}</p></details>
   </li>)}</ul>}{data.next_cursor?<Button variant="ghost" disabled={busy} onClick={()=>void read(data.next_cursor??undefined)}>{t("ui.236de4978313")}</Button>:null}</>:null}
  {organizationId?role==="owner"||role==="admin"?<form className="space-y-2" onSubmit={e=>{e.preventDefault();void save();}}>
    <label className="block">{t("ui.07985fd9bc8d")}</label>
    <Input aria-label={t("ui.964554cc6cdc")} placeholder={t("ui.ba91fbc3b259")} value={subject} maxLength={50} disabled={busy} onChange={e=>setSubject(e.target.value)}/>
    <label className="block">{t("ui.fcd306fd5888")}</label>
    <Input aria-label={t("ui.fcd306fd5888")} type="number" min={0} max={1000000} step={1} placeholder={t("ui.2bb49ce8a6d6")} value={limit} disabled={busy} onChange={e=>setLimit(e.target.value)}/>
    <Button type="submit" disabled={busy||!subject.trim()||!/^\d+$/.test(limit)||Number(limit)>1000000}>{t("ui.33c1161d287f")}</Button>
  </form>:<p className="text-muted-foreground">{t("ui.b1938e6f590d")}</p>:null}
 </div></details>;
}
