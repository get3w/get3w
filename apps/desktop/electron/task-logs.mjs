import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,open,rename} from 'node:fs/promises';
import path from 'node:path';

const secret=/^(?:authorization|proxy-authorization|cookie|set-cookie|password|secret|token|api.?key|client.?secret|access.?token|refresh.?token|id.?token|credential|credentials|signature)$|^(?:x-amz-|x-cos-)|(?:^|[_-])(?:secret|password|api.?key|access.?token|refresh.?token)(?:$|[_-])/i;
export function redactTaskLog(value){
 if(Array.isArray(value))return value.map(redactTaskLog);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,secret.test(k)?'[REDACTED]':redactTaskLog(v)]));
 if(typeof value==='string'){
  if(/^[\s]*[\[{]/.test(value)){try{return JSON.stringify(redactTaskLog(JSON.parse(value)));}catch{}}
  if(value.startsWith('data:text/')||value.startsWith('data:application/json')){const match=value.match(/^data:([^;,]+)(;base64)?,(.*)$/s);if(match){try{const decoded=match[2]?Buffer.from(match[3],'base64').toString('utf8'):decodeURIComponent(match[3]);return `data:${match[1]};base64,${Buffer.from(redactTaskLog(decoded)).toString('base64')}`;}catch{return '[REDACTED: invalid text attachment]';}}}
  return value.replace(/Bearer\s+[\w.~+/=-]+/gi,'Bearer [REDACTED]').replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g,'[REDACTED]').replace(/([?&][^=&\s]*(?:token|signature|credential|secret|key)[^=&\s]*=)[^&\s"<>]+/gi,'$1[REDACTED]').replace(/((?:api[_-]?key|password|secret|authorization)\s*[=:]\s*["']?)[^\s,"'}]+/gi,'$1[REDACTED]');
 }
 return value;
}
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const data=value=>value?.data??value;
const sessionInfo=value=>data(value)?.info??data(value);
const pick=(value,keys)=>value&&typeof value==='object'?Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]])):{};
const requestFields=['parts','messageID','model','agent','variant','prompt','text','permission','response','reply','answers','action','title','time','retry','message_id','call_id','decision'];

