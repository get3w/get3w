import { generationCategory, generationModelId } from "./generation-models";
import { z } from "zod";
import type { TaskCatalogSnapshot } from "./get3w-account";

import { outputFieldNames, outputSettingsForSchemas } from "@/lib/model-settings";
export { uniqueOutputValues } from "@/lib/model-settings";
const outputFields = new Set(outputFieldNames);
export function savedOutputFields(fields:Record<string,string>):Record<string,string>{
  return Object.fromEntries(Object.entries(fields).filter(([name])=>outputFields.has(name)));
}

const scopeSchema = z.enum(["session", "global"]);
const modelSchema = z.object({runType:z.string().min(1).max(150),slug:z.string().min(1).max(500).nullable(),scope:scopeSchema,updatedAt:z.number().finite(),catalogVersion:z.string().optional()});
const outputSchema = z.object({runType:z.string().min(1).max(150),fields:z.record(z.string().max(150),z.string().max(500)),scope:scopeSchema,updatedAt:z.number().finite()});
export type ModelPreference = z.infer<typeof modelSchema>;
export type OutputPreference = z.infer<typeof outputSchema>;
export type PreferenceScope = ModelPreference["scope"];

function key(userId: string, kind: "models" | "outputs", sessionId?: string) {
  return `get3w.personal.v1.${kind}.${encodeURIComponent(userId)}.${sessionId ? `session:${sessionId}` : "global"}`;
}
function read<T>(storageKey:string, schema:z.ZodType<T>):T[] {
  try {
    const parsed:unknown=JSON.parse(window.localStorage.getItem(storageKey)??"[]");
    if(!Array.isArray(parsed))return [];
    return parsed.flatMap(value=>{const row=schema.safeParse(value);return row.success?[row.data]:[];});
  }catch{return [];}
}
function legacyType(slug:string) { const suffix=slug.split("/").at(-1)??"";return generationCategory(suffix)!==suffix||suffix==="digital-human"?suffix:"__none"; }
function normalize<T extends {runType:string;updatedAt:number}>(rows:T[]):T[] {
  return [...new Map([...rows].sort((a,b)=>a.updatedAt-b.updatedAt).map(row=>[generationCategory(row.runType),{...row,runType:generationCategory(row.runType)}])).values()];
}
export function readModelPreferences(userId:string,sessionId?:string):ModelPreference[]{return normalize(read(key(userId,"models",sessionId),modelSchema)).map(row=>({...row,slug:row.slug?generationModelId({model_id:row.slug,type:legacyType(row.slug)}):null}));}
export function readOutputPreferences(userId:string,sessionId?:string):OutputPreference[]{return normalize(read(key(userId,"outputs",sessionId),outputSchema)).map(row=>({...row,fields:savedOutputFields(row.fields)}));}
function storageScope(scope:PreferenceScope,sessionId?:string){
  if(scope==="session"&&!sessionId)throw Error("Select a conversation before saving session preferences.");
  return scope==="session"?sessionId:undefined;
}
export function writeModelPreference(userId:string,preference:ModelPreference,sessionId?:string):void{
  const value=modelSchema.parse({...preference,runType:generationCategory(preference.runType)}),session=storageScope(value.scope,sessionId);
  const rows=readModelPreferences(userId,session).filter(row=>row.runType!==value.runType);
  window.localStorage.setItem(key(userId,"models",session),JSON.stringify([...rows,value]));
}
export function writeOutputPreference(userId:string,preference:OutputPreference,sessionId?:string):void{
  const value=outputSchema.parse({...preference,fields:savedOutputFields(preference.fields),runType:generationCategory(preference.runType)}),session=storageScope(value.scope,sessionId);
  const rows=readOutputPreferences(userId,session).filter(row=>row.runType!==value.runType);
  window.localStorage.setItem(key(userId,"outputs",session),JSON.stringify([...rows,value]));
}
/** Global preferences apply to every conversation; legacy session rows are ignored. */
export function effectivePreferences(userId:string,_sessionId?:string){
  return {models:readModelPreferences(userId),outputs:readOutputPreferences(userId)};
}
/** Keep complete JSON entries within the limit; never truncate a JSON string. */
export function modelPreferencesContext(userId:string,sessionId?:string,catalog?:TaskCatalogSnapshot):string{
  const preferences=effectivePreferences(userId,sessionId);
  const preferredModels:{runType:string;slug:string|null;unavailable:boolean}[]=[];
  const outputSettings:OutputPreference[]=[];
  const serialize=()=>JSON.stringify({preferredModels,outputSettings});
  for(const row of preferences.models){
    if(!row.slug)continue;
    const unavailable=!catalog||catalog.offline||!catalog.models.some(model=>generationModelId(model)===row.slug&&generationCategory(model.type)===row.runType);
    preferredModels.push({runType:row.runType,slug:unavailable?null:row.slug,unavailable});
    if(serialize().length>8000)preferredModels.pop();
  }
  for(const row of preferences.outputs){
    const fields=Object.fromEntries(Object.entries(row.fields).filter(([,value])=>value!=="auto"));
    if(!Object.keys(fields).length)continue;
    outputSettings.push({...row,fields});if(serialize().length>8000)outputSettings.pop();
  }
  if(!preferredModels.length&&!outputSettings.length)return "";
  return serialize();
}

/** Model lookup stays client-specific; all field rules are shared with Web. */
export function outputSettingOptions(catalog:TaskCatalogSnapshot,runType:string,slug?:string|null,selection:Record<string,string>={}){
  const candidates=catalog.models.filter(model=>generationCategory(model.type)===generationCategory(runType)&&(!slug||generationModelId(model)===slug||model.model_id===slug));
  const schemas=candidates.flatMap(model=>model.api_schema.api_schemas.length?model.api_schema.api_schemas.map(api=>api.request_schema):[{}]);
  return outputSettingsForSchemas(schemas,selection);
}
