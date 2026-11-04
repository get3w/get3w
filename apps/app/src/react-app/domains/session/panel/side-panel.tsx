import { t } from "@/i18n";
import { BuiltMcpAppPanel } from "../../apps/built-mcp-app-panel";
/** @jsxImportSource react */
import * as React from "react";
import {
  Blocks,
  ArrowLeft,
  ArrowRight,
  Globe,
  Loader2,
  MessagesSquare,
  Maximize2,
  PictureInPicture2,
  ShieldOff,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import { useDragControls } from "motion/react";
import { AGENT_VIEWPORTS, type AgentViewportKey } from "@openwork/browser-tabs";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { PanelTab, PanelTabClose, PanelTabItem, PanelTabList } from "@/components/panel-tabs";
import { Button } from "@/components/ui/button";
import { TaskRecovery } from "@/components/chat/task-recovery";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { ArtifactIcon } from "../artifacts/artifact-icon";
import { AppArtifact } from "../../apps/app-artifact";
import { ArtifactPanel } from "../artifacts/artifact-panel";
import { RemoteThreadPanel } from "../remote-threads/remote-thread-panel";
import {
  type BrowserPanelTab,
  usePanelTabStore,
  type PanelTab as PanelTabEntry,
  useActivePanelTab,
  useSessionPanelState,
} from "./panel-tab-store";
import { useControlAction, type OpenworkControlAction } from "../../../shell/control/control-provider";
import type { OpenTarget } from "../artifacts/open-target";
import type { OpenTargetOptions } from "@/lib/target-provider";
import { useSidePanelTabs } from "./use-side-panel-tabs";
import { handlePanelEscape, PanelEmpty } from "./panel-empty";
import {
  getElectronBrowser,
  getNativeMenuPoint,
  hasNativeBrowserOccluder,
} from "./utils";
import { computeBrowserBounds, createBrowserBoundsSync } from "./browser-bounds-sync";
import { browserOperationLabels } from "./browser-status";
import type { BrowserPresentationMode } from "./browser-presentation-store";
import { chooseAgentViewport, storedAgentViewport } from "./agent-viewport";

/** Floating browser presentation controls, present only while that feature is on. */
export type BrowserPresentationControls = {
  onPresent: (mode: BrowserPresentationMode) => void;
};

type SidePanelProps = {
  sessionId: string;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  workspaceRoot: string;
  onOpenTarget?: (target: OpenTarget, options?: OpenTargetOptions) => void;
  isLocalWorkspace?: boolean;
  onClose: () => void;
  onOpenExtensions?: () => void;
  /** Floating browser presentation; undefined keeps the docked-only browser. */
  browserPresentation?: BrowserPresentationControls;
  /** The browser is shown full screen: keep its tab but not a second native view here. */
  browserShownElsewhere?: boolean;
};

// HMR can remount this module without unmounting BrowserPanelContent, leaving
// the native Electron browser overlay visible — hide it before the module reloads.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    getElectronBrowser()?.hide?.();
  });
}

