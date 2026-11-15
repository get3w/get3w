import { test, expect } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir, symlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerFileRoutes } from "../src/routes/files";
import { matchRoute, type Route } from "../src/routes/registry";
import { ApprovalService } from "../src/approvals";
import { TokenService } from "../src/tokens";
import { UiControlMailbox } from "../src/ui-control";
import { ReloadEventStore } from "../src/events";
import type { ServerConfig } from "../src/types";

async function fixture(run: (root: string, request: (method: string, path: string, body?: Record<string, unknown>) => Promise<Response>) => Promise<void>) {
 const root = await mkdtemp(join(tmpdir(), "get3w-file-browser-"));
 const config: ServerConfig = { host:"127.0.0.1",port:0,token:"client",hostToken:"host",configPath:join(root,"config.json"),approval:{mode:"auto",timeoutMs:2000},corsOrigins:[],workspaces:[],authorizedRoots:[],readOnly:false,startedAt:0,tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false };
 const routes: Route[] = [];
 registerFileRoutes({ routes, config, jsonResponse:(value,status=200)=>Response.json(value,{status}), readJsonBody:request=>request.json(), ensureWritable:()=>{if(config.readOnly)throw Error("read-only");}, requireApproval:async()=>{}, requireClientScope:()=>{}, resolveWorkspace:async()=>({id:"ws",name:"Test",path:root,workspaceType:"local"}), resolveInboxEnabled:()=>true,resolveOutboxEnabled:()=>true,resolveInboxMaxBytes:()=>1000,scopeRank:()=>1 });
 async function request(method: string, path: string, body?: Record<string, unknown>) {
  const url = new URL("http://localhost" + path);
  const route = matchRoute(routes, method, url.pathname); if (!route) throw Error("Missing route");
  return route.handler({request:new Request(url,{method,...(body?{body:JSON.stringify(body)}:{})}),url,params:route.params,config,approvals:new ApprovalService(config.approval),tokens:new TokenService(config),uiControl:new UiControlMailbox(),reloadEvents:new ReloadEventStore(),actor:{type:"host"}});
 }
 try { await run(root, request); } finally { await rm(root,{recursive:true,force:true}); }
}
test("browser lists direct children, hidden files, optional system directories and pages", () => fixture(async(root, request) => {
 await mkdir(join(root,"folder")); await writeFile(join(root,"folder","inside.txt"),"nested");
 await mkdir(join(root,".git")); await writeFile(join(root,".hidden"),"hidden");
 const page = await (await request("GET","/workspace/ws/files/browser?limit=1")).json();
 expect(page.items).toHaveLength(1); expect(page.truncated).toBe(true);
 const next = await (await request("GET",`/workspace/ws/files/browser?after=${encodeURIComponent(page.nextAfter)}`)).json();
 expect(next.items.map((x:{path:string})=>x.path)).toEqual(["folder"]);
 const nested = await (await request("GET","/workspace/ws/files/browser?directory=folder")).json();
 expect(nested.items[0].path).toBe("folder/inside.txt");
 const system = await (await request("GET","/workspace/ws/files/browser?showSystem=true")).json();
 expect(system.items.some((x:{path:string})=>x.path===".git")).toBe(true);
}));
test("recursive search pagination does not skip prefix siblings", () => fixture(async(root, request) => {
 await mkdir(join(root,"a")); await writeFile(join(root,"a","match.txt"),""); await writeFile(join(root,"a.match.txt"),"");
 const first = await (await request("GET","/workspace/ws/files/browser?query=match&limit=1")).json();
 const next = await (await request("GET",`/workspace/ws/files/browser?query=match&limit=1&after=${encodeURIComponent(first.nextAfter)}`)).json();
 expect([...first.items,...next.items].map((x:{path:string})=>x.path)).toEqual(["a/match.txt","a.match.txt"]);
}));
test("creates, moves, renames and deletes without overwriting or escaping", () => fixture(async(root,request) => {
 const op = (body:Record<string,unknown>) => request("POST","/workspace/ws/files/browser/ops",body);
 await op({type:"mkdir",path:"目录"}); await op({type:"create",path:"报告.txt"}); await writeFile(join(root,"报告.txt"),"keep");
 await op({type:"create",path:"exists.txt"});
 await expect(op({type:"rename",path:"报告.txt",to:"exists.txt"})).rejects.toThrow("already exists");
 expect(await readFile(join(root,"报告.txt"),"utf8")).toBe("keep");
 await expect(op({type:"rename",path:"目录",to:"目录/child"})).rejects.toThrow("itself");
 await expect(op({type:"create",path:"../outside.txt"})).rejects.toThrow("traversal");
 await op({type:"rename",path:"报告.txt",to:"目录/renamed.txt"});
 expect(await readFile(join(root,"目录","renamed.txt"),"utf8")).toBe("keep");
 await op({type:"delete",path:"目录",recursive:true});
 await expect(readFile(join(root,"目录","renamed.txt"))).rejects.toThrow();
}));
test("symlinks are excluded and cannot be traversed by browser, writes or operations", () => fixture(async(root,request) => {
 await symlink(tmpdir(),join(root,"escape"));
 const list = await (await request("GET","/workspace/ws/files/browser")).json(); expect(list.items).toEqual([]);
 await expect(request("GET","/workspace/ws/files/browser?directory=escape")).rejects.toThrow("Symbolic");
 await expect(request("POST","/workspace/ws/files/browser/ops",{type:"create",path:"escape/test.txt"})).rejects.toThrow("Symbolic");
 await expect(request("POST","/workspace/ws/files/content",{path:"escape/test.txt",content:"bad",fileScope:"workspace"})).rejects.toThrow("Symbolic");
}));
test("deleted files cannot be resurrected by saving an old draft", () => fixture(async(root,request) => {
 await writeFile(join(root,"report.txt"),"original");
 const loaded=await (await request("GET","/workspace/ws/files/content?path=report.txt&fileScope=workspace")).json();
 await rm(join(root,"report.txt"));
 await expect(request("POST","/workspace/ws/files/content",{path:"report.txt",content:"draft",baseUpdatedAt:loaded.updatedAt,fileScope:"workspace"})).rejects.toThrow("changed");
}));
test("binary previews return native image, audio and video MIME types", () => fixture(async(root,request) => {
 for(const [name,mime] of [["clip.mp4","video/mp4"],["sound.mp3","audio/mpeg"],["picture.avif","image/avif"]]){
  await writeFile(join(root,name),"fixture");
  const response=await request("GET",`/workspace/ws/files/raw?path=${name}&fileScope=workspace`);
  expect(response.headers.get("content-type")).toBe(mime);
  await response.arrayBuffer();
 }
}));

