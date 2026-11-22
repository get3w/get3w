import {EventSourceCatalog} from "../src/react-app/domains/workspace/event-source-catalog";
import {createRoot} from 'react-dom/client';
import {GitHubEventSources} from '../src/react-app/domains/workspace/github-event-sources';
import {setLocale} from '../src/i18n';
import '../src/app/index.css';
setLocale('zh');
// Isolated presentation fixture: no credentials, GitHub requests or personal workspaces.
const items=[{id:'00000000-0000-0000-0000-000000000001',source_id:'source',workspace_id:'proof',repository:'get3w/acceptance',repository_id:1,name:'项目动态',enabled:true,state:'receiving',pending:3,last_received:Date.now(),gap_at:null}];
Reflect.set(window,'__GET3W_ACCOUNT__',{
 status:async()=>({status:'signed_in',user:{id:'fixture'}}),
 eventSources:async({path,method,body}:{path:string;method:string;body?:{action?:string}})=>{
  if(new URLSearchParams(location.search).has('unavailable'))return {ok:false,status:404,json:{detail:'Not Found'}};
  if(path==='/github')return {ok:true,json:{configured:true,state:'connected',account:'验收账号'}};
  if(path==='/subscriptions'&&method==='GET')return {ok:true,json:{items:[...items]}};
  if(method==='PATCH'){const item=items[0];if(item&&body?.action==='delete')items.splice(0);else if(item){item.enabled=body?.action==='enable';item.state=item.enabled?'receiving':'disabled';}}
  return {ok:true,json:{}};
 }
});
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-6"><EventSourceCatalog onAdd={()=>{}}/><div className="mt-8"/><GitHubEventSources workspaceId="proof" client={{saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async()=>[]}} onUpdated={()=>{}}/></main>);
