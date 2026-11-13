import { beforeAll, afterAll, beforeEach, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { resolveGenerationPolicy } from '../src/react-app/domains/cloud/generation-policy';
import { writeModelPreference, writeOutputPreference } from '../src/react-app/domains/cloud/model-preferences';
import { modelMentionValue } from '../src/react-app/domains/session/surface/composer/model-token';
import { encodeComposerMentionValue } from '../src/react-app/domains/session/surface/composer/mention-encoding';
import { parseComposerPillToken, composerPillToken, readComposerPill } from '../src/react-app/domains/session/surface/composer/composer-pills';
import type {TaskCatalogSnapshot} from '../src/react-app/domains/cloud/get3w-account';
beforeAll(()=>GlobalRegistrator.register({url:'http://localhost'}));
afterAll(()=>GlobalRegistrator.unregister());
beforeEach(()=>window.localStorage.clear());
const model=(id:string)=>({model_id:id,name:id,type:'text-to-image',provider_id:'test',description:'',run_type_title:'Image',category:'image',catalog_version:'v1',base_price:0,currency:'USD',billing_unit:null,output_schema:null,api_schema:{api_schemas:[{api_path:'/run',request_schema:{properties:{resolution:{enum:['1K','2K']},aspect_ratio:{enum:['1:1','16:9']}}}}]}});
const catalog:TaskCatalogSnapshot={catalog_version:'v1',expiresAt:Date.now()+60000,offline:false,models:['explicit','user','system'].map(model),desktop_defaults:{schema_version:1,version:'v1',tasks:{'text-to-image':{slug:'system',fields:{resolution:'1K',aspect_ratio:'1:1'}}}}};
test('explicit > user > system > auto, and legacy session overrides are ignored',()=>{
 const resolve=(selected:{slug:string;runType:string;name:string}[]=[])=>resolveGenerationPolicy('a','s',catalog,selected);
 expect(resolve().models['text-to-image']?.slug).toBe('system');
 writeModelPreference('a',{runType:'text-to-image',slug:'user',scope:'global',updatedAt:1});
 expect(resolve().models['text-to-image']?.slug).toBe('user');
 expect(resolve([{slug:'explicit',runType:'text-to-image',name:'Explicit'}]).models['text-to-image']?.slug).toBe('explicit');
 writeModelPreference('a',{runType:'text-to-image',slug:null,scope:'session',updatedAt:2},'s');
 expect(resolve().models['text-to-image']?.slug).toBe('user');
 expect(resolveGenerationPolicy('a','other',catalog,[]).models['text-to-image']?.slug).toBe('user');
 expect(resolveGenerationPolicy('b','s',{...catalog,desktop_defaults:undefined},[]).models).toEqual({});
});
test('invalid explicit selection blocks; invalid preferences fall through without mutation',()=>{
 expect(()=>resolveGenerationPolicy('a','s',catalog,[{slug:'gone',runType:'text-to-image',name:'Gone'}])).toThrow('重新选择');
 expect(resolveGenerationPolicy('a','s',catalog,[{slug:'explicit',runType:'text-to-video',name:'Legacy'}]).models['text-to-image']?.slug).toBe('explicit');
 writeModelPreference('a',{runType:'text-to-image',slug:'gone',scope:'global',updatedAt:1});
 expect(resolveGenerationPolicy('a','s',catalog,[]).models['text-to-image']?.slug).toBe('system');
 expect(resolveGenerationPolicy('a','s',{...catalog,models:[]},[]).models).toEqual({});
});
test('output settings merge field by field; legacy session settings are ignored',()=>{
 writeOutputPreference('a',{runType:'text-to-image',fields:{aspect_ratio:'16:9',resolution:'auto'},scope:'global',updatedAt:1});
 expect(resolveGenerationPolicy('a','s',catalog,[]).outputs['text-to-image']).toEqual({aspect_ratio:'16:9',resolution:'1K'});
 writeOutputPreference('a',{runType:'text-to-image',fields:{aspect_ratio:'auto'},scope:'session',updatedAt:2},'s');
 expect(resolveGenerationPolicy('a','s',catalog,[]).outputs['text-to-image']?.aspect_ratio).toBe('16:9');
});
test('model tokens preserve full identity through encoding and message metadata',()=>{
 const selected={slug:'provider/full-model/text-to-image',runType:'text-to-image',name:'模型 With Spaces'};
 const token='@'+encodeComposerMentionValue(modelMentionValue(selected));
 const pill=parseComposerPillToken(token);
 expect(pill).toEqual({kind:'model',...selected});
 expect(pill&&composerPillToken(pill)).toBe(token);
 expect(readComposerPill(pill)).toEqual(pill);
});
test('model draft produces native parts and transcript chips after restoration',async()=>{
 const {draftToParts}=await import('../src/react-app/domains/session/sync/draft-parts');
 const {splitComposerPillText}=await import('../src/react-app/domains/session/surface/composer/composer-pills');
 const model={slug:'provider/image/text-to-image',runType:'text-to-image',name:'Image Model'};
 const token='@'+encodeComposerMentionValue(modelMentionValue(model));
 const parts=await draftToParts({mode:'prompt',text:`${token} draw a cat`,parts:[],attachments:[]},'/tmp','ses_isolated',null);
 expect(parts.some(part=>part.type==='text'&&part.metadata&&Reflect.get(part.metadata,'openworkComposerPill')?.kind==='model')).toBe(true);
 expect(splitComposerPillText(token)).toEqual([{kind:'model',...model}]);
});

test('model choices deduplicate task variants and context can select any supported type',async()=>{
 const {generationModelChoices}=await import('../src/react-app/domains/cloud/generation-models');
 const variants=['text-to-video','first-to-video','reference-to-video'].map(type=>({...model('bytedance/seedance-2.5/'+type),type,name:'Seedance 2.5',provider_id:'bytedance'}));
 const choices=generationModelChoices(variants);
 expect(choices).toEqual([{slug:'bytedance/seedance-2.5',name:'Seedance 2.5',providerId:'bytedance'}]);
 const policy=resolveGenerationPolicy('a','s',{...catalog,models:variants},choices);
 for(const variant of variants)expect(policy.models[variant.type]?.slug).toBe(variant.model_id);
 const token=modelMentionValue(choices[0]!);
 expect(parseComposerPillToken('@'+encodeComposerMentionValue(token))).toEqual({kind:'model',slug:'bytedance/seedance-2.5',name:'Seedance 2.5'});
});
test('category preferences resolve contextual variants and unsupported variants fall through',()=>{
 const variant=(family:string,type:string)=>({...model(`${family}/${type}`),type});
 const mixed={...catalog,models:[variant('demo/user','text-to-image'),variant('demo/user','image-to-image'),variant('demo/system','image-to-image'),variant('demo/system','text-to-video')],desktop_defaults:{schema_version:1,version:'c',tasks:{image:{slug:'demo/system',fields:{resolution:'2K'}}}}};
 writeModelPreference('a',{runType:'image',slug:'demo/user',scope:'global',updatedAt:1});
 const result=resolveGenerationPolicy('a','s',mixed,[]);
 expect(result.models['text-to-image']?.slug).toBe('demo/user/text-to-image');
 expect(result.models['image-to-image']?.slug).toBe('demo/user/image-to-image');
 expect(result.models['text-to-video']).toBeUndefined();
 writeModelPreference('a',{runType:'image',slug:null,scope:'session',updatedAt:2},'s');
 expect(resolveGenerationPolicy('a','s',mixed,[]).models['image-to-image']?.slug).toBe('demo/user/image-to-image');
 expect(resolveGenerationPolicy('a','s',mixed,[]).models['text-to-image']?.slug).toBe('demo/user/text-to-image');
});

test('legacy system and user duration preferences never reach generation policy',()=>{
 const legacyCatalog={...catalog,desktop_defaults:{schema_version:1,version:'legacy',tasks:{image:{slug:'system',fields:{duration:'10',resolution:'2K'}}}}};
 window.localStorage.setItem('get3w.personal.v1.outputs.a.global',JSON.stringify([{runType:'image',fields:{duration:'5',aspect_ratio:'16:9'},scope:'global',updatedAt:1}]));
 expect(resolveGenerationPolicy('a','s',legacyCatalog,[]).outputs['text-to-image']).toEqual({resolution:'2K',aspect_ratio:'16:9'});
});

test('execution drops incompatible legacy output values',()=>{
 writeOutputPreference('a',{runType:'image',fields:{resolution:'8K',aspect_ratio:'16:9',format:'psd'},scope:'global',updatedAt:1});
 expect(resolveGenerationPolicy('a','s',catalog,[]).outputs['text-to-image']).toEqual({aspect_ratio:'16:9'});
});
