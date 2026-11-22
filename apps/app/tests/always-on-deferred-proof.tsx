import {useState} from "react";
import {MemoryRouter} from "react-router";
import {WorkspaceProvider} from "../src/react-app/shell/workspace-provider";
import {AlwaysOnWorkspaceControl} from "../src/react-app/domains/workspace/always-on-workspace-control";
import {AlwaysOnOverviewPage} from "../src/react-app/domains/workspace/always-on-overview-page";
import {Button} from "../src/components/ui/button";
import {createRoot} from "react-dom/client";
import {AlwaysOnAttentionPage} from "../src/react-app/domains/workspace/always-on-attention-page";
import {createGet3wServerClient} from "../src/app/lib/get3w-server";
import {setLocale} from "../src/i18n";
import {z} from "zod";
import "../src/app/index.css";
setLocale("zh");
const config=z.object({baseUrl:z.string(),workspaceId:z.string()}).parse(await(await fetch("http://127.0.0.1:4333")).json());
const client=createGet3wServerClient({baseUrl:config.baseUrl,token:"fixture-client",hostToken:"fixture-host"});
function Proof() {
 const [view,setView]=useState("attention");
 return <MemoryRouter><WorkspaceProvider client={null} get3wServerClient={client} workspaceId={config.workspaceId} selectedWorkspaceRoot="">
  <div className="flex h-screen bg-background text-foreground">
   <aside className="w-64 shrink-0 border-r p-3">
    <AlwaysOnWorkspaceControl workspaceId={config.workspaceId}/>
    <Button variant="ghost" className="w-full justify-start" onClick={()=>setView("attention")}>待你处理</Button>
    <Button variant="ghost" className="w-full justify-start" onClick={()=>setView("overview")}>目标与概览</Button>
   </aside>
   <main className="min-w-0 flex-1 overflow-auto">{view==="overview" ? <AlwaysOnOverviewPage client={client} workspaceId={config.workspaceId} onOpenSettings={()=>{}} onClose={()=>setView("attention")} onOpenSession={()=>{}}/> : <AlwaysOnAttentionPage client={client} workspaceId={config.workspaceId} onClose={()=>setView("overview")}/>}
   </main>
  </div>
 </WorkspaceProvider></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<Proof/>);
