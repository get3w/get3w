import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,open,rename,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {resolveSetting} from './model-settings.mjs';
import {Ajv2020} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const failure=(code,message,extra={})=>({status:'error',error:{code,message,...extra}});
// CommonJS format plugin exposes its callable export at runtime.
const formats = /** @type {import('ajv-formats').FormatsPlugin} */ (/** @type {unknown} */ (addFormats));
const ajv=new Ajv2020({strict:false,allErrors:true,validateFormats:true});formats(ajv);
const category=type=>type.includes('panorama')?'panorama':type.includes('image')&&!type.includes('video')?'image':type.includes('video')?'video':type==='text-to-speech'?'speech':type==='text-to-music'?'music':type;
const family=model=>model.model_id.endsWith(`/${model.type}`)?model.model_id.slice(0,-model.type.length-1):model.model_id;
// Keep validation constraints and references, omit verbose catalog UI metadata.
function conciseSchema(value){
 if(!record(value))return value;
 const result={...value};
 for(const name of ['title','examples','example','$comment','x-option-labels','x-option-descriptions','x-placeholder','x-order-properties'])delete result[name];
 if(typeof result.description==='string')result.description=result.description.slice(0,100);
 for(const name of ['properties','$defs','definitions','patternProperties','dependentSchemas'])if(record(result[name]))result[name]=Object.fromEntries(Object.entries(result[name]).map(([key,item])=>[key,conciseSchema(item)]));
 for(const name of ['items','contains','additionalProperties','propertyNames','not','if','then','else'])if(record(result[name]))result[name]=conciseSchema(result[name]);
 for(const name of ['allOf','anyOf','oneOf','prefixItems'])if(Array.isArray(result[name]))result[name]=result[name].map(conciseSchema);
 for(const name of ['x-channel-options','x-resolution-options'])if(record(result[name])){
  const entries=Object.entries(result[name]).filter(([,options])=>!Array.isArray(options)||hash(options.map(option=>option.value))!==hash(result.enum)).map(([key,options])=>[key,Array.isArray(options)?options.map(option=>({value:option.value})):options]);
  if(entries.length)result[name]=Object.fromEntries(entries);else delete result[name];
 }
 return result;
}

