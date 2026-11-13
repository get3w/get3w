import {afterAll,beforeAll,expect,test} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {readFileSync} from 'node:fs';
import {setLocale,t} from '../src/i18n';
import en from '../src/i18n/locales/en';
import zh from '../src/i18n/locales/zh';
let PreferenceFields:typeof import('../src/react-app/domains/cloud/model-preferences-panel')['PreferenceFields'];
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:'http://localhost'});Reflect.set(globalThis,'IS_REACT_ACT_ENVIRONMENT',true);PreferenceFields=(await import('../src/react-app/domains/cloud/model-preferences-panel')).PreferenceFields;});

afterAll(async()=>{await GlobalRegistrator.unregister();});
const model={model_id:'demo/image',name:'Demo Image',provider_id:'demo',description:'',type:'text-to-image',run_type_title:'Image',category:'image',catalog_version:'v1',base_price:.02,currency:'USD',billing_unit:'image',output_schema:null,api_schema:{api_schemas:[{api_path:'/run',request_schema:{properties:{aspect_ratio:{enum:['1:1','16:9']}}}}]}};
test('personal preference catalog handles loading, failure, empty, offline, locale change and stale replies',async()=>{
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 let finish:(value:unknown)=>void=()=>{};
 Reflect.set(window,'__GET3W_ACCOUNT__',{taskCatalog:()=>new Promise(resolve=>{finish=resolve;})});
 try{
  setLocale('zh');await act(async()=>root.render(<PreferenceFields userId="alice"/>));
  expect(node.querySelector('[aria-busy=true]')).not.toBeNull();
  const old=finish;
  Reflect.set(window,'__GET3W_ACCOUNT__',{taskCatalog:async()=>{throw Error('offline');}});
  await act(async()=>root.render(<PreferenceFields key="bob" userId="bob"/>));
  expect(node.textContent).toContain('无法更新模型目录');
  await act(async()=>old({catalog_version:'v1',models:[model],offline:false}));
  expect(node.textContent).not.toContain('图片生成');
  Reflect.set(window,'__GET3W_ACCOUNT__',{taskCatalog:async()=>({catalog_version:'v1',models:[],offline:false})});
  await act(async()=>root.render(<PreferenceFields key="empty" userId="bob"/>));
  expect(node.textContent).toContain('暂无可用模型');
  Reflect.set(window,'__GET3W_ACCOUNT__',{taskCatalog:async()=>({catalog_version:'v1',models:[model],offline:true})});
  await act(async()=>root.render(<PreferenceFields key="offline" userId="alice"/>));
  expect(node.querySelector('[aria-label="作用域"]')).toBeNull();
  expect(node.textContent).not.toContain('本会话');
  expect(node.textContent).toContain('离线目录');expect(node.textContent).not.toContain('宽高比');
  expect(node.querySelector('[aria-label="图片生成 模型"]')).not.toBeNull();
  expect(node.querySelector('[aria-label="图片生成 宽高比"]')).toBeNull();
  await act(async()=>setLocale('en'));
  expect(node.textContent).toContain('Offline catalog');expect(node.textContent).not.toContain('Aspect ratio');expect(node.textContent).not.toContain('宽高比');
 }finally{await act(async()=>root.unmount());node.remove();delete window.__GET3W_ACCOUNT__;}
});
test('signed-in accounts with zero organizations can open preferences; unverified account is not reported signed out',async()=>{
 const {Get3wAccount}=await import('../src/react-app/domains/cloud/get3w-account');
 const {ModelPreferencesPanel}=await import('../src/react-app/domains/cloud/model-preferences-panel');
 const {OutputsPage}=await import('../src/react-app/domains/cloud/outputs-page');
 let state='signed_in';
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:state,user:{id:'zero-org',name:'Demo'},error:null,pending:false}),taskCatalog:async()=>({catalog_version:'v1',models:[model],offline:false})});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  setLocale('en');await act(async()=>root.render(<MemoryRouter><Get3wAccount/><ModelPreferencesPanel/><OutputsPage workspaceId="test"/></MemoryRouter>));
  expect(node.querySelectorAll('[aria-label="Model preferences"]')).toHaveLength(1);
  expect(node.querySelector('[aria-label="Preferred models"]')).toBeNull();
  expect(node.querySelector('[aria-label="Output settings"]')).toBeNull();
  await act(async()=>node.querySelector<HTMLButtonElement>('[aria-label="Model preferences"]')?.click());
  expect(document.body.textContent).toContain('Image generation');expect(document.body.textContent).not.toContain('Sign in to set preferences');
  state='unavailable';await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(document.body.textContent).toContain('Could not verify your account');expect(document.body.textContent).not.toContain('Sign in to set preferences');expect(document.body.textContent).not.toContain('Sign in to view outputs');
 }finally{await act(async()=>root.unmount());node.remove();delete window.__GET3W_ACCOUNT__;}
});
test('personal translations exist in both languages with matching placeholders and no organization IPC or share controls',()=>{
 for(const [key,value] of Object.entries(en))if(key.startsWith('personal.')){
  expect(Reflect.get(zh,key)).toBeString();
  expect(String(Reflect.get(zh,key)).match(/\{\w+\}/g)?.sort()??[]).toEqual(value.match(/\{\w+\}/g)?.sort()??[]);
 }
 const root=import.meta.dir+'/../src/';
 for(const file of ['react-app/domains/cloud/get3w-account.tsx','react-app/domains/dashboard/artifacts-page.tsx']){
  const source=readFileSync(root+file,'utf8');expect(source).not.toMatch(/Get3wOrganizations|ArtifactShare|createOrganization:|membership:|toolAccess:/);
 }
 const routes=readFileSync(root+'react-app/shell/app-root.tsx','utf8');
 for(const route of ['/join-org','/organizations/*','/settings/organizations/*','/apps/:appId','/outputs'])expect(routes).toContain('path="'+route+'"');
 const connector=readFileSync(root+'react-app/domains/cloud/get3w-connectors.tsx','utf8');
 for(const locale of ['zh','en']){
  const consent=t('ui.1101e1156be3',{lng:locale});expect(consent).not.toMatch(/organization|组织/);
  expect(t('ui.9e3264c23ab2',{lng:locale})).not.toMatch(/organization|组织/);
  expect(t('ui.06faeb0780a2',{lng:locale})).not.toMatch(/organization|组织/);
  expect(t('settings_ui.6dcbec911e8e',{lng:locale})).not.toMatch(/organization|组织/);
  expect(t('settings.tab_description_cloud_account',{lng:locale})).not.toMatch(/organization|组织/);
 }
 expect(connector).not.toContain('organizationId');
 expect(t('personal.errors.upgrade',{lng:'zh'})).not.toContain('personal.');
});


