import {useState} from "react";
import {Play} from "lucide-react";
import {t,useLocale} from "@/i18n";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogTitle} from "@/components/ui/dialog";

/** The muted first frame is a thumbnail; playback only starts after a click. */
export function VideoPreview({src,compact=false}:{src:string;compact?:boolean}){
  useLocale();
  const [open,setOpen]=useState(false);
  const [failedSource,setFailedSource]=useState<string|null>(null);
  const failed=failedSource===src;
  return <>
    <Button variant="ghost" className="relative h-auto max-w-full overflow-hidden rounded-md bg-muted p-0" aria-label={t("personal.media.play_video")} onClick={()=>setOpen(true)}>
      <video src={src.startsWith("data:")?src:`${src.split("#")[0]}#t=0.001`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} className={compact?"max-h-40 max-w-60 object-contain":"max-h-72 max-w-full object-contain"}/>
      <span className="absolute inset-0 flex items-center justify-center"><span className="flex size-10 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm"><Play className="size-4"/></span></span>
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92dvh] lg:w-fit lg:max-w-[92vw]" data-video-lightbox="">
        <DialogTitle className="sr-only">{t("personal.media.play_video")}</DialogTitle>
        {open?<video key={src} src={src} controls autoPlay playsInline preload="metadata" aria-label={t("personal.media.play_video")} onError={()=>setFailedSource(src)} onLoadedData={()=>setFailedSource(null)} className="max-h-[80dvh] max-w-full rounded-md"/>:null}
        {failed?<p role="alert" className="text-sm text-muted-foreground">{t("personal.media.video_unavailable")}</p>:null}
      </DialogContent>
    </Dialog>
  </>;
}
