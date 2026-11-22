import {join} from "node:path";
import {z} from "zod";
import {nativeProtocolResponse} from "./native-provider-protocol-fixtures";

const message=z.object({role:z.string(),content:z.unknown(),tool_call_id:z.string().optional(),tool_calls:z.array(z.object({id:z.string(),function:z.object({name:z.string(),arguments:z.string()})})).optional()});
export const exitProviderInput=z.object({messages:z.array(message),tools:z.array(z.object({function:z.object({name:z.string()})})).optional()});
function objects(value:unknown):unknown[]{
 if(typeof value==="string"){try{return objects(JSON.parse(value));}catch{return [];}}
 if(Array.isArray(value))return value.flatMap(objects);
 if(!value||typeof value!=="object")return [];
 return [value,...Object.values(value).flatMap(objects)];
}
const planSchema=z.object({fileId:z.string(),path:z.string(),rootPath:z.string()});
export function exitProviderResponse(raw:unknown,root:string,completionTool=false){
 const body=exitProviderInput.parse(raw);
 const userIndex=body.messages.findLastIndex(m=>m.role==="user");
 const prompt=String(body.messages[userIndex]?.content??"");
 const eventId=/Trigger: [^\n]*?Event: ([a-z0-9-]+)\./.exec(prompt)?.[1];
 if(!eventId)return nativeProtocolResponse("openai","fixture","成果闭环验收");
 const quiet=prompt.includes("EXIT_QUIET");const deferred=prompt.includes("EXIT_DEFERRED") && !(process.env.GET3W_SUSPENSION_TEST==="1" && prompt.includes("INDEPENDENT_WHILE_WAITING"));
 const turns=body.messages.slice(userIndex+1);
 const calls=turns.flatMap(m=>m.tool_calls??[]);
 const result=(id:string)=>turns.find(m=>m.role==="tool"&&m.tool_call_id===id)?.content;
 const has=(step:string)=>calls.some(c=>c.id===`exit_${eventId}_${step}`);
 const call=(step:string,name:string,input:unknown)=>{
  if(!body.tools?.some(t=>t.function.name===name))throw Error(`Missing tool ${name}`);
  const frame=(delta:unknown,finish:string|null)=>`data: ${JSON.stringify({id:"chatcmpl_exit",object:"chat.completion.chunk",model:"fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`;
  return frame({role:"assistant",tool_calls:[{index:0,id:`exit_${eventId}_${step}`,type:"function",function:{name,arguments:JSON.stringify(input)}}]},null)+frame({},"tool_calls")+"data: [DONE]\n\n";
 };
 if(process.env.GET3W_RUNTIME_GUARD_TEST==="1") {
  if(!has("guard"))return call("guard","edit",{path:join(root,".get3w/always-on/state.json"),oldString:'"sources": []',newString:'"sources": ["corrupt"]'});
  if(!String(result(`exit_${eventId}_guard`)).includes("host-owned"))throw Error("Runtime state edit was not blocked");
 }
 if(process.env.GET3W_MEMORY_INDEX_TEST==="1") {
  if(prompt.includes("PRIVATE_NOTE_BODY")||prompt.includes("PRIVATE_PROGRESS_BODY"))throw Error("Memory bodies leaked into initial prompt");
  const note=/"id":"([a-f0-9-]{36})","kind":"note","title":"Native memory title"/.exec(prompt)?.[1];
  if(!note)throw Error("Memory index missing note");
  const hasProgress=prompt.includes('"id":"progress:current"');
  if(!has("memory"))return call("memory","always_on_memory_read",{ids:[note,...(hasProgress?["progress:current"]:[])]});
  const loaded=String(result(`exit_${eventId}_memory`));
  if(!loaded.includes("PRIVATE_NOTE_BODY")||hasProgress && !loaded.includes("PRIVATE_PROGRESS_BODY") && !loaded.includes("count=3"))throw Error("Native memory read did not return bodies");
 }
 if(deferred&&!has("question"))return call("question","question",{questions:[{header:"报告范围",question:"本次报告采用哪个范围？",options:[{label:"仅新增文件",description:"仅检查新增文件"},{label:"全部文件",description:"检查全部文件"}],multiple:false}]});
 if(deferred&&!String(result(`exit_${eventId}_question`)).includes("仅新增文件"))throw Error("Original deferred answer missing");
 if(!has("read"))return call("read","read",{path:join(root,"source.txt")});
 const source=String(result(`exit_${eventId}_read`));
 if(!source.includes("count=3"))throw Error("Native source read did not return count=3");
 const summary=quiet?"本地检查无变化，count=3":"本地检查完成，count=3";
 let plan:z.infer<typeof planSchema>|undefined;
 if(!quiet){
  if(!has("plan"))return call("plan","workspace_file",{action:"plan",task_name:"闭环验收",filename:deferred?"答复后报告":"检查报告",extension:".txt",task_key:eventId});
  for(const obj of objects(result(`exit_${eventId}_plan`))){const parsed=planSchema.safeParse(obj);if(parsed.success){plan=parsed.data;break;}}
  if(!plan||plan.rootPath!==root)throw Error("Native deliverable plan missing or outside fixture");
  if(!has("artifact"))return call("artifact","write",{path:join(root,plan.path),content:`${summary}\n来源：source.txt\n事件：${eventId}\n${deferred?"用户范围：仅新增文件\n":""}`});
  if(!has("register"))return call("register","workspace_file",{action:"register",file_id:plan.fileId});
  if(!objects(result(`exit_${eventId}_register`)).some(obj=>planSchema.safeParse(obj).success))throw Error("Deliverable registration did not succeed");
 }
 if(completionTool){
  if(!has("complete"))return call("complete","always_on_complete",{outcome:quiet?"no_change":"changed",summary,artifacts:plan?[plan.path]:[],continuity:`Source source.txt count=3. Event ${eventId}. No external action repeated.`,notification:quiet?{action:"quiet"}:{action:"send",text:`报告已保存 EXIT_RESULT_${eventId}`}});
  if(!String(result(`exit_${eventId}_complete`)).includes("committed"))throw Error("Completion receipt not confirmed");
  // Deliberately empty: the host receipt must establish completion.
  return nativeProtocolResponse("openai","fixture","");
 }
 if(!has("checkpoint"))return call("checkpoint","write",{path:join(root,".get3w/always-on/checkpoint.md"),content:`Event ${eventId}: ${summary}. Source source.txt count=3. ${quiet?"No user update needed.":`Deliverable ${plan?.path}. Notification requested, delivery not yet confirmed.`}`});
 if(!has("result"))return call("result","write",{path:join(root,`.get3w/always-on/results/${eventId}.json`),content:JSON.stringify({eventId,outcome:quiet?"no_change":"changed",summary,artifacts:plan?[plan.path]:[],notification:quiet?{action:"quiet"}:{action:"send",text:`${deferred?"答复后":""}本地检查完成，报告已保存。EXIT_RESULT_${eventId}`}})});
 return nativeProtocolResponse("openai","fixture",`${summary}。${plan?`报告：${plan.path}。`:"无需通知。"} EXIT_COMPLETE_${eventId}`);
}
