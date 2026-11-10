import {test,expect} from "bun:test";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {registerFileRoutes} from "../src/routes/files";
import {matchRoute,type Route} from "../src/routes/registry";
import {ApprovalService} from "../src/approvals";
import {TokenService} from "../src/tokens";
import {UiControlMailbox} from "../src/ui-control";
import {ReloadEventStore} from "../src/events";
import type {ServerConfig} from "../src/types";

test("history indexes owned conversation folders and reads the exact conversation copy",async()=>{
 const root=await mkdtemp(join(tmpdir(),"get3w-output-routes-")),moved=await mkdtemp(join(tmpdir(),"get3w-output-moved-"));
 const config:ServerConfig={host:"127.0.0.1",port:0,token:"client",hostToken:"host",configPath:join(root,"config.json"),approval:{mode:"auto",timeoutMs:2000},corsOrigins:[],workspaces:[],authorizedRoots:[],readOnly:false,startedAt:0,tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
 const routes:Route[]=[];
 registerFileRoutes({routes,config,jsonResponse:(value,status=200)=>Response.json(value,{status}),readJsonBody:request=>request.json(),ensureWritable:()=>{},requireApproval:async()=>{},requireClientScope:()=>{},resolveWorkspace:async()=>({id:"ws",name:"Test",path:root,workspaceType:"local"}),resolveInboxEnabled:()=>true,resolveOutboxEnabled:()=>true,resolveInboxMaxBytes:()=>1000,scopeRank:()=>1,resolveSessionDirectory:async(_workspace,id)=>id==="ses_owned"?moved:null,listOutputSessions:async()=>[{sessionId:"ses_owned",directory:moved}]});
 async function request(body:Record<string,unknown>){
  const route=matchRoute(routes,"POST","/workspace/ws/model-outputs");if(!route)throw Error("Missing route");expect(route.auth).toBe("host-token");
  const url=new URL("http://127.0.0.1/workspace/ws/model-outputs");
  return route.handler({request:new Request(url,{method:"POST",body:JSON.stringify(body)}),url,params:route.params,config,approvals:new ApprovalService(config.approval),tokens:new TokenService(config),uiControl:new UiControlMailbox(),reloadEvents:new ReloadEventStore(),actor:{type:"host"}});
 }
 try{
  await writeFile(join(root,"report.txt"),"home");await writeFile(join(moved,"report.txt"),"conversation");
  const index=await (await request({action:"index"})).json();
  expect(index.items).toHaveLength(2);
  expect(index.items.some((file:{sessionId?:string})=>file.sessionId==="ses_owned")).toBe(true);
  const result=await (await request({action:"read",sessionId:"ses_owned",path:"report.txt"})).json();
  expect(Buffer.from(result.dataBase64,"base64").toString()).toBe("conversation");
  await expect(request({action:"read",sessionId:"ses_foreign",path:"report.txt"})).rejects.toThrow("Conversation directory unavailable");
 }finally{await rm(root,{recursive:true,force:true});await rm(moved,{recursive:true,force:true});}
});
