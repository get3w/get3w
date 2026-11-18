import { t } from "../src/i18n";
import { expect, test } from "bun:test";
import { createGet3wServerClient } from "../src/app/lib/get3w-server";
import { loadFilePages, parentDirectory, joinFilePath } from "../src/react-app/domains/cloud/workspace-files-model";

test("directory loader follows cursors beyond ten thousand files", async () => {
 const original = globalThis.fetch;
 const calls: string[] = [];
 globalThis.fetch = Object.assign(async (input: string | URL | Request) => {
  const url = new URL(String(input)); calls.push(url.searchParams.get("after") ?? "");
  const offset = Number(url.searchParams.get("after") ?? 0);
  return Response.json({items:Array.from({length:1000},(_,index)=>({path:`file-${offset+index}.txt`,kind:"file",size:0,mtimeMs:1,revision:"1"})),truncated:offset<10000,nextAfter:String(offset+1000),incomplete:offset===10000});
 }, {preconnect: original.preconnect});
 try {
  const client = createGet3wServerClient({baseUrl:"http://localhost:8787",token:"test"});
  const result = await loadFilePages(client,"ws",{});
  expect(result.items).toHaveLength(11000); expect(result.incomplete).toBe(true); expect(calls).toHaveLength(11);
 } finally { globalThis.fetch=original; }
});
test("file path helpers preserve workspace-relative hierarchy",()=>{
 expect(parentDirectory("中文/图片/image.png")).toBe("中文/图片");
 expect(parentDirectory("file.txt")).toBe("");
 expect(joinFilePath("","file.txt")).toBe("file.txt");
});

test("older embedded services fall back to the paged catalog and close file sessions", async()=>{
 const original=globalThis.fetch;let browserCalls=0;let closed=0;let snapshots=0;
 globalThis.fetch=Object.assign(async(input:string|URL|Request,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.pathname.endsWith("/browser")){browserCalls++;return Response.json({code:"not_found",message:"Not found"},{status:404});}
  if(init?.method==="POST")return Response.json({session:{id:"files-test"}});
  if(init?.method==="DELETE"){closed++;return Response.json({ok:true});}
  snapshots++;
  const paths=url.searchParams.has("after")?["docs/report.txt","root.txt"]:["docs"];
  return Response.json({items:paths.map(path=>({path,kind:path==="docs"?"dir":"file",size:0,mtimeMs:1,revision:"1"})),truncated:!url.searchParams.has("after"),nextAfter:"docs"});
 },{preconnect:original.preconnect});
 try{
  const client=createGet3wServerClient({baseUrl:"http://localhost:8787",token:"test"});
  const root=await loadFilePages(client,"ws",{});expect(root.items.map(item=>item.path)).toEqual(["docs","root.txt"]);
  const nested=await loadFilePages(client,"ws",{directory:"docs"});expect(nested.items.map(item=>item.path)).toEqual(["docs/report.txt"]);
  const search=await loadFilePages(client,"ws",{query:"report"});expect(search.items.map(item=>item.path)).toEqual(["docs/report.txt"]);
  expect(browserCalls).toBe(1);expect(snapshots).toBe(6);expect(closed).toBe(3);
 }finally{globalThis.fetch=original;}
});
test("workspace not found and permission errors never trigger legacy fallback",async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=Object.assign(async()=>{calls++;return Response.json({code:"workspace_not_found",message:"Workspace missing"},{status:404});},{preconnect:original.preconnect});
 try{const client=createGet3wServerClient({baseUrl:"http://localhost:8787",token:"test"});await expect(loadFilePages(client,"ws",{})).rejects.toThrow("Workspace missing");expect(calls).toBe(1);}finally{globalThis.fetch=original;}
});
test("older services report restart guidance instead of attempting unsafe legacy writes",async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=Object.assign(async()=>{calls++;return Response.json({code:"not_found",message:"Not found"},{status:404});},{preconnect:original.preconnect});
 try{const client=createGet3wServerClient({baseUrl:"http://localhost:8787",token:"test"});await expect(client.operateWorkspaceFile("ws",{type:"rename",path:"a.txt",to:"b.txt"})).rejects.toThrow(t("files.restartService"));expect(calls).toBe(1);}finally{globalThis.fetch=original;}
});
