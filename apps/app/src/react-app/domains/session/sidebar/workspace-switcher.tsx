import {useRef,useState} from "react";
import {Check,ChevronDown,Infinity} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Command,CommandInput,CommandItem,CommandList} from "@/components/ui/command";
import {Popover,PopoverContent,PopoverTrigger} from "@/components/ui/popover";
import {WorkspaceAvatar} from "@/react-app/design-system/workspace-avatar";
import {useWorkspaceAvatarPreference} from "./workspace-avatar-store";
import {t} from "@/i18n";

export function WorkspaceSwitcher({workspaces,selectedId,onSelect}:{workspaces:{id:string;label:string;workspaceType?:string}[];selectedId:string;onSelect:(id:string)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState("");
 const inputRef=useRef<HTMLInputElement>(null);
 const selected=workspaces.find(workspace=>workspace.id===selectedId);
 const options=workspaces.filter(workspace=>workspace.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <Popover open={open} onOpenChange={value=>{setOpen(value);if(!value)setQuery("");}}>
  <PopoverTrigger render={<Button variant="ghost" className="min-w-0 flex-1 justify-start gap-2 px-2"/>} disabled={!workspaces.length} aria-label={t("workspace_list.switch_workspace")} title={selected?.label}>
   <span className="min-w-0 flex-1 truncate text-left">{selected?.label??t("workspace_list.select_workspace")}</span>{selected?.workspaceType==="always-on"?<Infinity className="size-4 shrink-0 text-muted-foreground" aria-label={t("workspace.always_on")}/>:null}<ChevronDown className="size-4 shrink-0 text-muted-foreground"/>
  </PopoverTrigger>
  <PopoverContent align="start" side="bottom" sideOffset={8} initialFocus={inputRef} className="flex max-h-[min(var(--available-height),24rem)] w-72 max-w-(--available-width) flex-col gap-0 overflow-hidden rounded-2xl p-0 shadow-[var(--dls-shell-shadow)] ring-0 [&_[data-slot=scroll-area]]:h-auto [&_[data-slot=scroll-area-viewport]]:max-h-[min(calc(var(--available-height)-2.75rem),21.25rem)] [&_[data-slot=scroll-area-scrollbar]]:opacity-100 data-open:animate-none data-closed:animate-none">
   <Command mode="none" items={options.map(workspace=>workspace.id)} value={query} onValueChange={setQuery}>
    <div className="flex h-11 shrink-0 items-center border-b px-1.5"><CommandInput ref={inputRef} autoFocus={false} placeholder={t("workspace_list.search_workspaces")} aria-label={t("workspace_list.search_workspaces")} className="h-9 text-sm"/></div>
    <CommandList className="min-h-0 p-1.5">
     {!options.length?<p role="status" className="px-2 py-3 text-sm text-muted-foreground">{t("workspace_list.no_matching_workspaces")}</p>:null}
     {options.map(workspace=><CommandItem key={workspace.id} value={workspace.id} data-workspace-option={workspace.id} data-selected={workspace.id===selectedId?"":undefined} className="min-h-8 gap-2 rounded-lg px-2 py-1 text-sm" onClick={()=>{setOpen(false);setQuery("");if(workspace.id!==selectedId)onSelect(workspace.id);}}>
      <SwitcherAvatar workspace={workspace}/><span className="min-w-0 flex-1 truncate">{workspace.label}</span>{workspace.workspaceType==="always-on"?<span className="shrink-0 text-xs text-muted-foreground">{t("workspace.always_on")}</span>:null}{workspace.id===selectedId?<Check className="size-4 shrink-0" aria-label={t("ui.57fd7a0cf33f")}/>:null}
     </CommandItem>)}
    </CommandList>
   </Command>
  </PopoverContent>
 </Popover>;
}
function SwitcherAvatar({workspace}:{workspace:{id:string;label:string}}){const preference=useWorkspaceAvatarPreference(workspace.id);return <WorkspaceAvatar workspaceId={workspace.id} label={workspace.label} sizeClass="size-4" color={preference?.color} imageUrl={preference?.imageUrl}/>;}
