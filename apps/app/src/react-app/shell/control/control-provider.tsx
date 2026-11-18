import { requireGet3wSignIn } from "@/react-app/domains/cloud/get3w-account";
import { t } from "@/i18n";
/** @jsxImportSource react */
import {
  createContext,
  useCallback,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import {
  get3wAffordanceFailureCodeSchema,
  type Get3wAffordanceDescriptor,
  type Get3wAffordanceEffects,
  type Get3wAffordanceFailureCode,
  type Get3wAffordanceOrigin,
  type Get3wAffordanceRequest,
  type Get3wAffordanceResult,
} from "@get3w/types/get3w-affordance";
import type { Get3wContextSnapshot } from "@get3w/types/get3w-context";
import { undeclaredArgsError } from "./undeclared-args";
import { useUiControlMailbox } from "./use-ui-control-mailbox";

export type Get3wControlSideEffect = "none" | "navigation" | "mutation" | "external";

export type Get3wControlActionArg = {
  name: string;
  type?: "string" | "number" | "boolean" | "object" | "array" | "unknown";
  required?: boolean;
  description?: string;
};

export type Get3wControlActionMetadata = {
  id: string;
  label: string;
  description?: string;
  kind: "query" | "command";
  effects: Get3wAffordanceEffects;
  sideEffect: Get3wControlSideEffect;
  requiresConfirmation: boolean;
  requiresArgs: boolean;
  hasPreviewArgs: boolean;
  previewArgs?: unknown;
  args?: Get3wControlActionArg[];
  disabled: boolean;
  busy: boolean;
};

export type Get3wControlSnapshot = {
  version: number;
  enabled: boolean;
  route: string;
  status: "off" | "ready" | "acting";
  busyActionId: string | null;
  narration: string;
  actions: Get3wControlActionMetadata[];
};

export type Get3wControlResult =
  | { ok: true; actionId: string; result?: unknown }
  | { ok: false; actionId: string; error: string; code?: Get3wAffordanceFailureCode; hint?: string };

export type Get3wControlHelpers = {
  setNarration: (text: string) => void;
  /** The conversation whose agent issued the request, when it came through the agent bridge. */
  origin?: Get3wAffordanceOrigin;
  /**
   * True when an agent issued the command through the server bridge, which
   * answers within seconds and has no person on the other end. A warning for
   * that request goes back through the agent's own conversation as a
   * structured result, never through a dialog.
   */
  bridged: boolean;
};

export type Get3wControlTargetRef = {
  readonly current: HTMLElement | null;
};

export type Get3wControlAction = {
  id: string;
  label: string;
  description?: string;
  kind?: "query" | "command";
  effects?: Get3wAffordanceEffects;
  sideEffect?: Get3wControlSideEffect;
  requiresConfirmation?: boolean;
  requiresArgs?: boolean;
  args?: Get3wControlActionArg[];
  previewArgs?: unknown;
  disabled?: boolean;
  targetRef?: Get3wControlTargetRef;
  execute: (args: unknown, helpers: Get3wControlHelpers) => unknown | Promise<unknown>;
};

type ControlActionRef = {
  readonly current: Get3wControlAction | null;
};

type RegisteredAction = {
  id: string;
  order: number;
  token: symbol;
  ref: ControlActionRef;
};

type SpotlightState = {
  visible: boolean;
  phase: "target" | "press";
  rect: { x: number; y: number; width: number; height: number } | null;
};

type Get3wControlContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  route: string;
  narration: string;
  busyActionId: string | null;
  actions: Get3wControlActionMetadata[];
  registerAction: (actionId: string, actionRef: ControlActionRef) => () => void;
  executeAction: (actionId: string, args?: unknown, origin?: Get3wAffordanceOrigin) => Promise<Get3wControlResult>;
  publishContext: (context: Get3wContextSnapshot) => void;
  snapshot: () => Get3wControlSnapshot;
};

