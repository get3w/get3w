import { t } from "@/i18n";
/** @jsxImportSource react */
import { useEffect, useMemo, useRef } from "react";
import { FileTree, useFileTree, useFileTreeSearch } from "@pierre/trees/react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";

import type { OpenworkServerClient, OpenworkWorkspaceCatalogEntry } from "@/app/lib/openwork-server";
import { Button } from "@/components/ui/button";
import { useNativeContextMenu } from "@/components/ui/action-context-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

const TREE_CSS = `
  :host {
    --trees-bg-override: transparent;
    --trees-selected-bg-override: color-mix(in srgb, currentColor 12%, transparent);
    --trees-hover-bg-override: color-mix(in srgb, currentColor 7%, transparent);
    --trees-border-color-override: color-mix(in srgb, currentColor 14%, transparent);
    --trees-font-family-override: var(--font-sans);
    --trees-font-size-override: 12px;
  }
  button[data-type='item'] { border-radius: 5px; }
`;

export type WorkspaceFileAction = {
  id: string;
  label: string;
  run: (entry: OpenworkWorkspaceCatalogEntry) => void;
};

type WorkspaceFileTreeProps = {
  client: OpenworkServerClient;
  workspaceId: string;
  workspaceName: string;
  selectedPath: string;
  onOpenFile: (entry: OpenworkWorkspaceCatalogEntry) => void;
  fileActions?: readonly WorkspaceFileAction[];
  entries?: OpenworkWorkspaceCatalogEntry[];
  onExpandDirectory?: (path: string) => void;
  onSelectEntry?: (entry: OpenworkWorkspaceCatalogEntry) => void;
  managed?: boolean;
  filter?: string;
};

/**
 * Pierre slots context-menu content into the tree host's light DOM, so the
 * document stylesheet (Tailwind) applies. Built imperatively because the
 * composition API expects a plain HTMLElement.
 */
function buildFileContextMenu(
  entry: OpenworkWorkspaceCatalogEntry,
  actions: readonly WorkspaceFileAction[],
  close: () => void,
) {
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  menu.className = "bg-popover text-popover-foreground min-w-36 rounded-lg border border-border p-1 shadow-md";
  for (const action of actions) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.className = "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground flex w-full items-center rounded-md px-2 py-1.5 text-start text-xs outline-none";
    item.textContent = action.label;
    item.addEventListener("click", () => {
      close();
      action.run(entry);
    });
    menu.appendChild(item);
  }
  return menu;
}

function treePath(entry: OpenworkWorkspaceCatalogEntry) {
  return entry.kind === "dir" ? `${entry.path}/` : entry.path;
}

