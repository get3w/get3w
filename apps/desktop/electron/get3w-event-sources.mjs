import {randomUUID} from 'node:crypto';
export function eventSourceRoute(input){
 if(!input||Object.keys(input).some(k=>!['userId','path','method','body'].includes(k))||typeof input.userId!=='string'||!input.userId||typeof input.path!=='string')throw Error('Invalid source request');
 const routes={GET:/^\/(github(?:\/repositories)?|subscriptions|catalog|channels)$/,POST:/^\/(github\/authorize|subscriptions|channels|(?:subscriptions|channels)\/[a-f0-9-]{36}\/(poll|ack|snapshot|refresh|authorize))$/,PATCH:/^\/(?:subscriptions|channels)\/[a-f0-9-]{36}$/,DELETE:/^\/github$/};
 if(!routes[input.method]?.test(input.path)||JSON.stringify(input.body??{}).length>50000||(['GET','DELETE'].includes(input.method)&&input.body!==undefined))throw Error('Invalid source operation');
 return 'event-sources'+input.path;
}
export function eventSourceTaskKey(event){
 if(typeof event?.url!=="string")return undefined;
 try{
  const url=new URL(event.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return undefined;
  // GitHub issue/PR comments share their parent resource; otherwise exact URL
  // identity only. Never infer sameness from titles or event arrival order.
  if(url.hostname==='github.com'){
   const resource=/^\/[^/]+\/[^/]+\/(?:issues|pull)\/\d+(?:\/|$)/.exec(url.pathname);
   if(resource)url.pathname=resource[0].replace(/\/$/,'');
   url.hash='';url.search='';
  }
  return url.href.length<=200?url.href:undefined;
 }catch{return undefined;}
}
/** At-least-once delivery: persist locally before cloud acknowledgement. */
export function createEventSourceSync({auth,getServerInfo,fetchImpl=fetch,intervalMs=30000}){
 const runnerId='desktop_'+randomUUID();let stopped=true,timer,busy=false,failures=0;
 async function tick(){
  if(stopped||busy)return;busy=true;
  try{
   const account=await auth.status();if(account.status!=='signed_in'||!account.user?.id)return;
   const uid=account.user.id;const current=async()=>{const a=await auth.status();if(stopped||a.status!=='signed_in'||a.user?.id!==uid)throw Error('Account changed');};const server=await getServerInfo();if(!server.running||!server.baseUrl||!server.hostToken)return;
   const u=new URL(server.baseUrl);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1')return;
   const local=async(path,body)=>{const r=await fetchImpl(u.origin+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+(server.clientToken??server.ownerToken),'x-get3w-host-token':server.hostToken,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Local source unavailable');return r.json();};
   const cloud=async(path,method='GET',body)=>{const r=await auth.eventSources({userId:uid,path,method,...(body===undefined?{}:{body})});if(!r.ok)throw Error('Cloud source unavailable');return r.json;};
   const workspaces=await local('/workspaces');const enabled=new Set(workspaces.items.filter(w=>w.workspaceType==='always-on').map(w=>w.id));if(!enabled.size)return;
   const results=await Promise.allSettled([cloud('/subscriptions'),cloud('/channels')]);const items=results.flatMap((r,i)=>r.status==='fulfilled'&&Array.isArray(r.value?.items)?r.value.items.map(sub=>({...sub,channel:i===1})):[]);if(results.every(r=>r.status==='rejected'))throw Error('Sources unavailable');
   failures=0;for(const sub of items){
    if(!enabled.has(sub.workspace_id)||!sub.enabled||(!sub.channel&&sub.state!=='receiving'))continue;
    try{await current();
    const inbox=await local(`/workspaces/${encodeURIComponent(sub.workspace_id)}/always-on/inbox`);
    const source=inbox.sources.find(s=>s.id===sub.source_id&&s.kind===(sub.channel?'connector':'github')&&s.subscriptionId===sub.id&&s.ownerUserId===uid&&s.enabled);
    if(!source)continue;
    const page=await cloud(`/${sub.channel?'channels':'subscriptions'}/${sub.id}/poll`,'POST',{runnerId});
    const ids=[];
    for(const item of page.items){
     const e=item.event;const text=[`${e.repository} · ${e.type} · ${e.action}`,e.title,e.url,e.occurredAt,e.body].filter(Boolean).join('\n').slice(0,15000);
     await current();await local(`/workspaces/${encodeURIComponent(sub.workspace_id)}/always-on/sources/${encodeURIComponent(sub.source_id)}/events`,{key:item.key,text,taskKey:eventSourceTaskKey(e)});ids.push(item.id);
    }
    await current();if(ids.length)await cloud(`/${sub.channel?'channels':'subscriptions'}/${sub.id}/ack`,'POST',{runnerId,ids});
    await local(`/workspaces/${encodeURIComponent(sub.workspace_id)}/always-on/sources/${encodeURIComponent(sub.source_id)}/sync`,{subscriptionId:sub.id,ownerUserId:uid,failed:false});
    }catch{failures=Math.min(failures+1,4);try{await current();await local(`/workspaces/${encodeURIComponent(sub.workspace_id)}/always-on/sources/${encodeURIComponent(sub.source_id)}/sync`,{subscriptionId:sub.id,ownerUserId:uid,failed:true});}catch{}}

   }
  }catch{failures=Math.min(failures+1,4);}finally{busy=false;if(!stopped)timer=setTimeout(tick,Math.min(300000,intervalMs*2**failures));}
 }
 return {start(){if(!stopped)return;stopped=false;void tick();},stop(){stopped=true;clearTimeout(timer);},wake(){clearTimeout(timer);if(!busy)void tick();},tick};
}
