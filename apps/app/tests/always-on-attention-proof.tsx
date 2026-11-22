import { createRoot } from "react-dom/client";
import { AlwaysOnAttentionPage, type AttentionPreviewRequest } from "../src/react-app/domains/workspace/always-on-attention-page";
import { setLocale } from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
export const requests: AttentionPreviewRequest[] = [
 {id:"p",kind:"permission",title:"更新本周检查报告？",task:"资料更新检查 · 等待3分钟",detail:"将修改工作区 reports/检查报告.md；不会发送到外部。",status:"pending"},
 {id:"q",kind:"question",title:"本轮需要核对哪个范围？",task:"资料更新检查 · 等待2分钟",detail:"上次范围为全部资料。",status:"pending",options:["仅新增资料","全部资料"]},
 {id:"e",kind:"expense",title:"批准本次模型费用？",task:"报告整理 · 等待1分钟",detail:"示例模型 · 预计 ¥0.20，最终费用以实际用量为准。",status:"pending"},
 {id:"p2",kind:"permission",title:"保存对比记录？",task:"资料更新检查 · 等待1分钟",detail:"将在工作区新增 reports/对比记录.md。",status:"pending"},
 {id:"a",kind:"permission",title:"更新检查报告",task:"资料更新检查",detail:"已允许本次，执行结果待核对。",status:"approved"},
 {id:"r",kind:"permission",title:"发送报告到外部",task:"报告整理",detail:"已拒绝，不授权发送。",status:"rejected"},
 {id:"s",kind:"question",title:"选择检查范围",task:"资料更新检查",detail:"原请求已撤销，不能继续答复。",status:"stale"},
 {id:"d",kind:"question",title:"选择报告语言",task:"报告整理",detail:"已答复：中文。",status:"answered"},
];
const live = new URLSearchParams(location.search).has("question");
let saved=false;
const client={alwaysOnAttention:async()=>({paused:true,checkedAt:Date.now(),scope:"active-task" as const,items:[{eventId:"fixture",sessionId:"fixture",messageId:"fixture",requestId:"fixture",createdAt:1,answerStatus:saved?"queued" as const:undefined,request:{kind:"question" as const,questions:[{header:"检查范围",question:"本轮需要核对哪个范围？",options:[{label:"仅新增资料",description:""},{label:"全部资料",description:""}],multiple:false,custom:true}]}}]}),answerAlwaysOnQuestion:async()=>{saved=true;return {status:"queued" as const};}};
createRoot(document.getElementById("root")!).render(<div className="min-h-screen bg-background text-foreground">{live?<><p className="px-6 pt-4 text-xs text-muted-foreground">隔离界面演示 · 不连接后台</p><AlwaysOnAttentionPage client={client} workspaceId="fixture" onClose={()=>{}} /></>:<AlwaysOnAttentionPage preview={requests} onClose={()=>{}}/>}</div>);
