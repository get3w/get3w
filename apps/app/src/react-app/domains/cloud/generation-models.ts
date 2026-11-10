import type { TaskCatalogModel } from './get3w-account';
/** Catalog task variants share a provider/model identity. Never group by display name. */
export function generationModelId(model: Pick<TaskCatalogModel,'model_id'|'type'>) {
  const suffix=`/${model.type}`;
  return model.model_id.endsWith(suffix)?model.model_id.slice(0,-suffix.length):model.model_id;
}
export function generationModelChoices(models: TaskCatalogModel[]) {
  return [...new Map(models.filter(model=>!/(decision|chat|llm)/i.test(`${model.category} ${model.type}`)).map(model=>{
    const slug=generationModelId(model);
    return [slug,{slug,name:model.name,providerId:model.provider_id}];
  })).values()];
}

/** Settings are media categories; execution still uses the context's exact task type. */
export const generationCategories = ["image", "video", "panorama", "digital-human", "3d", "speech", "music"];
export function generationCategory(type: string): string {
  if (type.endsWith("-to-panorama")) return "panorama";
  if (type.endsWith("-to-image")) return "image";
  if (type.endsWith("-to-video")) return "video";
  if (type.endsWith("-to-3d")) return "3d";
  if (type === "text-to-speech") return "speech";
  if (type === "text-to-music") return "music";
  return type;
}
export function categoryDefault<T>(tasks: Record<string,T> | undefined, type:string): T | undefined {
  const category=generationCategory(type);
  return tasks?.[category] ?? tasks?.[type] ?? Object.entries(tasks??{}).find(([key])=>generationCategory(key)===category)?.[1];
}
export function categoryRank(type:string) {
  const index=generationCategories.indexOf(type);
  return index<0?generationCategories.length:index;
}
