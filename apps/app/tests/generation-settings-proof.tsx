import { DesktopConfigProvider } from "../src/react-app/domains/cloud/desktop-config-provider";
import { WorkspaceProvider } from "../src/react-app/shell/workspace-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {ReactSessionComposer} from '../src/react-app/domains/session/surface/composer/composer';
import {Get3wAccount} from '../src/react-app/domains/cloud/get3w-account';
import type {ComposerMentionKind} from '../src/react-app/domains/session/surface/composer/mention-encoding';
import {setLocale} from '../src/i18n';
import '../src/app/index.css';
setLocale('zh');
const types=['text-to-image','image-to-image','text-to-video','image-to-video','first-last-to-video','text-to-panorama','image-to-panorama','digital-human','text-to-3d','image-to-3d','text-to-speech','text-to-music'];
const proofModels=types.map(type=>({model_id:`demo/creative/${type}`,name:'Creative Model',provider_id:'demo',description:'',type,run_type_title:type,category:type,catalog_version:'v1',base_price:.02,currency:'USD',billing_unit:'output',output_schema:null,api_schema:{api_schemas:[{api_path:'/run',request_schema:{properties:{format:{enum:['standard','high']},...(type.endsWith('-to-video')||type==='text-to-music'?{duration:{enum:[5,10]}}:{})}}}]}}));
Reflect.set(window,'__GET3W_ACCOUNT__',{
 status:async()=>({status:'signed_in',user:{id:'generation-proof',name:'Demo'},error:null,pending:false}),
 taskCatalog:async()=>({catalog_version:'v1',expiresAt:Date.now()+60000,offline:false,desktop_defaults:{schema_version:1,version:'v1',tasks:{image:{slug:'demo/creative',fields:{format:'high'}}}},models:proofModels})
});
const noop=()=>{};
function Proof(){const [draft,setDraft]=useState('');const [mentions,setMentions]=useState<Record<string,ComposerMentionKind>>({});return <MemoryRouter><Get3wAccount/><main className='mx-auto max-w-4xl px-8 pt-72'><ReactSessionComposer draft={draft} mentions={mentions} onDraftChange={setDraft} onInsertMention={(kind,value,text)=>{if(text!==undefined)setDraft(text);setMentions(current=>({...current,[value]:kind}));}} onSend={noop} onSteer={noop} onQueue={noop} onStop={noop} busy={false} steering={false} submissionPreparing={false} queuedCount={0} disabled={false} statusLabel='' modelPickerOpen={false} selectedModel={{providerID:'demo',modelID:'demo-chat'}} onModelPickerOpenChange={noop} onModelChange={noop} attachments={[]} onAttachFiles={noop} onRemoveAttachment={noop} attachmentsEnabled={false} attachmentsDisabledReason={null} modelVariantLabel='' modelVariant={null} onModelVariantChange={noop} agentLabel='Demo' selectedAgent={null} listAgents={async()=>[]} onSelectAgent={noop} listCommands={async()=>[]} recentFiles={[]} searchFiles={async()=>[]} onPasteText={noop} onUnsupportedFileLinks={noop} pastedText={[]} onExpandPastedText={noop} onRemovePastedText={noop}/></main></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><WorkspaceProvider client={null} selectedWorkspaceRoot="/tmp/get3w-generation-proof"><DesktopConfigProvider><Proof/></DesktopConfigProvider></WorkspaceProvider></QueryClientProvider>);
