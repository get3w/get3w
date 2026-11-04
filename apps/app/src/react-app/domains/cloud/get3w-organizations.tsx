import { t } from "@/i18n";
import { Get3wModelUsage } from "./get3w-model-usage";
import { Get3wMembership } from "./get3w-membership";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Get3wConnectors } from "./get3w-connectors";
import { Get3wGateway } from "./get3w-gateway";
import { Get3wToolAccess } from "./get3w-tool-access";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { settingsErrorMessage } from "./get3w-settings-policy";
export type Get3wOrganization = {organization_id:string;name:string;role:"owner"|"admin"|"member"|"viewer"};
export type OrganizationSnapshot = {organizations:Get3wOrganization[];selectedOrganization:Get3wOrganization|null};
export function Get3wOrganizations({userId}:{userId:string}) {
  const [snapshot,setSnapshot]=useState<OrganizationSnapshot|null>(null);
  const [message,setMessage]=useState(t("ui.8ab8587474a0"));
  const [busy,setBusy]=useState(false);
  const [name,setName]=useState("");
  const [creating,setCreating]=useState(false);
  const [members,setMembers]=useState<{user_id:string;role:string}[]|null>(null);
  const [removeTarget,setRemoveTarget]=useState<string|null>(null);
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function load(organizationId?:string|null) {
    const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge)return;
    setBusy(true);setMembers(null);setRemoveTarget(null);
    try {
      const next=await bridge.organizations({userId,...(organizationId!==undefined?{organizationId}:{})});
      if(!active.current)return;
      setSnapshot(next);setMessage(next.organizations.length ? "" : t("ui.c256efdc5810"));
    }catch(error){if(active.current){setSnapshot(null);setMessage(settingsErrorMessage(error));}}
    finally{if(active.current)setBusy(false);}
  }
  async function createOrganization() {
    const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge)return;
    setBusy(true);setMembers(null);setRemoveTarget(null);setMessage("");
    try {
      const next=await bridge.createOrganization({userId,name});
      if(!active.current)return;
      setSnapshot(next);setName("");setCreating(false);setMessage(t("ui.10fc8ff12903"));
    }catch(error){if(active.current)setMessage(settingsErrorMessage(error));}
    finally{if(active.current)setBusy(false);}
  }
  async function readMembers(){
    const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge)return;
    setBusy(true);setMembers(null);setRemoveTarget(null);setMessage("");
    try {const next=await bridge.members({userId});if(active.current)setMembers(next.members);}
    catch(error){if(active.current){setSnapshot(null);setMessage(settingsErrorMessage(error));}}
    finally{if(active.current)setBusy(false);}
  }
  async function changeRole(memberId:string,role:string) {
    const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge)return;
    setBusy(true);setMembers(null);setRemoveTarget(null);setMessage("");
    try {
      if(!snapshot?.selectedOrganization)throw new Error(t("ui.39ac2aa583c4"));
      await bridge.updateMember({userId,organizationId:snapshot.selectedOrganization.organization_id,memberId,role,active:true});
      const next=await bridge.organizations({userId});
      if(!active.current)return;
      setSnapshot(next);
      if(next.selectedOrganization && ["owner","admin"].includes(next.selectedOrganization.role)) {
        const result=await bridge.members({userId});
        if(active.current)setMembers(result.members);
      }
      if(active.current)setMessage(t("ui.7c4ab41d5908"));
    }catch(error){if(active.current){setSnapshot(null);setMessage(settingsErrorMessage(error));}}
    finally{if(active.current)setBusy(false);}
  }
  async function removeMember() {
    const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge||!removeTarget||!snapshot?.selectedOrganization)return;
    setBusy(true);setMessage("");
    try {
      await bridge.membership({userId,organizationId:snapshot.selectedOrganization.organization_id,action:"remove",memberId:removeTarget});
      if(!active.current)return;
      setRemoveTarget(null);await load();
    }catch(e){if(active.current){setMembers(null);setMessage(settingsErrorMessage(e));}}
    finally{if(active.current)setBusy(false);}
  }
  return <div className="space-y-3 border-t pt-3">
    <div className="flex items-center justify-between gap-3"><span className="text-sm">{t("ui.d764d42592fc")}</span><Button variant="outline" disabled={busy} onClick={()=>void load()}>{t("ui.c9bf28e3bfbc")}</Button></div>
    <Button variant="ghost" disabled={busy} onClick={()=>setCreating(!creating)}>{creating?t("ui.700528a60ae3"):t("ui.62e34b700059")}</Button>
    {creating?<form className="flex items-center gap-2" onSubmit={event=>{event.preventDefault();void createOrganization();}}>
      <Input aria-label={t("ui.9a807d52ba21")} placeholder={t("ui.9a807d52ba21")} value={name} maxLength={200} disabled={busy} onChange={event=>setName(event.target.value)}/>
      <Button type="submit" disabled={busy||!name.trim()}>{t("ui.f14e1b22393c")}</Button>
    </form>:null}
    {snapshot?.organizations.length ? <Select value={snapshot.selectedOrganization?.organization_id??"personal"} onValueChange={value=>{if(typeof value==="string")void load(value==="personal"?null:value);}}>
      <SelectTrigger disabled={busy} aria-label={t("ui.658eb6948f5d")}><SelectValue>{snapshot.selectedOrganization?.name??"Personal account"}</SelectValue></SelectTrigger>
      <SelectContent><SelectItem value="personal">{t("ui.96c55b36cc6b")}</SelectItem>{snapshot.organizations.map(org=><SelectItem key={org.organization_id} value={org.organization_id}>{org.name} · {org.role}</SelectItem>)}</SelectContent>
    </Select>:null}
    {message?<p className="text-sm text-muted-foreground" role="status">{message}</p>:null}
    {snapshot?.selectedOrganization ? <p className="text-sm">{snapshot.selectedOrganization.name} · {snapshot.selectedOrganization.role}</p>:null}
    {snapshot?.selectedOrganization && ["owner","admin"].includes(snapshot.selectedOrganization.role)?<Button variant="outline" disabled={busy} onClick={()=>void readMembers()}>{t("ui.3961c5634944")}</Button>:null}
    <Get3wGateway key={`${userId}:${snapshot?.selectedOrganization?.organization_id??"none"}`} userId={userId} organizationId={snapshot?.selectedOrganization?.organization_id}/>
    {snapshot?.selectedOrganization&&["owner","admin"].includes(snapshot.selectedOrganization.role)?<Get3wToolAccess key={`tools:${userId}:${snapshot.selectedOrganization.organization_id}`} userId={userId} organizationId={snapshot.selectedOrganization.organization_id}/>:null}
    {snapshot?.selectedOrganization?<Get3wConnectors key={`connections:${userId}:${snapshot.selectedOrganization.organization_id}`} userId={userId} organizationId={snapshot.selectedOrganization.organization_id} role={snapshot.selectedOrganization.role}/>:null}
    {snapshot?.selectedOrganization?<Get3wModelUsage userId={userId} organizationId={snapshot.selectedOrganization.organization_id} role={snapshot.selectedOrganization.role}/>:null}
    <Get3wMembership userId={userId} organizationId={snapshot?.selectedOrganization?.organization_id} role={snapshot?.selectedOrganization?.role} onChanged={()=>load()}/>
    {members?<ul className="space-y-2 text-sm">{members.map(member=><li className="flex items-center justify-between gap-3" key={member.user_id}>
      <span className="truncate">{member.user_id===userId?t("ui.08b041935798"):member.user_id}</span>
      <Select value={member.role} onValueChange={role=>{if(typeof role==="string" && role!==member.role)void changeRole(member.user_id,role);}}>
        <SelectTrigger aria-label={`Role for ${member.user_id===userId?"you":member.user_id}`} disabled={busy||(member.role==="owner"&&snapshot?.selectedOrganization?.role!=="owner")}><SelectValue/></SelectTrigger>
        <SelectContent>{["owner","admin","member","viewer"].map(role=><SelectItem key={role} value={role} disabled={role==="owner"&&snapshot?.selectedOrganization?.role!=="owner"}>{role}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="outline" disabled={busy||(member.role==="owner"&&snapshot?.selectedOrganization?.role!=="owner")} onClick={()=>setRemoveTarget(member.user_id)}>{t("ui.9438e0ba8e63")}</Button>
    </li>)}</ul>:null}
    <Dialog open={removeTarget!==null} onOpenChange={open=>{if(!open)setRemoveTarget(null);}}><DialogContent><DialogTitle>{t("ui.fd8bd0971d9c")}</DialogTitle>
      <p className="text-sm">{t("ui.81a8626515c3")}</p>
      <Button variant="outline" disabled={busy} onClick={()=>setRemoveTarget(null)}>{t("ui.79c737eecef5")}</Button>
      <Button disabled={busy} onClick={()=>void removeMember()}>{t("ui.9438e0ba8e63")}</Button>
    </DialogContent></Dialog>
  </div>;
}
