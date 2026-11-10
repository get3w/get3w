/** @jsxImportSource react */
import {expect,mock,test} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {automationDetailSchema} from '@openwork/types/automations';
GlobalRegistrator.register({url:'http://localhost/'});
Reflect.set(globalThis,'IS_REACT_ACT_ENVIRONMENT',true);
mock.module('../src/react-app/domains/cloud/get3w-account',()=>({openGet3wSignIn:()=>true,requireGet3wSignIn:()=>true,readGet3wAccount:()=>({status:'signed_in',user:{id:'alice'}}),useGet3wAccount:()=>({status:'signed_in',user:{id:'alice'}})}));
const {act}=await import('react');
const {createRoot}=await import('react-dom/client');
const {MemoryRouter,useLocation}=await import('react-router');
const {AutomationsPage}=await import('../src/react-app/domains/automations/automations-page');
const {setLocale}=await import('../src/i18n');
const {DesktopConfigProvider}=await import('../src/react-app/domains/cloud/desktop-config-provider');
setLocale('en');
const detail=automationDetailSchema.parse({automation:{id:'atm_test',organizationId:'alice',ownerMemberId:'alice',name:'Archived acceptance',state:'archived',currentRevisionId:'arv_test',nextDueAt:null,latestRunAt:null,needsAttentionReason:null,createdAt:1,updatedAt:2,archivedAt:2},revision:{id:'arv_test',automationId:'atm_test',version:1,instructions:'Original instructions',schedule:{kind:'daily',timezone:'UTC',hour:9,minute:0},model:{providerId:'test',modelId:'model',variant:null},workspaceId:null,executionTarget:'desktop',maximumRuntimeMs:10000,digest:'0123456789abcdef',createdAt:1},latestRun:null});
function Location(){return <><output>{useLocation().search}</output><output data-path>{useLocation().pathname}</output></>;}

