import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migrateGet3wStateFile } from './get3w-state-file.mjs';

test('private state moves byte-for-byte and never replaces newer state', async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'get3w-state-'));
 try {
  const old=path.join(dir,'old.enc'),next=path.join(dir,'new.enc');
  await writeFile(old,Buffer.from([0,1,255,42]));
  assert.equal(await migrateGet3wStateFile(dir,'new.enc','old.enc'),next);
  assert.deepEqual(await readFile(next),Buffer.from([0,1,255,42]));
  await writeFile(old,'stale');
  await migrateGet3wStateFile(dir,'new.enc','old.enc');
  assert.deepEqual(await readFile(next),Buffer.from([0,1,255,42]));
  assert.equal(await readFile(old,'utf8'),'stale');
 }finally {await rm(dir,{recursive:true,force:true});}
});
