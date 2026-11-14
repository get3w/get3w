import "./model-task-progress.css";
import {useEffect,useState} from "react";
import {t,useLocale} from "@/i18n";
import type {ModelTask} from "./get3w-account";

export function taskProgress(start:number,estimate:number|undefined,now:number){
  const elapsed=Math.max(0,Math.floor((now-start)/1000));
  const duration=estimate!==undefined&&Number.isFinite(estimate)&&estimate>0?estimate:null;
  const raw=duration===null?null:elapsed/duration;
  return {elapsed,duration,percent:raw===null?95*elapsed/(elapsed+60):raw>=1?95:Math.min(95,raw*(1-raw*0.05)*100)};
}
function formatTime(seconds:number){
  const value=Math.max(0,Math.round(seconds));
  if(value<60)return `${value}s`;
  return `${Math.floor(value/60)}m${value%60?`${value%60}s`:""}`;
}
export function ModelTaskProgress({task}:{task:ModelTask}){
  useLocale();
  const active=["submitted","created","processing"].includes(task.status);
  const start=task.submittedAt??task.createdAt;
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    if(!active||start===undefined)return;
    setNow(Date.now());
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(timer);
  },[active,start]);
  if(!active||start===undefined||!Number.isFinite(start))return null;
  const {elapsed,duration,percent}=taskProgress(start,task.estimatedDuration,now);
  const overtime=duration!==null&&elapsed>duration;
  const width=`${percent||2}%`;
  return <div className="model-task-canvas-progress relative flex aspect-video w-60 max-w-full items-center justify-center overflow-hidden rounded-md text-xs" data-task-progress="" data-overtime={overtime||undefined}>
    <div className="model-task-canvas-fill absolute inset-y-0 left-0" style={{width}} aria-hidden="true"/>
    <div className="model-task-canvas-edge absolute inset-y-0" style={{left:width}} aria-hidden="true"/>
    <div role="progressbar" aria-label={t("personal.media.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={duration===null?undefined:Math.round(percent)} className="relative rounded-lg bg-background/80 px-4 py-2 text-center leading-relaxed">
      {duration===null?<div className="font-medium text-foreground/70">{t("personal.media.elapsed",{time:formatTime(elapsed)})}</div>:overtime?<>
        <div className="font-medium text-amber-11">{t("personal.media.overdue",{time:formatTime(elapsed-duration)})}</div>
        <div className="mt-0.5 text-muted-foreground">{t("personal.media.elapsed",{time:formatTime(elapsed)})}</div>
      </>:<>
        <div className="font-medium text-foreground/90">{t("personal.media.estimate",{time:formatTime(duration)})}</div>
        <div className="mt-0.5 text-blue-11">{t("personal.media.remaining",{time:formatTime(Math.max(0,duration-elapsed))})}</div>
      </>}
    </div>
  </div>;
}
