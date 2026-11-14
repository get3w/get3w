import {useState} from "react";
import {Play} from "lucide-react";
import {t,useLocale} from "@/i18n";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogTitle} from "@/components/ui/dialog";

export function AudioPreview({src}:{src:string}){
  useLocale();
  const [open,setOpen]=useState(false);
  const [failed,setFailed]=useState(false);
  return <>
    <Button variant="secondary" size="sm" onClick={()=>{setFailed(false);setOpen(true);}}><Play className="size-4"/>{t("personal.media.play_audio")}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-audio-lightbox="">
        <DialogTitle>{t("personal.media.play_audio")}</DialogTitle>
        {open?<audio key={src} src={src} controls autoPlay preload="metadata" aria-label={t("personal.media.play_audio")} onError={()=>setFailed(true)} onLoadedData={()=>setFailed(false)} className="w-full"/>:null}
        {failed?<p role="alert" className="text-sm text-muted-foreground">{t("personal.media.audio_unavailable")}</p>:null}
      </DialogContent>
    </Dialog>
  </>;
}
