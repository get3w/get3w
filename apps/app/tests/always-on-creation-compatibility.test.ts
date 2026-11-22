import {expect,test} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {createGet3wServerClient} from "../src/app/lib/get3w-server";
import {setLocale} from "../src/i18n";
if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost/"});
const payload:{folderPath:string;name:string;preset:string;workspaceType:"always-on"}={folderPath:"/tmp/fixture",name:"Fixture",preset:"starter",workspaceType:"always-on"};
test("old service is rejected before creating a workspace; ordinary creation remains unchanged",async()=>{
 const original=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=async input=>{const path=new URL(String(input)).pathname;calls.push(path);return Response.json(path==="/capabilities"?{}:{activeId:"w",workspaces:[{id:"w",workspaceType:"local"}]});};
 try{setLocale("zh");const client=createGet3wServerClient({baseUrl:"http://localhost:1234"});
 await expect(client.createLocalWorkspace(payload)).rejects.toThrow("完全退出并重新打开");expect(calls).toEqual(["/capabilities"]);
 calls.length=0;await client.createLocalWorkspace({folderPath:"/tmp/local",name:"Local",preset:"starter"});expect(calls).toEqual(["/workspaces/local"]);
 }finally{globalThis.fetch=original;}
});
test("creation checks returned type and accepts only an always-on result",async()=>{
 const original=globalThis.fetch;let kind="local";
 globalThis.fetch=async input=>Response.json(new URL(String(input)).pathname==="/capabilities"?{alwaysOn:{create:true}}:{activeId:"w",workspaces:[{id:"w",workspaceType:kind}]});
 try{setLocale("zh");const client=createGet3wServerClient({baseUrl:"http://localhost:1234"});await expect(client.createLocalWorkspace(payload)).rejects.toThrow("未正确创建");kind="always-on";expect((await client.createLocalWorkspace(payload)).workspaces[0]?.workspaceType).toBe("always-on");}
 finally{globalThis.fetch=original;}
});
