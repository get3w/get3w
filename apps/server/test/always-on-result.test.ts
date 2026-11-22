import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyAlwaysOnResult } from "../src/always-on-result";
test("file evidence verifies no change, rejects missing, stale, wrong-event, outside and symlink artifacts", async () => {
 const root = await mkdtemp(join(tmpdir(),"always-on-result-")); const id="event-fixture"; const start=Date.now()-1000;
 try {
  const base=join(root,".get3w/always-on"); await mkdir(join(base,"results"),{recursive:true});
  const path=join(base,`results/${id}.json`);
  async function result(artifacts:string[],eventId=id) {await writeFile(path,JSON.stringify({eventId,outcome:"no_change",summary:"Source checked without change",artifacts}));}
  await result([]); await writeFile(join(base,"checkpoint.md"),`Verified ${id}`);
  expect((await verifyAlwaysOnResult(root,id,start,Date.now())).status).toBe("verified");
  await result(["missing.txt"]); expect((await verifyAlwaysOnResult(root,id,start,Date.now())).issues).toContain("artifact_missing");
  await writeFile(join(root,"report.txt"),"Observation evidence"); await result(["report.txt"]); expect((await verifyAlwaysOnResult(root,id,start,Date.now())).status).toBe("verified");
  await symlink(join(root,"report.txt"),join(root,"link.txt"));
  for(const bad of ["../outside.txt","/etc/hosts","link.txt",".get3w/always-on/state.json"]) {await result([bad]);expect((await verifyAlwaysOnResult(root,id,start,Date.now())).issues).toContain("artifact_missing");}
  await result(["report.txt", ".get3w/always-on/checkpoint.md", `.get3w/always-on/results/${id}.json`]); expect((await verifyAlwaysOnResult(root,id,start,Date.now())).status).toBe("verified");
  await result([],"another-event"); expect((await verifyAlwaysOnResult(root,id,start,Date.now())).issues).toContain("result_invalid");
  await result([]); await utimes(path,1,1); expect((await verifyAlwaysOnResult(root,id,start,Date.now())).issues).toContain("result_invalid");
  await result([]); await writeFile(join(base,"checkpoint.md"),"Old unrelated checkpoint"); expect((await verifyAlwaysOnResult(root,id,start,Date.now())).issues).toContain("checkpoint_missing");
 } finally {await rm(root,{recursive:true,force:true});}
});
test("notification intent is independent from outcome and send requires explicit text",async()=>{
 const root=await mkdtemp(join(tmpdir(),"result-notification-"));
 try{
  const base=join(root,".get3w/always-on");await mkdir(join(base,"results"),{recursive:true});await writeFile(join(base,"checkpoint.md"),"Verified notice");
  for(const notification of [undefined,{action:"quiet"},{action:"send",text:"Important change"},{action:"send"}]){
   await writeFile(join(base,"results/notice.json"),JSON.stringify({eventId:"notice",outcome:"no_change",summary:"Checked",artifacts:[],notification}));
   const verified=await verifyAlwaysOnResult(root,"notice",Date.now()-10000,Date.now());
   expect(verified.status).toBe(notification?.action==="send"&&!('text' in notification)?"needs_review":"verified");
   if(verified.status==="verified")expect(verified.notification).toEqual(notification);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