test('all merged preference groups translate and switch languages',async()=>{
 const types=['image-to-layers','image-upscale','video-edit','video-extend','video-upscale'];
 const chinese=['图片分层','图片放大','视频编辑','视频延长','视频放大'];
 const english=['Image to layers','Image upscaling','Video editing','Video extension','Video upscaling'];
 const models=types.map(type=>({...model,model_id:`demo/${type}`,type}));
 Reflect.set(window,'__GET3W_ACCOUNT__',{taskCatalog:async()=>({catalog_version:'v1',models,offline:false})});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const headings=()=>Array.from(node.querySelectorAll('h3'),heading=>heading.textContent);
 try{
  {
   setLocale('zh');await act(async()=>root.render(<PreferenceFields userId="translated-groups"/>));
   expect(headings()).toEqual(chinese);
   await act(async()=>setLocale('en'));expect(headings()).toEqual(english);
   await act(async()=>setLocale('zh'));expect(headings()).toEqual(chinese);

  }
 }finally{await act(async()=>root.unmount());node.remove();delete window.__GET3W_ACCOUNT__;setLocale('zh');}
});

test('temporary account outage preserves cached preference browsing but blocks execution',async()=>{
 const {Get3wAccount}=await import('../src/react-app/domains/cloud/get3w-account');
 const {ModelPreferencesPanel}=await import('../src/react-app/domains/cloud/model-preferences-panel');
 const {requireGet3wSignIn}=await import('../src/react-app/domains/cloud/get3w-account');
 let state='signed_in';let offline=false;
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:state,user:{id:'offline-ui',name:'Test'},pending:false,error:null}),taskCatalog:async()=>({catalog_version:'offline-v1',models:[model],offline,expiresAt:Date.now()+60000})});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  setLocale('en');await act(async()=>root.render(<MemoryRouter><Get3wAccount/><ModelPreferencesPanel/></MemoryRouter>));
  state='unavailable';offline=true;await act(async()=>window.dispatchEvent(new Event('focus')));
  await act(async()=>node.querySelector<HTMLButtonElement>('[aria-label="Model preferences"]')?.click());
  expect(document.body.textContent).toContain('Image generation');
  await act(async()=>{expect(requireGet3wSignIn()).toBe(false);});
 }finally{await act(async()=>root.unmount());node.remove();delete window.__GET3W_ACCOUNT__;setLocale('zh');}
});


test('closed lazy menus preserve saved model and output selections without storage writes',async()=>{
 const {writeModelPreference,writeOutputPreference,readOutputPreferences}=await import('../src/react-app/domains/cloud/model-preferences');
 const userId='lazy-selected';
 const selected={...model,api_schema:{api_schemas:[{api_path:'/run',request_schema:{properties:{resolution:{enum:['1K','2K','4K']}}}}]}};
 Reflect.set(window,'__GET3W_ACCOUNT__',{taskCatalog:async()=>({catalog_version:'v1',models:[selected],offline:false})});
 writeModelPreference(userId,{runType:'image',slug:'demo/image',scope:'global',updatedAt:1});
 writeOutputPreference(userId,{runType:'image',fields:{resolution:'1K'},scope:'global',updatedAt:1});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  setLocale('en');await act(async()=>root.render(<PreferenceFields userId={userId}/>));
  const trigger=node.querySelector<HTMLButtonElement>('[aria-label="Image generation Resolution"]');
  expect(trigger?.textContent).toContain('1K');
  await act(async()=>{trigger?.click();});
  await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
  expect(trigger?.textContent).toContain('1K');
  expect(readOutputPreferences(userId)).toEqual([{runType:'image',fields:{resolution:'1K'},scope:'global',updatedAt:1}]);
 }finally{await act(async()=>root.unmount());node.remove();delete window.__GET3W_ACCOUNT__;setLocale('zh');}
});


test('known offline catalog blocks draft execution before engine access',async()=>{
 const {Get3wAccount,requireGet3wSignIn}=await import('../src/react-app/domains/cloud/get3w-account');
 const {loadTaskCatalog}=await import('../src/react-app/domains/cloud/task-catalog-store');
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:'signed_in',user:{id:'offline-execution',name:'Test'},pending:false,error:null}),taskCatalog:async()=>({catalog_version:'v1',models:[model],offline:true,expiresAt:0})});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  await act(async()=>root.render(<MemoryRouter><Get3wAccount/></MemoryRouter>));
  await act(async()=>{await loadTaskCatalog('offline-execution');});
  expect(requireGet3wSignIn()).toBe(false);
 }finally{await act(async()=>root.unmount());node.remove();delete window.__GET3W_ACCOUNT__;}
});
