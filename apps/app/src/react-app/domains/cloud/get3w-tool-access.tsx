import { t } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { settingsErrorMessage } from "./get3w-settings-policy";

export type ToolAccessPage = {organization_id:string;member_id:string;capabilities:{name:string;description:string;granted:boolean}[];next_cursor:string|null};
export function Get3wToolAccess({userId,organizationId}:{userId:string;organizationId:string}) {
  const [opened,setOpened]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [members,setMembers]=useState<{user_id:string;role:string}[]>([]),[memberId,setMemberId]=useState(userId);
  const [page,setPage]=useState<ToolAccessPage|null>(null);
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function run(action:"read"|"publish"|"grant"|"google"|"microsoft",target=memberId,capability?:string,enabled?:boolean,after?:string) {
    const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge)return;
    setBusy(true);setError(null);
    try {
      const identity={userId,organizationId};
      if(action==="google"||action==="microsoft")await bridge.toolAccess({...identity,action:"publishConnector",provider:action});
      if(action==="publish")await bridge.toolAccess({...identity,action});
      if(action==="grant"&&capability&&enabled!==undefined)await bridge.toolAccess({...identity,action,memberId:target,capability,enabled});
      const list=await bridge.members({userId});
      if(list.organization_id!==organizationId)throw new Error(t("ui.a98097e09f77"));
      const next=await bridge.toolAccess({...identity,action:"read",memberId:target,...(after?{after}:{})});
      if(!active.current)return;
      setMembers(list.members);setMemberId(target);
      setPage(previous=>after&&previous?.member_id===target?{...next,capabilities:[...previous.capabilities,...next.capabilities]}:next);
    }catch(e){if(active.current){setPage(null);setMembers([]);setError(settingsErrorMessage(e));}}
    finally{if(active.current)setBusy(false);}
  }
  return <div className="space-y-3 border-t pt-3">
    <Button variant="outline" disabled={busy} onClick={()=>{setOpened(!opened);if(!opened)void run("read");}}>{opened?t("ui.ca8b571b9f32"):t("ui.127fc0c5810e")}</Button>
    {opened?<>
      <p className="text-sm text-muted-foreground">{t("ui.c89eb8c344d0")}</p>
      <Button variant="outline" disabled={busy} onClick={()=>void run("publish")}>{t("ui.405f7f94a6d5")}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void run("google")}>{t("ui.92ce585c6a3e")}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void run("microsoft")}>{t("ui.64caf23ce54a")}</Button>
      {members.length?<Select value={memberId} onValueChange={value=>{if(typeof value==="string")void run("read",value);}}>
        <SelectTrigger disabled={busy} aria-label={t("ui.a152e326c472")}><SelectValue>{memberId===userId?t("ui.08b041935798"):memberId}</SelectValue></SelectTrigger>
        <SelectContent>{members.map(member=><SelectItem key={member.user_id} value={member.user_id}>{member.user_id===userId?t("ui.08b041935798"):member.user_id} · {member.role}</SelectItem>)}</SelectContent>
      </Select>:null}
      {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
      {page?.capabilities.length===0?<p role="status" className="text-sm text-muted-foreground">{t("ui.0b817b44f8d1")}</p>:null}
      {page?<ul className="space-y-2">{page.capabilities.map(tool=><li className="flex items-center justify-between gap-3 text-sm" key={tool.name}>
        <span className="min-w-0"><span className="block truncate">{tool.description||tool.name}</span><span className="text-muted-foreground">{tool.granted?t("ui.62026a42b239"):t("ui.352a5b4c1246")}</span></span>
        <Button variant="outline" disabled={busy} aria-label={`${tool.granted?t("ui.87e6d00bbf53"):t("ui.78b7d0379d5e")} ${tool.name}`} onClick={()=>void run("grant",memberId,tool.name,!tool.granted)}>{tool.granted?t("ui.ab292ddb87d6"):t("ui.8693768c7e08")}</Button>
      </li>)}</ul>:null}
      {page?.next_cursor?<Button variant="ghost" disabled={busy} onClick={()=>void run("read",memberId,undefined,undefined,page.next_cursor??undefined)}>{t("ui.44edff2aa2f9")}</Button>:null}
      <Button variant="ghost" disabled={busy} onClick={()=>void run("read")}>{t("ui.0775c2832594")}</Button>
    </>:null}
  </div>;
}
