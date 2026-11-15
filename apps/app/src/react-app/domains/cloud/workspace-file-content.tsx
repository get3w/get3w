import { lazy, Suspense, useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { RefreshCw } from "lucide-react";
import type { OpenworkServerClient, OpenworkWorkspaceCatalogEntry } from "@/app/lib/openwork-server";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { classifyOpenTarget, type Data } from "../session/artifacts/open-target";
import { HTMLPreview, ImagePreview, MarkdownPreview, PdfPreview, PreviewLoading, PreviewUnavailable, VideoPreview } from "../session/artifacts/preview";
import { AudioPreview } from "./audio-preview";
import { DocxPreview } from "./output-preview";
import { fileName } from "./workspace-files-model";

const TextEditor = lazy(() => import("../session/artifacts/artifact-text-editor").then(m => ({ default: m.ArtifactTextEditor })));
const CodeView = lazy(() => import("../session/artifacts/artifact-code-view").then(m => ({ default: m.ArtifactCodeView })));
const SheetEditor = lazy(() => import("../session/artifacts/artifact-spreadsheet-editor").then(m => ({ default: m.ArtifactSpreadsheetEditor })));

type Loaded = { content: Data; updatedAt: number | null; mime: string | null };
const retainedDrafts = new Map<string, { loaded: Loaded; draft: string; sheetDraft: Data | null }>();
export type FileEditorHandle = { dirty: boolean; save: () => Promise<boolean>; discard: () => void };

export function WorkspaceFileContent({ client, workspaceId, entry, draftScope = "", actionsContainer, onEditor, onSaved }: {
  client: OpenworkServerClient; workspaceId: string; entry: OpenworkWorkspaceCatalogEntry; draftScope?: string;
  actionsContainer: HTMLElement | null;
  onEditor: (editor: FileEditorHandle | null) => void; onSaved: () => void;
}) {
  const draftKey = JSON.stringify([draftScope, workspaceId, entry.path]);
  const retained = useRef(retainedDrafts.get(draftKey)).current;
  const preview = classifyOpenTarget(entry.path, "file");
  const textFile = ["markdown", "code", "text", "html"].includes(preview) || /\.(csv|tsv)$/i.test(entry.path);
  const editable = textFile || preview === "sheet";
  const [loaded, setLoaded] = useState<Loaded | null>(retained?.loaded ?? null);
  const [draft, setDraft] = useState(retained?.draft ?? "");
  const recoveredSheet = useRef(retained?.sheetDraft ?? null);
  const [sheetDraft, setSheetDraft] = useState<Data | null>(retained?.sheetDraft ?? null);
  const [sheetEpoch, setSheetEpoch] = useState(0);
  const [sheetDirty, setSheetDirty] = useState(Boolean(retained?.sheetDraft));
  const sheetDirtyChange = useCallback((value: boolean) => { setSheetDirty(value); if (!value) setSheetDraft(null); }, []);
  const [editing, setEditing] = useState(Boolean(retained));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [objectUrl, setObjectUrl] = useState("");
  const dirty = sheetDirty || (loaded?.content.kind === "text" ? draft !== loaded.content.data : false);

  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    let active = true;
    setError("");
    if (dirty) return;
    void (async () => {
      const info = await client.statWorkspaceFile(workspaceId, entry.path);
      // Keep unknown/large binary formats available through external open/download.
      if ((info.size ?? entry.size) > 50_000_000) throw new Error(t("files.largeFile"));
      const result: Loaded = textFile
        ? await client.readWorkspaceFile(workspaceId, entry.path, { fileScope: "workspace" }).then(value => ({ content: { kind: "text", data: value.content }, updatedAt: value.updatedAt ?? null, mime: null }))
        : await client.downloadWorkspaceFile(workspaceId, entry.path, { fileScope: "workspace" }).then(value => ({ content: { kind: "binary", data: value.data }, updatedAt: info.updatedAt ?? null, mime: value.contentType }));
      if (active && !dirtyRef.current) { setLoaded(result); setDraft(result.content.kind === "text" ? result.content.data : ""); }
    })().catch(cause => { if (active && !dirtyRef.current) { setError(cause instanceof Error ? cause.message : String(cause)); setLoaded(null); } });
    return () => { active = false; };
    // Refresh clean previews on disk changes; dirty drafts retain their original version.
  }, [client, workspaceId, entry.path, entry.mtimeMs, attempt]);

  useEffect(() => {
    if (loaded?.content.kind !== "binary") return;
    const url = URL.createObjectURL(new Blob([loaded.content.data], { type: loaded.mime ?? "application/octet-stream" }));
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [loaded]);

  useEffect(() => {
    if (dirty && loaded) retainedDrafts.set(draftKey, { loaded, draft, sheetDraft });
    else retainedDrafts.delete(draftKey);
  }, [draftKey, dirty, loaded, draft, sheetDraft]);

  async function save() {
    if (!loaded || saving) return false;
    if (!dirty) return true;
    setSaving(true); setError("");
    if (sheetDirty && !sheetDraft) { setSaving(false); return false; }
    const content: Data = sheetDraft ?? (loaded.content.kind === "text" ? { kind: "text", data: draft } : loaded.content);
    try {
      const result = content.kind === "text"
        ? await client.writeWorkspaceFile(workspaceId, { path: entry.path, content: content.data, baseUpdatedAt: loaded.updatedAt, fileScope: "workspace" })
        : await client.writeWorkspaceBinaryFile(workspaceId, { path: entry.path, data: content.data, baseUpdatedAt: loaded.updatedAt, fileScope: "workspace" });
      retainedDrafts.delete(draftKey); if (sheetDirty && content.kind === "text") setDraft(content.data); setLoaded({ ...loaded, content, updatedAt: result.updatedAt ?? null }); setSheetDraft(null); recoveredSheet.current = null; setSheetDirty(false); onSaved(); return true;
    } catch (cause) { setError(`${t("files.saveFailed")} ${cause instanceof Error ? cause.message : String(cause)}`); return false; }
    finally { setSaving(false); }
  }
  function discard() { retainedDrafts.delete(draftKey); setDraft(loaded?.content.kind === "text" ? loaded.content.data : ""); setSheetDraft(null); recoveredSheet.current = null; setSheetDirty(false); setSheetEpoch(value => value + 1); setEditing(false); }
  useEffect(() => { onEditor({ dirty, save, discard }); });
  useEffect(() => () => onEditor(null), [onEditor]);

  return <section className="flex h-full min-h-0 flex-col" aria-label={fileName(entry.path)}>
    {actionsContainer ? createPortal(<div role="group" aria-label={t("files.actions")} className="flex shrink-0 items-center gap-1 text-xs">
      {dirty ? <span className="px-1 text-muted-foreground">{t("files.unsaved")}</span> : null}
      <Button size="icon-sm" variant="ghost" aria-label={t("files.reload")} title={t("files.reload")} onClick={() => setAttempt(value => value + 1)} disabled={dirty || saving}><RefreshCw /></Button>
      {editable ? <Button size="xs" variant="ghost" disabled={saving} onClick={() => { if (!dirty) setEditing(value => !value); }}>{editing ? t("files.preview") : t("files.edit")}</Button> : null}
      {editing && dirty ? <><Button size="xs" variant="ghost" disabled={saving} onClick={discard}>{t("files.discard")}</Button><Button size="xs" disabled={saving} onClick={() => void save()}>{t("files.save")}</Button></> : null}
    </div>, actionsContainer) : null}
    {error ? <div role="alert" className="border-b p-3 text-sm">{error}</div> : null}
    <div className="min-h-0 flex-1 overflow-auto">
      <Suspense fallback={<PreviewLoading />}>
        {!loaded ? error ? <PreviewUnavailable /> : <PreviewLoading />
          : editing && preview === "sheet" ? <SheetEditor key={`${loaded.updatedAt}:${sheetEpoch}`} name={entry.path} content={recoveredSheet.current ?? loaded.content} saving={saving} onDirtyChange={sheetDirtyChange} onDraftChange={setSheetDraft} onSave={async content => {
            try {
              const result = content.kind === "text" ? await client.writeWorkspaceFile(workspaceId, { path: entry.path, content: content.data, baseUpdatedAt: loaded.updatedAt, fileScope: "workspace" }) : await client.writeWorkspaceBinaryFile(workspaceId, { path: entry.path, data: content.data, baseUpdatedAt: loaded.updatedAt, fileScope: "workspace" });
              retainedDrafts.delete(draftKey); if (content.kind === "text") setDraft(content.data); setLoaded({ ...loaded, content, updatedAt: result.updatedAt ?? null }); setSheetDraft(null); recoveredSheet.current = null; setSheetDirty(false); onSaved();
            } catch (cause) { setError(`${t("files.saveFailed")} ${String(cause)}`); throw cause; }
          }} />
          : editing && loaded.content.kind === "text" ? <TextEditor value={draft} language={preview === "markdown" ? "markdown" : "text"} onChange={setDraft} />
          : preview === "markdown" && loaded.content.kind === "text" ? <MarkdownPreview content={loaded.content.data} />
          : preview === "html" && loaded.content.kind === "text" ? <HTMLPreview type="text" title={entry.path} content={loaded.content.data} />
          : preview === "image" && objectUrl ? <ImagePreview src={objectUrl} alt={entry.path} />
          : preview === "video" && objectUrl ? <VideoPreview src={objectUrl} title={entry.path} />
          : preview === "pdf" && objectUrl ? <PdfPreview url={objectUrl} title={entry.path} />
          : /\.(mp3|wav|m4a|ogg|flac|aac|opus|aiff)$/i.test(entry.path) && objectUrl ? <div className="p-6"><AudioPreview src={objectUrl} /></div>
          : preview === "document" && objectUrl ? <div className="p-4"><DocxPreview source={objectUrl} /></div>
          : preview === "sheet" ? <SheetEditor name={entry.path} content={loaded.content} readOnly onSave={() => {}} />
          : loaded.content.kind === "text" ? <CodeView name={fileName(entry.path)} path={entry.path} content={loaded.content.data} />
          : <PreviewUnavailable />}
      </Suspense>
    </div>
  </section>;
}
