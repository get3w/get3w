import { generationCategory, generationModelId, categoryDefault, categoryRank } from "./generation-models";
import { cachedTaskCatalog, loadTaskCatalog, useTaskCatalog } from "./task-catalog-store";
import { formatMoney } from "@/i18n/money";
import {SlidersHorizontal,ListFilter} from "lucide-react";
import {Tooltip,TooltipTrigger,TooltipContent} from "@/components/ui/tooltip";
import {useEffect,useMemo,useState} from "react";
import {t,useLocale} from "@/i18n";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Popover,PopoverContent,PopoverTrigger} from "@/components/ui/popover";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {useGet3wAccount,type TaskCatalogSnapshot} from "./get3w-account";
import {readModelPreferences,readOutputPreferences,writeModelPreference,writeOutputPreference,outputSettingOptions,effectivePreferences,type PreferenceScope} from "./model-preferences";

export function ModelPreferencesPanel({sessionId}:{sessionId?:string}){
  const account=useGet3wAccount();
  useLocale();
  const userId=account.status==="signed_in"?account.user?.id:undefined;
  const [,redraw]=useState(0);
  useEffect(()=>{const update=()=>redraw(value=>value+1);window.addEventListener("get3w-preferences-changed",update);return()=>window.removeEventListener("get3w-preferences-changed",update);},[]);
  const preferences=userId?effectivePreferences(userId,sessionId):null;
  const custom={models:preferences?.models.some(row=>row.slug!==null),outputs:preferences?.outputs.some(row=>Object.values(row.fields).some(value=>value!=="auto"))};
  return <div className="flex items-center gap-1">{(["models","outputs"] as const).map(mode=><Popover key={mode}>
    <Tooltip><TooltipTrigger render={<PopoverTrigger aria-label={mode==="models"?t("personal.copy.preferred_models"):t("personal.copy.output_settings")} className="relative flex h-9 items-center gap-1 rounded-md px-2 text-xs text-gray-10 hover:bg-gray-3"/>}>{mode==="models"?<ListFilter size={16} strokeWidth={1.5}/>:<SlidersHorizontal size={16} strokeWidth={1.5}/>}<span className="hidden @min-[700px]/composer:inline">{mode==="models"?t("personal.copy.preferred_models"):t("personal.copy.output_settings")}</span>{custom[mode]?<span aria-label={t("personal.copy.customized")} className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"/>:null}</TooltipTrigger><TooltipContent>{mode==="models"?t("personal.copy.preferred_models"):t("personal.copy.output_settings")}</TooltipContent></Tooltip>
    <PopoverContent side="top" align="start" aria-label={mode==="models"?t("personal.copy.preferred_models"):t("personal.copy.output_settings")} className="max-h-[min(40rem,var(--available-height))] w-[44rem] max-w-(--available-width) overflow-hidden p-4">
      {userId?<PreferenceFields key={`${userId}:${sessionId}`} userId={userId} sessionId={sessionId} mode={mode}/>:<div className="text-sm text-muted-foreground">{account.status==="checking"?<div className="h-24 animate-pulse rounded bg-muted" aria-busy="true" aria-label={t("personal.account.checking")}/>:account.status==="unavailable"?<><p role="status">{t("personal.account.unavailable")}</p><Button size="sm" variant="ghost" onClick={()=>window.dispatchEvent(new Event("focus"))}>{t("personal.account.retry")}</Button></>:<p>{t("personal.preferences.sign_in")}</p>}</div>}
    </PopoverContent>
  </Popover>)}</div>;
}
export function PreferenceFields({userId,sessionId,mode}:{userId:string;sessionId?:string;mode:"models"|"outputs"}){
  useLocale();
  const sharedCatalog=useTaskCatalog(userId);
  const [scope,setScope]=useState<PreferenceScope>(sessionId?"session":"global");
  const [catalog,setCatalog]=useState<TaskCatalogSnapshot|null>(()=>cachedTaskCatalog(userId)),[error,setError]=useState<"load"|"save"|null>(null),[query,setQuery]=useState("");
  const [,redraw]=useState(0);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;setError(null);
    void (async()=>{
      const value=await loadTaskCatalog(userId,attempt>0);
      if(active)setCatalog(value);
    })().catch(()=>{if(active)setError("load");});
    return()=>{active=false;};
  },[userId,attempt]);
  useEffect(()=>{if(sharedCatalog)setCatalog(sharedCatalog);},[sharedCatalog]);
  const fieldLabels:Record<string,string>={aspect_ratio:t("personal.copy.aspect_ratio"),resolution:t("personal.copy.resolution"),num_images:t("personal.copy.image_count"),num_outputs:t("personal.copy.output_count"),quantity:t("personal.copy.quantity"),generate_audio:t("personal.copy.generate_audio"),with_audio:t("personal.copy.include_audio"),language:t("personal.copy.language"),format:t("personal.copy.format"),output_format:t("personal.copy.output_format")};
  const storageSession=scope==="session"?sessionId:undefined;
  const models=readModelPreferences(userId,storageSession),outputs=readOutputPreferences(userId,storageSession);
  const groupTitle=(type:string,fallback:string)=>{
    const known:Record<string,string>={image:"image",video:"video",panorama:"panorama","3d":"3d",speech:"speech",music:"music","digital-human":"digital_human","speech-to-text":"transcription"};
    return known[type]?t(`personal.run_type.${known[type]}`):fallback;
  };
  const indexed=useMemo(()=>{const models=new Map<string,TaskCatalogSnapshot["models"]>();for(const model of catalog?.models??[]){if(/(decision|chat|llm)/i.test(`${model.category} ${model.type}`))continue;const rows=models.get(generationCategory(model.type))??[];rows.push(model);models.set(generationCategory(model.type),rows);}for(const rows of models.values())rows.sort((a,b)=>(a.base_price??Infinity)-(b.base_price??Infinity));return models;},[catalog]);
  const outputOptions=useMemo(()=>new Map([...indexed.keys()].map(type=>[type,catalog?outputSettingOptions(catalog,type):[]])),[catalog,indexed]);
  const groups=[...indexed.keys()].filter(type=>!/(decision|chat|llm)/i.test(type)).sort((a,b)=>categoryRank(a)-categoryRank(b)||a.localeCompare(b)).map(type=>({type,run_type_title:type}));
  const save=(action:()=>void)=>{try{action();setError(null);redraw(value=>value+1);window.dispatchEvent(new Event("get3w-preferences-changed"));}catch{setError("save");}};
  return <div className="@container/preferences flex min-h-0 flex-col gap-3 text-sm">
    <div className="grid shrink-0 grid-cols-1 gap-2 @min-[32rem]/preferences:grid-cols-2">
    <Select value={scope} onValueChange={value=>{if(value==="session"||value==="global")setScope(value);}}>
      <SelectTrigger aria-label={t("personal.copy.scope")} className="w-full"><SelectValue>{scope==="session"?t("personal.copy.this_conversation"):t("personal.copy.all_conversations")}</SelectValue></SelectTrigger>
      <SelectContent><SelectItem value="session" disabled={!sessionId}>{t("personal.copy.this_conversation")}</SelectItem><SelectItem value="global">{t("personal.copy.all_conversations")}</SelectItem></SelectContent>
    </Select>
    <Input aria-label={t("personal.copy.search")} placeholder={t("personal.copy.search")} value={query} onChange={event=>setQuery(event.target.value)}/>
    </div>
    {error?<div role="alert" className="flex items-center justify-between"><span>{t(error==="save"?"personal.preferences.save_failed":"personal.preferences.load_failed")}</span><Button size="sm" variant="ghost" onClick={()=>setAttempt(value=>value+1)}>{t("personal.copy.retry")}</Button></div>:null}
    {catalog?.offline?<p className="text-muted-foreground">{t("personal.copy.offline_catalog_revalidated_before_execution")}</p>:null}
    {!catalog&&!error?<div className="h-24 animate-pulse rounded bg-muted" aria-busy="true"/>:null}
    {catalog&&!groups.length?<p className="text-muted-foreground">{t("personal.copy.no_models_available_try_again_later")}</p>:null}
    {catalog&&groups.length>0&&!groups.some(group=>`${groupTitle(group.type,group.run_type_title)} ${group.type} ${(indexed.get(group.type)??[]).map(model=>model.name).join(" ")}`.toLowerCase().includes(query.toLowerCase()))?<p className="text-muted-foreground">{t("personal.preferences.no_matches")}</p>:null}
    <div className="grid min-h-0 grid-cols-1 items-start gap-x-6 overflow-y-auto overscroll-contain @min-[32rem]/preferences:grid-cols-2">
    {groups.filter(group=>`${groupTitle(group.type,group.run_type_title)} ${group.type} ${(indexed.get(group.type)??[]).map(model=>model.name).join(" ")}`.toLowerCase().includes(query.toLowerCase())).map(group=>{
      const available=[...new Map((indexed.get(group.type)??[]).map(model=>[generationModelId(model),model])).values()];
      const current=models.find(row=>row.runType===group.type);
      const valid=current?.slug&&available.some(model=>generationModelId(model)===current.slug);
      const system=categoryDefault(catalog?.desktop_defaults?.tasks,group.type);
      const systemName=available.find(model=>generationModelId(model)===system?.slug||model.model_id===system?.slug)?.name;
      const autoLabel=systemName?`${t("personal.preferences.auto")} · ${systemName}`:t("personal.preferences.auto");
      const fields=outputOptions.get(group.type)??[];
      return <section key={group.type} className="min-w-0 space-y-2 border-t py-3"><h3 className="truncate font-medium" title={groupTitle(group.type,group.run_type_title)}>{groupTitle(group.type,group.run_type_title)}</h3>{mode==="models"?<>
        {current?.slug&&!valid?<p className="text-muted-foreground">{t("personal.copy.previous_model_unavailable_using_auto")}</p>:null}
        <Select value={valid?current?.slug:"__auto"} onValueChange={value=>save(()=>writeModelPreference(userId,{runType:group.type,slug:value==="__auto"?null:value,scope,updatedAt:Date.now(),catalogVersion:catalog?.catalog_version},sessionId))}>
          <SelectTrigger aria-label={groupTitle(group.type,group.run_type_title)} className="h-10 w-full min-w-0"><SelectValue className="truncate">{valid?available.find(model=>generationModelId(model)===current?.slug)?.name:autoLabel}</SelectValue></SelectTrigger><SelectContent><SelectItem value="__auto">{autoLabel}</SelectItem>{available.map(model=><SelectItem key={model.model_id} value={generationModelId(model)}>{model.name}{model.base_price!==null?` · ${formatMoney(model.base_price,model.currency)} / ${model.billing_unit??"—"}`:""}</SelectItem>)}</SelectContent>
        </Select>
      </>:fields.length?fields.map(field=><div key={field.name} className="flex min-h-10 items-center justify-between gap-3"><span className="min-w-0 text-muted-foreground">{fieldLabels[field.name]??field.name}</span><Select value={outputs.find(row=>row.runType===group.type)?.fields[field.name]??"auto"} onValueChange={value=>save(()=>writeOutputPreference(userId,{runType:group.type,fields:{...outputs.find(row=>row.runType===group.type)?.fields,[field.name]:value??"auto"},scope,updatedAt:Date.now()},sessionId))}><SelectTrigger className="h-9 w-32 min-w-0 shrink-0" aria-label={`${groupTitle(group.type,group.run_type_title)} ${fieldLabels[field.name]??field.name}`}><SelectValue className="truncate">{outputs.find(row=>row.runType===group.type)?.fields[field.name]&&outputs.find(row=>row.runType===group.type)?.fields[field.name]!=="auto"?outputs.find(row=>row.runType===group.type)?.fields[field.name]:`${t("personal.preferences.auto")}${system?.fields[field.name]?` · ${system.fields[field.name]}`:""}`}</SelectValue></SelectTrigger><SelectContent><SelectItem value="auto">{`${t("personal.preferences.auto")}${system?.fields[field.name]?` · ${system.fields[field.name]}`:""}`}</SelectItem>{field.values.filter(value=>value!=="auto").map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>):<p className="text-muted-foreground">{t("personal.preferences.auto")}</p>}</section>;
    })}
    </div>
  </div>;
}