test('a deep link restores archived history and returns to the list without enabling edits',async()=>{
 const requests:string[]=[];
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string})=>{
  requests.push(input.path);
  return {ok:true,status:200,json:input.path.includes('/runs')?{items:[],nextCursor:null}:input.path.includes('?limit')?{items:[detail],nextCursor:null}:detail};
 }});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/automations?automation=atm_test']}><AutomationsPage/><Location/></MemoryRouter>);});
  expect(host.textContent).toContain('Archived acceptance');
  expect(host.textContent).toContain('Archived');
  expect(host.textContent).toContain('No runs yet');
  expect([...host.querySelectorAll('button')].some(button=>button.textContent==='Edit')).toBe(false);
  expect(requests.some(path=>path.includes('atm_test/runs'))).toBe(true);
  await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='Back to automations')?.click();});
  expect(host.querySelector('output')?.textContent).toBe('');
  await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='Show archived')?.click();});
  expect(host.textContent).toContain('Archived acceptance');
  expect([...host.querySelectorAll('button')].some(button=>button.textContent==='Run now')).toBe(false);
 } finally {await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('provider failures show their recovery reason and block manual execution until resumed',async()=>{
 const attention=automationDetailSchema.parse({...detail,automation:{...detail.automation,state:'needs_attention',archivedAt:null,needsAttentionReason:{code:'provider_unavailable',message:'Reconnect the provider',occurredAt:3}}});
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string})=>({ok:true,status:200,json:input.path.includes('/runs')?{items:[],nextCursor:null}:input.path.includes('?limit')?{items:[attention],nextCursor:null}:attention})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<MemoryRouter initialEntries={['/automations?automation=atm_test']}><AutomationsPage/></MemoryRouter>));
  expect(host.textContent).toContain('Reconnect it, then resume the automation.');
  expect([...host.querySelectorAll('button')].find(button=>button.textContent==='Run now')?.disabled).toBe(true);
  expect([...host.querySelectorAll('button')].find(button=>button.textContent==='Resume')?.disabled).toBe(true);
  expect([...host.querySelectorAll('button')].some(button=>button.textContent==='Select a supported model')).toBe(true);
 } finally {await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('the create deep link opens the editor and cancel clears the create route',async()=>{
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async()=>({ok:true,status:200,json:{items:[],nextCursor:null}})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<DesktopConfigProvider><MemoryRouter initialEntries={['/automations?create=1']}><AutomationsPage/><Location/></MemoryRouter></DesktopConfigProvider>));
  expect(host.textContent).toContain('Create automation');
  expect(host.querySelector('#automation-name')).not.toBeNull();
  await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='Cancel')?.click();});
  expect(host.querySelector('output')?.textContent).toBe('');
  expect(host.querySelector('#automation-name')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('a calendar handoff preserves the supplied name instructions and schedule',async()=>{
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async()=>({ok:true,status:200,json:{items:[],nextCursor:null}})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const params=new URLSearchParams({create:'1',name:'Calendar handoff',instructions:'Prepared instructions',schedule:JSON.stringify({kind:'weekly',timezone:'UTC',hour:14,minute:30,daysOfWeek:[1,3]})});
 try{
  await act(async()=>root.render(<DesktopConfigProvider><MemoryRouter initialEntries={['/automations?'+params]}><AutomationsPage providerCatalog={{test:{model:{id:'model',name:'Test model',providerName:'Test'}}}}/><Location/></MemoryRouter></DesktopConfigProvider>));
  expect(host.querySelector('input#automation-name')?.getAttribute('value')).toBe('Calendar handoff');
  expect(host.querySelector('textarea')?.textContent).toBe('Prepared instructions');
  expect(host.textContent).toContain('Weekly');
  await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='Cancel')?.click();});
  expect(host.querySelector('output')?.textContent).toBe('');
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('a connector failure receipt opens the connection recovery settings',async()=>{
 const failed=automationDetailSchema.parse({...detail,automation:{...detail.automation,state:'inactive',archivedAt:null}});
 const run={id:'arn_connection',automationId:'atm_test',revisionId:'arv_test',trigger:'manual',scheduledFor:null,idempotencyKey:'connection',status:'failed',attemptCount:1,executionTarget:'desktop',executionThread:null,providerId:'test',modelId:'model',modelVariant:null,resultSummary:'Slack could not be read',error:{code:'connection_action_required',message:'Slack needs reconnection',retryable:false},usage:{inputTokens:1,outputTokens:2,costMicros:null},createdAt:1,updatedAt:2,startedAt:1,finishedAt:2,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null};
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string})=>({ok:true,status:200,json:input.path.includes('/runs/')?{run,automation:failed.automation,revision:failed.revision,events:[]}:input.path.includes('/runs')?{items:[run],nextCursor:null}:input.path.includes('?limit')?{items:[failed],nextCursor:null}:failed})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/automations?automation=atm_test&run=arn_connection']}><AutomationsPage/><Location/></MemoryRouter>));
  expect(host.textContent).toContain('A connection required by this task is unavailable');
  await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='Open connections')?.click();});
  expect(host.querySelector('[data-path]')?.textContent).toBe('/settings/connect');
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('only a positive offline presence response warns on active automations',async()=>{
 const active=automationDetailSchema.parse({...detail,automation:{...detail.automation,state:'active',archivedAt:null}});
 for(const connected of [false,true,null]){
  Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string})=>({ok:connected!==null||!input.path.includes('/presence'),status:connected===null?404:200,json:input.path.includes('/presence')?{connected,lastSeenAt:null}:input.path.includes('/runs')?{items:[],nextCursor:null}:input.path.includes('?limit')?{items:[active],nextCursor:null}:active})});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try{
   await act(async()=>root.render(<MemoryRouter initialEntries={['/automations?automation=atm_test']}><AutomationsPage/></MemoryRouter>));
   expect(Boolean(host.querySelector('[data-automation-runner-offline]'))).toBe(connected===false);
  }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
 }
});

