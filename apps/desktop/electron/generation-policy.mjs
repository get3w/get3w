function category(type){for(const name of ['panorama','image','video','3d'])if(type.endsWith(`-to-${name}`))return name;return {'text-to-speech':'speech','text-to-music':'music'}[type]??type;}
function categoryDefault(tasks,type){return tasks?.[category(type)]??tasks?.[type]??Object.entries(tasks??{}).find(([key])=>category(key)===category(type))?.[1];}
/** Validate selection before schema/quote; never rewrite an approved payload. */
export function validateGenerationCall(context, policy, catalog) {
  if(!["get3w.models.schema","get3w.quote","get3w.submit"].includes(context?.type))return;
  policy ??= {models:{},outputs:{}};
  const args=context.call.arguments;
  if(catalog.offline||catalog.executionAllowed===false)throw Error("catalog_unverified: Reconnect before generation.");
  const explicit=Object.entries(policy.models??{}).filter(([,row])=>row.source==="explicit");
  for(const [type,row] of explicit)if(!policy.selectedModels?.length&&!catalog.models.some(model=>model.model_id===row.slug&&model.type===type))throw Error("model_unavailable: Explicitly selected model unavailable. Ask the user to select again; do not substitute.");
  const model=catalog.models.find(row=>row.model_id===args.slug);
  if(!model)throw Error("model_unavailable: Please select an available generation model again.");
  const family=row=>row.model_id.endsWith(`/${row.type}`)?row.model_id.slice(0,-row.type.length-1):row.model_id;
  for(const selected of policy.selectedModels??[])if(!catalog.models.some(row=>family(row)===selected.slug))throw Error("model_unavailable: Explicitly selected model unavailable. Ask the user to select again.");
  if(policy.selectedModels?.length&&!policy.selectedModels.some(row=>family(model)===row.slug))throw Error("model_preference_conflict: Use a task variant of the explicitly selected model matching the request context. If unsupported, ask the user to select again.");
  const preference=policy.models?.[model.type];
  const preferred=catalog.models.find(row=>row.model_id===preference?.slug&&row.type===model.type);
  if(preference?.source==="explicit"&&!preferred)throw Error("model_unavailable: Explicitly selected model unavailable. Ask the user to select again; do not substitute.");
  const defaults=categoryDefault(catalog.desktop_defaults?.tasks,model.type);
  const system=defaults?.slug;
  const expected=policy.selectedModels?.some(row=>family(model)===row.slug)?model.model_id:preferred?.model_id??catalog.models.find(row=>(row.model_id===system||family(row)===system)&&row.type===model.type)?.model_id;
  if(expected&&args.slug!==expected)throw Error(`model_preference_conflict: Use ${expected}; read its schema and obtain a new quote before submitting.`);
  if(context.type!=="get3w.quote")return;
  const schemas=model.api_schema.api_schemas.map(row=>row.request_schema);
  // Explicit call values win. Fill missing preferences only via a corrective
  // response: the next quote must contain the exact final inputs.
  const missing={};
  const outputDefaults={...defaults?.fields,...policy.outputs?.[model.type]};
  for(const [name,value] of Object.entries(outputDefaults)){
    if(Object.hasOwn(args.inputs,name))continue;
    const options=schemas.flatMap(schema=>schema.properties?.[name]?.enum??[]);
    const typed=options.find(option=>String(option)===value);
    if(typed!==undefined)missing[name]=typed;
  }
  if(Object.keys(missing).length)throw Error(`output_preferences_required: Add these default inputs and quote again: ${JSON.stringify(missing)}`);
}
