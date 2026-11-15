import {expect,test} from "bun:test";
import {createOpenworkServerClient} from "../src/app/lib/openwork-server";
import {searchWorkspaceMentionFiles} from "../src/react-app/domains/session/surface/composer/workspace-file-search";

test("mentions search workspace files including generated outputs without the engine git index",async()=>{
 const original=globalThis.fetch;let fallbackCalls=0;
 globalThis.fetch=Object.assign(async(input:string|URL|Request)=>{
  const url=new URL(String(input));expect(url.pathname).toBe("/workspace/ws/files/browser");expect(url.searchParams.get("query")).toBe("output");
  return Response.json({items:[{path:"generated/output.jpg",kind:"file"},{path:"output folder",kind:"dir"}],truncated:false});
 },{preconnect:original.preconnect});
 try{
  const client=createOpenworkServerClient({baseUrl:"http://localhost",token:"fixture"});
  expect(await searchWorkspaceMentionFiles(client,"ws","output",async()=>{fallbackCalls++;return [];})).toEqual(["generated/output.jpg","output folder/"]);
  expect(fallbackCalls).toBe(0);
 }finally{globalThis.fetch=original;}
});
test("typing just @ lists workspace root files and unavailable servers fall back",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=Object.assign(async(input:string|URL|Request)=>{expect(new URL(String(input)).searchParams.has("query")).toBe(false);return Response.json({items:[{path:"photo.jpg",kind:"file"}],truncated:false});},{preconnect:original.preconnect});
 try{const client=createOpenworkServerClient({baseUrl:"http://localhost",token:"fixture"});expect(await searchWorkspaceMentionFiles(client,"ws","",async()=>[])).toEqual(["photo.jpg"]);}finally{globalThis.fetch=original;}
 expect(await searchWorkspaceMentionFiles(null,"ws","out",async()=>["output.jpg"])).toEqual(["output.jpg"]);
});
