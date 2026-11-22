import { createRoot } from "react-dom/client";
import { AlwaysOnMemoryPage } from "../src/react-app/domains/workspace/always-on-memory-page";
import { Get3wServerError } from "../src/app/lib/get3w-server";
import { setLocale } from "../src/i18n";
import "../src/app/index.css";
// Isolated renderer fixture. No user workspace, model calls or writes.
const mode = new URLSearchParams(location.search).get("state");
setLocale("zh");
const client = {
 alwaysOnMemory: async () => ({version:1 as const,revision:0,reported:[{eventId:"event",sessionId:"session",messageId:"assistant",text:"已核对本地资料，本轮没有新变化。",truncated:false,completedAt:Date.now()}],history:[{id:"history",action:"save",after:"使用简洁中文汇报，并保留资料来源。",createdAt:Date.now()}],usage:[{eventId:"event",sessionId:"session",messageId:"message",revision:0,notes:[{id:"note",text:"使用简洁中文汇报，并保留资料来源。"}],submittedAt:Date.now()}],blocked:["a".repeat(64)],blockedEntries:[{hash:"a".repeat(64),text:"只用英文汇报",createdAt:Date.now()}],useNotes:true,extract:true,suggestions:[{id:"a7a394c1-abd0-4c53-b827-42e763140688",text:"进展汇报优先列出阻塞事项。",eventId:"fixture-event",sessionId:"fixture-session",messageId:"fixture-message",createdAt:Date.now()}],notes:[{id:"f7a394c1-abd0-4c53-b827-42e763140688",text:"使用简洁中文汇报，并保留资料来源。",enabled:true,locked:true,updatedAt:Date.now()}]}),
 changeAlwaysOnMemory: async () => { throw new Error("隔离只读预览"); },
 alwaysOnStatus: async () => ({settings:{goal:"检查资料更新",intervalMinutes:60,fullAccess:false,costAuto:false,costLimit:"7"},paused:true,phase:"idle" as const,sessionId:null,nextRunAt:null,lastError:null}),
 readWorkspaceFile: async () => {
  if(mode === "empty") throw new Get3wServerError(404,"file_not_found","File not found");
  if(mode === "error") throw new Error("无法连接工作区");
  return {path:".get3w/always-on/checkpoint.md",content:"已完成：核对本地资料，保存检查报告。\n待跟进：下次检查资料更新。\n资料引用：reports/check.md\n已处理标识：fixture-001",bytes:180,updatedAt:Date.now()};
 }
};
createRoot(document.getElementById("root")!).render(<div className="min-h-screen bg-background text-foreground"><header className="border-b border-border px-8 py-3 text-sm">工作区记忆 <span className="ml-3 text-xs text-muted-foreground">隔离界面验收 · 模拟数据</span></header><AlwaysOnMemoryPage client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}}/></div>);
