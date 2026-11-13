import {beforeAll,afterAll,beforeEach,expect,test} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {effectivePreferences,modelPreferencesContext,outputSettingOptions,readModelPreferences,uniqueOutputValues,writeModelPreference,writeOutputPreference} from "../src/react-app/domains/cloud/model-preferences";
import type {TaskCatalogSnapshot} from "../src/react-app/domains/cloud/get3w-account";
beforeAll(()=>GlobalRegistrator.register({url:"http://localhost"}));
afterAll(()=>GlobalRegistrator.unregister());
beforeEach(()=>window.localStorage.clear());
const catalog:TaskCatalogSnapshot={catalog_version:"v1",expiresAt:Date.now()+60000,offline:false,models:[{
 model_id:"test/image",name:"Image",provider_id:"test",description:"",type:"text-to-image",run_type_title:"Image",category:"image",catalog_version:"v1",base_price:0.02,currency:"USD",billing_unit:"image",output_schema:null,
 api_schema:{api_schemas:[{api_path:"/run",request_schema:{properties:{aspect_ratio:{enum:["1:1","16:9"]},num_images:{enum:[1,2]},prompt:{enum:["must not become a setting"]}}}}]},
}]};
test("global preferences apply to all conversations and ignore legacy session overrides",()=>{
 writeModelPreference("a",{runType:"text-to-image",slug:"global",scope:"global",updatedAt:1});
 writeModelPreference("a",{runType:"text-to-image",slug:null,scope:"session",updatedAt:2},"s");
 expect(effectivePreferences("a","s").models[0]?.slug).toBe("global");
 expect(effectivePreferences("a","other").models[0]?.slug).toBe("global");
 expect(effectivePreferences("b","s").models).toEqual([]);

 expect(()=>writeModelPreference("a",{runType:"x",slug:null,scope:"session",updatedAt:1})).toThrow();
});
test("unavailable and unverified models fall back to Auto and valid catalog restores the preference",()=>{
 writeModelPreference("a",{runType:"text-to-image",slug:"test/image",scope:"global",updatedAt:1});
 expect(JSON.parse(modelPreferencesContext("a")).preferredModels[0]).toEqual({runType:"image",slug:null,unavailable:true});
 expect(JSON.parse(modelPreferencesContext("a","s",catalog)).preferredModels[0]).toEqual({runType:"image",slug:"test/image",unavailable:false});
 expect(JSON.parse(modelPreferencesContext("a","s",{...catalog,models:[]})).preferredModels[0].unavailable).toBe(true);
});
test("schema controls use only allowed enum fields and preserve numbers as display values",()=>{
 expect(outputSettingOptions(catalog,"text-to-image")).toEqual([{name:"aspect_ratio",values:["1:1","16:9"]},{name:"num_images",values:["1","2"]}]);
 expect(outputSettingOptions(catalog,"text-to-video")).toEqual([]);
});
test("bounded context remains valid JSON and ignores malformed persisted preferences",()=>{
 window.localStorage.setItem("get3w.m2.models.a.o.global",JSON.stringify([null,{runType:"x"}]));
 expect(readModelPreferences("a")).toEqual([]);
 for(let i=0;i<40;i++)writeOutputPreference("a",{runType:`run-${i}`,fields:{resolution:"x".repeat(500)},scope:"global",updatedAt:i});
 const context=modelPreferencesContext("a","s",catalog);
 expect(context.length).toBeLessThanOrEqual(8000);
 expect(JSON.parse(context).outputSettings.length).toBeGreaterThan(0);
});

test("legacy task rows collapse by category using latest timestamp without rewriting storage",()=>{
 const key="get3w.personal.v1.models.a.global";
 const rows=[{runType:"text-to-image",slug:"demo/first/text-to-image",scope:"global",updatedAt:1},{runType:"image-to-image",slug:"demo/latest/image-to-image",scope:"global",updatedAt:2}];
 window.localStorage.setItem(key,JSON.stringify(rows));
 expect(readModelPreferences("a")).toEqual([{...rows[1],runType:"image",slug:"demo/latest"}]);
 expect(window.localStorage.getItem(key)).toBe(JSON.stringify(rows));
});

test("duration is excluded from controls, stored preferences and generated context",()=>{
 const videoCatalog={...catalog,models:catalog.models.map(model=>({...model,type:"text-to-video",api_schema:{api_schemas:[{api_path:"/run",request_schema:{properties:{duration:{enum:[5,10]},resolution:{enum:["720p","1080p"]}}}}]}}))};
 expect(outputSettingOptions(videoCatalog,"video")).toEqual([{name:"resolution",values:["720p","1080p"]}]);
 for(const scope of ["global","session"] as const){
   const suffix=scope==="session"?"session:s":"global";
   const storageKey=`get3w.personal.v1.outputs.a.${suffix}`;
   window.localStorage.setItem(storageKey,JSON.stringify([{runType:"text-to-video",fields:{duration:"10",resolution:"720p"},scope,updatedAt:1}]));
   expect(effectivePreferences("a","s").outputs[0]?.fields).toEqual({resolution:scope==="global"?"720p":"1080p"});
   expect(JSON.parse(modelPreferencesContext("a","s")).outputSettings[0].fields).toEqual({resolution:scope==="global"?"720p":"1080p"});
   writeOutputPreference("a",{runType:"video",fields:{duration:"5",resolution:"1080p"},scope,updatedAt:2},scope==="session"?"s":undefined);
   expect(JSON.parse(window.localStorage.getItem(storageKey)??"[]")[0].fields).toEqual({resolution:"1080p"});
 }
});

test("output options deduplicate case variants without changing distinct values",()=>{
 expect(uniqueOutputValues(["1k","1K","2K","2k","4k","4K","0.5k","1.5K"])).toEqual(["0.5k","1.5K","1K","2K","4K"]);
});

test("Auto outputs use only fields and values supported by every candidate",()=>{
 const variant=(id:string,properties:Record<string,{enum:string[]}>)=>({...catalog.models[0]!,model_id:id,api_schema:{api_schemas:[{api_path:"/run",request_schema:{properties}}]}});
 const mixed={...catalog,models:[variant("first",{resolution:{enum:["1K","2K"]},format:{enum:["png"]}}),variant("second",{resolution:{enum:["1k","4K"]}})]};
 expect(outputSettingOptions(mixed,"image")).toEqual([{name:"resolution",values:["1K"]}]);
 expect(outputSettingOptions(mixed,"image","first")).toEqual([{name:"resolution",values:["1K","2K"]},{name:"format",values:["png"]}]);
 expect(outputSettingOptions({...mixed,models:[...mixed.models,{...mixed.models[0]!,model_id:"unknown",api_schema:{api_schemas:[]}}]},"image")).toEqual([]);
});

test("channel preferences use Web options and visibility",()=>{
 const channelCatalog={...catalog,models:[{...catalog.models[0]!,api_schema:{api_schemas:[{api_path:"/run",request_schema:{properties:{channel:{enum:["economy","official"],default:"economy","x-option-labels":{economy:"经济",official:"官方"}},resolution:{enum:["1K"],"x-channel-options":{official:[{value:"1K"},{value:"2K"},{value:"4K"}]}},quality:{enum:["low","high"],"x-show-channels":["official"]}}}}]}}]};
 expect(outputSettingOptions(channelCatalog,"image","test/image",{channel:"official"}).find(field=>field.name==="resolution")?.values).toEqual(["1K","2K","4K"]);
 expect(outputSettingOptions(channelCatalog,"image","test/image").some(field=>field.name==="quality")).toBe(false);
});