/** Native-host queue. Credentials never enter the journal; accounts are immutable per task. */
export function createTaskLogs({directory,auth,getServerInfo,fetchImpl=fetch,now=Date.now,intervalMs=5000,clientVersion='unknown',log=()=>{}}){
 const file=path.join(directory,'task-logs.json');
 let state,serial=Promise.resolve(),timer,busy=false,stopped=false;
 const streams=new Map();let discoveringAt=0;
 const locked=fn=>{const pending=serial.then(fn,fn);serial=pending.catch(()=>{});return pending;};
 async function load(){if(state)return;try{state=JSON.parse(await readFile(file,'utf8'));if(state.version!==1||!Array.isArray(state.tasks))throw Error('Invalid task journal');}catch(error){if(error.code!=='ENOENT')throw error;state={version:1,tasks:[]};}}
 async function save(){await mkdir(directory,{recursive:true,mode:0o700});const handle=await open(file+'.tmp','w',0o600);try{await handle.writeFile(JSON.stringify(state));await handle.sync();}finally{await handle.close();}await rename(file+'.tmp',file);}
 const account=()=>auth.outputIdentity().userId;
 const matches=(r,x)=>r.workspaceId===x.workspaceId&&r.engine===x.engine&&r.sessionId===x.sessionId;
 function append(row,type,payload){
  const clean=redactTaskLog(payload); const json=JSON.stringify(clean);
  // Split large evidence instead of truncating it; reconstruction is deterministic.
  const chunks=[]; const width=500000;
  if(Buffer.byteLength(json)>700000){for(let at=0;at<json.length;at+=width)chunks.push(json.slice(at,at+width));}
  const entries=chunks.length?chunks.map((chunk,index)=>({type:'evidence.chunk',payload:{original_type:type,group:digest(json),index,count:chunks.length,encoding:'json',chunk}})):[{type,payload:clean}];
  for(const entry of entries)row.pending.push({id:randomUUID(),sequence:++row.sequence,occurred_at:now(),...entry});
 }
 async function create(x,info,userId,parent){
  const sid=info.id??info.sessionID;if(typeof sid!=='string')return null;
  const existing=state.tasks.find(r=>matches(r,{...x,sessionId:sid}));if(existing)return existing;
  const row={id:randomUUID(),userId,workspaceId:x.workspaceId,directory:x.directory,engine:x.engine,sessionId:sid,
   parentId:parent?.id,sequence:0,pending:[],registered:false,deleted:false,files:[],hashes:{},createdAt:now()};
  state.tasks.push(row);append(row,'session.created',{session:pick(info,['id','parentID','title','time']),summary:{title:info.title??'新建任务',status:'created',sync_complete:false}});return row;
 }
 async function capture(x){
  const userId=Object.hasOwn(x,'userId')?x.userId:account();if(!userId)return;
  await locked(async()=>{
   await load(); const normalized=x.path.replace(/^\/opencode2\/api|^\/opencode|^\/api/,'').split('?')[0];
   const payload=sessionInfo(x.response);
   if(x.method==='POST'&&normalized==='/session'&&x.status<300&&payload){const created=await create(x,payload,userId);await save();if(created)queueMicrotask(()=>void stream(created).catch(()=>{}));return;}
   const match=normalized.match(/^\/session\/([^/]+)(.*)$/);if(!match)return;
   const row=state.tasks.find(r=>matches(r,{...x,sessionId:decodeURIComponent(match[1])})&&r.userId===userId);
   if(!row||row.deleted)return; // Never backfill pre-feature tasks.
   if(x.method==='DELETE'&&!match[2]&&x.status<300){
    const remove=r=>{r.deleted=true;r.pending=[];r.files=[];r.hashes={};delete r.directory;for(const child of state.tasks.filter(item=>item.parentId===r.id&&!item.deleted))remove(child);};remove(row);
   }else {row.nextObserveAt=0;if(match[2]==='/abort')row.lastStatus='stopped';append(row,'client.exchange',{method:x.method,path:normalized,request:pick(x.request,requestFields),http_status:x.status,...(match[2]==='/abort'?{summary:{status:'stopped',sync_complete:false}}:{})});}
   await save();
  });
 }
 async function captureEvidence(sessionId,input){
  const uid=account();if(!uid)return;await locked(async()=>{await load();const row=state.tasks.find(r=>r.sessionId===sessionId&&r.userId===uid&&!r.deleted);if(!row)return;row.checkpointNeeded=true;row.nextObserveAt=0;append(row,String(input.type??"engine.evidence"),input.payload);await collectFiles(row,input.payload);await save();});
 }
 async function captureOutput(scope,files,result){
  if(scope.userId!==account())return;await locked(async()=>{await load();const row=state.tasks.find(r=>r.sessionId===scope.sessionId&&r.workspaceId===scope.workspaceId&&r.userId===scope.userId&&!r.deleted);if(!row)return;
   append(row,'media.result',{result});
   const {pathToFileURL}=await import('node:url');
   for(const file of files){const root=file.rootPath??row.directory;await collectFiles(row,{type:'file',url:pathToFileURL(path.resolve(root,file.path)).href,mime:file.mimeType,filename:file.path});}
   await save();});
 }
 async function local(row,suffix,signal){
  const server=await getServerInfo();const base=new URL(server.baseUrl);
  if(base.protocol!=='http:'||base.hostname!=='127.0.0.1')throw Error('Invalid local task log service');
  const mount=`${base.origin}/workspace/${encodeURIComponent(row.workspaceId)}/${row.engine==='v2'?'opencode2/api':'opencode'}`;
  return fetchImpl(`${mount}${suffix}`,{headers:{Authorization:`Bearer ${server.ownerToken??server.clientToken}`},signal:signal??AbortSignal.timeout(15000)});
 }
 async function read(row,suffix){const response=await local(row,suffix);if(!response.ok)throw Error('Task snapshot unavailable');return response.json();}
 async function history(row){
  const sid=encodeURIComponent(row.sessionId);const result=[];let cursor;const seen=new Set();
  while(true){
   const query=new URLSearchParams({limit:'200'});if(cursor)query.set(row.engine==='v2'?'cursor':'before',cursor);
   const response=await read(row,`/session/${sid}/message?${query}`);const list=data(response);
   if(!Array.isArray(list))throw Error('Invalid task message history');result.push(...list);
   const next=response?.cursor?.next;if(!next)break;if(seen.has(next))throw Error('Task message history cursor repeated');seen.add(next);cursor=next;
  }
  return result.sort((a,b)=>{const x=a.info??a,y=b.info??b;const ta=x.time?.created??x.created,tb=y.time?.created??y.created;return typeof ta==='number'&&typeof tb==='number'&&ta!==tb?ta-tb:String(x.id??'').localeCompare(String(y.id??''));});
 }
 async function discoverChildren(){
  if(now()-discoveringAt<30000)return;discoveringAt=now();const uid=account();const scopes=new Map();
  for(const row of state.tasks)if(!row.deleted&&row.userId===uid)scopes.set(`${row.workspaceId}:${row.engine}`,row);
  for(const row of scopes.values()){
   let cursor;const seen=new Set();
   while(true){
    const query=new URLSearchParams({limit:'200'});if(cursor)query.set('cursor',cursor);
    const page=await read(row,`/session?${query}`);const list=data(page);if(!Array.isArray(list))break;
    await locked(async()=>{if(account()!==uid)return;let changed=true;while(changed){changed=false;for(const value of list){const info=sessionInfo(value);if(!info?.parentID)continue;const parent=state.tasks.find(r=>!r.deleted&&r.userId===uid&&r.workspaceId===row.workspaceId&&r.engine===row.engine&&r.sessionId===info.parentID);
     if(parent&&!state.tasks.some(r=>matches(r,{...row,sessionId:info.id??info.sessionID}))){await create(row,info,uid,parent);changed=true;}}}await save();});
    const next=page?.cursor?.next;if(!next||seen.has(next))break;seen.add(next);cursor=next;
   }
  }
 }
 async function observe(row){
  if(now()<(row.nextObserveAt??0))return;
  row.nextObserveAt=now()+(['completed','failed','stopped'].includes(row.lastStatus)?60000:intervalMs);
  const sid=encodeURIComponent(row.sessionId);
  const [session,messages,statuses,_context,permissions,questions]=await Promise.all([
   read(row,`/session/${sid}`),history(row),read(row,row.engine==='v2'?'/session/active':'/session/status'),
   null,
   read(row,row.engine==='v2'?`/session/${sid}/permission`:'/permission').catch(()=>({unavailable:true})),
   read(row,row.engine==='v2'?`/session/${sid}/form`:'/question').catch(()=>({unavailable:true})),
  ]);
  await locked(async()=>{
   if(row.deleted||row.userId!==account())return;
   const info=sessionInfo(session); const list=data(messages);const status=data(statuses)?.[row.sessionId];
   const active=['busy','running','retry'].includes(status?.type);
   const ownRequests=value=>Array.isArray(data(value))?data(value).filter(item=>!item.sessionID||item.sessionID===row.sessionId):value;
   const raw={session,messages,permissions:ownRequests(permissions),questions:ownRequests(questions),statuses:{[row.sessionId]:status??null}};
   const hash=digest(raw);if(row.hashes.snapshot===hash)return;
   row.hashes.snapshot=hash;
   const history=Array.isArray(list)?list:[];
   const assistants=history.map(m=>m.info??m).filter(m=>m.role==='assistant'||m.type==='assistant');
   const failed=assistants.at(-1)?.error;
   const last=assistants.at(-1);
   const changed=[];const ids=[];row.messageHashes??={};for(const item of history){const id=(item.info??item).id;if(typeof id!=='string'){changed.push(item);continue;}ids.push(id);const hash=digest(item);if(row.messageHashes[id]!==hash){changed.push(item);row.messageHashes[id]=hash;}}const deleted=Object.keys(row.messageHashes).filter(id=>!ids.includes(id));for(const id of deleted)delete row.messageHashes[id];
   append(row,'messages.delta',{upserts:changed.map(item=>({...item,...(Array.isArray(item.parts)?{parts:item.parts.filter(part=>part.type!=='reasoning')}:{} )})),deleted,permissions:raw.permissions,questions:raw.questions,summary:{title:info?.title??'新建任务',status:failed?'failed':(Array.isArray(raw.permissions)&&raw.permissions.length||Array.isArray(raw.questions)&&raw.questions.length)?'waiting':active?'running':row.lastStatus==='stopped'?'stopped':history.length?'completed':'created',
    model:last?.modelID??last?.model?.id,rounds:history.filter(m=>(m.info??m).role==='user'||m.type==='user').length,
    sync_complete:false,duration_ms:Math.max(0,(info?.time?.updated??now())-(info?.time?.created??row.createdAt)),
    unavailable:['Engine-internal requests and hidden reasoning unavailable unless explicitly emitted by the runtime']}});
   await collectFiles(row,raw);row.lastStatus=failed?'failed':(Array.isArray(raw.permissions)&&raw.permissions.length||Array.isArray(raw.questions)&&raw.questions.length)?'waiting':active?'running':row.lastStatus==='stopped'?'stopped':history.length?'completed':'created';row.checkpointNeeded=true;await save();
  });
 }
 async function collectFiles(row,value){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const item of value)await collectFiles(row,item);return;}
  // Only explicit file parts qualify; never crawl arbitrary paths in tool arguments.
  if(value.type==='file'&&typeof (value.url??value.uri)==='string'&&!row.files.some(f=>f.reference===digest(value.url??value.uri))){
   const reference=value.url??value.uri;const referenceKey=digest(reference);const aid=randomUUID();
   try{
    let bytes;
    if(reference.startsWith('data:')){const match=reference.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);if(!match)throw Error('Invalid inline attachment');bytes=match[2]?Buffer.from(match[3],'base64'):Buffer.from(decodeURIComponent(match[3]));}
    else if(reference.startsWith('file:')){
     const {fileURLToPath}=await import('node:url');const {realpath,stat}=await import('node:fs/promises');
     const target=await realpath(fileURLToPath(reference));const root=await realpath(row.directory);
     if(!target.startsWith(root+path.sep))throw Error('File is outside task workspace');
     if((await stat(target)).size>200*1024*1024)throw Error('Attachment exceeds 200 MiB capture limit');bytes=await readFile(target);
    }else throw Error('Remote evidence has no trusted persistent local file');
    // The protocol stores large attachments in ordered independent chunks.
    const mime=String(value.mime??value.mimeType??'application/octet-stream');
    if(mime.startsWith('text/')||['application/json','application/xml'].includes(mime))bytes=Buffer.from(redactTaskLog(bytes.toString('utf8')));
    const width=3*1024*1024;const count=Math.max(1,Math.ceil(bytes.length/width));
    for(let i=0;i<count;i++)row.files.push({id:count===1?aid:`${aid}_${i}`,reference:referenceKey,index:i,count,pending:true,
     body:{name:String(value.filename??'attachment')+(count>1?`.part${i+1}`:''),content_type:mime,base64:bytes.subarray(i*width,(i+1)*width).toString('base64')}});
    append(row,'attachment.manifest',{id:aid,reference:referenceKey,count,size:bytes.length,filename:value.filename});
   }catch(error){row.files.push({id:aid,reference:referenceKey,missing:true});append(row,'attachment.unavailable',{id:aid,reference:referenceKey,reason:String(error.message)});}
  }
  for(const [key,item] of Object.entries(value))if(key!=='url')await collectFiles(row,item);
 }
 async function stream(row){
  const key=`${row.userId}:${row.workspaceId}:${row.engine}`;if(streams.has(key)){row.streamVerified=true;return;}
  const controller=new AbortController();streams.set(key,controller);
  try{
   const response=await local(row,row.engine==='v2'?'/event':'/event',controller.signal);if(!response.ok||!response.body)throw Error('Task event stream unavailable');
   row.streamVerified=true;const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
   while(!stopped&&account()===row.userId){
    const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');
    let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const json=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(!json)continue;
     let event;try{event=JSON.parse(json);}catch{continue;}
     await locked(async()=>{
      const payload=event.payload??event;const properties=payload.data??payload.properties??{};const info=properties.info??properties.session??properties;
      const sid=properties.sessionID??properties.sessionId??properties.part?.sessionID??properties.info?.sessionID??info.id;
      let target=state.tasks.find(r=>r.userId===row.userId&&r.workspaceId===row.workspaceId&&r.engine===row.engine&&r.sessionId===sid&&!r.deleted);
      if(!target&&payload.type==='session.created'&&info.parentID){const parent=state.tasks.find(r=>r.sessionId===info.parentID&&r.userId===row.userId&&!r.deleted);if(parent)target=await create(row,info,row.userId,parent);}
      if(target){target.checkpointNeeded=true;target.nextObserveAt=0;await collectFiles(target,event);await save();}
     });
    }
   }
  }catch{}finally{controller.abort();streams.delete(key);if(stopped)return;await locked(async()=>{if(!state)return;for(const target of state.tasks.filter(r=>r.userId===row.userId&&r.workspaceId===row.workspaceId&&r.engine===row.engine&&!r.deleted)){target.streamVerified=false;if(!target.hashes.streamGap){target.hashes.streamGap=true;append(target,'capture.gap',{summary:{sync_complete:false},reason:'Live engine stream disconnected; snapshots reconcile messages, transient events may be unavailable'});}}await save();});}
 }
 async function flush(row){
  if(row.userId!==account()||now()<(row.retryAt??0))return;
  try{
   if(row.deleted){if(!row.deletedAck){await auth.taskLogRequest(row.userId,`/${row.id}`,{method:'DELETE'});await locked(async()=>{row.deletedAck=true;await save();});}return;}
   if(!row.registered){await auth.taskLogRequest(row.userId,'',{method:'POST',body:{id:row.id,source:'desktop',session_id:row.sessionId,parent_id:row.parentId,title:'新建任务',
    environment:{os:process.platform,client_version:clientVersion,engine:row.engine,workspace_id:row.workspaceId,capture_policy_version:2}}});await locked(async()=>{row.registered=true;await save();});}
   while(row.pending.length&&!row.deleted&&row.userId===account()){
    const batch=[];let size=0;for(const event of row.pending){const length=Buffer.byteLength(JSON.stringify(event));if(batch.length&&(size+length>4*1024*1024||batch.length>=50))break;batch.push(event);size+=length;}
    await auth.taskLogRequest(row.userId,`/${row.id}/events`,{method:'POST',body:{events:batch}});
    await locked(async()=>{const ids=new Set(batch.map(e=>e.id));row.pending=row.pending.filter(e=>!ids.has(e.id));await save();});
   }
   for(const file of row.files.filter(f=>f.pending)){if(row.deleted||row.userId!==account())return;await auth.taskLogRequest(row.userId,`/${row.id}/attachments/${file.id}`,{method:'PUT',body:file.body});await locked(async()=>{file.pending=false;delete file.body;await save();});}
   await locked(async()=>{if(row.checkpointNeeded&&!row.deleted&&!row.pending.length&&!row.files.some(f=>f.pending||f.missing)){row.checkpointNeeded=false;const next=row.sequence+1;append(row,'sync.checkpoint',{summary:{sync_complete:row.streamVerified===true&&!row.hashes.streamGap,expected_sequence:next}});await save();}});
   row.attempt=0;row.retryAt=0;
  }catch(error){
   if(error.status===410){await locked(async()=>{row.deleted=true;row.pending=[];row.files=[];await save();});}
   else {row.attempt=(row.attempt??0)+1;row.retryAt=now()+Math.min(300000,1000*2**Math.min(row.attempt,9));await locked(save);}
  }
 }
 async function tick(){if(stopped||busy)return;busy=true;try{
  await locked(load);const uid=account();for(const [key,controller] of streams)if(!key.startsWith(`${uid}:`))controller.abort();
  await discoverChildren().catch(()=>{});
  for(const row of [...state.tasks]){if(row.userId!==uid)continue;if(!row.deleted){void stream(row).catch(()=>{});try{await observe(row);}catch(error){await locked(async()=>{if(row.deleted)return;const message=String(error.message);if(row.hashes.error!==message){row.hashes.error=message;append(row,'capture.error',{summary:{sync_complete:false,capture_error:message}});await save();}});}}await flush(row);}
 }catch(error){log('Task log journal unavailable: '+String(error.message));}finally{busy=false;}}
 return {identity:account,capture,captureEvidence,captureOutput,tick,start(){stopped=false;timer=setInterval(()=>void tick(),intervalMs);timer.unref?.();void tick();},stop(){stopped=true;clearInterval(timer);for(const c of streams.values())c.abort();},inspect:()=>locked(async()=>{await load();return structuredClone(state);})};
}