export type Get3wControlAPI = {
  version: number;
  snapshot: () => Get3wControlSnapshot;
  listActions: () => Get3wControlActionMetadata[];
  execute: (actionId: string, args?: unknown) => Promise<Get3wControlResult>;
  context: () => Get3wContextSnapshot;
  query: (request: Get3wAffordanceRequest) => Promise<Get3wAffordanceResult>;
  command: (request: Get3wAffordanceRequest) => Promise<Get3wAffordanceResult>;
  setEnabled: (enabled: boolean) => void;
  subscribe: (listener: (snapshot: Get3wControlSnapshot) => void) => () => void;
};

declare global {
  interface Window {
    __get3wControl?: Get3wControlAPI;
  }
}

const CONTROL_API_VERSION = 2;
const Get3wControlContext = createContext<Get3wControlContextValue | null>(null);
const SPOTLIGHT_TIMING_MS = Object.freeze({
  missingTarget: 80,
  scrollIntoView: 180,
  target: 260,
  press: 130,
  release: 80,
  done: 280,
});

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function returnedActionError(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const payload: { ok?: unknown; error?: unknown; code?: unknown; hint?: unknown } = result;
  if (payload.ok !== false) return null;
  const code = get3wAffordanceFailureCodeSchema.safeParse(payload.code);
  return {
    error: typeof payload.error === "string" && payload.error.trim()
      ? payload.error
      : t("ui.6b96d496dd09"),
    ...(code.success ? { code: code.data } : {}),
    ...(typeof payload.hint === "string" && payload.hint.trim() ? { hint: payload.hint } : {}),
  };
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function effectsForSideEffect(sideEffect: Get3wControlSideEffect): Get3wAffordanceEffects {
  if (sideEffect === "navigation") {
    return { data: "none", ui: "navigate", external: false };
  }
  if (sideEffect === "mutation") {
    return { data: "write", ui: "none", external: false };
  }
  if (sideEffect === "external") {
    return { data: "none", ui: "none", external: true };
  }
  return { data: "none", ui: "none", external: false };
}

function metadataForAction(registered: RegisteredAction, busyActionId: string | null): Get3wControlActionMetadata {
  const action = registered.ref.current;
  const sideEffect = action?.sideEffect ?? "none";
  return {
    id: registered.id,
    label: action?.label ?? registered.id,
    description: action?.description,
    kind: action?.kind ?? "command",
    effects: action?.effects ?? effectsForSideEffect(sideEffect),
    sideEffect,
    requiresConfirmation: action?.requiresConfirmation === true,
    requiresArgs: action?.requiresArgs === true,
    hasPreviewArgs: action?.previewArgs !== undefined,
    previewArgs: action?.previewArgs,
    args: action?.args,
    disabled: action?.disabled === true,
    busy: busyActionId === registered.id,
  };
}

function affordanceForAction(action: Get3wControlActionMetadata): Get3wAffordanceDescriptor {
  return {
    id: action.id,
    kind: action.kind,
    title: action.label,
    description: action.description ?? action.label,
    provider: { id: "get3w-ui", kind: "builtin" },
    arguments: (action.args ?? []).map((argument) => ({
      name: argument.name,
      type: argument.type ?? "unknown",
      required: argument.required === true,
      ...(argument.description ? { description: argument.description } : {}),
    })),
    effects: action.effects,
    confirmation: action.requiresConfirmation ? "destructive" : "never",
    availability: {
      enabled: !action.disabled && !action.busy,
      ...(action.disabled ? { reason: "This action is not available in the current app state." } : {}),
    },
    executor: { kind: "get3w" },
  };
}

function ControlModeSpotlight({ spotlight }: { spotlight: SpotlightState }) {
  const rect = spotlight.rect;
  if (!spotlight.visible || !rect) return null;

  const pad = spotlight.phase === "press" ? 8 : 12;
  return (
    <div
      className="pointer-events-none fixed z-[9998] rounded-[18px] bg-[rgba(var(--dls-accent-rgb),0.1)] shadow-[0_0_0_9999px_rgba(7,10,18,0.08),0_0_36px_rgba(var(--dls-accent-rgb),0.32),inset_0_0_0_1px_rgba(var(--dls-accent-rgb),0.24)] transition-all duration-200 ease-out"
      style={{
        left: `${rect.x - pad}px`,
        top: `${rect.y - pad}px`,
        width: `${rect.width + pad * 2}px`,
        height: `${rect.height + pad * 2}px`,
        transform: spotlight.phase === "press" ? "scale(0.985)" : "scale(1)",
      }}
    />
  );
}

export function Get3wControlProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const actionsRef = useRef(new Map<string, RegisteredAction>());
  const listenersRef = useRef(new Set<(snapshot: Get3wControlSnapshot) => void>());
  const contextRef = useRef<Get3wContextSnapshot | null>(null);
  const contextRevisionRef = useRef(0);
  const nextOrderRef = useRef(1);
  const [version, setVersion] = useState(0);
  const [enabledState, setEnabledState] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [narration, setNarration] = useState("Control mode is off.");
  const [spotlight, setSpotlight] = useState<SpotlightState>({ visible: false, phase: "target", rect: null });
  const busyActionIdRef = useRef<string | null>(null);
  const busyActorRef = useRef<string | null>(null);
  const spotlightRunRef = useRef(0);
  const apiRef = useRef<Get3wControlAPI | null>(null);

  const route = `${location.pathname}${location.search}${location.hash}`;
  const enabled = enabledState;
  const status: Get3wControlSnapshot["status"] = !enabled ? "off" : busyActionId ? "acting" : "ready";

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
  }, []);

  const listActionMetadata = useCallback((nextBusyActionId = busyActionId) => {
    return Array.from(actionsRef.current.values())
      .sort((left, right) => left.order - right.order)
      .map((action) => metadataForAction(action, nextBusyActionId));
  }, [busyActionId, version]);

  const actions = useMemo(() => {
    return listActionMetadata();
  }, [listActionMetadata]);

  const snapshot = useCallback((): Get3wControlSnapshot => ({
    version: CONTROL_API_VERSION,
    enabled,
    route,
    status,
    busyActionId,
    narration,
    actions: listActionMetadata(),
  }), [busyActionId, enabled, listActionMetadata, narration, route, status]);

  const publishContext = useCallback((context: Get3wContextSnapshot) => {
    if (contextRef.current === context) return;
    contextRef.current = context;
    contextRevisionRef.current += 1;
  }, []);

  const contextSnapshot = useCallback((): Get3wContextSnapshot => {
    const availableAffordances = listActionMetadata().map(affordanceForAction);
    const published = contextRef.current;
    const revision = contextRevisionRef.current;
    if (published) {
      return {
        ...published,
        revision,
        capturedAt: new Date().toISOString(),
        availableAffordances,
        execution: {
          ...published.execution,
          busyCommandId: busyActionId,
          busyActor: busyActorRef.current,
        },
      };
    }
    return {
      schemaVersion: 1,
      revision,
      capturedAt: new Date().toISOString(),
      screen: { kind: "other", route },
      conversations: { tabs: [], layout: { kind: "empty" }, pinnedSessionIds: [] },
      chrome: {
        sidebarOpen: true,
        applicationMenuVisible: false,
        rightSidebarExpanded: false,
      },
      execution: {
        queries: "parallel",
        commands: "serialized",
        busyCommandId: busyActionId,
        busyActor: busyActorRef.current,
      },
      sidePanel: {
        open: false,
        ownerSessionId: null,
        kind: null,
        tabs: [],
        activeTabId: null,
      },
      resources: [{
        ref: `screen:${route}`,
        kind: "screen",
        title: "Get3W",
        provider: { id: "get3w-ui", kind: "builtin" },
        state: { kind: "other", route },
      }],
      availableAffordances,
      contributions: [],
    };
  }, [busyActionId, listActionMetadata, route]);

  const registerAction = useCallback((actionId: string, actionRef: ControlActionRef) => {
    const token = Symbol(actionId);
    const previous = actionsRef.current.get(actionId);
    actionsRef.current.set(actionId, {
      id: actionId,
      order: previous?.order ?? nextOrderRef.current++,
      token,
      ref: actionRef,
    });
    contextRevisionRef.current += 1;
    setVersion((current) => current + 1);

    return () => {
      const current = actionsRef.current.get(actionId);
      if (current?.token === token) {
        actionsRef.current.delete(actionId);
        contextRevisionRef.current += 1;
        setVersion((value) => value + 1);
      }
    };
  }, []);

  const playTargetChoreography = useCallback(async (action: Get3wControlAction, runId: number) => {
    if (!isBrowser()) return;
    const stillCurrent = () => spotlightRunRef.current === runId;
    const target = action.targetRef?.current;
    if (!target) {
      await wait(SPOTLIGHT_TIMING_MS.missingTarget);
      return;
    }

    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    await wait(SPOTLIGHT_TIMING_MS.scrollIntoView);
    if (!stillCurrent() || !target.isConnected) return;
    const rect = target.getBoundingClientRect();
    setSpotlight({
      visible: true,
      phase: "target",
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
    });
    await wait(SPOTLIGHT_TIMING_MS.target);
    if (!stillCurrent()) return;
    setSpotlight((current) => ({ ...current, phase: "press" }));
    await wait(SPOTLIGHT_TIMING_MS.press);
    if (!stillCurrent()) return;
    setSpotlight((current) => ({ ...current, phase: "target" }));
    await wait(SPOTLIGHT_TIMING_MS.release);
  }, []);

  const executeAction = useCallback(async (
    actionId: string,
    args?: unknown,
    origin?: Get3wAffordanceOrigin,
    bridged = false,
  ): Promise<Get3wControlResult> => {
    if (!requireGet3wSignIn()) return { ok: false, actionId, error: "Sign in to Get3W to continue." };
    const registered = actionsRef.current.get(actionId);
    const action = registered?.ref.current;
    if (!registered || !action) return { ok: false, actionId, error: `Unknown action: ${actionId}` };
    if (action.disabled) return { ok: false, actionId, error: `Action is disabled: ${action.label}` };
    if (busyActionIdRef.current) {
      const actor = busyActorRef.current ? ` for ${busyActorRef.current}` : "";
      return { ok: false, actionId, error: `Already acting: ${busyActionIdRef.current}${actor}` };
    }

    if (action.requiresConfirmation && isBrowser()) {
      const confirmed = window.confirm(`Allow Control Mode to ${action.label}?`);
      if (!confirmed) return { ok: false, actionId, error: "User cancelled action." };
    }

    const runId = spotlightRunRef.current + 1;
    spotlightRunRef.current = runId;
    busyActionIdRef.current = action.id;
    contextRevisionRef.current += 1;
    setEnabled(true);
    setBusyActionId(action.id);
    setNarration(`Moving to ${action.label}…`);

    try {
      await playTargetChoreography(action, runId);
      setNarration(`Running ${action.label}…`);
      const effectiveArgs = args === undefined ? action.previewArgs : args;
      const result = await action.execute(effectiveArgs, { setNarration, origin, bridged });
      const resultError = returnedActionError(result);
      if (resultError) {
        setNarration(`Could not ${action.label}: ${resultError.error}`);
        if (spotlightRunRef.current === runId) {
          setSpotlight({ visible: false, phase: "target", rect: null });
        }
        return { ok: false, actionId, ...resultError };
      }
      setNarration(`Done: ${action.label}`);
      await wait(SPOTLIGHT_TIMING_MS.done);
      if (spotlightRunRef.current === runId) {
        setSpotlight({ visible: false, phase: "target", rect: null });
      }
      return { ok: true, actionId, result };
    } catch (error) {
      const message = describeError(error);
      setNarration(`Could not ${action.label}: ${message}`);
      if (spotlightRunRef.current === runId) {
        setSpotlight({ visible: false, phase: "target", rect: null });
      }
      return { ok: false, actionId, error: message };
    } finally {
      if (busyActionIdRef.current === action.id) busyActionIdRef.current = null;
      contextRevisionRef.current += 1;
      setBusyActionId(null);
    }
  }, [playTargetChoreography, setEnabled]);

  const queryAffordance = useCallback(async (
    request: Get3wAffordanceRequest,
  ): Promise<Get3wAffordanceResult> => {
    const action = actionsRef.current.get(request.id)?.ref.current;
    const revision = contextRevisionRef.current;
    if (!action || action.kind !== "query") {
      return {
        ok: false,
        id: request.id,
        error: `Unknown query: ${request.id}`,
        code: "unavailable",
        revision,
      };
    }
    if (action.disabled) {
      return {
        ok: false,
        id: request.id,
        error: `Query is disabled: ${action.label}`,
        code: "unavailable",
        revision,
      };
    }
    const argsError = undeclaredArgsError(action, request.args);
    if (argsError) return { ok: false, id: request.id, error: argsError, code: "invalid-args", revision };
    try {
      const effectiveArgs = request.args === undefined ? action.previewArgs : request.args;
      const result = await action.execute(effectiveArgs, { setNarration: () => undefined, bridged: false });
      const resultError = returnedActionError(result);
      if (resultError) {
        return {
          ok: false,
          id: request.id,
          error: resultError.error,
          code: resultError.code ?? "failed",
          ...(resultError.hint ? { hint: resultError.hint } : {}),
          revision,
        };
      }
      return {
        ok: true,
        id: request.id,
        result,
        revision,
        effects: action.effects ?? { data: "read", ui: "none", external: false },
      };
    } catch (error) {
      return {
        ok: false,
        id: request.id,
        error: describeError(error),
        code: "failed",
        revision,
      };
    }
  }, []);

  const executeCommand = useCallback(async (
    request: Get3wAffordanceRequest,
  ): Promise<Get3wAffordanceResult> => {
    const action = actionsRef.current.get(request.id)?.ref.current;
    const revision = contextRevisionRef.current;
    if (!action || action.kind === "query") {
      return {
        ok: false,
        id: request.id,
        error: `Unknown command: ${request.id}`,
        code: "unavailable",
        revision,
      };
    }
    if (busyActionIdRef.current) {
      const actor = busyActorRef.current ? ` for ${busyActorRef.current}` : "";
      return {
        ok: false,
        id: request.id,
        error: `Already acting: ${busyActionIdRef.current}${actor}`,
        code: "conflict",
        revision,
      };
    }
    if (request.expectedRevision !== undefined && request.expectedRevision !== revision) {
      return {
        ok: false,
        id: request.id,
        error: `Get3W context changed from revision ${request.expectedRevision} to ${revision}.`,
        code: "conflict",
        revision,
      };
    }
    busyActorRef.current = request.actor ?? null;
    const result = await executeAction(request.id, request.args, request.origin, true);
    if (!busyActionIdRef.current) busyActorRef.current = null;
    if (!result.ok) {
      return {
        ok: false,
        id: request.id,
        error: result.error,
        code: result.code ?? (result.error.startsWith("Already acting:") ? "conflict" : "failed"),
        ...(result.hint ? { hint: result.hint } : {}),
        revision: contextRevisionRef.current,
      };
    }
    const sideEffect = action.sideEffect ?? "none";
    return {
      ok: true,
      id: request.id,
      result: result.result,
      revision: contextRevisionRef.current,
      effects: action.effects ?? effectsForSideEffect(sideEffect),
    };
  }, [executeAction]);

  const value = useMemo<Get3wControlContextValue>(() => ({
    enabled,
    setEnabled,
    route,
    narration,
    busyActionId,
    actions,
    registerAction,
    executeAction,
    publishContext,
    snapshot,
  }), [
    actions,
    busyActionId,
    enabled,
    executeAction,
    narration,
    publishContext,
    registerAction,
    route,
    setEnabled,
    snapshot,
  ]);

  useEffect(() => {
    if (!enabled) {
      setNarration("Control mode is off.");
    } else if (narration === "Control mode is off.") {
      setNarration("Ready. A controller can inspect and run visible actions.");
    }
  }, [enabled, narration]);

  useEffect(() => {
    if (!isBrowser()) return;

    const api: Get3wControlAPI = {
      version: CONTROL_API_VERSION,
      snapshot,
      listActions: () => snapshot().actions,
      execute: executeAction,
      context: contextSnapshot,
      query: queryAffordance,
      command: executeCommand,
      setEnabled,
      subscribe(listener) {
        listenersRef.current.add(listener);
        listener(snapshot());
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    };

    window.__get3wControl = api;
    apiRef.current = api;
    return () => {
      if (window.__get3wControl === api) {
        delete window.__get3wControl;
      }
      if (apiRef.current === api) {
        apiRef.current = null;
      }
    };
  }, [contextSnapshot, executeAction, executeCommand, queryAffordance, setEnabled, snapshot]);

  useUiControlMailbox(apiRef);

  useEffect(() => {
    busyActionIdRef.current = busyActionId;
  }, [busyActionId]);

  useEffect(() => {
    const next = snapshot();
    listenersRef.current.forEach((listener) => listener(next));
  }, [snapshot, version]);

  return (
    <Get3wControlContext.Provider value={value}>
      {children}
      <ControlModeSpotlight spotlight={spotlight} />
    </Get3wControlContext.Provider>
  );
}

