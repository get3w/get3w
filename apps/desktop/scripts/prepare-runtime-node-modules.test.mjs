import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stageRuntimeNodeModules} from './prepare-runtime-node-modules.mjs';

test('staged automation runtime resolves transitive pnpm dependencies outside the checkout',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'get3w-runtime-test-'));
 try {
  const modules=join(directory,'node_modules');
  const staged=stageRuntimeNodeModules(modules);
  assert.ok(staged.includes('cross-spawn'));
  assert.ok(staged.includes('@openwork/headless-threads'));
  const runtime=await import(pathToFileURL(join(modules,'@openwork/headless-threads/dist/index.js')).href);
  assert.ok(Object.keys(runtime).length>0);
 } finally {await rm(directory,{recursive:true,force:true});}
});