/** The size pages lay out at while the agent works, like Chrome's device toolbar. */
function AgentViewportMenu({ viewport }: { viewport: { key: AgentViewportKey; scale: number } | null }) {
  const [chosen, setChosen] = React.useState(storedAgentViewport);
  const active = viewport?.key ?? chosen;
  return (
    <Popover>
      <PopoverTrigger
        render={(
          <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-xs text-muted-foreground"
            aria-label={`Agent page size: ${AGENT_VIEWPORTS[active].label}. Change it`} data-testid="browser-agent-page-size">
            {AGENT_VIEWPORTS[active].label}{viewport && viewport.scale < 1 ? ` · ${Math.round(viewport.scale * 100)}%` : ""}
          </Button>
        )}
      />
      <PopoverContent align="end" side="bottom" sideOffset={8} className="w-64 gap-0 p-1">
        <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">
          {t("ui.86c195240e8d")}
        </p>
        {(Object.keys(AGENT_VIEWPORTS) as AgentViewportKey[]).map((key) => (
          <button key={key} type="button" aria-pressed={key === active} data-testid={`browser-agent-page-size-${key}`}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted aria-pressed:bg-muted"
            onClick={() => { setChosen(key); chooseAgentViewport(key); }}>
            <span className="font-medium">{AGENT_VIEWPORTS[key].label}</span>
            <span className="text-muted-foreground">
              {AGENT_VIEWPORTS[key].fitsPanel ? t("ui.a03ca5129c73") : `${AGENT_VIEWPORTS[key].width} × ${AGENT_VIEWPORTS[key].height}`}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const MARKDOWN_PRIMITIVE_ARTIFACT_CONTENT = `# Artifact Markdown Proof

The artifact preview keeps **outside-chat Markdown** readable with inline \`surface renderer\`, a fenced code block, and [Get3W](https://get3w.com).

\`\`\`ts
const surface = "shared markdown primitive";
console.log(surface);
\`\`\`

\`\`\`mermaid
flowchart LR
  ArtifactStart[Artifact Mermaid Start] --> ArtifactFinish[Artifact Mermaid Finish]
\`\`\``;

const STANDALONE_MERMAID_ARTIFACT_CONTENT = `flowchart TD
  StandaloneStart[Standalone Mermaid] --> StandaloneFinish[Rendered artifact]`;

type SidePanelTabProps = {
  tab: PanelTabEntry;
  active: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tab: PanelTabEntry) => void;
};

function SidePanelTab({ tab, active, onSelect, onClose }: SidePanelTabProps) {
  const dragControls = useDragControls();
  const tabRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (active) {
      tabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [active]);

  const showBrowserTabContextMenu = (point?: { clientX: number; clientY: number }) => {
    void getElectronBrowser()?.showTabContextMenu?.(
      tab.id,
      getNativeMenuPoint(tabRef.current, point),
    );
  };

  return (
    <PanelTabItem
      value={tab.id}
      id={tab.id}
      dragControls={tab.type === "browser" ? dragControls : undefined}
      onContextMenu={tab.type === "browser" ? (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        showBrowserTabContextMenu({ clientX: event.clientX, clientY: event.clientY });
      } : undefined}
      // Middle-click closes a tab, as in a browser; stopping mousedown keeps it from starting autoscroll.
      onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 1) return;
        event.preventDefault();
        onClose(tab);
      }}
    >
      <div ref={tabRef} className="relative" data-browser-shortcut-tab={tab.type === "browser" ? tab.id : undefined}>
        <PanelTab
          active={active}
          onClick={() => onSelect(tab.id)}
          onPointerDown={tab.type === "browser" ? (event) => {
            if (event.button !== 0) {
              return;
            }

            dragControls.start(event);
          } : undefined}
          onKeyDown={tab.type === "browser" ? (event: React.KeyboardEvent<HTMLButtonElement>) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
              return;
            }

            event.preventDefault();
            showBrowserTabContextMenu();
          } : undefined}
          title={tab.label}
          aria-label={`Select tab: ${tab.label}`}
        >
          {tab.type === "browser" ? (
            tab.favicon ? (
              <img src={tab.favicon} alt="" className="size-3.5 shrink-0 rounded-[2px]" />
            ) : tab.status === "loading" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Globe />
            )
          ) : (tab.type === "app" || tab.type === "mcp-app") ? <Blocks /> : tab.type === "remote-thread" ? <MessagesSquare /> : (
            <ArtifactIcon type={tab.preview} />
          )}
          <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>
        </PanelTab>
        <PanelTabClose
          active={active}
          label={tab.label}
          onClose={() => onClose(tab)}
        />
      </div>
    </PanelTabItem>
  );
}

type BrowserPanelContentProps = {
  sessionId: string;
  tab: BrowserPanelTab;
  onClose: () => void;
  /** Where this content is shown and how to move it, with the floating browser feature on. */
  presentation?: BrowserPresentationControls & { mode: "side" | "fullscreen" };
};

