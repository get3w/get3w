import {test,expect} from "bun:test";
import {mkdtemp,mkdir,rm,readFile,writeFile,rename,symlink} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {deliverableName,planDeliverable,saveDeliverableBytes,resolveDeliverable,registerDeliverable,relocateDeliverables,resolveDeliverableAlias} from "../src/workspace-deliverables";
import {EnvService} from "../src/env-file";
import {callOpenAiImageGenerationExtensionAction} from "../src/extensions/openai-image-generation";
import {saveModelOutput} from "../src/model-output-files";
import type {ServerConfig,WorkspaceInfo} from "../src/types";
async function fixture(run:(config:ServerConfig,workspace:WorkspaceInfo)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),"deliverables-"));
 const config:ServerConfig={host:"127.0.0.1",port:0,token:"t",hostToken:"h",configPath:join(root,"state","config.json"),approval:{mode:"auto",timeoutMs:1000},corsOrigins:[],workspaces:[],authorizedRoots:[],readOnly:false,startedAt:0,tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
 const path=join(root,"workspace");await mkdir(path);const workspace:WorkspaceInfo={id:"ws",name:"项目",path,preset:"starter",workspaceType:"local"};config.workspaces=[workspace];
 try{await run(config,workspace);}finally{await rm(root,{recursive:true,force:true});}
}
test("readable Unicode names, deterministic allocation, parallel collisions and user files are preserved",()=>fixture(async(config,workspace)=>{
 expect(deliverableName('../宣传/片:*')).toBe('-宣传-片--');
 await mkdir(join(workspace.path,"品牌宣传片"));await writeFile(join(workspace.path,"品牌宣传片","主视觉.png"),"original");
 const request={taskName:"品牌宣传片",filename:"主视觉.png",extension:".png"};
 const plans=await Promise.all(Array.from({length:5},(_,i)=>planDeliverable(config,workspace,{...request,key:String(i)})));
 expect(plans.map(plan=>plan.path)).toEqual([2,3,4,5,6].map(i=>`品牌宣传片/主视觉-${i}.png`));
 expect(await planDeliverable(config,workspace,{...request,key:"0"})).toEqual(plans[0]);
 const bytes=new TextEncoder().encode("image");await saveDeliverableBytes(config,workspace,plans[0],bytes);
 expect(await readFile(join(workspace.path,plans[0].path),"utf8")).toBe("image");
 expect(await readFile(join(workspace.path,"品牌宣传片","主视觉.png"),"utf8")).toBe("original");
 await saveDeliverableBytes(config,workspace,plans[0],new TextEncoder().encode("different"));
 expect(await readFile(join(workspace.path,plans[0].path),"utf8")).toBe("image");
}));
test("folder moves retain file identity and aliases; deleted outputs are never resurrected",()=>fixture(async(config,workspace)=>{
 const plan=await planDeliverable(config,workspace,{key:"one",taskName:"销售分析",filename:"报告",extension:".docx"});
 await saveDeliverableBytes(config,workspace,plan,new TextEncoder().encode("doc"));
 await rename(join(workspace.path,"销售分析"),join(workspace.path,"销售报告"));await relocateDeliverables(config,workspace,"销售分析","销售报告");
 const moved=await resolveDeliverable(config,workspace,plan.fileId);expect(moved.path).toBe("销售报告/报告.docx");expect(moved.fileId).toBe(plan.fileId);
 expect(await resolveDeliverableAlias(config,workspace,plan.path)).toBe(moved.path);
 expect(await resolveDeliverableAlias(config,workspace,"销售分析")).toBe("销售报告");
 expect((await planDeliverable(config,workspace,{key:"one",extension:".docx"})).path).toBe(moved.path);
 await rm(join(workspace.path,moved.path));await relocateDeliverables(config,workspace,moved.path);
 await expect(planDeliverable(config,workspace,{key:"one",extension:".docx"})).rejects.toThrow("deleted");
}));
test("edits stay beside the source; local exports register; traversal and symlink directories fail",()=>fixture(async(config,workspace)=>{
 await mkdir(join(workspace.path,"原图"));await writeFile(join(workspace.path,"原图","猫.png"),"cat");
 const plan=await planDeliverable(config,workspace,{key:"edit",sourcePath:"原图/猫.png",filename:"猫",extension:".png"});expect(plan.path).toBe("原图/猫-2.png");
 await writeFile(join(workspace.path,plan.path),"edit");expect((await registerDeliverable(config,workspace,plan.fileId)).sizeBytes).toBe(4);
 await expect(planDeliverable(config,workspace,{key:"bad",directory:"../escape",extension:".png"})).rejects.toThrow();
 await symlink(tmpdir(),join(workspace.path,"link"));await expect(planDeliverable(config,workspace,{key:"link",directory:"link",extension:".png"})).rejects.toThrow();
}));
test("explicit workspace root and absolute child destinations retain safety boundaries",()=>fixture(async(config,workspace)=>{
 for(const [key,directory] of [["absolute-root",workspace.path],["relative-root","."]]){
  const plan=await planDeliverable(config,workspace,{key,directory,filename:key,extension:".csv"});
  expect(plan.path).toBe(`${key}.csv`);
 }
 const child=await planDeliverable(config,workspace,{key:"child",directory:join(workspace.path,"reports"),filename:"report",extension:".docx"});
 expect(child.path).toBe("reports/report.docx");
 await writeFile(join(workspace.path,"source.docx"),"source");
 const edit=await planDeliverable(config,workspace,{key:"absolute-source",sourcePath:join(workspace.path,"source.docx"),filename:"source",extension:".docx"});
 expect(edit.path).toBe("source-2.docx");
 await expect(planDeliverable(config,workspace,{key:"outside",directory:tmpdir(),extension:".csv"})).rejects.toThrow();
 await symlink(tmpdir(),join(workspace.path,"outside-link"));
 await expect(planDeliverable(config,workspace,{key:"linked",directory:join(workspace.path,"outside-link"),extension:".csv"})).rejects.toThrow();
}));
test("native media uses the shared plan and retry does not redownload, including refreshed query tokens",()=>fixture(async(config,workspace)=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;return new Response("image");};
 const managed={config,workspace,request:{taskName:"品牌宣传片",filename:"产品主视觉",sessionId:"ses_one"}};
 const key="a".repeat(64),url="https://xianchou.com/result.png";
 const first=await saveModelOutput(workspace.path,key,url,fetcher,managed);
 expect(first.path).toBe("品牌宣传片/产品主视觉.png");
 const second=await saveModelOutput(workspace.path,key,url+"?renewed",fetcher,managed);expect(second).toEqual(first);expect(calls).toBe(1);
}));
test("a reserved path occupied by another file is never overwritten",()=>fixture(async(config,workspace)=>{
 const plan=await planDeliverable(config,workspace,{key:"collision",taskName:"任务",filename:"图",extension:".png"});
 await writeFile(join(workspace.path,plan.path),"user");
 await expect(saveDeliverableBytes(config,workspace,plan,new TextEncoder().encode("generated"))).rejects.toThrow("occupied");
 expect(await readFile(join(workspace.path,plan.path),"utf8")).toBe("user");
}));

