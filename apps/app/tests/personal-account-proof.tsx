/** @jsxImportSource react */
import channelSchema from './model-settings-fixture.json';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {Get3wAccount} from '../src/react-app/domains/cloud/get3w-account';
import {PreferenceFields} from '../src/react-app/domains/cloud/model-preferences-panel';
import {Get3wBalance} from '../src/react-app/domains/cloud/get3w-balance';
import {Get3wConnectors} from '../src/react-app/domains/cloud/get3w-connectors';
import {Get3wModelUsage} from '../src/react-app/domains/cloud/get3w-model-usage';
import {ModelApprovalCards} from '../src/react-app/domains/cloud/model-approval-cards';
import {t,setLocale,useLocale} from '../src/i18n';
import '../src/app/index.css';
const params=new URLSearchParams(location.search);
setLocale(params.get('lang')==='en'?'en':'zh');
const state=params.get('state')??'ready';
Reflect.set(window,'__GET3W_ACCOUNT__',{
 status:async()=>({status:'signed_in',user:{id:'isolated-fixture',name:'Demo'},error:null,pending:false}),
 taskCatalog:async()=>{
  if(state==='loading')return new Promise(()=>{});
  if(state==='error')throw Error('unavailable');
  return {catalog_version:'fixture-v1',expiresAt:Date.now()+60000,offline:state==='offline',models:state==='empty'?[]:[{model_id:'demo/image',name:'Demo Image',provider_id:'demo',description:'',type:'text-to-image',run_type_title:'Image',category:'image',catalog_version:'fixture-v1',base_price:.02,currency:'USD',billing_unit:'image',output_schema:null,api_schema:{api_schemas:[{api_path:'/run',request_schema:params.has('channels')?channelSchema:{properties:{aspect_ratio:{enum:['1:1','16:9']}}}}]}}]};
 },
 balance:async()=>({balance:{amount:'12.000000',currency:'USD'}}),
 connectors:async()=>({connectors:[{provider:'google',configured:true,connected:true},{provider:'microsoft',configured:true,connected:false}]}),
 modelUsage:async()=>({billing:'personal',items:[],next_cursor:null}),
 modelApprovals:async()=>({items:[{id:'fixture',workspaceId:'ws',modelTask:{quoteId:'q',sessionId:'chat-session-123456',slug:'Demo Image',amountUsd:'0.020000',expiresAt:Date.now()+60000}}]}),
});
function Proof(){useLocale();return <MemoryRouter><Get3wAccount/><main className="mx-auto max-w-4xl space-y-6 p-8 text-foreground"><h1 className="text-xl font-semibold">{t('ui.ddf6f9a613af')}</h1><section className="space-y-4"><h2 className="text-sm font-medium">{t('personal.copy.model_preferences')}</h2><PreferenceFields userId="isolated-fixture"/></section><Get3wBalance userId="isolated-fixture"/><Get3wConnectors userId="isolated-fixture"/><Get3wModelUsage userId="isolated-fixture"/><ModelApprovalCards workspaceId="ws" sessionId="chat-session-123456"/></main></MemoryRouter>;}
createRoot(document.getElementById('root')!).render(<Proof/>);
