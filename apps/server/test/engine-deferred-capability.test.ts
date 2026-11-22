import { test, expect } from "bun:test";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { probeDeferredQuestions, supportsDeferredQuestions } from "../src/engine-deferred-capability";
const supported={protocol:"get3w-deferred-questions",version:1,actions:["bind","pause","list","read","answer","commit","resume","cancel"]};
test("capability negotiation requires the complete known protocol",()=>{
 expect(supportsDeferredQuestions(supported)).toBe(true);
 for(const value of [null,{}, {...supported,version:2},{...supported,actions:["bind"]},{...supported,protocol:"other"}])expect(supportsDeferredQuestions(value)).toBe(false);
});
test("capability probe accepts supported executables and safely rejects old or malformed engines",async()=>{
 const root=await mkdtemp(join(tmpdir(),"get3w-capabilities-"));
 try {
  for(const [name,body,expected] of [["new",JSON.stringify(supported),true],["old","legacy help",false],["partial",JSON.stringify({...supported,actions:["bind"]}),false]] as const){
   const bin=join(root,name);await writeFile(bin,`#!/bin/sh\nprintf '%s' '${body}'\n`);await chmod(bin,0o755);
   expect(await probeDeferredQuestions(bin,{PATH:process.env.PATH??""})).toBe(expected);
  }
  expect(await probeDeferredQuestions(join(root,"missing"),{})).toBe(false);
 }finally{await rm(root,{recursive:true,force:true});}
});
