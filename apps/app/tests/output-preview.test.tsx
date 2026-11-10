import {beforeAll,afterAll,test,expect} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
import {createRoot} from "react-dom/client";
import {OutputPreview,outputKind} from "../src/react-app/domains/cloud/output-preview";
let originalObserver:typeof IntersectionObserver;
beforeAll(()=>{GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);originalObserver=globalThis.IntersectionObserver;Reflect.set(globalThis,"IntersectionObserver",undefined);});
afterAll(()=>{Reflect.set(globalThis,"IntersectionObserver",originalObserver);GlobalRegistrator.unregister();});
test("classification keeps HTML as a document, with media and 3D deterministic",()=>{
 expect(outputKind("report.html")).toBe("document");expect(outputKind("model.glb")).toBe("3d");expect(outputKind("image.png?token=redacted")).toBe("image");expect(outputKind("music.mp3")).toBe("audio");expect(outputKind("result.json")).toBe("text");
});
test("HTML preview has no scripts, forms or same-origin privileges and blocks network requests",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const previousCreate=URL.createObjectURL,previousRevoke=URL.revokeObjectURL;
 URL.createObjectURL=()=>"blob:fixture";URL.revokeObjectURL=()=>{};
 try{
  await act(async()=>{root.render(<OutputPreview file={{path:"preview.html",mimeType:"text/html",sizeBytes:50}} read={async()=>({dataBase64:btoa('<script>top.alert("bad")</script><p>Safe content</p>'),mimeType:"text/html",sizeBytes:50})}/>);});
  const frame=node.querySelector("iframe");expect(frame?.getAttribute("sandbox")).toBe("");expect(frame?.getAttribute("srcdoc")).toContain("default-src 'none'");expect(frame?.getAttribute("srcdoc")).toContain("form-action 'none'");expect(node.querySelector("script")).toBeNull();
 }finally{await act(async()=>root.unmount());node.remove();URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;}
});

test("generated image is visible, downloadable and releases its local URL on unmount",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const previousCreate=URL.createObjectURL,previousRevoke=URL.revokeObjectURL;
 const revoked:string[]=[];let mime="";
 URL.createObjectURL=blob=>{if(blob instanceof Blob)mime=blob.type;return "blob:cat-image";};
 URL.revokeObjectURL=url=>{revoked.push(url);};
 try{
  await act(async()=>{root.render(<OutputPreview file={{path:"outputs/cat.png",mimeType:"image/png",sizeBytes:68}} read={async()=>({dataBase64:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",mimeType:"image/png",sizeBytes:68})}/>);});
  expect(mime).toBe("image/png");
  expect(node.querySelector("img")?.getAttribute("src")).toBe("blob:cat-image");
  expect(node.querySelector("img")?.getAttribute("alt")).toBe("outputs/cat.png");
  expect(node.querySelector("a")?.getAttribute("download")).toBe("cat.png");
  expect(node.querySelector("a")?.getAttribute("href")).toBe("blob:cat-image");
  expect(node.querySelector('[aria-busy="true"]')).toBeNull();
 }finally{await act(async()=>root.unmount());node.remove();URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;}
 expect(revoked).toEqual(["blob:cat-image"]);
});

test("failed image read offers retry and shows the recovered image",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const previousCreate=URL.createObjectURL,previousRevoke=URL.revokeObjectURL;let reads=0;
 URL.createObjectURL=()=>"blob:recovered-cat";URL.revokeObjectURL=()=>{};
 try{
  await act(async()=>{root.render(<OutputPreview file={{path:"cat.png",mimeType:"image/png",sizeBytes:1}} read={async()=>{
   reads++;if(reads===1)throw Error("temporarily unavailable");
   return {dataBase64:"AA==",mimeType:"image/png",sizeBytes:1};
  }}/>);});
  expect(node.querySelector('[role="alert"]')).not.toBeNull();
  expect(node.querySelector("img")).toBeNull();
  const retry=node.querySelector('[role="alert"] button');
  if(!(retry instanceof HTMLElement))throw Error("Missing retry button");
  await act(async()=>retry.click());
  expect(reads).toBe(2);
  expect(node.querySelector('[role="alert"]')).toBeNull();
  expect(node.querySelector("img")?.getAttribute("src")).toBe("blob:recovered-cat");
 }finally{await act(async()=>root.unmount());node.remove();URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;}
});
