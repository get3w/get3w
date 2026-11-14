import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {PlatformProvider,createDefaultPlatform} from '../src/react-app/kernel/platform';
import {DenAuthProvider} from '../src/react-app/domains/cloud/den-auth-provider';
import {MessageListProvider} from '../src/components/chat/message-list-provider';
import {MessageList} from '../src/components/chat/message-list';
import type {UIMessage} from 'ai';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {Get3wAccount,type ModelTask} from '../src/react-app/domains/cloud/get3w-account';
import {ModelTasksProvider,ModelTaskStatus} from '../src/react-app/domains/cloud/model-task-status';
import {VideoPreview} from '../src/react-app/domains/cloud/video-preview';
import {setLocale} from '../src/i18n';
import '../src/app/index.css';
setLocale('zh');
const messages:UIMessage[]=[{id:'user',role:'user',parts:[{type:'text',text:'生成一段咖啡视频'}]},{id:'reply',role:'assistant',parts:[
 {type:'text',text:'开始生成视频。'},
 {type:'dynamic-tool',toolName:'media_generate',toolCallId:'generate',state:'output-available',input:{},output:{task_id:'done',request_id:'done',status:'submitted'}},
 {type:'text',text:'视频已生成，接下来核验尺寸并提取首尾帧。'},
 {type:'dynamic-tool',toolName:'bash',toolCallId:'verify',state:'output-available',input:{command:'echo verified'},output:'verified'},
 {type:'text',text:'继续生成配音。'},
 {type:'dynamic-tool',toolName:'media_generate',toolCallId:'audio',state:'output-available',input:{},output:{task_id:'audio',request_id:'audio',status:'submitted'}},
 {type:'text',text:'最终交付：\n\n[final.mp4](https://xianchou.com/fixture.mp4)'},
]}];
const now=Date.now();
const items:ModelTask[]=[
 {key:'queued',slug:'demo/text-to-video',status:'created',createdAt:now-10000,estimatedDuration:120,requestId:'queued',updatedAt:now,outputs:[],messageId:'reply',reservedUsd:'1.071000'},
 {key:'running',slug:'demo/text-to-video',status:'processing',createdAt:now-65000,estimatedDuration:120,requestId:'running',updatedAt:now,outputs:[],messageId:'reply'},
 {key:'overdue',slug:'demo/text-to-video',status:'processing',createdAt:now-150000,estimatedDuration:120,requestId:'overdue',updatedAt:now,outputs:[],messageId:'reply'},
 {key:'unknown',slug:'demo/text-to-video',status:'processing',createdAt:now-15000,requestId:'unknown',updatedAt:now,outputs:[],messageId:'reply'},
 {key:'done',slug:'demo/text-to-video',status:'completed',requestId:'done',updatedAt:now,outputs:['https://xianchou.com/fixture.mp4'],messageId:'user',chargedUsd:'1.071429'},
];
Reflect.set(window,'__GET3W_ACCOUNT__',{
 status:async()=>({status:'signed_in',user:{id:'fixture',name:'Demo'},error:null,pending:false}),
 taskCatalog:async()=>({catalog_version:'v1',expiresAt:now+60000,offline:false,models:[]}),
 modelTasks:async()=>({items:[...items.filter(item=>item.key==='done'),{key:'audio',slug:'demo/text-to-speech',status:'completed',requestId:'audio',updatedAt:now,outputs:['https://xianchou.com/fixture.wav'],messageId:'user'}]})
});
const noop=()=>{};
createRoot(document.getElementById('root')!).render(<MemoryRouter><Get3wAccount/><QueryClientProvider client={new QueryClient()}><DenAuthProvider><PlatformProvider value={createDefaultPlatform()}><MessageListProvider workspaceId="fixture" sessionId="fixture" showThinking={true} developerMode={false} displaySuggestions={false} providerConnectedCount={0} dispatchAction={noop} setPrompt={noop} onRevertToUserMessage={noop} onForkAtMessage={noop} onEditUserMessage={noop} onMcpReconnect={async()=>{}} onMcpReopenAuthorization={async()=>{}}><main className="mx-auto max-w-3xl p-8"><MessageList messages={messages} status="ready"/></main></MessageListProvider></PlatformProvider></DenAuthProvider></QueryClientProvider></MemoryRouter>);
