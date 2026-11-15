import {test,expect} from "bun:test";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {proxyOpencodeV2Request} from "../src/server.js";
import {listThreadApprovals} from "../src/thread-approvals.js";
import type {ServerConfig} from "../src/types.js";

test("chat always replies become once in the engine; native global grants and imported permissions are blocked",async()=>{
 const root=await mkdtemp(join(tmpdir(),"permission-proxy-"));
 const config={configPath:join(root,"server.json"),workspaces:[],readOnly:false} as ServerConfig;
 const forwarded:unknown[]=[];
 const engine=Bun.serve({port:0,hostname:"127.0.0.1",fetch:async req=>{
  const path=new URL(req.url).pathname;
  if(path==="/api/session/ses_a/message")return Response.json({data:[],cursor:{next:null}});
  if(path==="/api/session/ses_a")return Response.json({data:{id:"ses_a",location:{directory:root}}});
  if(path==="/api/session/ses_a/permission"&&req.method==="GET")return Response.json({data:[{id:"per_a",action:"shell",resources:["git status"],save:["git status*"]}]});
  if(path.endsWith("/reply")){forwarded.push(await req.json());return new Response(null,{status:204});}
  return new Response(null,{status:404});
 }});
 const send=async(path:string,body:unknown,method="POST")=>{
  const url=new URL(`http://test/workspace/ws/opencode2${path}`);
  return proxyOpencodeV2Request({actor:{type:"host"},config,request:new Request(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)}),url,workspace:{id:"ws",name:"Test",path:root,preset:"default",workspaceType:"local"},proxyPath:`/opencode2${path}`,connection:{url:engine.url.href,username:"test",password:"test"}});
 };
 try{
  expect((await send("/api/session/ses_a/permission/per_a/reply",{decision:"always"})).status).toBe(204);
  expect(forwarded).toEqual([{decision:"once",reply:"once"}]);
  expect(await listThreadApprovals(config,"ws","ses_a")).toEqual([{permission:"shell",patterns:["git status*"]}]);
  await expect(send("/api/session/ses_a",{permissions:[{effect:"allow"}]},"PATCH")).rejects.toThrow("Use Desktop");
  await expect(send("/api/permission/saved/global",{},"PATCH")).rejects.toThrow("Use Desktop");
  await expect(send("/api/experimental/session/import",{info:{permissions:[{effect:"allow"}]}})).rejects.toThrow("Imported permissions");
 }finally{engine.stop(true);}
});
