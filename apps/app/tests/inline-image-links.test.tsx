import {afterAll,expect,test} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
import {createRoot} from "react-dom/client";
import {MarkdownBlock} from "../src/components/markdown/markdown";
import {renderMarkdownHtml} from "../src/components/markdown/markdown-primitive";
import {OpenTargetProvider} from "../src/lib/target-provider";
import {createOpenworkServerClient} from "../src/app/lib/openwork-server";
if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost/"});
Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);
afterAll(async()=>{await GlobalRegistrator.unregister();});
test("file chip precedes local image preview, other links stay unchanged",()=>{
 const node=document.createElement("div");node.innerHTML=renderMarkdownHtml("[Cup](/workspace/cup.png)");
 expect(node.querySelector("img")?.closest("button")?.previousElementSibling?.querySelector("a")?.textContent).toBe("Cup");
 for(const text of ["[Document](report.pdf)","[Web](https://example.com/cup.png)"])expect(renderMarkdownHtml(text)).not.toContain("data-openwork-image-path");
 expect(renderMarkdownHtml("[Cup](cup.png)","remote")).not.toContain("data-openwork-image-path");
});
test("workspace image loads within session and releases its URL",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const client=createOpenworkServerClient({baseUrl:"http://localhost"});const reads:unknown[]=[];
 client.downloadWorkspaceFile=async(...args)=>{reads.push(args);return {data:new Uint8Array([1,2,3]),contentType:"image/png",filename:"cup.png"};};
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;const revoked:string[]=[];
 URL.createObjectURL=()=>"blob:cup";URL.revokeObjectURL=url=>{revoked.push(url);};
 try{
  await act(async()=>root.render(<OpenTargetProvider client={client} workspaceId="ws" workspaceRoot="/workspace" sessionId="session"><MarkdownBlock text="[Cup](/workspace/cup.png)"/></OpenTargetProvider>));
  expect(reads).toEqual([["ws","cup.png",{sessionId:"session",fileScope:undefined}]]);
  expect(node.querySelector("img")?.getAttribute("src")).toBe("blob:cup");
  expect(node.querySelector("img")?.closest("button")?.hidden).toBe(false);
 }finally{await act(async()=>root.unmount());node.remove();URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
 expect(revoked).toEqual(["blob:cup"]);
});