export function BrowserPanelContent({
  sessionId,
  tab,
  onClose,
  presentation,
}: BrowserPanelContentProps) {
  const isAvailable = Boolean(getElectronBrowser());
  const suspended = tab.status === "suspended";
  const busy = tab.status === "suspending" || tab.status === "restoring";
  const pageFailure = tab.loadError?.code === "page_load_failed" ? tab.loadError : null;
  const blockedSite = tab.loadError?.code === "blocked_by_organization" ? tab.loadError : null;
  const [urlInput, setUrlInput] = React.useState(tab.url);
  const urlFocusedRef = React.useRef(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const urlInputRef = React.useRef<HTMLInputElement>(null);
  const [failure, setFailure] = React.useState<{ owner: string; title: string; details: string } | null>(null);
  const failureOwner = JSON.stringify([sessionId, tab.id]);
  const reportFailure = React.useCallback((title: string, error: unknown) => {
    setFailure({ owner: failureOwner, title, details: error instanceof Error ? error.message : String(error) });
  }, [failureOwner]);

  React.useEffect(() => {
    if (!urlFocusedRef.current) {
      setUrlInput(tab.url);
    }
  }, [tab.id, tab.url]);

  const navigate = React.useCallback(() => {
    void getElectronBrowser()?.navigate?.(urlInput).catch((error: unknown) => {
      reportFailure("Could not open this page. Check the address and try again.", error);
    });
  }, [urlInput, reportFailure]);
  const extendedOccluders = presentation !== undefined;

  const back = React.useCallback(() => {
    void getElectronBrowser()?.back?.().catch((error: unknown) => {
      reportFailure("Could not go back. Try again.", error);
    });
  }, [reportFailure]);

  const forward = React.useCallback(() => {
    void getElectronBrowser()?.forward?.().catch((error: unknown) => {
      reportFailure("Could not go forward. Try again.", error);
    });
  }, [reportFailure]);

  const reload = React.useCallback(() => {
    const browser = getElectronBrowser();
    void (suspended ? browser?.selectTab?.(tab.id) : browser?.reload?.())?.catch((error: unknown) => {
      reportFailure("Could not reload this page. Try again.", error);
    });
  }, [suspended, tab.id, reportFailure]);

  const handleUrlKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      navigate();
      urlInputRef.current?.blur();
    }
  }, [navigate]);

  React.useLayoutEffect(() => {
    const browser = getElectronBrowser();
    const content = contentRef.current;

    if (!browser || !content || !isAvailable) {
      browser?.hide?.();
      return;
    }

    let disposed = false;
    let ready = false;
    let boundsFrame: number | null = null;
    const boundsSync = createBrowserBoundsSync(browser, sessionId, (error) => {
      reportFailure("Could not show the browser. Try reopening this tab.", error);
    });

    const scheduleBounds = () => {
      if (!disposed && ready && boundsFrame === null) {
        boundsFrame = window.requestAnimationFrame(watchBounds);
      }
    };

    const resetNativeView = async () => {
      // This hide only stages fresh geometry; it is not leaving browser focus.
      await browser.hide?.({ preserveShortcutFocus: true });

      if (disposed) {
        return;
      }

      ready = true;
      scheduleBounds();
    };

    const syncBounds = () => {
      if (!ready || disposed) return;
      const bounds = computeBrowserBounds(content);
      const occluded = extendedOccluders
        ? hasNativeBrowserOccluder({ bounds, exclude: content.closest("[data-browser-fullscreen-dialog]") })
        : hasNativeBrowserOccluder();
      boundsSync.sync(bounds, window.devicePixelRatio, occluded);
    };

    const invalidateBounds = () => {
      boundsSync.invalidate();
      scheduleBounds();
    };

    const watchBounds = () => {
      boundsFrame = null;
      syncBounds();
      // Position-only layout changes and dialog occlusion also need tracking.
      scheduleBounds();
    };

    void resetNativeView();

    // Panel constraints can settle in ResizeObserver after this frame's RAF.
    const observer = new ResizeObserver(syncBounds);
    observer.observe(content);
    window.addEventListener("resize", invalidateBounds);
    window.addEventListener("openwork:browser:bounds-invalidated", invalidateBounds);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", invalidateBounds);
      window.removeEventListener("openwork:browser:bounds-invalidated", invalidateBounds);

      if (boundsFrame !== null) {
        window.cancelAnimationFrame(boundsFrame);
      }

      boundsSync.dispose();
    };
  }, [isAvailable, sessionId, reportFailure, extendedOccluders]);

  return (
    <>
      {failure?.owner === failureOwner ? <div className="shrink-0 px-3 py-2"><TaskRecovery compact title={failure.title} technicalDetails={failure.details}
        actions={<Button variant="ghost" size="xs" onClick={() => setFailure(null)}>{t("ui.48845bff334a")}</Button>} /></div> : null}
      {isAvailable && tab.browserTask ? (
        <div data-browser-shortcut-tab={tab.id} className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
          <span className="shrink-0 font-medium">{t("ui.8541ff157f43")}</span>
          <span role="status" className="min-w-0 flex-1 truncate text-muted-foreground">
            {tab.browserTask?.status === "paused" ? t("ui.a4abe8071d8d") : tab.browserTask?.status === "running" ? browserOperationLabels[tab.browserTask.operation ?? ""] ?? t("ui.1f6972803f00") : tab.browserTask?.status === "needs_attention" ? browserOperationLabels[tab.browserTask.operation ?? ""] ?? t("ui.267ca815bb72") : t("ui.5559f0e98115")}
          </span>
          <AgentViewportMenu viewport={tab.agentViewport ?? null} />
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs"
            onClick={() => { void window.__OPENWORK_ELECTRON__?.browser?.taskControl?.(tab.id, tab.browserTask?.status === "paused" ? "resume" : "pause"); }}>
            {tab.browserTask?.status === "paused" ? t("ui.2be4eb0af810") : t("ui.66abfef02cd8")}
          </Button>
        </div>
      ) : null}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-background px-2 mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
        {isAvailable ? (
          <div data-browser-shortcut-tab={tab.id} className="flex min-w-0 flex-1 items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={back}
                    disabled={suspended || busy || !tab.canGoBack}
                    aria-label={t("ui.6aadac2f2b7a")}
                  >
                    <ArrowLeft />
                  </Button>
                )}
              />
              <TooltipContent>{t("ui.76900f1bfd16")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={forward}
                    disabled={suspended || busy || !tab.canGoForward}
                    aria-label={t("ui.8121136d7ccf")}
                  >
                    <ArrowRight />
                  </Button>
                )}
              />
              <TooltipContent>{t("ui.f1c65e14817e")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={reload}
                    disabled={busy}
                    aria-label={t("ui.437d0d63bfbd")}
                  >
                    {tab.status === "loading" || busy ? <Loader2 className="animate-spin" /> : <RotateCw />}
                  </Button>
                )}
              />
              <TooltipContent>{t("ui.bdc090ec61e3")}</TooltipContent>
            </Tooltip>
            <InputGroup className="mx-1 h-7 flex-1 rounded-md">
              <InputGroupInput
                ref={urlInputRef}
                type="text"
                className="h-7"
                value={urlInput}
                disabled={suspended || busy}
                onChange={(event) => setUrlInput(event.target.value)}
                onKeyDown={handleUrlKeyDown}
                onFocus={() => {
                  urlFocusedRef.current = true;
                  urlInputRef.current?.select();
                }}
                onBlur={() => {
                  urlFocusedRef.current = false;
                }}
                placeholder={t("ui.48ac254ed2a2")}
                spellCheck={false}
                autoComplete="off"
              />
              <InputGroupAddon align="inline-start" className="ps-2">
                <Globe />
              </InputGroupAddon>
            </InputGroup>
            {tab.siteToolCount > 0 ? (
              <Popover>
                <PopoverTrigger
                  render={(
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 shrink-0 rounded-md bg-muted/60 px-2 text-[11px] font-medium"
                      aria-label={`${tab.siteToolCount} site ${tab.siteToolCount === 1 ? "tool" : "tools"} available; inspect site tools and activity`}
                    >
                      {tab.siteToolCount} {tab.siteToolCount === 1 ? "tool" : "tools"}
                    </Button>
                  )}
                />
                <PopoverContent align="end" side="bottom" sideOffset={8} className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold">{t("ui.6f48c2b2d059")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("ui.9aa472648b58")}
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto px-4 py-2">
                    {(tab.siteTools ?? []).map((tool) => (
                      <div key={`${tool.origin}:${tool.name}`} className="border-b border-border/60 py-2 last:border-b-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-xs font-medium">{tool.title || tool.name}</p>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {tool.readOnly ? t("ui.45383176f529") : t("ui.37916b2087e7")}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{tool.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{tool.origin}</p>
                      </div>
                    ))}
                  </div>
                  {(tab.siteToolActivity ?? []).length > 0 ? (
                    <div className="border-t border-border px-4 py-3">
                      <p className="mb-1.5 text-xs font-semibold">{t("ui.6cb44b56336a")}</p>
                      {(tab.siteToolActivity ?? []).slice(0, 5).map((activity, index) => (
                        <div key={`${activity.at}:${activity.name}:${index}`} className="flex items-center justify-between gap-3 py-1 text-[10px]">
                          <span className="min-w-0 truncate font-mono">{activity.name}</span>
                          <span className={activity.status === "completed" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                            {activity.status === "completed" ? t("ui.3610231fdcab") : activity.code || t("session.remote_task_status_failed")}
                          </span>
                        </div>
                      ))}
                      <p className="mt-1 text-[10px] text-muted-foreground">{t("ui.4fb2ec040e22")}</p>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        ) : (
          <p className="px-2 text-sm text-muted-foreground">
            {t("ui.fe92c5545f0e")}
          </p>
        )}
        {isAvailable && presentation?.mode === "side" ? (
          <>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button variant="ghost" size="icon-sm" aria-label={t("ui.c581fbf3fe55")} data-testid="browser-mode-float" onClick={() => presentation.onPresent("floating")}>
                    <PictureInPicture2 />
                  </Button>
                )}
              />
              <TooltipContent>{t("ui.b461674f43a1")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button variant="ghost" size="icon-sm" aria-label={t("ui.674fe2acd0d5")} data-testid="browser-mode-fullscreen" onClick={() => presentation.onPresent("fullscreen")}>
                    <Maximize2 />
                  </Button>
                )}
              />
              <TooltipContent>{t("ui.674fe2acd0d5")}</TooltipContent>
            </Tooltip>
          </>
        ) : null}
        {presentation?.mode === "fullscreen" ? null : (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title={t("ui.a600b900f83d")}
            aria-label={t("ui.a600b900f83d")}
          >
            <X />
          </Button>
        )}
      </div>
      {tab.loadError && !pageFailure && !blockedSite ? (
        <div data-browser-shortcut-tab={tab.id} role="alert" className="shrink-0 border-b border-border bg-muted px-3 py-2 text-xs">
          {tab.loadError.message}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isAvailable ? (
          // A page the agent controls is drawn scaled inside this area; the rest frames it.
          <div ref={contentRef} data-browser-shortcut-tab={tab.id} className={`h-full overflow-hidden${tab.agentViewport ? " bg-muted" : ""}`}>
            {blockedSite && !suspended ? (
              <BlockedSitePage url={blockedSite.url} message={blockedSite.message} errorDescription={blockedSite.errorDescription} />
            ) : pageFailure && !suspended ? (
              <div className="flex h-full items-center justify-center p-6" data-testid="browser-page-load-error">
                <TaskRecovery
                  compact
                  title={pageFailure.message}
                  technicalDetails={`${pageFailure.errorDescription} (${pageFailure.errorCode})\n${pageFailure.url}`}
                  actions={<Button variant="outline" size="sm" disabled={tab.status === "loading" || busy} onClick={reload}>{t("ui.bdc090ec61e3")}</Button>}
                />
              </div>
            ) : suspended ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm font-medium">{t("ui.998ab8625d12")}</p>
                <p className="text-sm text-muted-foreground">{t("ui.60d62a4f8962")}</p>
                <Button variant="outline" size="sm" onClick={reload}>{t("ui.bdc090ec61e3")}</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}


export function SidePanel({
  sessionId,
  client,
  workspaceId,
  workspaceRoot,
  onOpenTarget,
  isLocalWorkspace,
  onClose,
  onOpenExtensions,
  browserPresentation,
  browserShownElsewhere = false,
}: SidePanelProps) {
  const { tabs } = useSessionPanelState(sessionId);
  const activeTab = useActivePanelTab(sessionId);
  const isBrowserAvailable = Boolean(getElectronBrowser());

  const { createTab, closeTab, selectTab, reorderTabs } = useSidePanelTabs(sessionId);

  const seedArtifactOverflowControlAction = React.useMemo<OpenworkControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;

    return {
      id: "eval.artifact_tabs.seed_overflow",
      label: t("ui.09168aa54747"),
      description: t("ui.db52e094a32d"),
      sideEffect: "mutation",
      disabled: !client || !workspaceId,
      args: [
        { name: "count", type: "number", description: t("ui.20452dfe5c34") },
        { name: "longNameLast", type: "boolean", description: t("ui.edfa231d7aa8") },
      ],
      previewArgs: { count: 18 },
      execute: async (args) => {
        if (!client || !workspaceId) return { ok: false, error: t("ui.8806adf41a3f") };

        let count = 18;
        if (args && typeof args === "object" && "count" in args && typeof args.count === "number") {
          count = Math.max(12, Math.min(30, Math.floor(args.count)));
        }
        const longNameLast = Boolean(args && typeof args === "object" && "longNameLast" in args && args.longNameLast);

        const targets: OpenTarget[] = [];
        const store = usePanelTabStore.getState();

        for (let index = 1; index <= count; index += 1) {
          const padded = String(index).padStart(2, "0");
          const baseName = longNameLast && index === count
            ? `openwork-self-managed-subscription-and-licensing-overview-very-long-${padded}`
            : `overflow-tab-${padded}`;
          const value = `artifacts/${baseName}.md`;
          const label = `${baseName}.md`;
          const content = `# Overflow tab ${padded}\n\nGenerated by the artifact tab overflow eval.\n`;

          await client.writeWorkspaceFile(workspaceId, { path: value, content, baseUpdatedAt: null });

          const target: OpenTarget = {
            id: `file:${value}`,
            kind: "file",
            value,
            name: label,
            preview: "markdown",
            confidence: 100,
            reason: "eval",
            exists: true,
            size: content.length,
          };

          targets.push(target);
          store.openTab(sessionId, {
            id: target.id,
            type: "artifact",
            label: target.name,
            preview: target.preview,
          });
        }

        store.syncTranscriptArtifacts(sessionId, targets);
        store.selectTab(sessionId, targets[targets.length - 1]?.id ?? "");

        return { ok: true, count: targets.length, activeTabId: targets[targets.length - 1]?.id ?? null };
      },
    };
  }, [client, sessionId, workspaceId]);
  useControlAction(seedArtifactOverflowControlAction);

  const seedMarkdownPrimitiveArtifactControlAction = React.useMemo<OpenworkControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;

    return {
      id: "eval.markdown_primitive.seed_artifact",
      label: t("ui.5a49fd63af23"),
      description: t("ui.59000be0e9a2"),
      sideEffect: "mutation",
      disabled: !client || !workspaceId,
      execute: async (args) => {
        if (!client || !workspaceId) return { ok: false, error: t("ui.8806adf41a3f") };

        const standalone = Boolean(args && typeof args === "object" && "standalone" in args && args.standalone);
        const value = standalone ? "artifacts/standalone-mermaid-proof.mmd" : "artifacts/markdown-primitive-proof.md";
        const name = standalone ? "standalone-mermaid-proof.mmd" : "markdown-primitive-proof.md";
        const content = standalone ? STANDALONE_MERMAID_ARTIFACT_CONTENT : MARKDOWN_PRIMITIVE_ARTIFACT_CONTENT;
        await client.writeWorkspaceFile(workspaceId, {
          path: value,
          content,
          baseUpdatedAt: null,
        });

        const target: OpenTarget = {
          id: `file:${value}`,
          kind: "file",
          value,
          name,
          preview: "markdown",
          confidence: 100,
          reason: "eval",
          exists: true,
          size: content.length,
        };

        const store = usePanelTabStore.getState();
        store.syncTranscriptArtifacts(sessionId, [target]);
        store.openTab(sessionId, { id: target.id, type: "artifact", label: target.name, preview: target.preview });
        store.selectTab(sessionId, target.id);

        return { ok: true, activeTabId: target.id, path: value };
      },
    };
  }, [client, sessionId, workspaceId]);
  useControlAction(seedMarkdownPrimitiveArtifactControlAction);

  const seedPdfArtifactControlAction = React.useMemo<OpenworkControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;

    return {
      id: "eval.artifact_tabs.seed_pdf",
      label: t("ui.97684d5f02be"),
      description: t("ui.0ceaec70fab8"),
      sideEffect: "mutation",
      disabled: !client || !workspaceId,
      execute: async () => {
        if (!client || !workspaceId) return { ok: false, error: t("ui.8806adf41a3f") };

        // Minimal single-page PDF that draws "Get3W PDF" — base64 encoded.
        const pdfBase64 =
          "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAzMDAgMTQ0XS9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUCi9GMSAyNCBUZgo3MiA3MCBUZAooT3BlbldvcmsgUERGKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzEyIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNDA2CiUlRU9G";
        const binary = atob(pdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

        const value = "artifacts/sample-document.pdf";
        await client.writeWorkspaceBinaryFile(workspaceId, { path: value, data: bytes.buffer, baseUpdatedAt: null });

        const target: OpenTarget = {
          id: `file:${value}`,
          kind: "file",
          value,
          name: "sample-document.pdf",
          preview: "pdf",
          confidence: 100,
          reason: "eval",
          exists: true,
          size: bytes.length,
        };

        const store = usePanelTabStore.getState();
        store.syncTranscriptArtifacts(sessionId, [target]);
        store.openTab(sessionId, { id: target.id, type: "artifact", label: target.name, preview: target.preview });
        store.selectTab(sessionId, target.id);

        return { ok: true, activeTabId: target.id };
      },
    };
  }, [client, sessionId, workspaceId]);
  useControlAction(seedPdfArtifactControlAction);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.key !== "Tab" || tabs.length < 2) {
        return;
      }

      const activeIndex = activeTab ? tabs.findIndex((tab) => tab.id === activeTab.id) : -1;
      if (activeIndex === -1) {
        return;
      }

      event.preventDefault();
      const offset = event.shiftKey ? -1 : 1;
      selectTab(tabs[(activeIndex + offset + tabs.length) % tabs.length].id);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, selectTab, tabs]);

  return (
    <TooltipProvider delay={1000}>
      <div
        className="flex h-full flex-col"
        onKeyDownCapture={(event) => {
          if (!handlePanelEscape(event.key, onClose)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {!(tabs.length === 1 && activeTab?.type === "mcp-app") ? <div className="shrink-0 border-b border-border bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
          <div className="flex h-10 items-center gap-1 border-b border-border/60 px-2">
            <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
              <PanelTabList
                values={tabs.map((tab) => tab.id)}
                onReorder={reorderTabs}
              >
                {tabs.map((tab) => (
                  <SidePanelTab
                    key={tab.id}
                    tab={tab}
                    active={tab.id === activeTab?.id}
                    onSelect={selectTab}
                    onClose={closeTab}
                  />
                ))}
              </PanelTabList>
            </div>
            {!activeTab ? <span className="sr-only">{t("ui.5022e10cdce8")}</span> : null}
            {activeTab && isBrowserAvailable ? (
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => createTab()}
                      aria-label={t("ui.1e08fda9c966")}
                    >
                      <Plus />
                    </Button>
                  )}
                />
                <TooltipContent>{t("ui.1e08fda9c966")}</TooltipContent>
              </Tooltip>
            ) : !activeTab ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label={t("ui.a600b900f83d")}
              >
                <X />
              </Button>
            ) : null}
          </div>
        </div> : null}
        {!activeTab ? (
          <PanelEmpty
            onOpenBrowser={isBrowserAvailable ? createTab : undefined}
            onOpenExtensions={onOpenExtensions}
          />
        ) : null}
        {activeTab?.type === "browser" ? (
          browserShownElsewhere ? null : (
            <BrowserPanelContent
              sessionId={sessionId}
              tab={activeTab}
              onClose={onClose}
              presentation={browserPresentation ? { ...browserPresentation, mode: "side" } : undefined}
            />
          )
        ) : activeTab?.type === "mcp-app" ? (
          <BuiltMcpAppPanel key={activeTab.id} tab={activeTab} onClose={onClose} />
        ) : activeTab?.type === "remote-thread" ? (
          <div className="min-h-0 flex-1 overflow-hidden"><RemoteThreadPanel key={activeTab.id} tab={activeTab} /></div>
        ) : activeTab?.type === "app" ? (
          <div className="min-h-0 flex-1 overflow-hidden"><AppArtifact key={activeTab.id} appId={activeTab.appId} revisionId={activeTab.revisionId} receiptId={activeTab.receiptId} onClose={onClose} /></div>
        ) : activeTab?.type === "artifact" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <ArtifactPanel
              sessionId={sessionId}
              tab={activeTab}
              client={client}
              workspaceId={workspaceId}
              workspaceRoot={workspaceRoot}
              onOpenTarget={onOpenTarget}
              isLocalWorkspace={isLocalWorkspace}
              onClose={onClose}
            />
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function siteHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** A site the organization's website rules block, shown like a browser's own blocked-site page. */
function BlockedSitePage({ url, message, errorDescription }: { url: string; message: string; errorDescription: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6" data-testid="browser-blocked-site" role="alert">
      <div className="flex max-w-sm flex-col items-start gap-3">
        <ShieldOff className="size-8 text-muted-foreground" aria-hidden="true" strokeWidth={1.5} />
        <h2 className="text-lg font-medium text-foreground">
          <span className="break-all">{siteHost(url)}</span> {t("ui.eb89f0885fed")}
        </h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="font-mono text-xs text-muted-foreground">{errorDescription}</p>
      </div>
    </div>
  );
}
