import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {localServiceEnvironment} from './dev-local-env.mjs';
test('private local config reaches services with explicit env precedence', () => {
 const dir=mkdtempSync(path.join(tmpdir(),'get3w-local-env-'));
 try {
  writeFileSync(path.join(dir,'.env'),'GET3W_EVENT_SOURCES=0\nDB_PASSWORD=private\nGET3W_CONNECTOR_ENCRYPTION_KEY="original"\n');
  writeFileSync(path.join(dir,'.env.dev-local'),'GET3W_EVENT_SOURCES=1\nGET3W_CONNECTOR_ENCRYPTION_KEY="stable"\n');
  assert.deepEqual(localServiceEnvironment(dir,{}),{GET3W_EVENT_SOURCES:'1',GET3W_CONNECTOR_ENCRYPTION_KEY:'stable'});
  assert.equal(localServiceEnvironment(dir,{GET3W_EVENT_SOURCES:'0'}).GET3W_EVENT_SOURCES,'0');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
