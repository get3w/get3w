import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {Get3wAccount,type ModelTask} from '../src/react-app/domains/cloud/get3w-account';
import {ModelTasksProvider,ModelTaskStatus} from '../src/react-app/domains/cloud/model-task-status';
import type {UIMessage} from 'ai';
import {setLocale} from '../src/i18n';
import '../src/app/index.css';
setLocale('zh');
const messages:UIMessage[]=[{id:'image-turn',role:'assistant',parts:[]},{id:'video-turn',role:'assistant',parts:[]}];
const items:ModelTask[]=[{key:'image',messageId:'image-turn',slug:'demo/text-to-image',status:'completed',requestId:'image',updatedAt:1,outputs:[],outputEntry:{id:'image',userId:'fixture',workspaceId:'ws',sessionId:'session',messageId:'image-turn',requestId:'image',slug:'demo/text-to-image',status:'completed',files:[{path:'landscape.svg.png',mimeType:'image/svg+xml',sizeBytes:100}],outputs:[],structured:null,charged:null,createdAt:1,updatedAt:1}},{key:'video',messageId:'video-turn',slug:'demo/text-to-video',status:'processing',requestId:'video',updatedAt:1,outputs:[]}];
Reflect.set(window,'__GET3W_ACCOUNT__',{
 status:async()=>({status:'signed_in',user:{id:'fixture',name:'Demo'},error:null,pending:false}),
 taskCatalog:async()=>({catalog_version:'v1',expiresAt:Date.now()+60000,offline:false,models:[]}),
 modelTasks:async()=>({items}),
 outputs:async()=>({mimeType:'image/svg+xml',sizeBytes:100,dataBase64:btoa('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="seagreen"/><circle cx="450" cy="100" r="50" fill="wheat"/><path d="M0 400L200 130L400 400L500 220L640 400" fill="darkseagreen"/></svg>')})
});
createRoot(document.getElementById('root')!).render(<MemoryRouter><Get3wAccount/><main className="mx-auto max-w-3xl space-y-6 p-8 text-sm text-foreground"><ModelTasksProvider workspaceId="ws" sessionId="session" messages={messages}><p className="text-right">生成一张风景图片</p><p className="px-10">图片已生成。</p><ModelTaskStatus messageIds={['image-turn']}/><p className="text-right">接着生成一段视频</p><p className="px-10">正在生成视频。</p><ModelTaskStatus messageIds={['video-turn']}/><p className="text-right">后续对话</p><p className="px-10">之前的图片保留在原来的对话位置。</p></ModelTasksProvider></main></MemoryRouter>);
