import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Ellipsis, ExternalLink, FolderOpen, PanelRight, Plus, RefreshCw, Search } from "lucide-react";
import type { OpenworkServerClient, OpenworkWorkspaceCatalogEntry } from "@/app/lib/openwork-server";
import { joinDesktopPath, openDesktopWorkspaceFile } from "@/app/lib/desktop";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { WorkspaceFileTree } from "../session/artifacts/workspace-file-tree";
import { WorkspaceFileContent, type FileEditorHandle } from "./workspace-file-content";
import { fileName, joinFilePath, loadFilePages, parentDirectory } from "./workspace-files-model";

type Props = { workspaceId: string; workspaceRoot?: string; client: OpenworkServerClient | null; localWorkspace?: boolean };
type Entry = OpenworkWorkspaceCatalogEntry;
type Operation = { type: "create" | "mkdir" | "rename" | "move" | "delete"; entry?: Entry; directory?: string };

export function OutputsPage(props: Props) {
  return <WorkspaceFiles key={JSON.stringify([props.workspaceId, props.workspaceRoot])} {...props} />;
}
function WorkspaceFiles({ client, workspaceId, workspaceRoot = "", localWorkspace }: Props) {
  const [directories, setDirectories] = useState<Record<string, Entry[]>>({});
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entry[]>([]);
  const [showSystem, setShowSystem] = useState(false);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationEntries, setDestinationEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [fileActionsContainer, setFileActionsContainer] = useState<HTMLDivElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const editor = useRef<FileEditorHandle | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const directoryRef = useRef(directories); directoryRef.current = directories;
  const inflight = useRef(new Set<string>());
  const onEditor = useCallback((value: FileEditorHandle | null) => { editor.current = value; setDirty(Boolean(value?.dirty)); }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);

  const guard = (action: () => void) => {
    if (editor.current?.dirty) setPending(() => action);
    else action();
  };
  // The app uses declarative routers. Capture shell navigation before it changes
  // workspace or route, then replay the original control after handling drafts.
  useEffect(() => {
    if (!dirty) return;
    let replaying = false;
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a,button,[role=menuitem]") : null;
      if (replaying || !target || rootRef.current?.contains(target) || target.closest("[role=dialog]")) return;
      if (!(target instanceof HTMLElement)) return;
      event.preventDefault(); event.stopPropagation();
      setPending(() => () => { replaying = true; target.click(); replaying = false; });
    };
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("beforeunload", unload); };
  }, [dirty]);

  const loadDirectory = useCallback(async (directory: string, refresh = false) => {
    if (!client || inflight.current.has(directory) || (!refresh && directoryRef.current[directory])) return;
    const owner = generation.current;
    inflight.current.add(directory);
    try {
      const result = await loadFilePages(client, workspaceId, { directory, showSystem });
      if (!alive.current || owner !== generation.current) return;
      setDirectories(previous => ({ ...previous, [directory]: result.items }));
      if (result.incomplete) setError(t("files.incomplete"));
      setSelected(previous => previous && parentDirectory(previous.path) === directory ? result.items.find(entry => entry.path === previous.path) ?? { ...previous, mtimeMs: -1, revision: "missing" } : previous);
    } catch (cause) { if (alive.current && owner === generation.current) setError(String(cause)); }
    finally { if (owner === generation.current) inflight.current.delete(directory); }
  }, [client, workspaceId, showSystem]);
  const refresh = useCallback(() => {
    setError(""); setRefreshVersion(value => value + 1);
    for (const directory of new Set(["", ...Object.keys(directoryRef.current)])) void loadDirectory(directory, true);
  }, [loadDirectory]);
  useEffect(() => {
    generation.current++; inflight.current.clear(); setDirectories({}); directoryRef.current = {}; setSearchResults([]);
    void loadDirectory("");
  }, [loadDirectory]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState !== "hidden") refresh(); };
    const timer = window.setInterval(tick, 5000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); };
  }, [refresh]);
  useEffect(() => {
    if (!client || !query.trim()) { setSearchResults([]); setLoading(false); return; }
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void loadFilePages(client, workspaceId, { query, showSystem }).then(result => {
        if (active) { setSearchResults(result.items); if (result.incomplete) setError(t("files.incomplete")); }
      }).catch(cause => { if (active) setError(String(cause)); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [client, workspaceId, query, showSystem, refreshVersion]);
  const entries = useMemo(() => [...new Map((query.trim() ? searchResults : Object.values(directories).flat()).map(entry => [entry.path, entry])).values()], [query, searchResults, directories]);
  const selectedDirectory = activeEntry?.kind === "dir" ? activeEntry.path : activeEntry ? parentDirectory(activeEntry.path) : "";

  function startOperation(type: Operation["type"], entry?: Entry) {
    guard(() => { setError(""); setName(type === "rename" && entry ? fileName(entry.path) : ""); setDestination(""); setOperation({ type, entry, directory: selectedDirectory }); });
  }
  useEffect(() => {
    if (operation?.type !== "move" || !client) return;
    let active = true;
    void loadFilePages(client, workspaceId, { directory: destination, showSystem }).then(result => { if (active) setDestinationEntries(result.items.filter(entry => entry.kind === "dir")); }).catch(cause => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [operation, destination, client, workspaceId, showSystem]);
  async function applyOperation() {
    if (!operation || !client || busy) return;
    const current = operation;
    setBusy(true); setError("");
    try {
      if (current.type !== "delete" && current.type !== "move" && (!name.trim() || /[/\\]/.test(name) || [".", ".."].includes(name))) throw new Error(t("files.invalidName"));
      const path = current.entry?.path ?? joinFilePath(current.directory ?? "", name);
      const to = current.type === "move" ? joinFilePath(destination, fileName(path)) : current.type === "rename" ? joinFilePath(parentDirectory(path), name) : undefined;
      await client.operateWorkspaceFile(workspaceId, { type: current.type === "move" ? "rename" : current.type, path, to, recursive: current.entry?.kind === "dir" });
      if (!alive.current) return;
      if (selected && (selected.path === path || selected.path.startsWith(path + "/"))) {
        if (to) setSelected({ ...selected, path: to + selected.path.slice(path.length) });
        else if (current.type === "delete") setSelected(null);
      }
      setOperation(null); setActiveEntry(null);
      // Remove cached descendants after moving/deleting a directory.
      setDirectories(previous => Object.fromEntries(Object.entries(previous).filter(([directory]) => directory !== path && !directory.startsWith(path + "/"))));
      refresh(); if (to) void loadDirectory(parentDirectory(to), true);
      if (current.type === "create") { await loadDirectory(parentDirectory(path), true); setSelected({ path, kind: "file", size: 0, mtimeMs: Date.now(), revision: "" }); }
    } catch (cause) { if (alive.current) setError(String(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function external(entry: Entry, reveal = false) {
    try { const absolutePath = await joinDesktopPath(workspaceRoot, entry.path); const result = await openDesktopWorkspaceFile(workspaceRoot, absolutePath, { reveal }); if (result === "unavailable") throw Error(t("files.unavailable")); }
    catch (cause) { setError(String(cause)); }
  }
  async function download(entry: Entry) {
    if (!client || entry.kind !== "file") return;
    try {
      const result = await client.downloadWorkspaceFile(workspaceId, entry.path, { fileScope: "workspace" });
      if (!alive.current) return;
      const url = URL.createObjectURL(new Blob([result.data], { type: result.contentType ?? "application/octet-stream" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName(entry.path); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(String(cause)); }
  }
  const actions = [
    { id: "copy", label: t("files.copyPath"), run: (entry: Entry) => void navigator.clipboard.writeText(entry.path).catch(cause => setError(String(cause))) },
    { id: "rename", label: t("files.rename"), run: (entry: Entry) => startOperation("rename", entry) },
    { id: "move", label: t("files.move"), run: (entry: Entry) => startOperation("move", entry) },
    { id: "delete", label: t("files.delete"), run: (entry: Entry) => startOperation("delete", entry) },
    { id: "download", label: t("files.download"), run: (entry: Entry) => void download(entry) },
    ...(localWorkspace ? [{ id: "reveal", label: t("files.reveal"), run: (entry: Entry) => void external(entry, true) }, { id: "open", label: t("files.openExternal"), run: (entry: Entry) => void external(entry) }] : []),
  ];
  const title = operation ? t(`files.${operation.type === "create" ? "newFile" : operation.type === "mkdir" ? "newFolder" : operation.type}`) : "";
  return <main ref={rootRef} className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background" aria-label={t("personal.outputs.title")}>
    <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
      <nav aria-label={t("files.path")} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm">
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { setQuery(""); setActiveEntry(null); }}>{fileName(workspaceRoot) || t("personal.outputs.title")}</Button>
        {selected?.path.split("/").map((part, index, parts) => <span key={index} className="flex min-w-0 items-center gap-1"><span className="text-muted-foreground">›</span><button className="truncate rounded px-1 py-1 hover:bg-muted" title={part} onClick={() => { const path = parts.slice(0, index + 1).join("/"); if (index < parts.length - 1) { setActiveEntry({ path, kind: "dir", size: 0, mtimeMs: 0, revision: "" }); void loadDirectory(path); } }}>{part}</button></span>)}
      </nav>
      <div ref={setFileActionsContainer} className="shrink-0" />
      {selected ? <>
        <Button variant="ghost" size="icon-sm" aria-label={t("files.copyPath")} onClick={() => void navigator.clipboard.writeText(selected.path).catch(cause => setError(String(cause)))}><Copy /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={t("files.download")} onClick={() => void download(selected)}><Download /></Button>
        {localWorkspace ? <Button variant="ghost" size="sm" onClick={() => void external(selected)}><ExternalLink />{t("files.openExternal")}</Button> : null}
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("files.actions")} />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end">{actions.map(action => <DropdownMenuItem key={action.id} onClick={() => action.run(selected)}>{action.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      </> : null}
      <Button variant="ghost" size="icon-sm" aria-label={t("files.toggleTree")} aria-pressed={treeOpen} onClick={() => setTreeOpen(value => !value)}><PanelRight /></Button>
    </header>
    {error ? <p role="alert" className="shrink-0 border-b px-3 py-2 text-sm">{error}</p> : null}
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel minSize="30%">
        {client && selected ? <WorkspaceFileContent key={selected.path} client={client} workspaceId={workspaceId} entry={selected} draftScope={workspaceRoot} actionsContainer={fileActionsContainer} onEditor={onEditor} onSaved={refresh} /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><FolderOpen className="size-10" /><span className="text-base font-medium text-foreground">{t("files.openFile")}</span><span className="text-sm">{client ? t("files.chooseFile") : t("files.unavailable")}</span></div>}
      </ResizablePanel>
      {treeOpen ? <><ResizableHandle /><ResizablePanel defaultSize="28%" minSize="22%" maxSize="60%">
        <aside className="flex h-full min-h-0 flex-col" aria-label={t("personal.outputs.title")}>
          <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
            <Search className="size-4 shrink-0 text-muted-foreground" /><Input className="h-7 min-w-0 border-0 shadow-none" aria-label={t("files.filter")} placeholder={t("files.filter")} value={query} onChange={event => setQuery(event.target.value)} />
            <Button variant="ghost" size="icon-xs" aria-label={t("files.refresh")} onClick={refresh}><RefreshCw /></Button>
            <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("files.new")} />}><Plus /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => startOperation("create")}>{t("files.newFile")}</DropdownMenuItem><DropdownMenuItem onClick={() => startOperation("mkdir")}>{t("files.newFolder")}</DropdownMenuItem><DropdownMenuItem onClick={() => setShowSystem(value => !value)}>{showSystem ? t("files.hideSystem") : t("files.showSystem")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </div>
          {loading ? <div role="status" className="px-3 py-1 text-xs text-muted-foreground">{t("files.searching")}</div> : null}
          {client ? <div className="min-h-0 flex-1"><WorkspaceFileTree managed client={client} workspaceId={workspaceId} workspaceName={fileName(workspaceRoot)} entries={entries} filter={query} selectedPath={selected?.path ?? ""} onSelectEntry={setActiveEntry} onOpenFile={entry => { if (selected?.path !== entry.path) guard(() => setSelected(entry)); }} onExpandDirectory={path => { void loadDirectory(path); }} fileActions={actions} /></div> : null}
          {!entries.length && client && !loading ? <p className="px-3 py-2 text-xs text-muted-foreground">{query ? t("files.noMatches") : t("files.empty")}</p> : null}
        </aside>
      </ResizablePanel></> : null}
    </ResizablePanelGroup>
    <Dialog open={Boolean(operation)} onOpenChange={open => { if (!open && !busy) setOperation(null); }}><DialogContent><DialogTitle>{title}</DialogTitle>
      {operation?.type === "delete" ? <p className="break-all text-sm">{operation.entry?.path} · {t("files.deleteWarning")}</p> : operation?.type === "move" ? <div className="max-h-64 space-y-1 overflow-auto"><p className="break-all text-xs text-muted-foreground">/{destination}</p>{destination ? <Button variant="ghost" size="sm" onClick={() => setDestination(parentDirectory(destination))}>..</Button> : null}{destinationEntries.filter(entry => entry.path !== operation.entry?.path && !entry.path.startsWith((operation.entry?.path ?? "\0") + "/")).map(entry => <Button className="w-full justify-start" variant="ghost" key={entry.path} onClick={() => setDestination(entry.path)}><FolderOpen />{fileName(entry.path)}</Button>)}</div> : <Input autoFocus aria-label={t("files.name")} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void applyOperation(); }} />}
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
      <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setOperation(null)}>{t("files.cancel")}</Button><Button disabled={busy || (operation?.type === "move" && joinFilePath(destination, fileName(operation.entry?.path ?? "")) === operation.entry?.path)} onClick={() => void applyOperation()}>{title}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={Boolean(pending)} onOpenChange={open => { if (!open) setPending(null); }}><DialogContent><DialogTitle>{t("files.unsaved")}</DialogTitle><DialogFooter><Button variant="ghost" onClick={() => setPending(null)}>{t("files.cancel")}</Button><Button variant="outline" onClick={() => { editor.current?.discard(); const action = pending; setPending(null); action?.(); }}>{t("files.discard")}</Button><Button onClick={async () => { if (await editor.current?.save()) { const action = pending; setPending(null); action?.(); } }}>{t("files.save")}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}
