import { formatMoney } from "@/i18n/money";
import { t, useLocale } from "@/i18n";
import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {settingsErrorMessage} from "./get3w-settings-policy";
type Money={amount:string;currency:string};
export type ModelUsageSnapshot={billing:"personal";items:{entry_id:string;request_id:string|null;charged:Money;balance_after:Money;created_at:string|null}[];next_cursor:string|null};
export function Get3wModelUsage({userId}:{userId:string}) {
  useLocale();
 const [data,setData]=useState<ModelUsageSnapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setData(null);setError("");setBusy(false);return()=>{generation.current++;};},[userId]);
 async function read(after?:string){const bridge=window.__GET3W_ACCOUNT__;if(!bridge)return;const current=generation.current;setBusy(true);setError("");
  try{const result=await bridge.modelUsage({userId,action:"read",...(after?{after}:{})});if(current===generation.current)setData(previous=>after&&previous?{...result,items:[...previous.items,...result.items]}:result);}
  catch(e){if(current===generation.current){setData(null);setError(settingsErrorMessage(e));}}finally{if(current===generation.current)setBusy(false);}}
 return <details className="border-t pt-3"><summary className="cursor-pointer text-sm">{t("ui.3e2d8350575b")}</summary><div className="space-y-3 pt-3 text-sm">
  <Button variant="outline" disabled={busy} onClick={()=>void read()}>{t("ui.55ad0e203a01")}</Button>
  {error?<p role="alert">{error}</p>:null}
  {data?<>{data.items.length===0?<p>{t("ui.c07d7a4008a9")}</p>:<ul className="divide-y">{data.items.map(row=><li className="space-y-1 py-2" key={row.entry_id}>
    <p>{formatMoney(row.charged.amount,row.charged.currency)}</p>
    <details><summary>{t("ui.c13142f7eeca")}</summary><p className="break-all">{row.request_id}</p><p>{row.created_at?new Date(row.created_at).toLocaleString():null}</p></details>
   </li>)}</ul>}{data.next_cursor?<Button variant="ghost" disabled={busy} onClick={()=>void read(data.next_cursor??undefined)}>{t("ui.236de4978313")}</Button>:null}</>:null}
 </div></details>;
}
