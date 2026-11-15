import React from "react";
import {createRoot} from "react-dom/client";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {createOpenworkServerClient} from "../src/app/lib/openwork-server";
import {OutputsPage} from "../src/react-app/domains/cloud/outputs-page";
import {PlatformProvider,createDefaultPlatform} from "../src/react-app/kernel/platform";
import {setLocale} from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
document.documentElement.dataset.theme = new URLSearchParams(location.search).has("dark") ? "dark" : "light";
const files = new Map<string, string>([["docs/readme.md", "# 工作区文件\n\n这里展示工作区中的文件。\n\n- 图片与视频\n- 文档与表格\n- 代码与文本"], ["src/index.ts", "export const workspace = 'Get3W';\n"], ["notes.txt", "本周计划\n1. 整理文件\n2. 完成设计"], ["logo.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" rx="32" fill="#edf5ed"/><text x="300" y="230" text-anchor="middle" font-size="84" fill="#154b36">Get3W</text></svg>']]);
files.set("budget.csv", "项目,金额\n设计,100\n开发,200");
const folders = new Set(["docs", "src", "images", ".local"]);
let version=1;
window.fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
 const url=new URL(String(input)); const path=url.searchParams.get("path")??"";
 if(url.pathname.endsWith("/browser/ops")) {
  const body=JSON.parse(String(init?.body));
  if(body.type==="create")files.set(body.path,"");
  if(body.type==="mkdir")folders.add(body.path);
  if(body.type==="rename"){if(files.has(body.path)){files.set(body.to,files.get(body.path)!);files.delete(body.path);}else{folders.delete(body.path);folders.add(body.to);}}
  if(body.type==="delete"){files.delete(body.path);folders.delete(body.path);}
  version++;return Response.json({ok:true});
 }
 if(url.pathname.endsWith("/browser")) {
  const dir=url.searchParams.get("directory")??"",query=url.searchParams.get("query")??"";
  const items=[...folders].map(path=>({path,kind:"dir",size:0,mtimeMs:1,revision:"1"})).concat([...files].map(([path,data])=>({path,kind:"file",size:data.length,mtimeMs:version,revision:String(version)})));
  return Response.json({items:items.filter(entry=>query?entry.path.includes(query):(entry.path.includes("/")?entry.path.slice(0,entry.path.lastIndexOf("/")):"")===dir),truncated:false});
 }
 if(url.pathname.endsWith("/stat"))return Response.json({size:files.get(path)?.length??0,updatedAt:version,kind:"file"});
 if(url.pathname.endsWith("/content")){
  if(init?.method==="POST"){const body=JSON.parse(String(init.body));files.set(body.path,body.content);version++;return Response.json({updatedAt:version});}
  return Response.json({content:files.get(path)??"",updatedAt:version});
 }
 return new Response(files.get(path)??"",{headers:{"Content-Type":path.endsWith(".svg")?"image/svg+xml":"text/plain"}});
}, {preconnect:fetch.preconnect});
const client=createOpenworkServerClient({baseUrl:"http://fixture.local",token:"test"});
createRoot(document.getElementById("root")!).render(<PlatformProvider value={createDefaultPlatform()}><QueryClientProvider client={new QueryClient()}><OutputsPage client={client} workspaceId="fixture" workspaceRoot="/workspace/Get3W" /></QueryClientProvider></PlatformProvider>);