/** Host-owned media workflow. No model-controlled quotes, identities or keys. */
export function createNativeMedia({auth,userId,directory,dispatch,findTask,now=Date.now,onTiming=(_event)=>{}}){
 const file=directory&&path.join(directory,'native-media-preparations.json');
 let records,capabilityCatalogVersion,queue=Promise.resolve();const preparing=new Map(),active=new Map(),capabilities=new Map(),schemas=new Map();
 /** @template T @param {()=>Promise<T>} fn @returns {Promise<T>} */
 const serial=fn=>{const pending=queue.then(fn,fn);queue=pending.then(()=>{},()=>{});return pending;};
 async function load(){if(records)return;try{const value=JSON.parse(await readFile(file,'utf8'));if(value.version!==1||!Array.isArray(value.records))throw Error('Invalid preparations');records=value.records;}catch(error){if(file&&error.code!=='ENOENT')throw Error('Media preparation history could not be verified');records=[];}}
 async function save(){if(!file)return;await mkdir(directory,{recursive:true,mode:0o700});const handle=await open(file+'.tmp','w',0o600);try{await handle.writeFile(JSON.stringify({version:1,records}));await handle.sync();}finally{await handle.close();}await rename(file+'.tmp',file);if(process.platform!=='win32'){const folder=await open(directory,'r');try{await folder.sync();}finally{await folder.close();}}}
 const identity=host=>({userId,workspaceId:host.workspaceId,sessionId:host.sessionId,messageId:host.userMessageId});
 async function verify(){const account=await (auth.mediaIdentity?.()??auth.status());if(account.status!=='signed_in'||account.user?.id!==userId){capabilities.clear();schemas.clear();throw Error('The current Get3W account is unavailable');}}
 async function measure(trace,stage,run){const start=now();try{return await run();}finally{onTiming({traceId:trace,stage,startedAt:start,endedAt:now(),durationMs:now()-start});}}
 async function catalog(){const value=await (auth.mediaCatalog?.({userId})??auth.taskCatalog({userId}));if(value.offline||value.executionAllowed===false)throw Error('Reconnect before generating media');if(capabilityCatalogVersion!==value.catalog_version){capabilities.clear();capabilityCatalogVersion=value.catalog_version;}return value;}
 async function capability(name,args,host,signal,key){
  // Discovery and MCP framing are private implementation details.
  // Personal capability names are account-scoped. Execution still carries the
  // caller's verified conversation; new chats need not rediscover the names.
  const capabilityKey=name;
  let match=capabilities.get(capabilityKey);
  if(!match){
   const found=await dispatch('search_capabilities',{query:'get3w.'},host,signal);
   const rows=found.result?.structuredContent?.data;
   if(!Array.isArray(rows))throw Object.assign(Error('Media capability discovery failed. Reconnect the account and retry'),{code:found.result?.structuredContent?.error?.code??found.result?.structuredContent?.code??'discovery_unavailable'});
   if(Array.isArray(rows))for(const row of rows)if(row.enabled!==false)capabilities.set(row.handler,row);
   match=capabilities.get(capabilityKey);
  }
  if(!match)throw Object.assign(Error('The requested media service is unavailable'),{code:'capability_unavailable'});
  await verify();signal.throwIfAborted();
  const response=await dispatch('execute_capability',{name:match.name,arguments:args,idempotency_key:key},host,signal);
  if(response.error||response.result?.isError){capabilities.clear();throw Object.assign(Error(response.error?.message??response.result?.content?.find(item=>item.type==='text')?.text??'Media request failed'),{code:response.error?.reason??response.result?.structuredContent?.code,notSubmitted:response.error?.not_submitted===true||response.result?.structuredContent?.not_submitted===true});}
  const value=response.result?.structuredContent;
  if(value?.status!=='succeeded')throw Error('Media service returned an invalid response');
  return value.result;
 }
 function defaults(model,policy,cat){
  const tasks=cat.desktop_defaults?.tasks??{};
  return {...(tasks[category(model.type)]??tasks[model.type])?.fields,...policy.outputs?.[model.type]};
 }
 function inputSchema(schema,inputs){
  const result=structuredClone(schema);delete result.$schema;
  for(const [name,property] of Object.entries(result.properties??{})){
   if(!record(property))continue;
   const resolved=resolveSetting({options:property.enum?.map(value=>({value})),defaultValue:property.default,
    channelOptions:property['x-channel-options'],resolutionOptions:property['x-resolution-options'],
    showChannels:property['x-show-channels'],showResolutions:property['x-show-resolutions'],apiOnly:property['x-api-only']},inputs);
   if(!resolved){result.properties[name]=false;continue;}
   if(resolved.options)property.enum=resolved.options.map(option=>option.value);
   // Advertise the resolved preference, so schema defaults do not invite the
   // model to overwrite a user setting with the catalog default.
   if(inputs[name]!==undefined)property.default=structuredClone(inputs[name]);
  }
  function close(node){if(!record(node))return;if(node.type==='object'&&node.properties)node.additionalProperties=false;for(const child of Object.values(node)){if(Array.isArray(child))child.forEach(close);else if(record(child))close(child);}}
  close(result);result.additionalProperties=false;return result;
 }
 function referenceRequirements(type,schema){
  if(type!=='reference-to-video')return schema;
  const names=Object.keys(schema.properties??{}).filter(name=>/^(image|video|audio|reference)(s|_urls|_url)?$/.test(name));
  if(!names.length)return schema;
  return {...schema,allOf:[...(schema.allOf??[]),{anyOf:names.map(name=>({required:[name],properties:{[name]:schema.properties[name].type==='array'?{minItems:1}:{minLength:1}}}))}]};
 }
 function missingInputs(schema,inputs){
  const missing=(schema.required??[]).filter(name=>inputs[name]===undefined);
  for(const rule of schema.allOf??[])if(rule.anyOf?.every(branch=>branch.required?.length===1)){
   const names=rule.anyOf.map(branch=>branch.required[0]);
   if(names.every(name=>inputs[name]===undefined||inputs[name]===''||Array.isArray(inputs[name])&&!inputs[name].length))missing.push({one_of:names});
  }
  return missing;
 }
 function merged(row,values){
  const result={...Object.fromEntries(Object.entries(row.defaults).filter(([name,value])=>Object.hasOwn(row.schema.properties??{},name)&&value!=='auto')),...row.references,...values};
  for(const [name,property] of Object.entries(row.schema.properties??{})){
   if(result[name]===undefined&&property.default!==undefined)result[name]=structuredClone(property.default);
   if(result[name]!==undefined&&Array.isArray(property.enum)){
    const typed=property.enum.find(option=>String(option).toLowerCase()===String(result[name]).toLowerCase());
    if(typed!==undefined)result[name]=typed;
   }
  }
  for(const [name,property] of Object.entries(row.schema.properties??{})){
   const resolved=resolveSetting({options:property.enum?.map(value=>({value})),defaultValue:property.default,channelOptions:property['x-channel-options'],resolutionOptions:property['x-resolution-options'],showChannels:property['x-show-channels'],showResolutions:property['x-show-resolutions'],apiOnly:property['x-api-only']},result);
   if(!resolved){
    if(values[name]===undefined&&row.references[name]===undefined)delete result[name];
   }else if(values[name]===undefined&&row.references[name]===undefined&&resolved.options&&!resolved.options.some(option=>String(option.value)===String(result[name]))){
    // Conditional defaults follow the same resolver as Web preferences. Never
    // correct an explicit value silently; validation reports that to the caller.
    const candidate=resolved.defaultValue;
    if(candidate!==undefined)result[name]=property.enum?.find(value=>String(value)===String(candidate))??candidate;
   }
  }
  return result;
 }
 async function referenceValue(value,host,signal,trace){
  if(Array.isArray(value))return Promise.all(value.map(item=>referenceValue(item,host,signal,trace)));
  if(typeof value!=='string'||(!path.isAbsolute(value)&&!value.startsWith('file:')))return value;
  if(!host.workspaceDirectory)throw Error('Select a workspace before uploading local references');
  const root=await realpath(host.workspaceDirectory);
  const filename=await realpath(value.startsWith('file:')?new URL(value):value);
  const relative=path.relative(root,filename);
  if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw Error('Copy the reference into the current workspace before generating');
  const info=await stat(filename);
  if(!info.isFile()||info.size<1||info.size>200*1024*1024)throw Error('Choose a media file smaller than 200 MB');
  const ticket=await capability('get3w.media.upload',{filename:path.basename(filename),size_bytes:info.size},host,signal,`upload-${trace}-${randomUUID()}`);
  const target=new URL(ticket.upload?.url);
  if(target.protocol!=='https:'||ticket.upload.method!=='PUT'||typeof ticket.download_url!=='string')throw Error('The reference upload destination could not be verified');
  await verify();signal.throwIfAborted();
  const response=await fetch(target,{method:'PUT',headers:ticket.upload.headers,body:await readFile(filename),signal,redirect:'error'});
  if(!response.ok)throw Error('Reference upload failed. Retry preparing this task');
  return ticket.download_url;
 }
 async function prepare(input,host,signal){
  if(!record(input)||typeof input.task_type!=='string'||!input.task_type)return failure('invalid_input','Choose the media task type');
  if(input.references!==undefined&&!record(input.references))return failure('invalid_input','References must use the model reference parameter names');
  const cat=await catalog(),policy=host.generationPolicy??{models:{},outputs:{}};
  const taskTypes=[...new Set(cat.models.map(model=>model.type))];
  if(!taskTypes.includes(input.task_type))return failure('invalid_task_type','Choose one of the supported native media task types',{supported_task_types:taskTypes});
  let candidates=cat.models.filter(model=>model.type===input.task_type);
  const explicit=input.model??policy.models?.[input.task_type]?.slug;
  const selected=policy.selectedModels??[];
  if(input.model||policy.models?.[input.task_type]?.source==='explicit')candidates=candidates.filter(model=>model.model_id===explicit||family(model)===explicit);
  else if(selected.length)candidates=candidates.filter(model=>selected.some(item=>item.slug===family(model)));
  else{
   const tasks=cat.desktop_defaults?.tasks??{};
   const preferred=explicit??(tasks[category(input.task_type)]??tasks[input.task_type])?.slug;
   const match=candidates.filter(model=>model.model_id===preferred||family(model)===preferred);
   if(match.length)candidates=match;
  }
  const model=candidates.sort((a,b)=>(a.base_price??Infinity)-(b.base_price??Infinity))[0];
  if(!model)return failure('model_unavailable','Select an available model supporting this task');
  const trace=randomUUID();
  if(Number.isFinite(host.receivedAt))onTiming({traceId:trace,stage:'model_wait_before_prepare',durationMs:Math.max(0,now()-host.receivedAt)});
  const schemaKey=`${cat.catalog_version}:${model.model_id}`;
  let schemaResult=schemas.get(schemaKey);
  if(!schemaResult){
   const published=model.api_schema?.api_schemas?.[0]?.request_schema;
   schemaResult=record(published)?{input_schema:published}:await measure(trace,'schema',()=>capability('get3w.models.schema',{slug:model.model_id},host,signal,`schema-${trace}`));
   if(schemas.size>=100)schemas.delete(schemas.keys().next().value);
   schemas.set(schemaKey,schemaResult);
  }
  const schema=referenceRequirements(model.type,schemaResult?.input_schema??{});
  if(!record(schema)||!record(schema.properties))return failure('invalid_schema','The model input definition is unavailable');
  const sourceReferences=input.references??{};
  if(Object.keys(sourceReferences).some(name=>!Object.hasOwn(schema.properties,name)))return failure('invalid_references','Use reference fields supported by this model');
  const prior=await serial(async()=>{await load();return records.find(item=>hash(item.owner)===hash(identity(host))&&item.model===model.model_id&&hash(item.sourceReferences??item.references)===hash(sourceReferences));});
  if(prior)return {status:missingInputs(prior.schema,merged(prior,{})).length>0?'needs_input':'ready',preparation_id:prior.id,model:{id:prior.model,name:prior.name},parameters:conciseSchema(inputSchema(prior.schema,merged(prior,{}))),defaults:prior.defaults,missing_inputs:missingInputs(prior.schema,merged(prior,{})),trace_id:prior.traceId};
  const references=Object.fromEntries(await Promise.all(Object.entries(sourceReferences).map(async([name,value])=>[name,await measure(trace,'reference_upload',()=>referenceValue(value,host,signal,trace))])));
  if(Object.keys(references).some(name=>!Object.hasOwn(schema.properties,name)))return failure('invalid_references','Use reference fields supported by this model');
  const row={id:"",traceId:trace,owner:identity(host),receivedAt:host.receivedAt,model:model.model_id,name:model.name,taskType:model.type,catalogVersion:cat.catalog_version,schema,defaults:defaults(model,policy,cat),references,sourceReferences,createdAt:now()};
  const initial=merged(row,{});
  const missing=missingInputs(schema,initial);
  await serial(async()=>{await load();const existing=records.find(item=>hash(item.owner)===hash(row.owner)&&item.model===row.model&&hash(item.references)===hash(row.references));
    if(existing){Object.assign(row,existing);return;}
    // This is a scoped lookup handle, not a credential. Short decimal handles
    // avoid model transcription errors; ownership is still checked on every call.
    let sequence=records.length+1;
    while(records.some(item=>item.id===`media_${sequence}`))sequence++;
    row.id=`media_${sequence}`;
    records.push(row);await save();});
  return {status:missing.length?'needs_input':'ready',preparation_id:row.id,model:{id:row.model,name:row.name},parameters:conciseSchema(inputSchema(schema,initial)),defaults:row.defaults,missing_inputs:missing,trace_id:trace};
 }
 async function generate(input,host,signal){
  if(!record(input)||typeof input.preparation_id!=='string'||!record(input.inputs))return failure('invalid_input','Provide a preparation and its media inputs');
  // Local references must be uploaded in prepare, before the input is frozen.
  // Never send a filesystem path to a model API as if it were a public URL.
  const localFields=Object.entries(input.inputs).filter(([name,value])=>{
   if(!/(image|video|audio|reference|file|url)/i.test(name))return false;
   const local=item=>typeof item==='string'&&(path.isAbsolute(item)||item.startsWith('file:'));
   return Array.isArray(value)?value.some(local):local(value);
  }).map(([name])=>name);
  if(localFields.length)return failure('references_require_preparation','Prepare local media references before generating',{missing_inputs:localFields});
  const row=await serial(async()=>{await load();return records.find(item=>item.id===input.preparation_id&&hash(item.owner)===hash(identity(host)));});
  if(!row)return failure('preparation_unavailable','Prepare this media task in the current conversation');
  let inputs=merged(row,input.inputs),fingerprint=hash(inputs);
  if(row.inputHash&&row.inputHash!==fingerprint)return failure('input_conflict','These inputs differ from the existing task. Prepare a new task to change them');
  if(active.has(row.id)){const running=active.get(row.id);return running.fingerprint===fingerprint?running.pending:failure('input_conflict','A different input is already being submitted for this preparation');}
  const execute=async()=>{
   onTiming({traceId:row.traceId,stage:'model_wait_after_prepare',durationMs:Math.max(0,now()-row.createdAt)});
   const task=await findTask?.(host,`native-${row.id}`);
   if(task)return {status:task.status,task_id:task.key,request_id:task.requestId,trace_id:row.traceId};
   if(row.denied)return failure('approval_denied','This media request was declined. Prepare a new request to continue');
   const cat=await catalog();
   if(!cat.models.some(model=>model.model_id===row.model))return failure('model_unavailable','The selected model is no longer available');
   if(cat.catalog_version!==row.catalogVersion){
    if(row.refreshed)return failure('catalog_changed','Model settings changed again. Prepare a new request');
    const definition=await capability('get3w.models.schema',{slug:row.model},host,signal,`refresh-${row.id}`);
    if(!record(definition?.input_schema)||!record(definition.input_schema.properties))return failure('invalid_schema','The model input definition is unavailable');
    row.schema=referenceRequirements(row.taskType,definition.input_schema);row.catalogVersion=cat.catalog_version;row.refreshed=true;
    // A frozen request can only be revalidated, never silently rewritten.
    if(!row.inputHash){row.defaults=defaults(cat.models.find(model=>model.model_id===row.model),host.generationPolicy??{},cat);inputs=merged(row,input.inputs);fingerprint=hash(inputs);}
    await serial(async()=>{await save();});
   }
   // The host journal is committed after consent and before network dispatch.
   // No journal row means a previous process stopped before dispatch, even if
   // its preparation intent was saved. A journal read failure must propagate.
   if(row.submissionAttempted&&!findTask)return failure('submission_unconfirmed','The original submission is being recovered. Do not submit again');
   await verify();signal.throwIfAborted();
   const validationStart=now();
   const validate=ajv.compile(inputSchema(row.schema,inputs));
   const valid=validate(inputs);onTiming({traceId:row.traceId,stage:'validation',durationMs:now()-validationStart});
   if(!valid)return failure('invalid_inputs','Complete or correct the media inputs',{issues:validate.errors.map(error=>({field:error.instancePath,keyword:error.keyword,...(error.params??{})}))});
   await serial(async()=>{row.inputHash=fingerprint;row.inputs=inputs;await save();});
   const key=`native-${row.id}`;
   // Always restore quote evidence into this connection's guard on restart.
   const submitHost={...host,nativeMedia:{preparationId:row.id,traceId:row.traceId,catalogVersion:row.catalogVersion,inputHash:row.inputHash,model:row.model}};
   let result;
   for(let attempt=0;attempt<2;attempt++){
    const quote=await measure(row.traceId,'quote',()=>capability('get3w.quote',{slug:row.model,inputs},submitHost,signal,`quote-${row.id}-${attempt}`));
    const args={slug:row.model,inputs,quote_id:quote.quote_id,idempotency_key:key,session_id:host.sessionId};
    await verify();signal.throwIfAborted();
    await serial(async()=>{row.submissionAttempted=true;await save();});
    try{result=await measure(row.traceId,'approval_and_submit',()=>capability('get3w.submit',args,submitHost,signal,key));break;}
    catch(error){
     if(error.notSubmitted){await serial(async()=>{row.submissionAttempted=false;if(error.code==='stopped_waiting')row.denied=true;await save();});}
     if(attempt===0&&error.notSubmitted&&(error.code==='quote_expired'||/quote_expired/.test(error.message)))continue;
     if(attempt===0&&error.notSubmitted&&error.code==='quote_stale'&&!row.refreshed){
      const fresh=await auth.taskCatalog({userId,refresh:true});
      const current=fresh.models.find(model=>model.model_id===row.model);
      if(!current)return failure('model_unavailable','The selected model is no longer available');
      const definition=current.api_schema?.api_schemas?.[0]?.request_schema??(await capability('get3w.models.schema',{slug:row.model},host,signal,`refresh-${row.id}`))?.input_schema;
      if(!record(definition)||!record(definition.properties))return failure('invalid_schema','The model input definition is unavailable');
      row.schema=referenceRequirements(row.taskType,definition);row.catalogVersion=fresh.catalog_version;row.refreshed=true;
      await serial(async()=>{await save();});
      if(!ajv.compile(inputSchema(row.schema,inputs))(inputs))return failure('catalog_changed','Model parameters changed. Prepare a new request');
      submitHost.nativeMedia.catalogVersion=row.catalogVersion;
      continue;
     }
     throw error;
    }
   }
   const stored=await findTask?.(host,key);
   if(Number.isFinite(row.receivedAt))onTiming({traceId:row.traceId,stage:'message_to_submitted',startedAt:row.receivedAt,endedAt:now(),durationMs:now()-row.receivedAt});
   return {status:result.status??'submitted',task_id:stored?.key??key,request_id:result.request_id,trace_id:row.traceId};
  };
  const pending=execute().catch(async error=>{if(/denied|declined/i.test(error.message)){await serial(async()=>{row.denied=true;await save();});}return failure(error.code??'media_unavailable',error.message,{trace_id:row.traceId});}).finally(()=>active.delete(row.id));
  active.set(row.id,{fingerprint,pending});return pending;
 }
 return {async call(name,input,host,signal){
  try{await verify();if(!host.userMessageId||!host.workspaceId)return failure('context_unavailable','The original conversation message could not be verified');signal.throwIfAborted();if(!['media_prepare','media_generate'].includes(name))return failure('unknown_tool','The native media tool is unavailable');if(name==='media_generate')return await generate(input,host,signal);
   const key=hash([identity(host),input]);
   if(preparing.has(key))return await preparing.get(key);
   const started=now();
   const pending=prepare(input,host,signal).then(result=>{if(result.trace_id)onTiming({traceId:result.trace_id,stage:'prepare',durationMs:now()-started});return result;}).finally(()=>preparing.delete(key));preparing.set(key,pending);return await pending;}
  catch(error){return failure('media_unavailable',error.message);}
 }};
}
