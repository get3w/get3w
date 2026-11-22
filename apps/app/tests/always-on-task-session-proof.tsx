import {createRoot} from "react-dom/client";
import {AlwaysOnTimersPage} from "../src/react-app/domains/workspace/always-on-timers-page";
import type {AlwaysOnTimers,AlwaysOnFollowup} from "@get3w/types/workspace";
import {setLocale} from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
const tasks=[{id:"00000000-0000-4000-a000-000000000001",title:"周期检查：资料更新",sessionId:"session-check"},{id:"00000000-0000-4000-a000-000000000002",title:"跟进测试仓库的问题 #42",sessionId:"session-issue"}];
const followups:AlwaysOnFollowup[]=[
{id:"schedule-demo",text:"核对测试仓库的未解决问题",dueAt:Date.now()+3600000,createdAt:Date.now(),state:"scheduled",repeatMinutes:1440,missedPolicy:"once",taskId:tasks[1]!.id},
{id:"single-demo",text:"核对修复后的检查报告",dueAt:Date.now()+7200000,createdAt:Date.now(),state:"scheduled",missedPolicy:"skip",taskId:tasks[1]!.id},
{id:"suggestion-demo",text:"明天确认问题是否已解决",dueAt:Date.now()+86400000,createdAt:Date.now(),state:"suggested",taskId:tasks[1]!.id}
];
const client={alwaysOnTimers:async():Promise<AlwaysOnTimers>=>({tasks,currentTaskId:tasks[1]!.id,followups:[...followups],status:{settings:{goal:"核对资料更新",intervalMinutes:60,fullAccess:false,costAuto:false,costLimit:"7"},paused:true,phase:"idle",sessionId:"session-issue",nextRunAt:null,lastError:null}}),addAlwaysOnFollowup:async(_:string,input:Pick<AlwaysOnFollowup,"id"|"text"|"dueAt"|"taskId">)=>{const item:AlwaysOnFollowup={...input,state:"scheduled",createdAt:Date.now()};followups.push(item);return item;},confirmAlwaysOnFollowup:async(_:string,id:string)=>{const item=followups.find(item=>item.id===id)!;item.state="scheduled";return item;},cancelAlwaysOnFollowup:async(_:string,id:string)=>{const item=followups.find(item=>item.id===id);if(!item)throw Error("missing fixture");item.state="cancelled";return item;}};
createRoot(document.getElementById("root")!).render(<main className="min-h-screen bg-background text-foreground"><header className="border-b border-border px-8 py-3 text-sm">定时语义验收 · 隔离模拟数据</header><AlwaysOnTimersPage client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}} onOpenEvent={()=>{}}/></main>);
