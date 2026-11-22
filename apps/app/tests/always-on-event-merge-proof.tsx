import {createRoot} from "react-dom/client";
import {AlwaysOnInboxPage} from "../src/react-app/domains/workspace/always-on-inbox-page";
import type {AlwaysOnInbox} from "@get3w/types/workspace";
import {setLocale} from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
const data:AlwaysOnInbox={status:{settings:{goal:"跟进测试仓库的问题",fullAccess:false,costAuto:false,costLimit:"7",intervalMinutes:60},paused:true,phase:"idle",sessionId:"session",nextRunAt:null,lastError:null},pending:[],processing:[],history:["问题状态已更新","补充了复现步骤"].map((text,i)=>({id:`original-${i}`,batchId:"batch",batchSize:2,kind:"source",phase:"done",sourceName:"测试仓库",text,messageId:"msg",sessionId:"session",createdAt:Date.now()-60000+i*1000,finishedAt:Date.now(),summary:"已合并检查两条更新，报告已保存",verification:{status:"verified",checkedAt:Date.now(),issues:[],outcome:"changed",artifacts:[]}})),historyTotal:2,nextOffset:null,unreadableCount:0,sources:[{id:"source",name:"测试仓库",kind:"webhook",scope:"",enabled:true,lastReceived:Date.now(),mergeWindowSeconds:0}]};
const client={alwaysOnInbox:async()=>data,reviewAlwaysOnResult:async()=>data.status,saveAlwaysOnSource:async(_:string,input:{mergeWindowSeconds?:number})=>{data.sources[0]!.mergeWindowSeconds=input.mergeWindowSeconds;return data.sources;},controlAlwaysOnSource:async()=>data.sources,receiveAlwaysOnEvent:async()=>({duplicate:false})};
createRoot(document.getElementById("root")!).render(<main className="min-h-screen bg-background text-foreground"><header className="border-b border-border px-8 py-3 text-sm">事件合并验收 · 隔离模拟数据</header><AlwaysOnInboxPage client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}} onOpenSession={()=>{}}/></main>);
