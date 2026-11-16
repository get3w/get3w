import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('startup recovers a hot rollback journal without exposing uncommitted config',()=>{
 const root=mkdtempSync(join(tmpdir(),'get3w-config-recovery-'));
 try{
  const crash=join(root,'crash.cjs');
  writeFileSync(crash,`const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(process.argv[2]);
db.exec('PRAGMA journal_mode=DELETE; PRAGMA cache_size=10; CREATE TABLE runtime_opencode_configs(workspace_id TEXT PRIMARY KEY,config_json TEXT,updated_at INTEGER)');
const insert=db.prepare('INSERT INTO runtime_opencode_configs VALUES(?,?,?)');
for(let i=0;i<100;i++)insert.run('w'+i,JSON.stringify({plugin:['original'],padding:'x'.repeat(4000)}),i);
db.exec("BEGIN IMMEDIATE; UPDATE runtime_opencode_configs SET config_json=replace(config_json,'original','modified')");
process.kill(process.pid,'SIGKILL');`);
  const result=spawnSync(process.execPath,[crash,join(root,'runtime.sqlite')]);
  assert.equal(result.signal,'SIGKILL');
  const source=join(root,'check.ts'),bundle=join(root,'check.mjs');
  const module=fileURLToPath(new URL('../src/runtime-opencode-config-store.ts',import.meta.url));
  writeFileSync(source,`import {listRuntimeOpencodeConfigRows,migrateWorkspaceRuntimeConfigToEngineGlobal,readGlobalRuntimeOpencodeConfig} from ${JSON.stringify(module)};
const config={configPath:process.argv[2],readOnly:false};
let code;try{await listRuntimeOpencodeConfigRows(config);}catch(e){code=e.errcode;}
if(code!==776)throw Error('Expected SQLITE_READONLY_ROLLBACK, received '+code);
await migrateWorkspaceRuntimeConfigToEngineGlobal(config);
if(JSON.stringify((await readGlobalRuntimeOpencodeConfig(config)).plugin)!=='["original"]')throw Error('Committed data lost');
if((await listRuntimeOpencodeConfigRows(config)).some(row=>JSON.stringify(row.value).includes('modified')))throw Error('Uncommitted data retained');`);
  const built=spawnSync('bun',['build',source,'--target=node','--format=esm','--define','process.versions.bun=undefined',`--outfile=${bundle}`],{encoding:'utf8'});
  assert.equal(built.status,0,built.stderr);
  const checked=spawnSync(process.execPath,[bundle,join(root,'server.json')],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
 }finally{rmSync(root,{recursive:true,force:true});}
});
