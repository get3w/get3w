import { test } from 'node:test';
import assert from 'node:assert/strict';
import {validateGenerationCall} from './generation-policy.mjs';
const models=['explicit','user','system'].map(model_id=>({model_id,type:'text-to-image',api_schema:{api_schemas:[{request_schema:{properties:{num_images:{enum:[1,2]},generate_audio:{enum:[true,false]},resolution:{enum:['1K','2K']}}}}]}}));
const catalog={models,desktop_defaults:{tasks:{'text-to-image':{slug:'system'}}}};
const context=(slug,inputs={},type='get3w.quote')=>({type,call:{arguments:{slug,inputs}}});
test('guard rejects model conflicts before quoting and preserves explicit selections',()=>{
 for(const source of ['explicit','user','system']){
  const policy={models:{'text-to-image':{slug:source,source}},outputs:{}};
  assert.doesNotThrow(()=>validateGenerationCall(context(source),policy,catalog));
  assert.throws(()=>validateGenerationCall(context(source==='system'?'user':'system'),policy,catalog),/model_preference_conflict/);
 }
 assert.throws(()=>validateGenerationCall(context('system'),{models:{'text-to-image':{slug:'gone',source:'explicit'}}},catalog),/Explicitly selected/);
 assert.doesNotThrow(()=>validateGenerationCall(context('system'),{models:{'text-to-image':{slug:'gone',source:'user'}}},catalog));
});
test('missing output defaults require a new quote using typed enum values',()=>{
 const inputs={prompt:'test'};
 const policy={models:{},outputs:{'text-to-image':{num_images:'2',generate_audio:'true',unknown:'secret'}}};
 assert.throws(()=>validateGenerationCall(context('system',inputs),policy,catalog),/"num_images":2,"generate_audio":true/);
 assert.deepEqual(inputs,{prompt:'test'});
 assert.doesNotThrow(()=>validateGenerationCall(context('system',{num_images:1,generate_audio:false}),policy,catalog));
 assert.doesNotThrow(()=>validateGenerationCall(context('system',{},'get3w.submit'),policy,catalog));
});
test('explicit unavailable selections and offline catalogs cannot authorize generation',()=>{
 assert.throws(()=>validateGenerationCall(context('system'),{models:{'text-to-video':{slug:'gone',source:'explicit'}}},catalog),/Explicitly selected/);
 assert.throws(()=>validateGenerationCall(context('system'),{models:{},outputs:{}},{...catalog,offline:true}),/Reconnect/);
});
test('system defaults are enforced for messages without a custom preference policy',()=>{
 assert.throws(()=>validateGenerationCall(context('user'),undefined,catalog),/model_preference_conflict/);
 assert.doesNotThrow(()=>validateGenerationCall(context('system'),undefined,catalog));
});

test('model family selection allows contextual task variants and rejects another model',()=>{
 const types=['text-to-video','first-to-video','reference-to-video'];
 const variants=types.map(type=>({model_id:`bytedance/seedance-2.5/${type}`,type,api_schema:{api_schemas:[]}}));
 const policy={selectedModels:[{slug:'bytedance/seedance-2.5',name:'Seedance 2.5'}],models:{},outputs:{}};
 for(const variant of variants)assert.doesNotThrow(()=>validateGenerationCall(context(variant.model_id,{},'get3w.models.schema'),policy,{models:variants}));
 assert.throws(()=>validateGenerationCall(context('system'),policy,{models:[...variants,...models]}),/model_preference_conflict/);
 assert.throws(()=>validateGenerationCall(context('system'),policy,{models}),/unavailable/);
});
test('category system defaults select the contextual variant and enforce its output defaults',()=>{
 const variants=['text-to-image','image-to-image'].map(type=>({...models[0],type,model_id:`demo/shared/${type}`}));
 const grouped={models:variants,desktop_defaults:{tasks:{image:{slug:'demo/shared',fields:{num_images:'2'}}}}};
 for(const variant of variants){
  assert.throws(()=>validateGenerationCall(context(variant.model_id),null,grouped),/output_preferences_required/);
  assert.doesNotThrow(()=>validateGenerationCall(context(variant.model_id,{num_images:2}),null,grouped));
 }
});
