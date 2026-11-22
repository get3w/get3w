// Isolated acceptance shell composed from the real workspace pages.
import {useState} from "react";
import {createRoot} from "react-dom/client";
import {MemoryRouter} from "react-router";
import {z} from "zod";
import {WorkspaceProvider} from "../src/react-app/shell/workspace-provider";
import {AlwaysOnWorkspaceControl} from "../src/react-app/domains/workspace/always-on-workspace-control";
import {AlwaysOnOverviewPage} from "../src/react-app/domains/workspace/always-on-overview-page";
import {AlwaysOnAttentionPage} from "../src/react-app/domains/workspace/always-on-attention-page";
import {AlwaysOnInboxPage} from "../src/react-app/domains/workspace/always-on-inbox-page";
import {AlwaysOnDeliveryPage} from "../src/react-app/domains/workspace/always-on-delivery-page";
import {Button} from "../src/components/ui/button";
import {createGet3wServerClient} from "../src/app/lib/get3w-server";
import {setLocale} from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
const config=z.object({baseUrl:z.string(),workspaces:z.array(z.object({id:z.string(),name:z.string()}))}).parse(await(await fetch("http://127.0.0.1:4346")).json());
const client=createGet3wServerClient({baseUrl:config.baseUrl,token:"recovery-client",hostToken:"recovery-host"});
function Proof(){
 const [workspaceId,setWorkspace]=useState(config.workspaces[0]?.id??"");const [view,setView]=useState("overview");const [session,setSession]=useState("");
 const open=(id:string,message:string)=>setSession(`${id} / ${message}`);
 return <MemoryRouter><WorkspaceProvider client={null} get3wServerClient={client} workspaceId={workspaceId} selectedWorkspaceRoot=""><div className="flex h-screen bg-background text-foreground"><aside className="w-64 shrink-0 space-y-3 border-r p-3"><h1 className="text-sm font-medium">异常恢复 · 隔离验收</h1>{config.workspaces.map(w=><Button key={w.id} variant={w.id===workspaceId?"secondary":"ghost"} className="w-full justify-start" onClick={()=>{setWorkspace(w.id);setSession("");}}>{w.name}</Button>)}<AlwaysOnWorkspaceControl key={workspaceId} workspaceId={workspaceId}/>{[["overview","目标与概览"],["inbox","事件收件箱"],["attention","待你处理"],["delivery","成果与交付"]].map(([id,label])=><Button key={id} variant="ghost" className="w-full justify-start" onClick={()=>setView(id)}>{label}</Button>)}</aside><main className="min-w-0 flex-1 overflow-auto" key={workspaceId+view}>{session?<p role="status" className="p-3 text-xs">原任务定位：{session}</p>:null}{view==="overview"?<AlwaysOnOverviewPage client={client} workspaceId={workspaceId} onOpenSettings={()=>{}} onClose={()=>{}} onOpenSession={open}/>:view==="inbox"?<AlwaysOnInboxPage client={client} workspaceId={workspaceId} onClose={()=>setView("overview")} onOpenSettings={()=>{}} onOpenSession={open}/>:view==="attention"?<AlwaysOnAttentionPage client={client} workspaceId={workspaceId} onClose={()=>setView("overview")} onOpenSession={open}/>:<AlwaysOnDeliveryPage client={client} workspaceId={workspaceId} onClose={()=>setView("overview")} onOpenSession={open}/>}</main></div></WorkspaceProvider></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<Proof/>);
