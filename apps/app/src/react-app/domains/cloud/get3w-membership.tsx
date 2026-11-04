import { t } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { settingsErrorMessage } from "./get3w-settings-policy";
import type { MembershipInput, OrganizationInvitation } from "./get3w-account";

export function Get3wMembership({userId,organizationId,role,onChanged}:{userId:string;organizationId?:string;role?:string;onChanged:()=>Promise<void>}) {
  const [rows,setRows]=useState<OrganizationInvitation[]|null>(null);
  const [cursor,setCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [recipient,setRecipient]=useState(""),[inviteRole,setInviteRole]=useState("member");
  const [scope,setScope]=useState<"inbox"|"list">("inbox");
  const [confirmLeave,setConfirmLeave]=useState(false);
  const generation=useRef(0);
  useEffect(()=>{generation.current++;setRows(null);setCursor(null);setBusy(false);setMessage("");setRecipient("");setInviteRole("member");setConfirmLeave(false);return()=>{generation.current++;};},[userId,organizationId,role]);
  const admin=role==="owner"||role==="admin";
  async function load(nextScope:"inbox"|"list",after?:string) {
    const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge)return;
    const current=generation.current;setBusy(true);setMessage("");
    try {
      const page=await bridge.membership({userId,organizationId,action:nextScope,...(after?{after}:{})});
      if(current!==generation.current)return;
      setRows(previous=>after&&scope===nextScope?[...(previous??[]),...page.invitations]:page.invitations);setScope(nextScope);setCursor(page.next_cursor);
    }catch(e){if(current===generation.current){setRows(null);setCursor(null);setMessage(settingsErrorMessage(e));}}
    finally{if(current===generation.current)setBusy(false);}
  }
  async function change(input:Omit<MembershipInput,"userId"|"organizationId">) {
    const bridge=window.__OPENWORK_ACCOUNT__;if(!bridge)return;
    const current=generation.current;setBusy(true);setMessage("");
    try {
      await bridge.membership({userId,organizationId,...input});
      if(current!==generation.current)return;
      setRows(null);setCursor(null);setRecipient("");setConfirmLeave(false);
      setMessage(input.action==="invite"?t("ui.305946b3f60b"):t("ui.00e0addf0a76"));
      await onChanged();
    }catch(e){if(current===generation.current){setRows(null);setMessage(settingsErrorMessage(e));}}
    finally{if(current===generation.current)setBusy(false);}
  }
  return <details className="border-t pt-3">
    <summary className="cursor-pointer text-sm">{t("ui.60ff9f5f21ae")}</summary>
    <div className="space-y-3 pt-3 text-sm">
      <p className="select-all text-muted-foreground">{t("ui.1c74d9e04c74")} {userId}</p>
      <Button variant="outline" disabled={busy} onClick={()=>void load("inbox")}>{t("ui.d46398c6481d")}</Button>
      {organizationId?<>
        {admin?<>
          <Button variant="outline" disabled={busy} onClick={()=>void load("list")}>{t("ui.76728859ae90")}</Button>
          <form className="space-y-2" onSubmit={event=>{event.preventDefault();void change({action:"invite",recipientId:recipient.trim(),role:inviteRole});}}>
            <Input aria-label={t("ui.2f3585333c76")} placeholder={t("ui.32aa7acc13c1")} value={recipient} maxLength={50} disabled={busy} onChange={event=>setRecipient(event.target.value)}/>
            <Select value={inviteRole} onValueChange={value=>{if(typeof value==="string")setInviteRole(value);}}>
              <SelectTrigger aria-label={t("ui.6e2f67157a27")} disabled={busy}><SelectValue/></SelectTrigger>
              <SelectContent>{["viewer","member",...(role==="owner"?["admin"]:[])].map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-muted-foreground">{t("ui.d3d87d7d2fe0")} {inviteRole}. No model or connector grants are added.</p>
            <Button type="submit" disabled={busy||!recipient.trim()}>{t("ui.a6612262af01")}</Button>
          </form>
        </>:<p className="text-muted-foreground">{t("ui.e761fe517694")}</p>}
        <Button variant="outline" disabled={busy} onClick={()=>setConfirmLeave(true)}>{t("ui.ac8fd77730fe")}</Button>
      </>:null}
      {rows?.length===0?<p role="status" className="text-muted-foreground">{t("ui.4f374c2b82ae")}</p>:null}
      {rows?<ul className="space-y-2">{rows.map(row=><li key={row.invitation_id} className="border-b py-2 space-y-2">
        <span>{scope==="inbox"?row.organization_name:row.recipient_id} · {row.role} · {row.status}</span>
        {row.status==="pending"?<div className="flex gap-2">{scope==="inbox"?<>
          <Button disabled={busy} onClick={()=>void change({action:"accept",invitationId:row.invitation_id})}>{t("ui.1872d33749d0")}</Button>
          <Button variant="outline" disabled={busy} onClick={()=>void change({action:"decline",invitationId:row.invitation_id})}>{t("ui.2ce06dafd875")}</Button>
        </>:<Button variant="outline" disabled={busy} onClick={()=>void change({action:"revoke",invitationId:row.invitation_id})}>{t("ui.eb39fc8cf692")}</Button>}</div>:null}
      </li>)}</ul>:null}
      {cursor?<Button variant="ghost" disabled={busy} onClick={()=>void load(scope,cursor)}>{t("ui.5cfc618f429f")}</Button>:null}
      {message?<p role="status" className="text-muted-foreground">{message}</p>:null}
    </div>
    <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}><DialogContent><DialogTitle>{t("ui.09322f30d0d0")}</DialogTitle>
      <p className="text-sm">{t("ui.85abc1902ded")}</p>
      <Button variant="outline" disabled={busy} onClick={()=>setConfirmLeave(false)}>{t("ui.c7fb30ed7328")}</Button>
      <Button disabled={busy} onClick={()=>void change({action:"leave"})}>{t("ui.ac8fd77730fe")}</Button>
    </DialogContent></Dialog>
  </details>;
}