test("image extension shares readable collision-safe naming and retries without a second generation",()=>fixture(async(config,workspace)=>{
 const env=new EnvService({path:join(workspace.path,"test-env.json")});await env.upsertMany([{key:"OPENAI_API_KEY",value:"fixture"}]);
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=Object.assign(async()=>{calls++;return Response.json({data:[{b64_json:Buffer.from("png").toString("base64")}]});},original);
 try{
  const args={prompt:"a cup",task_name:"品牌设计",filename:"产品图",task_key:"cup"};
  const first=await callOpenAiImageGenerationExtensionAction(config,env,"image_generate",args,{directory:workspace.path});
  expect(first?.path).toBe("品牌设计/产品图.png");
  const again=await callOpenAiImageGenerationExtensionAction(config,env,"image_generate",args,{directory:workspace.path});expect(again?.path).toBe(first?.path);expect(calls).toBe(1);
  const second=await callOpenAiImageGenerationExtensionAction(config,env,"image_generate",{...args,task_key:"cup-2"},{directory:workspace.path});expect(second?.path).toBe("品牌设计/产品图-2.png");
 }finally{globalThis.fetch=original;}
}));

test("older hashed media files are reused in place without downloading or renaming",()=>fixture(async(config,workspace)=>{
 const key="b".repeat(64),url="https://xianchou.com/old.png";
 const legacy=await saveModelOutput(workspace.path,key,url,async()=>new Response("old"));
 const result=await saveModelOutput(workspace.path,key,url,async()=>{throw Error("Must not download");},{config,workspace,request:{taskName:"新目录",filename:"新名称"}});
 expect(result.path).toBe(legacy.path);expect(await readFile(join(workspace.path,legacy.path),"utf8")).toBe("old");
}));

test("extension names with or without a leading dot allocate the same safe filename",()=>fixture(async(config,workspace)=>{
 const request={key:"json-export",directory:".",filename:"report.json"};
 const bare=await planDeliverable(config,workspace,{...request,extension:"json"});
 expect(bare.path).toBe("report.json");
 expect(await planDeliverable(config,workspace,{...request,extension:".json"})).toEqual(bare);
 await expect(planDeliverable(config,workspace,{key:"escape-extension",extension:"../json"})).rejects.toThrow("Invalid deliverable");
 await expect(planDeliverable(config,workspace,{key:"empty-extension",extension:""})).rejects.toThrow("Invalid deliverable");
}));


test("registering an unwritten collision path explains the reserved destination and preserves files",()=>fixture(async(config,workspace)=>{
 await writeFile(join(workspace.path,"report.md"),"original");
 const plan=await planDeliverable(config,workspace,{key:"collision-error",directory:".",filename:"report",extension:".md"});
 expect(plan.path).toBe("report-2.md");
 await expect(registerDeliverable(config,workspace,plan.fileId)).rejects.toMatchObject({status:422,code:"deliverable_not_written"});
 await expect(registerDeliverable(config,workspace,plan.fileId)).rejects.toThrow("report-2.md");
 expect((await resolveDeliverable(config,workspace,plan.fileId)).state).toBe("planned");
 expect(await readFile(join(workspace.path,"report.md"),"utf8")).toBe("original");
 await writeFile(join(workspace.path,plan.path),"new result");
 expect((await registerDeliverable(config,workspace,plan.fileId)).path).toBe(plan.path);
}));
