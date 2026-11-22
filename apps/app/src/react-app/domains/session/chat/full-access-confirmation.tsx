import { useEffect, useState } from "react";
import { Folder, Globe, ShieldAlert, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { t } from "@/i18n";

export function FullAccessConfirmation({ open, onOpenChange, onConfirm, busy = false, error = false, impact }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy?: boolean;
  error?: boolean;
  impact?: string;
}) {
  const [accepted, setAccepted] = useState(false);
  useEffect(() => { if (!open) setAccepted(false); }, [open]);
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) {onOpenChange(value);setAccepted(false);} }}>
      <DialogContent className="lg:max-w-xl" showCloseButton={!busy}>
        <DialogTitle className="flex items-center gap-3"><ShieldAlert className="text-destructive" size={20}/>{t("permissions.confirm")}</DialogTitle>
        <DialogDescription>{impact ?? t("permissions.impact")}</DialogDescription>
        <div className="space-y-4 rounded-2xl bg-muted p-4">
          {[{Icon:Folder,key:"files"},{Icon:Terminal,key:"commands"},{Icon:Globe,key:"internet"}].map(({Icon,key}) => <div key={key} className="flex gap-3"><Icon size={18} className="mt-0.5 shrink-0"/><div><p className="font-medium">{t(`permissions.${key}`)}</p><p className="mt-1 text-muted-foreground">{t(`permissions.${key}_detail`)}</p></div></div>)}
        </div>
        <p className="text-muted-foreground">{t("permissions.limits")}</p>
        <label className="flex items-center gap-3"><Checkbox checked={accepted} disabled={busy} onCheckedChange={value => setAccepted(value === true)} aria-label={t("permissions.acknowledge")}/>{t("permissions.acknowledge")}</label>
        {error ? <p role="alert" className="text-destructive">{t("permissions.error")}</p> : null}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => {onOpenChange(false);setAccepted(false);}}>{t("permissions.cancel")}</Button><Button variant="destructive" disabled={!accepted || busy} onClick={onConfirm}>{t("permissions.enable")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
