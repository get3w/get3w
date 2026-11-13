import { generationModelId, generationCategory, categoryDefault } from "./generation-models";
import { effectivePreferences, savedOutputFields, outputSettingOptions } from "./model-preferences";
import type { TaskCatalogSnapshot } from "./get3w-account";
export type SelectedGenerationModel = {slug:string;runType?:string;name:string};
export type GenerationPolicy = {selectedModels?:{slug:string;name:string}[];models:Record<string,{slug:string;source:"explicit"|"user"|"system"}>;outputs:Record<string,Record<string,string>>};
export function resolveGenerationPolicy(userId:string,sessionId:string,catalog:TaskCatalogSnapshot,selected:SelectedGenerationModel[]):GenerationPolicy {
  const user=effectivePreferences(userId,sessionId);
  const result:GenerationPolicy={models:{},outputs:{}};
  const selections=selected.map(row=>({slug:generationModelId(catalog.models.find(model=>model.model_id===row.slug)??{model_id:row.slug,type:row.runType??""}),name:row.name}));
  for(const row of selections)if(!catalog.models.some(model=>generationModelId(model)===row.slug))throw Error(`请重新选择生成模型：${row.name} 不可用。`);
  if(selections.length)result.selectedModels=selections;
  const types=new Set(catalog.models.map(model=>model.type));
  for(const type of types){
    const explicit=catalog.models.find(model=>model.type===type&&selections.some(row=>generationModelId(model)===row.slug));
    const preferred=user.models.find(r=>r.runType===generationCategory(type))?.slug;
    const system=categoryDefault(catalog.desktop_defaults?.tasks,type);
    const available=(slug:string|null|undefined)=>catalog.models.find(m=>m.type===type&&(m.model_id===slug||generationModelId(m)===slug));
    if(explicit)result.models[type]={slug:explicit.model_id,source:"explicit"};
    else if(available(preferred)&&preferred)result.models[type]={slug:available(preferred)!.model_id,source:"user"};
    else if(available(system?.slug)&&system?.slug)result.models[type]={slug:available(system.slug)!.model_id,source:"system"};
    const fields=savedOutputFields(system?.fields??{});
    for(const [key,value] of Object.entries(user.outputs.find(r=>r.runType===generationCategory(type))?.fields??{}))if(value!=="auto")fields[key]=value;
    const modelId=result.models[type]?.slug;
    const candidates={...catalog,models:catalog.models.filter(model=>model.type===type&&(!modelId||model.model_id===modelId))};
    const supported=outputSettingOptions(candidates,type,modelId,fields);
    const channel=supported.find(field=>field.name==="channel");
    if(channel&&(!fields.channel||fields.channel==="auto"))fields.channel=channel.defaultValue??channel.values[0]??"";
    for(const [name,value] of Object.entries(fields)){
      const canonical=supported.find(field=>field.name===name)?.values.find(option=>option.toLowerCase()===value.toLowerCase());
      if(canonical!==undefined)fields[name]=canonical;else delete fields[name];
    }
    if(Object.keys(fields).length)result.outputs[type]=fields;
  }
  return result;
}
