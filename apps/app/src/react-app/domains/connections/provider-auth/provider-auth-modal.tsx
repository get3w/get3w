import { t } from "@/i18n";
/** @jsxImportSource react */
import {
  ChevronLeft,
  Loader2,
  Search,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { openDesktopUrl } from "@/app/lib/desktop";
import { isDesktopRuntime } from "@/app/utils";
import { compareProviders } from "@/app/utils/providers";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "../../../design-system/provider-icon";
import { OrganizationMark, ProviderSectionLabel, ProviderStatus, ProviderTile } from "../../settings/pages/provider-rows";
import { autoProviderSubtitle } from "../../models/model-catalog";
import { showsRetiredOpencodeZen } from "@/app/cloud/desktop-app-restrictions";
import type { SecretFieldHandle } from "@/components/secret-field";
import { SecretTextInput } from "../../../design-system/secret-text-input";
import { TextInput } from "../../../design-system/text-input";
import type {
  ProviderAuthMethod,
  ProviderAuthProvider,
  ProviderOAuthStartResult,
} from "./store";

type ProviderAuthEntry = {
  id: string;
  name: string;
  methods: ProviderAuthMethod[];
  connected: boolean;
  env: string[];
};

type ProviderOAuthSession = ProviderOAuthStartResult & {
  providerId: string;
  methodLabel: string;
};

export const PROVIDER_LABELS: Record<string, string> = {
  openwork: "Get3W",
  opencode: "OpenCode Zen",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openrouter: "OpenRouter",
};

const OPENWORK_MODELS_PROVIDER_ID = "openwork";

export type ProviderAuthModalProps = {
  open: boolean;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  preferredProviderId?: string | null;
  providers: ProviderAuthProvider[];
  connectedProviderIds: string[];
  /** Listed by the engine but without the person's own key (built-in Zen): offered under "Available to add". */
  keylessProviderIds?: ReadonlySet<string>;
  gatewayProviderIds?: ReadonlySet<string>;
  authMethods: Record<string, ProviderAuthMethod[]>;
  onSelect: (providerId: string, methodIndex?: number) => Promise<ProviderOAuthStartResult>;
  onSubmitApiKey: (providerId: string, apiKey: string) => Promise<string | void>;
  onSubmitOAuth: (
    providerId: string,
    methodIndex: number,
    code?: string,
  ) => Promise<{ connected: boolean; pending?: boolean; message?: string }>;
  onRefreshProviders?: () => Promise<unknown>;
  openWorkModelsState?: "included" | "off" | "unavailable";
  organizationName?: string;
  organizationProviderIds?: ReadonlySet<string>;
  organizationProviderCount?: number;
  onOpenDen?: () => void;
  onClose: () => void;
};

export default function ProviderAuthModal(props: ProviderAuthModalProps) {
  const [view, setView] = useState<
    "list" | "method" | "api" | "oauth-code" | "oauth-auto"
  >("list");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  // The key stays in the field until submit takes it; only emptiness is state.
  const apiKeyField = useRef<SecretFieldHandle>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [oauthCodeInput, setOauthCodeInput] = useState("");
  const [oauthSession, setOauthSession] = useState<ProviderOAuthSession | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pollingBusy, setPollingBusy] = useState(false);
  const [oauthAutoBusy, setOauthAutoBusy] = useState(false);
  const [oauthCodeCopied, setOauthCodeCopied] = useState(false);
  const [oauthBrowserOpened, setOauthBrowserOpened] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const isMobile = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const providerButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const returnProviderIdRef = useRef<string | null>(null);
  const previousViewRef = useRef(view);
  const providerPollRef = useRef<number | null>(null);
  const oauthAutoPollRef = useRef<number | null>(null);
  const oauthCodeCopiedResetRef = useRef<number | null>(null);
  const autoOpenedPreferredProviderIdRef = useRef<string | null>(null);

  const formatProviderName = (id: string, fallback?: string) => {
    const named = fallback?.trim();
    if (named) return named;

    const normalized = id.trim();
    const mapped = PROVIDER_LABELS[normalized.toLowerCase()];
    if (mapped) return mapped;

    const cleaned = normalized.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return id;

    return cleaned
      .split(" ")
      .flatMap((word) => {
        if (!word) return [];
        if (/\d/.test(word) || word.length <= 3) {
          return [word.toUpperCase()];
        }
        const lower = word.toLowerCase();
        return [lower.charAt(0).toUpperCase() + lower.slice(1)];
      })
      .join(" ");
  };

  const isOpenAiHeadlessMethod = (method: ProviderAuthMethod) => {
    const label = method.label.toLowerCase();
    return method.type === "oauth" && (label.includes("headless") || label.includes("device"));
  };

  const isOpenAiProvider = (id: string, fallbackName?: string) => {
    const normalizedId = id.trim().toLowerCase();
    const normalizedName = fallbackName?.trim().toLowerCase() ?? "";
    return normalizedId === "openai" || normalizedName === "openai";
  };

  const isAnthropicProvider = (id: string, fallbackName?: string) => {
    const normalizedId = id.trim().toLowerCase();
    const normalizedName = fallbackName?.trim().toLowerCase() ?? "";
    return normalizedId === "anthropic" || normalizedName === "anthropic";
  };

  const isOpencodeZenProvider = (id: string) => id.trim().toLowerCase() === "opencode";

  const OPENCODE_ZEN_KEY_URL = "https://opencode.ai/auth";

  const openExternalUrl = async (url: string) => {
    if (!url) return;
    if (isDesktopRuntime()) {
      await openDesktopUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const isClaudeProMaxMethod = (method: ProviderAuthMethod) => {
    const label = method.label.toLowerCase();
    return method.type === "oauth" && (label.includes("pro/max") || label.includes("create an api key"));
  };

  const entries = useMemo<ProviderAuthEntry[]>(() => {
    const methods = props.authMethods ?? {};
    const connected = new Set(props.connectedProviderIds ?? []);
    const providers = props.providers ?? [];

    const providersById = new Map(providers.map((provider) => [provider.id, provider]));
    const nextEntries = Object.keys(methods)
      .filter((id) => !props.gatewayProviderIds?.has(id))
      .flatMap((id) => {
        const provider = providersById.get(id);
        const entryMethods = (methods[id] ?? []).filter((method) => {
          if (isAnthropicProvider(id, provider?.name) && isClaudeProMaxMethod(method)) {
            return false;
          }
          if (!isOpenAiProvider(id, provider?.name)) return true;
          if (method.type !== "oauth") return true;
          return !isOpenAiHeadlessMethod(method);
        });
        if (entryMethods.length === 0) return [];
        return [{
          id,
          name: formatProviderName(id, provider?.name),
          methods: entryMethods,
          connected: connected.has(id) && !props.keylessProviderIds?.has(id),
          env: Array.isArray(provider?.env) ? provider.env : [],
        } satisfies ProviderAuthEntry];
      })
      .sort(compareProviders);

    return nextEntries.filter((entry) => entry.id !== OPENWORK_MODELS_PROVIDER_ID && entry.id !== "openwork-free");
  }, [props.authMethods, props.connectedProviderIds, props.gatewayProviderIds, props.keylessProviderIds, props.providers]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedProviderId) ?? null,
    [entries, selectedProviderId],
  );

  const resolvedView = selectedEntry ? view : "list";
  const errorMessage = localError ?? props.error;

  // Connected providers lead the list so the two groups render as one flat
  // array — keyboard navigation keeps indexing straight into display order.
  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matched = query
      ? entries.filter((entry) => {
          const methodText = entry.methods.map((method) => method.label || (method.type === "oauth" ? "OAuth" : t("ui.16f0ee47f993"))).join(" ");
          return `${entry.name} ${entry.id} ${methodText}`.toLowerCase().includes(query);
        })
      : entries;
    return [
      ...matched.filter((entry) => entry.connected),
      ...matched.filter((entry) => !entry.connected),
    ];
  }, [entries, searchQuery]);

  const connectedCount = useMemo(
    () => filteredEntries.filter((entry) => entry.connected).length,
    [filteredEntries],
  );

  const oauthInstructions = oauthSession?.authorization.instructions?.trim() ?? "";
  const isOpenAiHeadlessSession = Boolean(
    oauthSession && oauthSession.providerId === "openai" && oauthSession.methodLabel.toLowerCase().includes("headless"),
  );
  const shouldStartOauthAutoPolling =
    props.open &&
    resolvedView === "oauth-auto" &&
    oauthSession &&
    (!isOpenAiHeadlessSession || oauthBrowserOpened);

  const oauthDisplayCode = useMemo(() => {
    if (!oauthInstructions) return "";
    const matched = oauthInstructions.match(/[A-Z0-9]{4}-[A-Z0-9]{4,5}/)?.[0];
    if (matched) return matched;
    if (oauthInstructions.includes(":")) {
      return oauthInstructions.split(":").slice(1).join(":").trim();
    }
    return oauthInstructions;
  }, [oauthInstructions]);

  const methodLabel = (method: ProviderAuthMethod) =>
    method.label || (method.type === "oauth" ? "OAuth" : t("ui.16f0ee47f993"));

  const actionDisabled = props.loading || props.submitting;

  const resetState = () => {
    if (oauthCodeCopiedResetRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(oauthCodeCopiedResetRef.current);
      oauthCodeCopiedResetRef.current = null;
    }
    setView("list");
    setSelectedProviderId(null);
    apiKeyField.current?.clear();
    setHasApiKey(false);
    setOauthCodeInput("");
    setOauthSession(null);
    setSearchQuery("");
    setActiveEntryIndex(0);
    setLocalError(null);
    setOauthCodeCopied(false);
    setOauthBrowserOpened(false);
  };

  const stopProviderPolling = () => {
    if (providerPollRef.current !== null) {
      window.clearInterval(providerPollRef.current);
      providerPollRef.current = null;
    }
  };

  const stopOauthAutoPolling = () => {
    if (oauthAutoPollRef.current !== null) {
      window.clearInterval(oauthAutoPollRef.current);
      oauthAutoPollRef.current = null;
    }
  };

  const handleClose = () => {
    void props.onRefreshProviders?.();
    stopOauthAutoPolling();
    stopProviderPolling();
    resetState();
    props.onClose();
  };

  useEffect(() => {
    if (!props.open) {
      autoOpenedPreferredProviderIdRef.current = null;
      resetState();
    }
  }, [props.open]);

  useEffect(() => {
    if (!props.open || resolvedView !== "list") return;
    const total = filteredEntries.length;
    if (total <= 0) {
      setActiveEntryIndex(0);
      return;
    }
    setActiveEntryIndex((current) => Math.max(0, Math.min(current, total - 1)));
  }, [filteredEntries.length, props.open, resolvedView]);

  useLayoutEffect(() => {
    const previous = previousViewRef.current;
    previousViewRef.current = resolvedView;
    if (!props.open || previous === resolvedView) return;
    const providerButton = returnProviderIdRef.current
      ? providerButtonsRef.current.get(returnProviderIdRef.current) : null;
    const target = resolvedView === "list" ? providerButton ?? titleRef.current : titleRef.current;
    target?.focus({ preventScroll: true });
  }, [props.open, resolvedView]);

  useEffect(() => {
    if (!props.open || props.loading || resolvedView !== "list") return;

    const preferredId = props.preferredProviderId?.trim().toLowerCase() ?? "";
    if (!preferredId || autoOpenedPreferredProviderIdRef.current === preferredId) return;

    const entry = entries.find((item) => item.id.trim().toLowerCase() === preferredId);
    if (!entry) return;

    autoOpenedPreferredProviderIdRef.current = preferredId;
    queueMicrotask(() => {
      handleEntrySelect(entry);
    });
  }, [
    entries,
    props.loading,
    props.open,
    props.preferredProviderId,
    resolvedView,
  ]);

  useEffect(() => {
    return () => {
      stopOauthAutoPolling();
      stopProviderPolling();
      if (oauthCodeCopiedResetRef.current !== null) {
        window.clearTimeout(oauthCodeCopiedResetRef.current);
        oauthCodeCopiedResetRef.current = null;
      }
    };
  }, []);

  const isOauthView = resolvedView === "oauth-code" || resolvedView === "oauth-auto";
  const activeProviderId = oauthSession?.providerId ?? selectedProviderId;
  const isActiveProviderConnected =
    !!activeProviderId && (props.connectedProviderIds ?? []).includes(activeProviderId);

  const pollProviders = async () => {
    const id = activeProviderId;
    if (!id || pollingBusy) return;
    setPollingBusy(true);
    try {
      await props.onRefreshProviders?.();
    } finally {
      setPollingBusy(false);
    }
    if ((props.connectedProviderIds ?? []).includes(id)) {
      handleClose();
    }
  };

  const startProviderPolling = () => {
    if (typeof window === "undefined") return;
    if (providerPollRef.current !== null) return;
    void pollProviders();
    providerPollRef.current = window.setInterval(() => {
      void pollProviders();
    }, 2000);
  };

  useEffect(() => {
    if (!props.open || !isOauthView) {
      stopProviderPolling();
      return;
    }
    if (isActiveProviderConnected) {
      handleClose();
      return;
    }
    startProviderPolling();
  }, [isActiveProviderConnected, isOauthView, props.open]);

  const openOauthUrl = async (url: string) => {
    if (!url) return;
    if (isDesktopRuntime()) {
      await openDesktopUrl(url);
      setOauthBrowserOpened(true);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setOauthBrowserOpened(true);
  };

  const copyOauthDisplayCode = async () => {
    const code = oauthDisplayCode.trim();
    if (!code) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setLocalError("Clipboard is unavailable in this environment.");
      return;
    }
    await navigator.clipboard.writeText(code);
    setOauthCodeCopied(true);
    if (typeof window === "undefined") return;
    if (oauthCodeCopiedResetRef.current !== null) {
      window.clearTimeout(oauthCodeCopiedResetRef.current);
    }
    oauthCodeCopiedResetRef.current = window.setTimeout(() => {
      setOauthCodeCopied(false);
      oauthCodeCopiedResetRef.current = null;
    }, 2000);
  };

  const submitOauth = async (providerId: string, methodIndex: number, code?: string) => {
    const trimmedCode = code?.trim();
    setLocalError(null);
    try {
      return await props.onSubmitOAuth(providerId, methodIndex, trimmedCode || undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("ui.d75f83b260e6");
      setLocalError(message);
      throw error instanceof Error ? error : new Error(message);
    }
  };

  const attemptOauthAutoCompletion = async () => {
    const session = oauthSession;
    if (!session || oauthAutoBusy) return;
    setOauthAutoBusy(true);
    try {
      const result = await submitOauth(session.providerId, session.methodIndex);
      if (result?.connected) {
        stopOauthAutoPolling();
      }
    } finally {
      setOauthAutoBusy(false);
    }
  };

  const startOauthAutoPolling = () => {
    if (typeof window === "undefined") return;
    if (oauthAutoPollRef.current !== null) return;
    void attemptOauthAutoCompletion();
    oauthAutoPollRef.current = window.setInterval(() => {
      void attemptOauthAutoCompletion();
    }, 2000);
  };

  useEffect(() => {
    if (!shouldStartOauthAutoPolling) {
      stopOauthAutoPolling();
      return;
    }
    startOauthAutoPolling();
  }, [shouldStartOauthAutoPolling]);

  const startOauth = async (entry: ProviderAuthEntry, methodIndex?: number) => {
    if (actionDisabled) return;
    if (!Number.isInteger(methodIndex) || methodIndex === undefined) {
      setLocalError(`No OAuth flow available for ${entry.name}.`);
      return;
    }
    setLocalError(null);
    setOauthCodeInput("");
    setOauthSession(null);
    setOauthCodeCopied(false);
    setOauthBrowserOpened(false);
    try {
      const started = await props.onSelect(entry.id, methodIndex);
      const selectedMethod = entry.methods.find((method) => method.methodIndex === methodIndex);
      if (!selectedMethod) {
        throw new Error(`Selected auth method is unavailable for ${entry.name}.`);
      }
      const nextSession: ProviderOAuthSession = {
        providerId: entry.id,
        methodIndex: started.methodIndex,
        methodLabel: selectedMethod.label,
        authorization: started.authorization,
      };
      setOauthSession(nextSession);

      if (started.authorization.method === "code") {
        await openOauthUrl(started.authorization.url);
        setView("oauth-code");
        return;
      }

      if (!isOpenAiHeadlessMethod(selectedMethod)) {
        await openOauthUrl(started.authorization.url);
      }

      setView("oauth-auto");
    } catch (error) {
      const message = error instanceof Error ? error.message : t("ui.ebe8f27a0546");
      setLocalError(message);
    }
  };

  const handleMethodSelect = async (method: ProviderAuthMethod, entry = selectedEntry) => {
    if (!entry || actionDisabled) return;
    setLocalError(null);

    if (method.type === "oauth") {
      await startOauth(entry, method.methodIndex);
      return;
    }

    if (method.type === "cloud") return;

    setView("api");
  };

  const handleEntrySelect = (entry: ProviderAuthEntry) => {
    if (actionDisabled) return;
    setLocalError(null);
    setSelectedProviderId(entry.id);
    returnProviderIdRef.current = entry.id;

    if (entry.methods.length === 1) {
      void handleMethodSelect(entry.methods[0], entry);
      return;
    }

    if (entry.methods.length > 1) {
      setView("method");
      return;
    }

    setLocalError(`No authentication methods available for ${entry.name}.`);
  };

  const handleApiSubmit = async () => {
    if (!selectedEntry || actionDisabled) return;

    const trimmed = (apiKeyField.current?.take() ?? "").trim();
    if (!trimmed) {
      setLocalError("API key is required.");
      return;
    }

    setLocalError(null);
    try {
      await props.onSubmitApiKey(selectedEntry.id, trimmed);
      toast.success(`${selectedEntry.name} connected`, {
        description: t("ui.41c8de05a3e1"),
      });
      // Close the modal after a successful save
      props.onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("ui.e2446d6606fb");
      setLocalError(message);
    }
  };

  const handleOauthCodeSubmit = async () => {
    if (!selectedEntry || !oauthSession || actionDisabled) return;

    const trimmed = oauthCodeInput.trim();
    if (!trimmed) {
      setLocalError("Authorization code is required.");
      return;
    }

    await submitOauth(selectedEntry.id, oauthSession.methodIndex, trimmed);
  };

  const handleBack = () => {
    if (resolvedView === "oauth-code" || resolvedView === "oauth-auto") {
      if ((selectedEntry?.methods.length ?? 0) > 1) {
        setView("method");
      } else {
        resetState();
      }
      setOauthSession(null);
      setOauthCodeInput("");
      setOauthCodeCopied(false);
      setOauthBrowserOpened(false);
      setLocalError(null);
      return;
    }

    if (resolvedView === "api" && (selectedEntry?.methods.length ?? 0) > 1) {
      setView("method");
      apiKeyField.current?.clear();
    setHasApiKey(false);
      setLocalError(null);
      return;
    }
    resetState();
  };

  const submittingLabel = () => {
    if (!props.submitting) return null;
    if (resolvedView === "api") return t("ui.f40eb88ee902");
    if (resolvedView === "oauth-code") return t("ui.ac343c6b85c9");
    if (resolvedView === "oauth-auto") return t("ui.4298504f9b94");
    return t("ui.87b59196f765");
  };

  const stepEntryIndex = (delta: number) => {
    const total = filteredEntries.length;
    if (total <= 0) {
      setActiveEntryIndex(0);
      return;
    }
    setActiveEntryIndex((current) => {
      const normalized = ((current % total) + total) % total;
      return (normalized + delta + total) % total;
    });
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (resolvedView !== "list") return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      stepEntryIndex(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      stepEntryIndex(-1);
      return;
    }
    if (event.key === "Enter") {
      const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & { keyCode?: number };
      if (nativeEvent.isComposing || nativeEvent.keyCode === 229) {
        return;
      }
      const entry = filteredEntries[activeEntryIndex];
      if (!entry) return;
      event.preventDefault();
      handleEntrySelect(entry);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
    }
  };

  const methodDescription = (entry: ProviderAuthEntry, method: ProviderAuthMethod) => {
    const label = methodLabel(method).toLowerCase();
    if (isOpenAiProvider(entry.id, entry.name) && (label.includes("headless") || label.includes("device"))) {
      return t("ui.691732d3cf6e");
    }
    if (method.type === "oauth") {
      return t("ui.6f1081548ffa");
    }
    if (method.type === "cloud") return t("ui.075e1f850c27");
    if (isOpencodeZenProvider(entry.id)) {
      return t("ui.661e7cd2ba62");
    }
    return t("ui.c86b62430d0b");
  };

  const searchText = searchQuery.trim().toLowerCase();
  const showIncludedAuto = Boolean(props.openWorkModelsState || props.connectedProviderIds.includes("openwork-free"))
    && (!searchText || "openwork models auto free".includes(searchText));
  const showRetiredZen = showsRetiredOpencodeZen({ providerIds: entries.map((entry) => entry.id), query: searchText });

  const entrySubtitle = (entry: ProviderAuthEntry) => {
    if (entry.connected) return entry.methods.some((method) => method.type === "oauth") ? t("ui.0ffe8dc501c0") : t("ui.20839f0c14a5");
    const oauth = entry.methods.some((method) => method.type === "oauth");
    const apiKey = entry.methods.some((method) => method.type === "api");
    const signIn = isOpenAiProvider(entry.id, entry.name) ? t("ui.f6de648021fd") : isAnthropicProvider(entry.id, entry.name) ? t("ui.e3de59560d4e") : t("ui.bfd402b2f6f3");
    const how = oauth && apiKey ? `${signIn} or paste an API key` : oauth ? `${signIn} in the browser` : t("ui.494b247e810a");
    return props.organizationProviderIds?.has(entry.id) ? `${how} · also available from ${props.organizationName || "your organization"}` : how;
  };

  const renderEntry = (entry: ProviderAuthEntry, index: number) => {
    const active = index === activeEntryIndex;
    return (
      <button
        key={entry.id}
        type="button"
        data-provider-id={entry.id}
        ref={(element) => {
          if (element) providerButtonsRef.current.set(entry.id, element);
          else providerButtonsRef.current.delete(entry.id);
        }}
        className={`group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${active ? "bg-dls-hover" : "hover:bg-dls-hover/60"}`}
        disabled={actionDisabled}
        aria-current={active ? "true" : undefined}
        onMouseEnter={() => setActiveEntryIndex(index)}
        onFocus={() => setActiveEntryIndex(index)}
        onClick={() => handleEntrySelect(entry)}
      >
        <ProviderTile providerId={entry.id} name={entry.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-dls-text">{entry.name}</div>
          <div className="line-clamp-2 text-xs text-muted-foreground">{entrySubtitle(entry)}</div>
        </div>
        {entry.connected ? null : (
          <span className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-dls-text text-dls-surface" : "text-muted-foreground"}`}>
            {t("ui.1a2303ede074")}
          </span>
        )}
      </button>
    );
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        initialFocus={() => isMobile ? titleRef.current : searchInputRef.current ?? titleRef.current}
        className="flex max-h-[min(680px,calc(100dvh-2rem))] min-h-0 w-[calc(100vw-2rem)] max-w-[34rem] flex-col overflow-hidden sm:max-w-[34rem]">
        <DialogHeader className="pr-8">
          <DialogTitle ref={titleRef} tabIndex={-1}>{t("ui.a002b3f35f99")}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t("ui.92857b5c84d3")}{props.organizationName ? ` Providers from ${props.organizationName} are already included and managed in Den.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {errorMessage ? (
            <div className="rounded-xl border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs text-red-11">
              {errorMessage}
            </div>
          ) : props.loading ? (
            <div className="rounded-xl border border-gray-6 bg-gray-1/60 px-4 py-3 text-sm text-gray-10 animate-pulse">
              {t("ui.d8de930be069")}
            </div>
          ) : null}

          {!props.loading ? (
            <div className="-mr-1 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {resolvedView === "list" ? (
                <div className="space-y-4" role="presentation" onKeyDown={handleListKeyDown}>
                  <div className="sticky top-0 z-10 bg-background pb-1">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <input
                      ref={searchInputRef}
                      type="search"
                      aria-label={t("ui.c63a3f5870fa")}
                      placeholder={t("ui.f9ccc4f92169")}
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.currentTarget.value);
                        setActiveEntryIndex(0);
                      }}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      disabled={actionDisabled}
                      className="h-10 w-full rounded-xl border border-dls-border bg-dls-surface pl-9 pr-3 text-base text-dls-text placeholder:text-muted-foreground transition-colors focus:border-gray-8 focus:outline-none lg:text-[13px]"
                    />
                  </div>

                  {showIncludedAuto || connectedCount ? (
                    <div role="group" aria-labelledby="connect-provider-device">
                      <ProviderSectionLabel id="connect-provider-device" count={connectedCount + Number(showIncludedAuto)}>{t("ui.38b9d88c1fdb")}</ProviderSectionLabel>
                      {showIncludedAuto ? (
                        <div className="flex items-center gap-3 rounded-xl px-2 py-2" data-testid="included-openwork-provider">
                          <ProviderTile providerId="openwork" size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-dls-text">{t("ui.5246148b3097")}</div>
                            <div className="line-clamp-2 text-xs text-muted-foreground">{autoProviderSubtitle()}</div>
                          </div>
                          {props.openWorkModelsState === "off" || props.openWorkModelsState === "unavailable" ? (
                            <ProviderStatus tone="neutral">{props.openWorkModelsState === "off" ? t("ui.462e3498d66f") : t("ui.ca1844969742")}</ProviderStatus>
                          ) : null}
                        </div>
                      ) : null}
                      {filteredEntries.slice(0, connectedCount).map((entry, index) => renderEntry(entry, index))}
                    </div>
                  ) : null}

                  {filteredEntries.length > connectedCount ? (
                    <div role="group" aria-labelledby="connect-provider-available">
                      <ProviderSectionLabel id="connect-provider-available" count={filteredEntries.length - connectedCount}>{t("ui.3ae4e2b8365a")}</ProviderSectionLabel>
                      {filteredEntries.slice(connectedCount).map((entry, offset) => renderEntry(entry, connectedCount + offset))}
                    </div>
                  ) : null}

                  {showRetiredZen ? (
                    <div className="flex items-center gap-3 rounded-xl px-2 py-2" data-testid="retired-opencode-zen">
                      <ProviderTile providerId="opencode" name="OpenCode Zen" size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-dls-text">{t("ui.d03a78273339")}</div>
                        <div className="line-clamp-2 text-xs text-muted-foreground">{t("ui.d85b7804b5c3")}</div>
                      </div>
                      <ProviderStatus tone="locked">{t("ui.4639bc628812")}</ProviderStatus>
                    </div>
                  ) : null}

                  {!filteredEntries.length && !showIncludedAuto && !showRetiredZen ? (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      {entries.length ? t("ui.6f07c7004956") : t("ui.20ea4eb977bb")}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {resolvedView === "method" && selectedEntry ? (
                <div className="rounded-xl border border-gray-6/40 bg-gray-2/50 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-12">{selectedEntry.name}</div>
                      <div className="text-xs text-gray-10 mt-1">{t("ui.41a28af99735")}</div>
                    </div>
                    <Button variant="outline" onClick={handleBack} disabled={actionDisabled}>
                      {t("ui.76900f1bfd16")}
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {selectedEntry.methods.map((method) => (
                      <button
                        key={`${selectedEntry.id}-${method.type}-${method.methodIndex ?? method.label}`}
                        type="button"
                        className={`w-full rounded-xl border px-4 py-3.5 text-left transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
                          method.type === "oauth"
                            ? "border-indigo-5/40 bg-indigo-3/20 hover:bg-indigo-4/30 shadow-sm"
                            : "border-gray-5/50 bg-gray-2 hover:bg-gray-3/50 shadow-sm"
                        }`}
                        onClick={() => void handleMethodSelect(method)}
                        disabled={actionDisabled}
                      >
                        <div className="text-sm font-medium text-gray-12">{methodLabel(method)}</div>
                        <div className="mt-1 text-xs text-gray-10">{methodDescription(selectedEntry, method)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {resolvedView === "api" && selectedEntry ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] border border-gray-5/60 bg-gray-1 shadow-sm overflow-hidden">
                      <ProviderIcon providerId={selectedEntry.id} size={20} className="text-gray-12" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-12 truncate">{selectedEntry.name}</div>
                      <div className="text-[11px] text-gray-9 font-mono truncate">{selectedEntry.id}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-10">
                    {isOpencodeZenProvider(selectedEntry.id)
                      ? t("ui.f2e794fed81e")
                      : t("ui.e368dc03a4aa")}
                  </div>
                  {isOpencodeZenProvider(selectedEntry.id) ? (
                    <div className="rounded-lg border border-indigo-5/30 bg-indigo-3/15 px-3 py-2.5 text-xs text-indigo-12 space-y-1.5">
                      <div>
                        {t("ui.5d72272ad2a8")}
                      </div>
                      <button
                        type="button"
                        className="text-indigo-11 hover:text-indigo-12 underline underline-offset-2 font-medium"
                        onClick={() => void openExternalUrl(OPENCODE_ZEN_KEY_URL)}
                      >
                        {t("ui.30b2b3c3441f")}
                      </button>
                    </div>
                  ) : null}
                  <SecretTextInput
                    id="provider-auth-api-key"
                    label={t("ui.16f0ee47f993")}
                    placeholder={isOpencodeZenProvider(selectedEntry.id) ? "ock_..." : "sk-..."}
                    handleRef={apiKeyField}
                    onValueChange={(next) => {
                      setHasApiKey(next);
                      if (next && localError) setLocalError(null);
                    }}
                    onSubmit={() => void handleApiSubmit()}
                    disabled={actionDisabled}
                  />
                  {selectedEntry.env.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-9">
                      {t("ui.bb1db0bbbba0")}
                      {selectedEntry.env.map((envVar) => (
                        <span
                          key={envVar}
                          className="rounded-md bg-gray-3/40 px-1.5 py-0.5 font-mono text-[10px] text-gray-11"
                        >
                          {envVar}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}


              {resolvedView === "oauth-code" && selectedEntry && oauthSession ? (
                <div className="rounded-xl border border-gray-6/40 bg-gray-2/50 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-12">{selectedEntry.name}</div>
                      <div className="text-xs text-gray-10 mt-1">{t("ui.d9e64a2a0035")}</div>
                    </div>
                    <Button variant="outline" onClick={handleBack} disabled={actionDisabled}>
                      {t("ui.76900f1bfd16")}
                    </Button>
                  </div>
                  <div className="text-xs text-gray-9">
                    {t("ui.0c77534db576")}
                  </div>
                  {oauthInstructions ? (
                    <div className="rounded-lg border border-gray-6/60 bg-gray-1/60 px-3 py-2 text-[11px] text-gray-9 font-mono break-all">
                      {oauthInstructions}
                    </div>
                  ) : null}
                  <TextInput
                    className="text-base lg:text-sm"
                    label={t("ui.d778d58f7781")}
                    type="text"
                    placeholder={t("ui.6829099ead05")}
                    value={oauthCodeInput}
                    onChange={(event) => {
                      setOauthCodeInput(event.currentTarget.value);
                      if (localError) setLocalError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      void handleOauthCodeSubmit();
                    }}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    disabled={actionDisabled}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        void openOauthUrl(oauthSession.authorization.url ?? "");
                      }}
                    >
                      {t("ui.63833e99712e")}
                    </Button>
                    <Button
                      onClick={() => void handleOauthCodeSubmit()}
                      disabled={actionDisabled || !oauthCodeInput.trim()}
                    >
                      {props.submitting ? t("ui.2ec1ac7d45e8") : t("ui.7da19662ba92")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {resolvedView === "oauth-auto" && selectedEntry && oauthSession ? (
                <div className="rounded-xl border border-gray-6/40 bg-gray-2/50 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-12">{selectedEntry.name}</div>
                      <div className="text-xs text-gray-10 mt-1">{t("ui.c0b8237f2891")}</div>
                    </div>
                    <Button variant="outline" onClick={handleBack} disabled={actionDisabled}>
                      {t("ui.76900f1bfd16")}
                    </Button>
                  </div>
                  {isOpenAiHeadlessSession ? (
                    <div className="space-y-2 text-xs text-gray-9">
                      <div>{t("ui.78e1e91359ad")}</div>
                      <div>{t("ui.ccb20041d6a2")}</div>
                      <div>{t("ui.e10f014c34c7")}</div>
                      <div>{t("ui.ba494fa8cb00")}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-9">
                      {t("ui.8a3133f42c81")}
                    </div>
                  )}
                  {oauthDisplayCode ? (
                    <div className="rounded-xl border border-gray-6/70 bg-gray-2/40 p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wide text-gray-8">{t("ui.84d98f02d8f2")}</div>
                        <div className="text-sm text-gray-12 font-mono break-all">{oauthDisplayCode}</div>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => void copyOauthDisplayCode()}>
                        {oauthCodeCopied ? t("text_activity.copied") : t("ui.e21f935f11d7")}
                      </Button>
                    </div>
                  ) : null}
                  {isOpenAiHeadlessSession && !oauthBrowserOpened ? (
                    <div className="flex items-center gap-2 text-xs text-gray-9">
                      <span>{t("ui.77360d44e152")}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-gray-9">
                      <Loader2 size={14} className={props.submitting || pollingBusy || oauthAutoBusy ? "animate-spin" : ""} />
                      <span>{t("ui.48faa2e7a2d9")}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        void openOauthUrl(oauthSession.authorization.url ?? "");
                      }}
                    >
                      {isOpenAiHeadlessSession
                        ? oauthBrowserOpened
                          ? t("ui.572e4e5f33ca")
                          : t("ui.8b3453d30dd9")
                        : t("ui.63833e99712e")}
                    </Button>
                    <div className="text-[11px] text-gray-9 text-right">
                      {t("ui.5f036537ea65")}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {resolvedView === "list" ? (
          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 sm:flex-row sm:justify-between">
            {props.organizationProviderCount !== undefined ? (
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                {props.organizationName ? <OrganizationMark name={props.organizationName} size="sm" /> : null}
                <span className="truncate" title={`${props.organizationProviderCount === 1 ? t("ui.384ae4ab1a28") : `${props.organizationProviderCount} providers`} already included by ${props.organizationName || "your organization"}`}>{props.organizationProviderCount} {t("ui.70f3ba4eda29")} {props.organizationName || t("ui.bb0bdf0a41b5")}</span>
                {props.onOpenDen ? <><span aria-hidden>·</span><button type="button" className="shrink-0 font-medium text-dls-text underline-offset-2 hover:underline" onClick={props.onOpenDen}>{t("ui.028506de3228")}</button></> : null}
              </div>
            ) : <span className="text-xs text-muted-foreground">{props.submitting ? submittingLabel() : t("ui.ef40d6cb89da")}</span>}
            <div className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden>
              {["↑↓", "↵", "esc"].map((key) => <kbd key={key} className="rounded-md border border-dls-border bg-dls-surface px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">{key}</kbd>)}
            </div>
          </DialogFooter>
        ) : (
        <DialogFooter className="shrink-0 flex-col gap-3 sm:flex-col sm:justify-start">
          <div className="min-h-[16px] text-xs text-gray-10">
            {props.submitting ? submittingLabel() : null}
          </div>
          {/* One action bar per view: Back returns to the list, Close dismisses,
              and the view's primary action sits last. */}
          <div className="flex w-full items-center gap-2">
            {resolvedView === "api" && selectedEntry ? (
              <Button variant="outline" onClick={handleBack} disabled={actionDisabled}>
                <ChevronLeft className="size-4" />
                {t("ui.76900f1bfd16")}
              </Button>
            ) : null}
            <div className="flex-1" />
            <DialogClose
              disabled={actionDisabled}
              render={<Button variant="outline" disabled={actionDisabled} />}
            >
              {t("ui.7d9eb7acb13e")}
            </DialogClose>
            {resolvedView === "api" && selectedEntry ? (
              <Button onClick={handleApiSubmit} disabled={actionDisabled || !hasApiKey}>
                {props.submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("ui.23e39291d613")}
                  </>
                ) : (
                  "Save key"
                )}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