export function useGet3wControl() {
  return use(Get3wControlContext);
}

export function usePublishGet3wContext(context: Get3wContextSnapshot) {
  const control = useGet3wControl();
  const publishContext = control?.publishContext;

  useEffect(() => {
    publishContext?.(context);
  }, [context, publishContext]);
}

export function useControlAction(action: Get3wControlAction | null | false | undefined) {
  const control = useGet3wControl();
  const registerAction = control?.registerAction;
  const latestActionRef = useRef<Get3wControlAction | null>(action || null);
  latestActionRef.current = action || null;
  const actionId = action ? action.id : null;

  useEffect(() => {
    if (!registerAction || !actionId) return undefined;
    return registerAction(actionId, latestActionRef);
  }, [actionId, registerAction]);
}

/**
 * Register a dynamic list of control actions. Unlike calling useControlAction
 * per item, this scales to an arbitrary, changing number of actions without
 * violating the rules of hooks. Each action is tracked by its stable id; the
 * latest closure for that id is always used, and removed ids are unregistered.
 */
export function useControlActions(actions: readonly Get3wControlAction[]) {
  const control = useGet3wControl();
  const registerAction = control?.registerAction;

  // One ref per action id, so executeAction always sees the freshest closure.
  const refsById = useRef<Map<string, { current: Get3wControlAction | null }>>(new Map());
  for (const action of actions) {
    const existing = refsById.current.get(action.id);
    if (existing) {
      existing.current = action;
    } else {
      refsById.current.set(action.id, { current: action });
    }
  }

  const ids = actions.map((action) => action.id).join("\u0000");

  useEffect(() => {
    if (!registerAction) return undefined;
    const liveIds = new Set(actions.map((action) => action.id));
    // Drop refs for ids that no longer exist.
    for (const id of Array.from(refsById.current.keys())) {
      if (!liveIds.has(id)) refsById.current.delete(id);
    }
    const cleanups = actions.map((action) => {
      const ref = refsById.current.get(action.id);
      return ref ? registerAction(action.id, ref) : undefined;
    });
    return () => {
      for (const cleanup of cleanups) cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerAction, ids]);
}

import { SETTINGS_TAB_VALUES } from "../../../app/types";
import { settingsNavigationFromPathname } from "../workspace-routes";

const SETTINGS_TABS: ReadonlySet<string> = new Set<string>(
  SETTINGS_TAB_VALUES.filter((tab) => tab !== "extensions"),
);

export function Get3wRouteControlActions() {
  const navigate = useNavigate();
  const location = useLocation();
  // Read through a ref so the action list stays stable across route changes.
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  const openSettingsTab = useCallback((tab: string) => {
    const target = settingsNavigationFromPathname(pathnameRef.current, tab);
    navigate(target.to, { state: target.state });
  }, [navigate]);

  const actions = useMemo<Get3wControlAction[]>(() => [
    {
      id: "route.session",
      label: t("ui.8bf47766c290"),
      description: t("ui.3ae82d747780"),
      sideEffect: "navigation",
      execute: () => navigate("/session"),
    },
    {
      id: "route.settings.general",
      label: t("ui.7a7468a0c860"),
      description: t("ui.3130e1217549"),
      sideEffect: "navigation",
      execute: () => openSettingsTab("general"),
    },
    {
      id: "route.extensions.skills",
      label: t("ui.da9226032375"),
      description: t("ui.1d5c4c6c8c09"),
      sideEffect: "navigation",
      execute: () => navigate("/extensions/skills"),
    },
    {
      id: "route.settings.providers",
      label: t("ui.bbcae46445cf"),
      description: t("ui.9f7dcfa89b07"),
      sideEffect: "navigation",
      execute: () => openSettingsTab("ai"),
    },
    {
      id: "route.settings.authorized_folders",
      label: t("ui.c4ba71b6d25f"),
      description: t("ui.00276885383f"),
      sideEffect: "navigation",
      execute: () => openSettingsTab("permissions"),
    },
    {
      id: "route.settings.appearance",
      label: t("ui.2160cecd1780"),
      description: t("ui.948ab79d99c6"),
      sideEffect: "navigation",
      execute: () => openSettingsTab("appearance"),
    },
    {
      id: "settings.panel.open",
      label: t("ui.a3343ab224d1"),
      description: t("ui.94c0d6d9a3c2"),
      sideEffect: "navigation",
      requiresArgs: true,
      args: [
        {
          name: "panel",
          type: "string",
          required: true,
          description:
            "Settings tab: general | ai | ollama | preferences | permissions | shell | environment | advanced | appearance | computer | updates | recovery | debug | cloud-account | usage | cloud-providers",
        },
      ],
      previewArgs: { panel: "ai" },
      execute: (args) => {
        const requested = (args as { panel?: unknown } | undefined)?.panel;
        const panel = typeof requested === "string" ? requested.trim() : "";
        if (!SETTINGS_TABS.has(panel)) {
          return {
            ok: false,
            error: `Unknown settings panel: ${panel || "(empty)"}. Expected one of ${Array.from(SETTINGS_TABS).join(", ")}.`,
          };
        }
        openSettingsTab(panel);
        return { ok: true, panel };
      },
    },
    {
      id: "route.back",
      label: t("ui.6aadac2f2b7a"),
      description: t("ui.b1c723a3af61"),
      sideEffect: "navigation",
      execute: () => navigate(-1),
    },
    {
      id: "route.forward",
      label: t("ui.8121136d7ccf"),
      description: t("ui.7c67f85d3a3b"),
      sideEffect: "navigation",
      execute: () => navigate(1),
    },
    {
      id: "help.capabilities",
      label: t("ui.ffba42894120"),
      description: t("ui.10edd1dca06a"),
      kind: "query",
      effects: { data: "read", ui: "none", external: false },
      sideEffect: "none",
      execute: () => ({
        capabilities: [
          { id: "browse", label: t("ui.4b93a675d791"), description: t("ui.426ad8c63fd9") },
          { id: "providers", label: t("ui.8b38cbfb21b4"), description: t("ui.e90bd826a13b") },
          { id: "extensions", label: "Library", description: t("ui.8c5cdf660d48") },
          { id: "files", label: t("ui.da255d477f50"), description: t("ui.dd5862679e4d") },
          { id: "code", label: t("ui.f74ea124de15"), description: t("ui.97a10cf427fd") },
          { id: "skills", label: "Skills", description: t("ui.fc3b4f6f95bd") },
          { id: "automations", label: "Automations", description: t("ui.3c9fa20ecd96") },
          { id: "sharing", label: t("ui.31b5c9c03b3d"), description: t("ui.1812d58a1013") },
        ],
        hint: "Use settings.panel.open for settings such as AI providers, and route.extensions.skills to browse Library.",
      }),
    },
  ], [navigate, openSettingsTab]);

  useControlActions(actions);
  return null;
}
