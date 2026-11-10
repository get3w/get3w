import {test,expect} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {ServerConfig} from '../src/types';
import {writeRuntimeOpencodeConfig} from '../src/runtime-opencode-config-store';
import {readOpenWorkConnectMcpAppHostCatalog,findOpenWorkConnectMcpAppHostServer,readOpenWorkConnectMcpAppHostAuthorization,readOpenWorkConnectMcpAppHostAuthorizationRevision} from '../src/connect-mcp-server-catalog';
import {resolveConnectMcpAppResource,callMcpAppTool,releaseMcpAppLaunch} from '../src/mcp-app-host';

test('native catalog resolves an app through loopback without enabling arbitrary private MCP URLs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'native-artifact-catalog-'));
 const before=process.env.GET3W_RUNTIME_DB;process.env.GET3W_RUNTIME_DB=join(dir,'runtime.sqlite');
 const privateBefore=process.env.GET3W_ALLOW_PRIVATE_MCP_URLS;delete process.env.GET3W_ALLOW_PRIVATE_MCP_URLS;
 const aid='cob_0'+'1'.repeat(25),rid='cov_0'+'1'.repeat(25),uri=`ui://openwork/apps/${aid}/revisions/${rid}/index.html`;
 let published = true;
 let oversized = false;
 const auth='Bearer '+'a'.repeat(43);
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
  expect(request.headers.get('authorization')).toBe(auth);
  if(new URL(request.url).pathname==='/app-index' && oversized)return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(600_000));controller.enqueue(new Uint8Array(600_000));controller.close();}}));
  if(new URL(request.url).pathname==='/app-index')return Response.json({apps:published ? [{connectionId:aid,title:'Report',description:null}] : []});
  expect(new URL(request.url).pathname).toBe(`/mcp/apps/${aid}`);
  if(request.method!=='POST')return new Response(null,{status:405});
  const body:unknown=await request.json();if(!body||typeof body!=='object')throw Error('Invalid RPC');
  const method=Reflect.get(body,'method'),id=Reflect.get(body,'id');
  const reply=(result:unknown)=>Response.json({jsonrpc:'2.0',id,result});
  if(method==='initialize')return reply({protocolVersion:'2025-06-18',capabilities:{tools:{},resources:{}},serverInfo:{name:'artifact',version:'1'}});
  if(method==='notifications/initialized')return new Response(null,{status:202});
  if(method==='tools/list')return reply({tools:[{name:'open_app',inputSchema:{type:'object'},annotations:{readOnlyHint:true,destructiveHint:false},_meta:{ui:{resourceUri:uri}}}]});
  if(method==='resources/read')return reply({contents:[{uri,mimeType:'text/html;profile=mcp-app',text:'<p>Report</p>'}]});
  if(method==='tools/call')return reply({content:[{type:'text',text:'viewer result'}]});
  return new Response(null,{status:404});
 }});
 const config:ServerConfig={host:'127.0.0.1',port:0,token:'test',hostToken:'host',configPath:join(dir,'server.json'),approval:{mode:'auto',timeoutMs:1000},corsOrigins:[],workspaces:[],authorizedRoots:[],readOnly:false,startedAt:Date.now(),tokenSource:'generated',hostTokenSource:'generated',logFormat:'json',logRequests:false};
 try{
  const url=`http://127.0.0.1:${server.port}/mcp`;
  await writeRuntimeOpencodeConfig(config,'ws',()=>({mcp:{'get3w-account':{type:'remote',url,headers:{Authorization:auth}}}}));
  const catalog=await readOpenWorkConnectMcpAppHostCatalog(config,'ws');expect(catalog.servers).toHaveLength(1);
  const descriptor=await findOpenWorkConnectMcpAppHostServer(config,'ws',{connectionId:aid});expect(descriptor?.url).toBe(`${url}/apps/${aid}`);
  expect(await readOpenWorkConnectMcpAppHostAuthorization(config,'ws','https://evil.test/mcp')).toBeNull();
  oversized=true;
  await expect(readOpenWorkConnectMcpAppHostCatalog(config,'ws')).rejects.toThrow('too large');
  oversized=false;
  published = false; // Unsaved drafts never appear in the active inventory.
  const base={serverConfig:config,workspaceId:'ws',workspaceRoot:dir};
  const opened=await resolveConnectMcpAppResource({...base,launch:{connectionId:aid,toolName:'open_app',resourceUri:uri,arguments:{}},context:{sessionId:null,readOnly:false}});
  expect(opened?.html).toBe('<p>Report</p>');expect(opened?.launchId).toBeString();
  if(!opened?.launchId)throw Error('Missing launch');
  const result=await callMcpAppTool({...base,launchId:opened.launchId,sessionId:null,serverName:opened.serverName,name:'open_app',resourceUri:uri,arguments:{}});
  expect(result.content).toEqual([{type:'text',text:'viewer result'}]);
  const revision=await readOpenWorkConnectMcpAppHostAuthorizationRevision(config,'ws');
  await writeRuntimeOpencodeConfig(config,'ws',()=>({}));
  expect(await readOpenWorkConnectMcpAppHostAuthorizationRevision(config,'ws')).not.toBe(revision);
  await expect(callMcpAppTool({...base,launchId:opened.launchId,sessionId:null,serverName:opened.serverName,name:'open_app',resourceUri:uri,arguments:{}})).rejects.toBeDefined();
  releaseMcpAppLaunch(config,'ws',opened.launchId);
 }finally{
  server.stop(true);
  if(before===undefined)delete process.env.GET3W_RUNTIME_DB;else process.env.GET3W_RUNTIME_DB=before;
  if(privateBefore===undefined)delete process.env.GET3W_ALLOW_PRIVATE_MCP_URLS;else process.env.GET3W_ALLOW_PRIVATE_MCP_URLS=privateBefore;
  await rm(dir,{recursive:true,force:true});
 }
});
