import { test, expect } from "bun:test";
import { ApprovalService } from "../src/approvals.js";
import { registerOperationRoutes } from "../src/routes/operations.js";
import { matchRoute, type Route } from "../src/routes/registry.js";
import { ReloadEventStore } from "../src/events.js";
import { UiControlMailbox } from "../src/ui-control.js";
import { TokenService } from "../src/tokens.js";
import type { ServerConfig } from "../src/types.js";
import { createGet3wManagedMcp } from "../../desktop/electron/get3w-managed-mcp.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("managed proxy reaches the real approval service; explicit allow and deny gate cloud in auto mode", async () => {
 const root = await mkdtemp(join(tmpdir(), "get3w-approval-bridge-"));
 const config: ServerConfig = {host:"127.0.0.1",port:0,token:"client",hostToken:"host",configPath:join(root,"server.json"),approval:{mode:"auto",timeoutMs:2000},corsOrigins:[],workspaces:[],authorizedRoots:[],readOnly:false,startedAt:0,tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
 const approvals = new ApprovalService(config.approval);
 const routes: Route[] = [];
 registerOperationRoutes({routes,config,jsonResponse:(value,status=200)=>Response.json(value,{status}),readJsonBody:request=>request.json(),requireClientScope:()=>{},resolveWorkspace:async()=>({id:"ws",name:"Test",path:root,workspaceType:"local"}),reloadOpencodeEngine:async()=>{}});
 let definition: {url:string;headers:Record<string,string>} | undefined;
 let cloudCalls=0;
 const manager=createGet3wManagedMcp({userData:root,auth:{status:async()=>({status:"signed_in",user:{id:"u"}}),
 // The model guard verifies every quote and submit against the signed-in catalog.
 taskCatalog:async()=>({models:[{model_id:"p/m/run",type:"text-to-image",api_schema:{api_schemas:[{request_schema:{properties:{prompt:{type:"string"}}}}]}}]}),submitPersonal:async()=>{cloudCalls++;return {request_id:"request"};},mcp:async input=>{const message=JSON.parse(input.body.toString());const call=message.params.arguments;let value;
 if(message.params.name==="search_capabilities") value={data:[{name:"quote",handler:"get3w.quote"},{name:"get3w.submit",handler:"get3w.submit"}]};
 else if(call.name==="quote") value={status:"succeeded",result:{quote_id:"q",slug:"p/m/run",currency:"USD",discounted_price:"0.1",expires_at:Math.floor(Date.now()/1000)+300}};
 else {cloudCalls++;value={request_id:"request"};}
 return {response:Response.json({jsonrpc:"2.0",id:7,result:{structuredContent:value}})};}},getServerInfo:async()=>({running:true,baseUrl:"http://127.0.0.1:1234",hostToken:"host",clientToken:"client",pid:1}),fetchImpl:async(url,options)=>{
  const pathname=new URL(url).pathname;
  if(pathname.endsWith("/mcp")) {
   if(options.method==="POST") definition=JSON.parse(options.body).config;
   return Response.json({items:definition?[{name:"get3w-account",source:"config.remote",config:definition}]:[]});
  }
  const route=matchRoute(routes,options.method,pathname);
  if(!route) return new Response(null,{status:404});
  expect(route.auth).toBe("host-token");expect(options.headers["X-Get3W-Host-Token"]).toBe("host");
  const request=new Request(url,options);
  return route.handler({request,url:new URL(url),params:route.params,config,approvals,tokens:new TokenService(config),uiControl:new UiControlMailbox(),reloadEvents:new ReloadEventStore(),actor:{type:"host"}});
 }});
 try {
  await manager.run({action:"enable",userId:"u",workspaceId:"ws",sessionId:"chat-session-123456"});
  let sessionId = "chat-session-123456";
  const hostContext = () => ({ sessionId, messageId: "message-basic-approval" });
  // Engine transport credentials alone cannot impersonate the trusted chat host.
  if(!definition) throw Error("Missing proxy");
  const untrusted = await fetch(definition.url,{method:"POST",headers:{...definition.headers,"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:7,method:"tools/call",params:{name:"search_capabilities",arguments:{}}})});
  expect(untrusted.status).toBe(403);
  expect(approvals.list()).toHaveLength(0);
  expect(cloudCalls).toBe(0);
  async function discoverAndQuote() {
   if(!definition) throw Error("Missing proxy");
   for(const params of [{name:"search_capabilities",arguments:{}},{name:"execute_capability",arguments:{name:"quote",arguments:{slug:"p/m/run",inputs:{prompt:"test"}},idempotency_key:"quote"}}]) {
    const response=await fetch(definition.url,{method:"POST",headers:{...definition.headers,"X-Get3W-Host-Token":"host","Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:7,hostContext:hostContext(),method:"tools/call",params})});
    expect(response.status).toBe(200);await response.text();
   }
  }
  for(const reply of ["deny","allow"]) {
   if(reply==="allow") {
    sessionId = "chat-session-654321";
    await manager.run({action:"status",userId:"u",workspaceId:"ws",sessionId:"chat-session-654321"});
    // The saved ownership fingerprint must match the rotated proxy.
    expect((await manager.run({action:"status",userId:"u",workspaceId:"ws"})).enabled).toBe(true);
   }
   if(!definition) throw Error("Missing proxy");
   await discoverAndQuote();
   const result=fetch(definition.url,{method:"POST",headers:{...definition.headers,"X-Get3W-Host-Token":"host","Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:7,hostContext:hostContext(),method:"tools/call",params:{name:"execute_capability",arguments:{name:"get3w.submit",idempotency_key:"submit",arguments:{slug:"p/m/run",inputs:{prompt:"test"},quote_id:"q",session_id:reply==="allow"?"chat-session-654321":"chat-session-123456",idempotency_key:"submit"}}}})});
   for(let i=0;i<100&&!approvals.list().length;i++) await Bun.sleep(5);
   const pending=approvals.list()[0];expect(pending.action).toBe("model.submit");expect(cloudCalls).toBe(0);
   approvals.respond(pending.id,reply==="allow"?"allow":"deny");
   const payload=await (await result).json();
   if(reply==="deny") expect(payload.error.code).toBe(-32003); else expect(payload.result.structuredContent.result.request_id).toBe("request");
  }
  expect(cloudCalls).toBe(1);
 } finally {await manager.close();await rm(root,{recursive:true,force:true});}
});