test("shared output API allocates readable paths and file-manager moves retain old conversation links",()=>fixture(async(root,request)=>{
 const plan=await (await request("POST","/workspace/ws/files/deliverables",{action:"plan",key:"report",taskName:"销售分析",filename:"分析报告",extension:".txt"})).json();
 expect(plan.path).toBe("销售分析/分析报告.txt");
 await writeFile(join(root,plan.path),"report");
 await request("POST","/workspace/ws/files/deliverables",{action:"register",fileId:plan.fileId});
 await request("POST","/workspace/ws/files/browser/ops",{type:"rename",path:"销售分析",to:"销售总结"});
 const resolved=await (await request("POST","/workspace/ws/model-outputs",{action:"resolve",files:[{path:plan.path,fileId:plan.fileId}]})).json();
 expect(resolved.files[0].path).toBe("销售总结/分析报告.txt");
 const content=await (await request("POST","/workspace/ws/model-outputs",{action:"read",fileId:plan.fileId,path:plan.path})).json();expect(atob(content.dataBase64)).toBe("report");
 const targets=await (await request("POST","/workspace/ws/artifacts/resolve",{targets:[{kind:"file",value:plan.path}]})).json();
 expect(JSON.stringify(targets)).toContain("销售总结/分析报告.txt");
 await request("POST","/workspace/ws/files/browser/ops",{type:"delete",path:"销售总结",recursive:true});
 const removed=await (await request("POST","/workspace/ws/model-outputs",{action:"resolve",files:[{path:plan.path,fileId:plan.fileId}]})).json();expect(removed.files[0].missing).toBe(true);
}));
