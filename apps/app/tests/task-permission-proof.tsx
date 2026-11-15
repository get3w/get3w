import { DesktopConfigProvider } from "../src/react-app/domains/cloud/desktop-config-provider";
import { WorkspaceProvider } from "../src/react-app/shell/workspace-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {ReactSessionComposer} from '../src/react-app/domains/session/surface/composer/composer';
import type {ComposerMentionKind} from '../src/react-app/domains/session/surface/composer/mention-encoding';
import {setLocale} from '../src/i18n';
import '../src/app/index.css';
setLocale("zh");
const state=new URLSearchParams(location.search).get("state");
let mode=state==="full"?"full_access":"default";
Reflect.set(window,"__GET3W_ACCOUNT__",{taskPermissions:async(input:{action:string;mode?:string})=>{
 if(state==="error" || (state==="save-error" && input.action==="set"))throw Error("Isolated failure");
 if(input.action==="set"&&input.mode)mode=input.mode;
 return {mode,defaultMode:mode,grants:[]};
}});
const noop=()=>{};
function Proof(){const [draft,setDraft]=useState('');const [mentions,setMentions]=useState<Record<string,ComposerMentionKind>>({});return <MemoryRouter><main className='mx-auto max-w-4xl px-8 pt-32'><ReactSessionComposer workspaceId="ws" sessionId="ses_proof" draft={draft} mentions={mentions} onDraftChange={setDraft} onInsertMention={(kind,value,text)=>{if(text!==undefined)setDraft(text);setMentions(current=>({...current,[value]:kind}));}} onSend={noop} onSteer={noop} onQueue={noop} onStop={noop} busy={false} steering={false} submissionPreparing={false} queuedCount={0} disabled={false} statusLabel='' modelPickerOpen={false} selectedModel={{providerID:'anthropic',modelID:'claude-opus-4-6'}} onModelPickerOpenChange={noop} onModelChange={noop} attachments={[]} onAttachFiles={noop} onRemoveAttachment={noop} attachmentsEnabled={false} attachmentsDisabledReason={null} modelVariantLabel='' modelVariant={null} onModelVariantChange={noop} agentLabel='Demo' selectedAgent={null} listAgents={async()=>[]} onSelectAgent={noop} listCommands={async()=>[]} recentFiles={[]} searchFiles={async()=>[]} onPasteText={noop} onUnsupportedFileLinks={noop} pastedText={[]} onExpandPastedText={noop} onRemovePastedText={noop}/></main></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><WorkspaceProvider client={null} selectedWorkspaceRoot="/tmp/get3w-permission-proof"><DesktopConfigProvider><Proof/></DesktopConfigProvider></WorkspaceProvider></QueryClientProvider>);
