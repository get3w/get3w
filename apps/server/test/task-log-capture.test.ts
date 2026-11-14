import {afterEach,expect,test} from 'bun:test';
import {captureTaskLogExchange} from '../src/task-log-capture.js';
import evidencePlugin from '../src/opencode-plugins/task-log-evidence-v2.js';
import type {WorkspaceInfo} from '../src/types.js';
const workspace:WorkspaceInfo={id:'ws',name:'test',path:'/tmp/test',workspaceType:'local'};
afterEach(()=>{globalThis.__get3wTaskLogs=undefined;});
test('capture preserves account at admission and does not consume caller response',async()=>{
 const records:unknown[]=[];let uid='alice';globalThis.__get3wTaskLogs={identity:()=>uid,capture:async value=>{records.push(value)}};
 const request=new Request('http://localhost/session',{method:'POST',body:'{"title":"hello"}'});
 const response=await captureTaskLogExchange(workspace,'v2','/api/session',request,async()=>{uid='bob';return Response.json({data:{id:'ses_new'}})});
 expect(await response.json()).toEqual({data:{id:'ses_new'}});
 expect(records).toMatchObject([{userId:'alice',request:{title:'hello'}}]);
});
test('capture outage never fails a successful task',async()=>{
 globalThis.__get3wTaskLogs={capture:async()=>{throw Error('disk unavailable')}};
 const response=await captureTaskLogExchange(workspace,'v1','/session',new Request('http://localhost',{method:'POST'}),async()=>new Response(null,{status:204}));
 expect(response.status).toBe(204);
});
test('v2 HTTP hook copies actual request and response without consuming engine bodies',async()=>{
 let callback:((event:{sessionID:string;request:Request;response:Response})=>Promise<void>)|undefined;
 const bodies:unknown[]=[];const original=globalThis.fetch;
 globalThis.fetch=async(_input,init)=>{bodies.push(JSON.parse(String(init?.body)));return Response.json({ok:true})};
 try{
 const stop=await evidencePlugin.setup({options:{url:'http://127.0.0.1/read',token:'local'},session:{hook:async(_name,handler)=>{callback=handler;return {dispose:async()=>{}}}}});
 const request=new Request('http://provider/chat',{method:'POST',body:'{"messages":[{"role":"user","content":"hello"}]}'});const response=new Response('data: hello\n\n');
 await callback?.({sessionID:'ses_new',request,response});
 for(let attempt=0;attempt<20&&bodies.length<3;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 expect(await request.text()).toContain('hello');expect(await response.text()).toContain('hello');
 expect(bodies[0]).toMatchObject({name:'task_log_evidence',sessionId:'ses_new',input:{type:'model.http.request'}});
 expect(bodies.length).toBeGreaterThanOrEqual(3);expect(JSON.stringify(bodies)).toContain('model.output');expect(JSON.stringify(bodies)).not.toContain('model.http.response.chunk');await stop();
 }finally{globalThis.fetch=original}
});
