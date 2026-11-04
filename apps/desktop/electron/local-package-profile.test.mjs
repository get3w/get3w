import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareLocalPackageEnvironment } from "./local-package-profile.mjs";
import { BLANK_SLATE_PATH_ENV_KEYS } from "./blank-slate-profile.mjs";

test("local package isolates every runtime store and reuses paths on restart", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "openwork-local-profile-"));
  try {
    const env = { PATH: "/usr/bin", OPENCODE_DB: "/existing/user/database" };
    prepareLocalPackageEnvironment(root, env, "linux");
    for (const key of BLANK_SLATE_PATH_ENV_KEYS) {
      assert.ok(env[key].startsWith(root + path.sep) || env[key] === root, key);
    }
    assert.equal(env.PATH, "/usr/bin");
    const before = { ...env };
    prepareLocalPackageEnvironment(root, env, "linux");
    assert.deepEqual(env, before);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("macOS preserves the system HOME for Keychain while isolating data stores",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"openwork-keychain-home-"));
  try {
    const env={HOME:"/Users/test",PATH:"/usr/bin"};
    prepareLocalPackageEnvironment(root,env,"darwin");
    assert.equal(env.HOME,"/Users/test");
    for(const key of BLANK_SLATE_PATH_ENV_KEYS.filter(key=>key!=="HOME")) assert.ok(env[key].startsWith(root),key);
    const before={...env};prepareLocalPackageEnvironment(root,env,"darwin");assert.deepEqual(env,before);
  }finally {await rm(root,{recursive:true,force:true});}
});
