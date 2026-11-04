// Explicit local/dev acceptance only. Receives a temporary native grant on stdin; never logs credentials.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import os from 'node:os';import path from 'node:path';
import {createGet3wAuth} from '../electron/get3w-auth.mjs';
import {createGet3wManagedMcp} from '../electron/get3w-managed-mcp.mjs';
const req=createRequire(new URL('../package.json',import.meta.url));
const {Client}=await import(req.resolve('@modelcontextprotocol/sdk/client/index.js'));
const {StreamableHTTPClientTransport}=await import(req.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js'));
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const input=JSON.parse(raw);raw='';
const root=await mkdtemp(path.join(os.tmpdir(),'openwork-native-mcp-')),key=randomBytes(32);
const storage={isAsyncEncryptionAvailable:async()=>true,getSelectedStorageBackend:()=> 'test-aes-gcm',encryptStringAsync:async text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(text),c.final(),c.getAuthTag()]);},decryptStringAsync:async value=>{const d=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));d.setAuthTag(value.subarray(-16));return Buffer.concat([d.update(value.subarray(12,-16)),d.final()]).toString();}};
const profile=fileURLToPath(new URL('../../../../.local/desktop-m1/electron/',import.meta.url));
const credentials=JSON.parse(await readFile(path.join(profile,'openwork-server-tokens.json'),'utf8')).credentials;
const state=JSON.parse(await readFile(path.join(profile,'openwork-server-state.json'),'utf8'));
const ports=[...new Set(Object.values(state.workspacePorts))];
const port=state.preferredPort||(ports.length===1?ports[0]:null);if(!port)throw Error('ambiguous runtime');
const server={...credentials,running:true,pid:1,baseUrl:`http://127.0.0.1:${port}`};
const headers={'X-Get3W-Host-Token':server.hostToken,Authorization:`Bearer ${server.ownerToken||server.clientToken}`,'Content-Type':'application/json'};
let workspaceId,userId,manager,client,stage='start',offline=false;const result={};
const outageSeconds=Number(process.env.OPENWORK_MCP_OUTAGE_SECONDS||0);
if(!Number.isInteger(outageSeconds)||outageSeconds<0||outageSeconds>600)throw Error('invalid outage duration');
let blockedRequests=0;
const cloudFetch=async(...args)=>{if(process.env.OPENWORK_MCP_CONNECTORS==='1'&&String(args[0]).endsWith('/organizations'))await new Promise(resolve=>setTimeout(resolve,2500));if(offline){blockedRequests++;throw new TypeError('Simulated test-only cloud network outage');}return fetch(...args);};
try {
 await writeFile(path.join(root,'openwork-session.enc'),await storage.encryptStringAsync(JSON.stringify({...input.session,apiBase:'http://127.0.0.1:6604',expiresAt:Date.now()+input.session.expires_in*1000})),{mode:0o600});
 const auth=createGet3wAuth({userData:root,safeStorage:storage,openExternal:async()=>{},apiBase:'http://127.0.0.1:6604',gatewayBase:'http://127.0.0.1:6605',fetchImpl:cloudFetch});
 stage='native_identity';const identity=await auth.status();if(identity.status!=='signed_in')throw Error('identity');userId=identity.user.id;
 await auth.organizations({userId:identity.user.id,organizationId:input.org});
 if(process.env.OPENWORK_MCP_MANAGE_ACCESS==='1'){
  stage='native_tool_access';const scope={userId,organizationId:input.org};
  const before=await auth.toolAccess({...scope,action:'read',memberId:userId});
  if(before.capabilities.length)throw Error('expected isolated empty catalog');
  await auth.toolAccess({...scope,action:'publish'});
  const published=await auth.toolAccess({...scope,action:'read',memberId:userId});
  if(published.capabilities.length!==1||published.capabilities[0].granted)throw Error('publication granted access');
  await auth.toolAccess({...scope,action:'grant',memberId:userId,capability:'models',enabled:true});
  result.native_publication_and_grant=true;
 }
 stage='create_workspace';const response=await fetch(server.baseUrl+'/workspaces/local',{method:'POST',headers,body:JSON.stringify({folderPath:path.join(root,'workspace'),name:'Get3W MCP acceptance'})});
 if(!response.ok){result.workspace_http_status=response.status;throw Error('workspace');}workspaceId=(await response.json()).activeId;
 manager=createGet3wManagedMcp({auth,userData:root,getServerInfo:async()=>server});
 stage='install_connection';await manager.run({userId:identity.user.id,organizationId:input.org,workspaceId,action:'enable'});
 const listing=await fetch(`${server.baseUrl}/workspace/${workspaceId}/mcp`,{headers});
 const item=(await listing.json()).items.find(item=>item.name==='openwork-account');
 if(!item||item.config.headers.Authorization.includes(input.session.access_token))throw Error('configuration');
 result.runtime_only_local_bearer=true;
 stage='sdk_handshake';client=new Client({name:'Get3W acceptance',version:'1.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(item.config.url),{requestInit:{headers:item.config.headers}}));
 const found=await client.callTool({name:'search_capabilities',arguments:{}});if(found.isError)throw Error('search');
 stage='execute';const args={name:'models',arguments:{},idempotency_key:'native-live'};
 const first=await client.callTool({name:'execute_capability',arguments:args});if(first.isError)throw Error('execute');
 result.model_count=first.structuredContent.result.models.length;
 result.idempotent_replay=JSON.stringify(first)===JSON.stringify(await client.callTool({name:'execute_capability',arguments:args}));
 if(process.env.OPENWORK_MCP_MANAGE_ACCESS==='1'){
  stage='native_revoke';
  await auth.toolAccess({userId,organizationId:input.org,action:'grant',memberId:userId,capability:'models',enabled:false});
  const denied=await client.callTool({name:'execute_capability',arguments:args});
  if(!denied.isError)throw Error('revoked cached result allowed');
  result.revoked_replay_denied=true;
 }
 if(process.env.OPENWORK_MCP_CONNECTORS==='1'){
  stage='connector_status';const scope={userId,organizationId:input.org};
  const snapshot=await auth.connectors({...scope,action:'status'});
  if(snapshot.connectors.length!==2||snapshot.connectors.some(row=>row.configured||row.connected))throw Error('expected unconfigured local connectors');
  result.unconfigured_connectors_visible=true;
  for(const provider of ['google','microsoft']){
   stage='connector_publish';await auth.toolAccess({...scope,action:'publishConnector',provider});
   const published=await auth.toolAccess({...scope,action:'read',memberId:userId});
   const row=published.capabilities.find(row=>row.name===provider+'.files');
   if(!row||row.granted)throw Error('connector publication auto granted');
   await auth.toolAccess({...scope,action:'grant',memberId:userId,capability:provider+'.files',enabled:true});
   stage='connector_execute';
   const denied=await client.callTool({name:'execute_capability',arguments:{name:provider+'.files',arguments:{},idempotency_key:'unconfigured-'+provider}});
   if(denied.structuredContent?.status!=='failed'||denied.structuredContent?.result?.error!=='execution_failed')throw Error('unconfigured connector did not fail closed');
   stage='connector_authorize';let rejected=false;
   try{await auth.connectors({...scope,action:'authorize',provider});}catch{rejected=true;}
   if(!rejected)throw Error('unconfigured authorization allowed');
   stage='connector_disconnect';await auth.connectors({...scope,action:'disconnect',provider});
   await auth.toolAccess({...scope,action:'grant',memberId:userId,capability:provider+'.files',enabled:false});
  }
  result.connector_publication_no_auto_grant=true;
  result.unconfigured_execution_rejected=true;
  result.unconfigured_authorization_rejected=true;
  result.connector_disconnect_and_revoke=true;
 }
 if(outageSeconds){
  stage='outage';offline=true;
  const started=performance.now();let rejected=false;
  try{await client.callTool({name:'execute_capability',arguments:args},undefined,{timeout:15_000});}catch{rejected=true;}
  if(!rejected)throw Error('offline call unexpectedly succeeded');
  result.offline_request_rejected=true;
  const blocked=blockedRequests;
  while(performance.now()-started<outageSeconds*1000)await new Promise(resolve=>setTimeout(resolve,Math.max(1,outageSeconds*1000-(performance.now()-started))));
  result.outage_seconds=Math.floor((performance.now()-started)/1000);
  result.no_background_replay=blockedRequests===blocked;
  stage='recover';offline=false;
  const recovered=await client.callTool({name:'execute_capability',arguments:args});
  result.recovered_same_result=JSON.stringify(recovered)===JSON.stringify(first);
  if(!result.recovered_same_result||!result.no_background_replay)throw Error('recovery invariant');
  stage='offline_disconnect';offline=true;
  await manager.run({userId,organizationId:input.org,workspaceId,action:'disable'});
  result.offline_disconnect=true;
  await client.close();client=null;offline=false;
  stage='explicit_reconnect';
  await manager.run({userId,organizationId:input.org,workspaceId,action:'enable'});
  const restored=await (await fetch(`${server.baseUrl}/workspace/${workspaceId}/mcp`,{headers})).json();
  const connection=restored.items.find(i=>i.name==='openwork-account');
  result.local_bearer_rotated=connection.config.headers.Authorization!==item.config.headers.Authorization;
  client=new Client({name:'Get3W recovery acceptance',version:'1.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(connection.config.url),{requestInit:{headers:connection.config.headers}}));
  result.reconnected_search=!(await client.callTool({name:'search_capabilities',arguments:{}})).isError;
 }
 await client.close();client=null;
 stage='disconnect';await manager.run({userId:identity.user.id,organizationId:input.org,workspaceId,action:'disable'});
 const remaining=await (await fetch(`${server.baseUrl}/workspace/${workspaceId}/mcp`,{headers})).json();
 result.connection_removed=!remaining.items.some(i=>i.name==='openwork-account');
 stage='done';
} catch(error) {result.failed_stage=stage;result.error=error.message;process.exitCode=1;}
finally {
 offline=false;
 await client?.close().catch(()=>{});
 if(manager&&workspaceId&&userId)await manager.run({userId,organizationId:input.org,workspaceId,action:'disable'}).catch(()=>{});
 await manager?.close().catch(()=>{});
 if(workspaceId){const removed=await fetch(`${server.baseUrl}/workspaces/${workspaceId}`,{method:'DELETE',headers});result.workspace_removed=removed.ok;}
 await rm(root,{recursive:true,force:true});
}
console.log(JSON.stringify(result));