test('run now opens the exact queued receipt from the list',async()=>{
 const active=automationDetailSchema.parse({...detail,automation:{...detail.automation,state:'active',archivedAt:null}});
 const run={id:'arn_new',automationId:'atm_test',revisionId:'arv_test',trigger:'manual',scheduledFor:null,idempotencyKey:'manual-new',status:'queued',attemptCount:0,executionTarget:'desktop',executionThread:null,providerId:'test',modelId:'model',modelVariant:null,resultSummary:null,error:null,usage:{inputTokens:null,outputTokens:null,costMicros:null},createdAt:1,updatedAt:1,startedAt:null,finishedAt:null,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null};
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string})=>({ok:true,status:200,json:input.path.endsWith('/run')?{run}:input.path.includes('/runs/')?{run,automation:active.automation,revision:active.revision,events:[]}:input.path.includes('/runs')?{items:[run],nextCursor:null}:input.path.includes('?limit')?{items:[active],nextCursor:null}:active})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/automations']}><AutomationsPage/><Location/></MemoryRouter>));
  await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='Run now')?.click();});
  expect(host.querySelector('output')?.textContent).toBe('?automation=atm_test&run=arn_new');
  expect(host.querySelector('details')?.open).toBe(true);
  expect(host.textContent).toContain('Runtime limit');
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('creating an automation opens its detail and clears the create route',async()=>{
 const active=automationDetailSchema.parse({...detail,automation:{...detail.automation,state:'active',archivedAt:null}});
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string;method:string})=>({ok:true,status:200,json:input.path==='/v1/automations'&&input.method==='POST'?active:input.path.includes('/runs')?{items:[],nextCursor:null}:input.path.includes('?limit')?{items:[active],nextCursor:null}:active})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<DesktopConfigProvider><MemoryRouter initialEntries={['/automations?create=1&name=Prepared&instructions=Test']}><AutomationsPage providerCatalog={{test:{model:{id:'model',name:'Test model',providerName:'Test'}}}}/><Location/></MemoryRouter></DesktopConfigProvider>));
  await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='Create and activate')?.click();});
  expect(host.querySelector('output')?.textContent).toBe('?automation=atm_test');
  expect(host.querySelector('#automation-name')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('archiving from a detail returns to the current list',async()=>{
 let archived=false;
 const active=automationDetailSchema.parse({...detail,automation:{...detail.automation,state:'active',archivedAt:null}});
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string;method:string})=>{
  if(input.method==='DELETE')archived=true;
  return {ok:true,status:200,json:input.path.includes('/runs')?{items:[],nextCursor:null}:input.path.includes('?limit')?{items:[archived?detail:active],nextCursor:null}:archived?detail:active};
 }});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/automations?automation=atm_test']}><AutomationsPage/><Location/></MemoryRouter>));
  await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='Archive')?.click();});
  await act(async()=>{[...document.querySelectorAll('button')].filter(button=>button.textContent==='Archive').at(-1)?.click();});
  expect(archived).toBe(true);
  expect(host.querySelector('output')?.textContent).toBe('');
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('a history request failure stops its skeleton and offers retry',async()=>{
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string})=>({ok:!input.path.includes('/runs'),status:input.path.includes('/runs')?503:200,json:input.path.includes('?limit')?{items:[detail],nextCursor:null}:detail})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/automations?automation=atm_test']}><AutomationsPage/></MemoryRouter>));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('503');
  expect(host.querySelector('[data-slot="skeleton"]')).toBeNull();
  expect([...host.querySelectorAll('button')].some(button=>button.textContent==='Retry')).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('a collapsed active receipt can be cancelled without opening it',async()=>{
 const active=automationDetailSchema.parse({...detail,automation:{...detail.automation,state:'active',archivedAt:null}});
 let cancelled=false;
 const run={id:'arn_pending',automationId:'atm_test',revisionId:'arv_test',trigger:'manual',scheduledFor:null,idempotencyKey:'pending',status:'queued',attemptCount:0,executionTarget:'desktop',executionThread:null,providerId:'test',modelId:'model',modelVariant:null,resultSummary:null,error:null,usage:{inputTokens:null,outputTokens:null,costMicros:null},createdAt:1,updatedAt:1,startedAt:null,finishedAt:null,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null};
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string})=>{
  if(input.path.endsWith('/cancel'))cancelled=true;
  const current={...run,status:cancelled?'cancelled':'queued'};
  return {ok:true,status:200,json:input.path.endsWith('/cancel')?{run:current}:input.path.includes('/runs')?{items:[current],nextCursor:null}:input.path.includes('?limit')?{items:[active],nextCursor:null}:active};
 }});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/automations?automation=atm_test']}><AutomationsPage/></MemoryRouter>));
  expect(host.querySelector('details')?.open).toBe(false);
  const cancel=[...host.querySelectorAll('button')].find(button=>button.textContent==='Cancel run');
  expect(cancel?.closest('details')).toBeNull();
  await act(async()=>cancel?.click());
  expect(cancelled).toBe(true);
  expect(host.querySelector('details')?.open).toBe(false);
  expect(host.textContent).toContain('Cancelled');
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});


test('a collapsed completed run opens its original local task',async()=>{
 const run={id:'arn_complete',automationId:'atm_test',revisionId:'arv_test',trigger:'manual',scheduledFor:null,idempotencyKey:'completed',status:'succeeded',attemptCount:1,executionTarget:'desktop',executionThread:{id:'thread_record',threadKind:'automation',executionLocation:'desktop',automationId:'atm_test',automationRunId:'arn_complete',engineKind:'opencode',nativeThreadId:'ses_original',workspaceId:'workspace_test'},providerId:'test',modelId:'model',modelVariant:null,resultSummary:'Done',error:null,usage:{inputTokens:1,outputTokens:2,costMicros:null},createdAt:1,updatedAt:2,startedAt:1,finishedAt:2,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null};
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async(input:{path:string})=>({ok:true,status:200,json:input.path.includes('/runs')?{items:[run],nextCursor:null}:input.path.includes('?limit')?{items:[detail],nextCursor:null}:detail})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/automations?automation=atm_test']}><AutomationsPage/><Location/></MemoryRouter>));
  expect(host.querySelector('details')?.open).toBe(false);
  const open=[...host.querySelectorAll('button')].find(button=>button.textContent==='Open task');
  expect(open).toBeDefined();expect(open?.closest('details')).toBeNull();
  await act(async()=>open?.click());
  expect(host.querySelector('[data-path]')?.textContent).toBe('/workspace/workspace_test/session/ses_original');
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});
