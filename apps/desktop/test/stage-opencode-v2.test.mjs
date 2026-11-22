import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageOpencodeV2 } from "../scripts/stage-opencode-v2.mjs";

test("source-built sidecar validates target and checksum before staging", async t => {
 const root=await mkdtemp(join(tmpdir(),"get3w-stage-v2-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const bytes=Buffer.from("isolated binary fixture");await writeFile(join(root,"opencode.exe"),bytes);
 const manifest={schema:1,target:"x86_64-pc-windows-msvc",version:"2.2.0-get3w.1",binary:"opencode.exe",sha256:createHash("sha256").update(bytes).digest("hex")};
 const path=join(root,"manifest.json");await writeFile(path,JSON.stringify(manifest));
 await assert.rejects(stageOpencodeV2(path,join(root,"stage"),"aarch64-apple-darwin"),/target/);
 const binary=await stageOpencodeV2(path,join(root,"stage"),manifest.target);assert.deepEqual(await readFile(binary),bytes);
 assert.equal(JSON.parse(await readFile(join(root,"stage/opencode2-integrity.json"),"utf8")).version,manifest.version);
 await writeFile(join(root,"opencode.exe"),"tampered");await assert.rejects(stageOpencodeV2(path,join(root,"stage"),manifest.target),/checksum/);
 await writeFile(path,JSON.stringify({...manifest,binary:"../opencode.exe"}));await assert.rejects(stageOpencodeV2(path,join(root,"stage"),manifest.target),/manifest/);
});