export function WorkspaceFileTree({ client, workspaceId, workspaceName, selectedPath, onOpenFile, fileActions, entries: suppliedEntries, onExpandDirectory, onSelectEntry, managed, filter }: WorkspaceFileTreeProps) {
  const showNativeMenu = useNativeContextMenu();
  const showNativeMenuRef = useRef(showNativeMenu);
  showNativeMenuRef.current = showNativeMenu;
  const query = useQuery({
    queryKey: ["workspace-file-tree", workspaceId] as const,
    queryFn: () => client.listWorkspaceFiles(workspaceId),
    enabled: !managed,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const entries = suppliedEntries ?? query.data?.items ?? [];
  const entriesByPath = useMemo(() => new Map(entries.map((entry) => [entry.path, entry])), [entries]);
  const entriesByPathRef = useRef(entriesByPath);
  entriesByPathRef.current = entriesByPath;
  const fileActionsRef = useRef(fileActions);
  fileActionsRef.current = fileActions;
  const paths = useMemo(() => entries.map(treePath), [entries]);
  const syncingSelection = useRef(false);
  const callbacksRef = useRef({ onOpenFile, onSelectEntry, onExpandDirectory });
  callbacksRef.current = { onOpenFile, onSelectEntry, onExpandDirectory };
  const { model } = useFileTree({
    // useFileTree captures options on first render, so callbacks read refs.
    composition: {
      contextMenu: {
        triggerMode: "both",
        buttonVisibility: "when-needed",
        onOpen: (item, context) => {
          const show = showNativeMenuRef.current;
          if (!show) return;
          // Pierre supplies identity and positioning; no shadow-DOM inspection.
          context.close();
          if (item.kind !== "file" && !managed) return;
          const entry = entriesByPathRef.current.get(item.path.replace(/\/$/, ""));
          const actions = fileActionsRef.current ?? [];
          if (!entry || actions.length === 0) return;
          void show(actions.map((action) => ({
            type: "item", id: action.id, label: action.label, onSelect: () => action.run(entry),
          })), { point: { x: context.anchorRect.left, y: context.anchorRect.bottom } });
        },
        render: (item, context) => {
          if (showNativeMenuRef.current) return null;
          if (item.kind !== "file" && !managed) return null;
          const entry = entriesByPathRef.current.get(item.path.replace(/\/$/, ""));
          const actions = fileActionsRef.current ?? [];
          if (!entry || actions.length === 0) return null;
          return buildFileContextMenu(entry, actions, () => context.close());
        },
      },
    },
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: !managed,
    initialExpansion: managed ? 0 : 1,
    onSelectionChange: (selectedPaths) => {
      if (syncingSelection.current) return;
      const path = selectedPaths.at(-1)?.replace(/\/$/, "");
      const entry = path ? entriesByPathRef.current.get(path) : undefined;
      if (entry) callbacksRef.current.onSelectEntry?.(entry);
      if (entry?.kind === "file") callbacksRef.current.onOpenFile(entry);
    },
    paths: [],
    search: false,
    unsafeCSS: TREE_CSS,
  });
  const search = useFileTreeSearch(model);

  useEffect(() => {
    const expanded = entries.filter(entry => entry.kind === "dir" && (() => { const item = model.getItem(entry.path); return item && "isExpanded" in item && item.isExpanded(); })()).map(entry => entry.path + "/");
    syncingSelection.current = true;
    if (managed) model.resetPaths(paths, { initialExpandedPaths: expanded });
    else model.resetPaths(paths);
    syncingSelection.current = false;
  }, [model, paths]);

  useEffect(() => model.subscribe(() => {
    for (const entry of entriesByPathRef.current.values()) {
      const item = model.getItem(entry.path);
      if (entry.kind === "dir" && item && "isExpanded" in item && item.isExpanded()) callbacksRef.current.onExpandDirectory?.(entry.path);
    }
  }), [model]);

  useEffect(() => { if (managed) model.setSearch(filter?.trim() || null); }, [model, managed, filter]);

  useEffect(() => {
    const selected = model.getItem(selectedPath);
    if (!selected) return;
    syncingSelection.current = true;
    for (const path of model.getSelectedPaths()) model.getItem(path)?.deselect();
    selected.select();
    syncingSelection.current = false;
  }, [model, paths, selectedPath]);

  return (
    <aside
      className={cn("flex h-full min-h-0 shrink-0 flex-col bg-muted/20", managed ? "w-full" : "w-40 border-r border-border")}
      data-workspace-file-tree
      data-workspace-file-count={entries.length}
    >
      {!managed ? <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-1.5">
        <InputGroup className="h-7 min-w-0 flex-1 bg-background">
          <InputGroupAddon align="inline-start"><Search /></InputGroupAddon>
          <InputGroupInput
            aria-label={`Search ${workspaceName} files`}
            placeholder={t("ui.179fed85ec50")}
            value={search.value}
            onChange={(event) => {
              const value = event.target.value;
              if (value.trim()) search.setValue(value);
              else search.close();
            }}
          />
        </InputGroup>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("ui.fe4d202224b5")}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={cn(query.isFetching && "animate-spin")} />
        </Button>
      </div> : null}
      {query.isError && !managed ? (
        <p role="alert" className="p-3 text-xs text-dls-secondary">{t("ui.d38375451174")}</p>
      ) : (
        <FileTree
          model={model}
          aria-label={`${workspaceName} files`}
          className="min-h-0 flex-1 overflow-hidden"
          style={{ ["--trees-fg-override" as string]: "var(--foreground)" }}
        />
      )}
      {!managed && query.data?.incomplete ? (
        <p role="status" className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">{t("ui.3b9f8e226f6b")}</p>
      ) : null}
    </aside>
  );
}
