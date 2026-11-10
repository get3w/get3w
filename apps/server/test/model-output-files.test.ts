import {test,expect} from "bun:test";
import {mkdtemp,rm,writeFile,symlink,mkdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {saveModelOutput,readOutputFile,indexOutputFiles,trustedOutputUrl,OUTPUT_MAX_BYTES} from "../src/model-output-files";
const key="a".repeat(64);
test("downloads are durable, idempotent and scoped; unsupported sources, redirects and excess bytes fail",async()=>{
 const root=await mkdtemp(join(tmpdir(),"model-output-"));let calls=0;
 const fetcher:typeof fetch=async(_url,options)=>{calls++;expect(options?.redirect).toBe("error");return new Response("image bytes");};
 try{
  const file=await saveModelOutput(root,key,"https://xianchou.com/result.png",fetcher);
  expect(file.sizeBytes).toBe(11);expect(file.mimeType).toBe("image/png");
  expect(await saveModelOutput(root,key,"https://xianchou.com/result.png?renewed",fetcher)).toEqual(file);expect(calls).toBe(1);
  expect((await readOutputFile(root,file.path)).dataBase64).toBe(Buffer.from("image bytes").toString("base64"));
  for(const url of ["http://xianchou.com/a.png","https://xianchou.com.evil/a.png","https://u@xianchou.com/a.png","https://127.0.0.1/a.png"])expect(()=>trustedOutputUrl(url)).toThrow();
  await expect(saveModelOutput(root,key,"https://xianchou.com/tool.exe",fetcher)).rejects.toThrow();
  const large:typeof fetch=async()=>new Response("x",{headers:{"content-length":String(OUTPUT_MAX_BYTES+1)}});
  await expect(saveModelOutput(root,key,"https://xianchou.com/large.mp4",large)).rejects.toThrow("limit");
  await expect(readOutputFile(root,"../secret.txt")).rejects.toThrow();
  const index=await indexOutputFiles(root);expect(index.items.map(row=>row.path)).toContain(file.path);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("history index classifies supported files and excludes links, hidden files and dependencies",async()=>{
 const root=await mkdtemp(join(tmpdir(),"model-index-")),outside=await mkdtemp(join(tmpdir(),"model-outside-"));
 try{
  await writeFile(join(root,"report.docx"),"doc");await writeFile(join(root,"preview.html"),"<script>bad()</script>");
  await writeFile(join(outside,"secret.pdf"),"secret");await symlink(outside,join(root,"link"));
  await mkdir(join(root,"node_modules"));await writeFile(join(root,"node_modules","hidden.pdf"),"hidden");await writeFile(join(root,".secret.txt"),"hidden");
  expect((await indexOutputFiles(root)).items.map(row=>row.path).sort()).toEqual(["preview.html","report.docx"]);
  await expect(readOutputFile(root,"link/secret.pdf")).rejects.toThrow();
  await expect(saveModelOutput(root,"bad","https://xianchou.com/a.png")).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
