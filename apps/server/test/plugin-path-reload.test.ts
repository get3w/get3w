import { test, expect } from "bun:test";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { get3wPluginPath } from "../src/get3w-extensions-plugin-path";

test("isolated compiled backend generations resolve JS plugins while source execution retains TS", async () => {
 const root=await mkdtemp(join(tmpdir(),"get3w-plugin-path-"));
 const previous=process.env.GET3W_EXTENSIONS_PLUGIN_DIR;
 delete process.env.GET3W_EXTENSIONS_PLUGIN_DIR;
 try {
  const compiled=join(root,".dev-runtime-fixture");
  await mkdir(join(compiled,"opencode-plugins"),{recursive:true});
  await writeFile(join(compiled,"opencode-plugins/get3w-context-v2.js"),"export default {};");
  expect(get3wPluginPath("get3w-context-v2",compiled)).toBe(join(compiled,"opencode-plugins/get3w-context-v2.js"));
  expect(get3wPluginPath("get3w-context-v2",join(root,"src"))).toBe(join(root,"src/opencode-plugins/get3w-context-v2.ts"));
  expect(get3wPluginPath("get3w-context-v2",join(root,"dist"))).toBe(join(root,"dist/opencode-plugins/get3w-context-v2.js"));
 } finally {
  if(previous===undefined)delete process.env.GET3W_EXTENSIONS_PLUGIN_DIR;else process.env.GET3W_EXTENSIONS_PLUGIN_DIR=previous;
  await rm(root,{recursive:true,force:true});
 }
});
