import type { SelectedGenerationModel } from "../../../cloud/generation-policy";
export function modelMentionValue(value:SelectedGenerationModel){return `model:${encodeURIComponent(JSON.stringify({slug:value.slug,...(value.runType?{runType:value.runType}:{}),name:value.name}))}`;}
export function parseModelMention(value:string):SelectedGenerationModel|null {
  if(!value.startsWith("model:"))return null;
  try{const row:unknown=JSON.parse(decodeURIComponent(value.slice(6)));if(!row||typeof row!=="object")return null;
    if(!("slug" in row)||typeof row.slug!=="string"||!row.slug||row.slug.length>500||!("name" in row)||typeof row.name!=="string")return null;
    return {slug:row.slug,...("runType" in row&&typeof row.runType==="string"?{runType:row.runType}:{}),name:row.name};
  }catch{return null;}
}
