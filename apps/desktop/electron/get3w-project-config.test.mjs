import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureGet3wProjectConfig, readGet3wProjectConfig } from '@get3w/paths';
import { exportWorkspaceConfig, importWorkspaceConfig } from './workspace-archive.mjs';
import { createWorkspaceStore } from './workspace-store.mjs';

test('project config ignores retired engine-scoped configuration and respects existing root config', async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'get3w-project-'));
 try {
  await mkdir(path.join(root,'.opencode'));
  const legacy={version:1,workspace:{name:'Legacy',preset:'starter',createdAt:123},authorizedRoots:['/private'],reload:{auto:true},credentials:'secret'};
  const file=path.join(root,'.opencode/get3w.json');
  await writeFile(file,JSON.stringify(legacy));
  const project=await ensureGet3wProjectConfig(root);
  assert.deepEqual(project,{version:1,workspace:{}});
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),legacy);
  await writeFile(path.join(root,'get3w.json'),JSON.stringify({version:1,workspace:{name:'Root'},runtime:'pi'}));
  assert.equal((await ensureGet3wProjectConfig(root)).runtime,'pi');
  await writeFile(path.join(root,'get3w.json'),'{broken');
  await assert.rejects(()=>ensureGet3wProjectConfig(root));
 } finally { await rm(root,{recursive:true,force:true}); }
});

test('runtime-neutral project-only archive roundtrips without local grants or engine directory', async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'get3w-archive-'));
 try {
  const source=path.join(root,'source');await mkdir(source);
  await writeFile(path.join(source,'get3w.json'),JSON.stringify({version:1,workspace:{name:'Portable'},runtime:'deepseek',authorizedRoots:['/private'],reload:{auto:true}}));
  const archivePath=path.join(root,'config.zip');
  await exportWorkspaceConfig({workspace:{id:'test',name:'Portable',path:source},outputPath:archivePath});
  const targetDir=path.join(root,'target');
  assert.equal((await importWorkspaceConfig({archivePath,targetDir})).workspaceName,'Portable');
  assert.deepEqual(JSON.parse(await readFile(path.join(targetDir,'get3w.json'),'utf8')),{version:1,workspace:{name:'Portable'},runtime:'deepseek'});
 } finally { await rm(root,{recursive:true,force:true}); }
});

test('desktop keeps local grants outside the project and creates no legacy config',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'get3w-store-'));
 try {
  await mkdir(path.join(root,'state'));
  await writeFile(path.join(root,'state/get3w-workspaces.json'),JSON.stringify({workspaces:[]}));
  const store=createWorkspaceStore({app:{getPath:()=>path.join(root,'state')}});
  const workspace=path.join(root,'project');
  await store.createWorkspace({folderPath:workspace});
  await assert.rejects(()=>readFile(path.join(workspace,'.opencode/get3w.json')));
  await store.addAuthorizedRoot({workspacePath:workspace,folderPath:'/allowed'});
  assert.ok((await store.readWorkspaceGet3wConfig(workspace)).authorizedRoots.includes('/allowed'));
  const project=JSON.parse(await readFile(path.join(workspace,'get3w.json'),'utf8'));
  assert.equal(project.authorizedRoots,undefined);
  assert.equal(project.reload,undefined);
  assert.equal((await readGet3wProjectConfig(workspace)).version,1);
 } finally { await rm(root,{recursive:true,force:true}); }
});


test('existing root configs drop retired preset while preserving runtime and unrelated fields', async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'get3w-retired-preset-'));
 try {
  const file=path.join(root,'get3w.json');
  await writeFile(file,JSON.stringify({version:1,workspace:{name:'Existing',preset:'starter',custom:'keep'},runtime:'pi',custom:{keep:true}}));
  const project=await ensureGet3wProjectConfig(root);
  assert.deepEqual(project,{version:1,workspace:{name:'Existing'},runtime:'pi'});
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{version:1,workspace:{name:'Existing',custom:'keep'},runtime:'pi',custom:{keep:true}});
 } finally {await rm(root,{recursive:true,force:true});}
});
