import { t } from "@/i18n";
import { AUTO_ROUTER_PROVIDER_ID, autoRouterIdFromModel } from "@openwork/types/den/auto-router";
import type { ModelOption, ModelRef } from "@/app/types";
import type { CloudImportedProvider } from "@/app/cloud/import-state";
import { modelRefKey, nextFavoriteModel } from "../session/models/model-collections-store";

export type ModelPickerCatalogState = {
  state: "loading" | "ready" | "error";
  lastVerifiedAt?: number;
  refreshing?: boolean;
  onRetry?: () => void | Promise<unknown>;
};
export type RetainedModelSelection = {
  model: ModelRef;
  title?: string;
  description?: string;
  reason: "unavailable" | "policy" | "disabled" | "signed-out";
};
export function retainedModelCopy(reason: RetainedModelSelection["reason"]) {
  switch (reason) {
    case "policy": return { subtitle: "blocked by your organization", detail: t("ui.630622ff279f") };
    case "disabled": return { subtitle: "disabled in AI providers", detail: t("ui.c8ffd2f2317b") };
    case "signed-out": return { subtitle: "sign in to verify access", detail: t("ui.675927f3b9f7") };
    case "unavailable": return { subtitle: "no longer available here", detail: t("ui.fe5b288b50c4") };
  }
}
export function nonDefaultModelSummary(model: ModelRef, value: string | null, label: string) {
  return !managesOwnBehavior(model) && value !== null ? label : null;
}

/** GPT-6 Luna as served by Get3W Models (provider `openwork`). */
export const AUTO_MODEL_ID = "openai/gpt-6-luna";
/** The picker group that holds only Smart Router models, above everything else, without a label. */
export const AUTO_ROUTER_GROUP = "Smart";
/** What a Smart Router model is called when the engine reports no name for it. */
export const SMART_MODEL_FALLBACK_NAME = "Smart";

/**
 * One of the organization's Smart Routers (feature `autoRouter`): the Gateway
 * picks the real model for every prompt. Every router is a model of the one
 * `openwork-auto` provider, named "Smart: <router name>".
 */
export function isAutoRouterModel(model: ModelRef | null | undefined) {
  return model?.providerID === AUTO_ROUTER_PROVIDER_ID;
}

/** Models that choose their own settings, so they offer no effort, fast mode or inherited behavior. */
export function managesOwnBehavior(model: ModelRef | null | undefined) {
  return isAutoRouterModel(model) || (model?.providerID === "get3w-account" && model.modelID === "get3w-auto");
}
export const EXPLICIT_MODEL_CHOICE_KEY = "openwork.modelChoice.explicit";
export function shouldSelectInitialAuto(input: { available: readonly ModelRef[]; current: ModelRef | null; empty: boolean; explicit: boolean }) {
  return input.empty && !input.explicit && Boolean(starterModel(input.available))
    && (!input.current || (input.current.providerID === "opencode" && input.current.modelID === "big-pickle"));
}
export function markExplicitModelChoice() {
  try { window.localStorage.setItem(EXPLICIT_MODEL_CHOICE_KEY, "1"); } catch {}
}
export type ModelSource = "gateway" | "local" | "organization";
export const MODEL_SOURCE_LABELS: Record<ModelSource, string> = {
  gateway: "Get3W Gateway", local: "Local", organization: "Organization",
};

/** The model a new member starts on: the Get3W account's Auto model, then any Get3W account model, then any model. */
export function starterModel<T extends ModelRef & { disabled?: boolean }>(available: readonly T[]): T | undefined {
  return available.find((model) => model.providerID === "get3w-account" && model.modelID === "get3w-auto" && !model.disabled)
    ?? available.find((model) => model.providerID === "get3w-account" && !model.disabled)
    ?? available.find((model) => !model.disabled);
}

/** A Smart Router's own name ("Smart: Engineering") when it is known; undefined otherwise. */
export function fixedModelTitle(model: ModelRef & { title?: string }): string | undefined {
  if (isAutoRouterModel(model)) {
    const title = model.title?.trim();
    return title && title !== model.modelID && autoRouterIdFromModel(title) === null ? title : undefined;
  }
  return undefined;
}

export function modelSource(model: ModelRef & { source?: ModelOption["source"] }): ModelSource {
  if (isAutoRouterModel(model) || model.providerID === "openwork" || model.providerID === "get3w-account" || model.source === "gateway" || model.providerID.startsWith("ipr_")) return "gateway";
  if (model.source === "cloud" || model.providerID.startsWith("lpr_")) return "organization";
  return "local";
}

/** Gateway ids (`gwm_…`, `ipr_…`) are long and opaque: never a name a person reads. */
function isOpaqueModelId(value: string) {
  return /^(gwm|ipr)_/.test(value);
}

/** A model's display name: its title, never an opaque gateway id (then "<Provider> model"). */
export function modelTitle(model: ModelRef & { title?: string; description?: string }) {
  const fixed = fixedModelTitle(model);
  if (fixed) return fixed;
  // A Smart model's id (`openwork-smart-…`) is never a name a person reads.
  if (isAutoRouterModel(model)) return SMART_MODEL_FALLBACK_NAME;
  const name = model.title?.trim() || model.modelID;
  if (!isOpaqueModelId(name)) return name;
  const provider = model.description?.trim();
  return provider ? `${provider} model` : t("ui.5e2c614c23f0");
}

/** A name safe to show as a value: the public title, never an opaque provider/model id. */
export function publicModelTitle(model: ModelRef & { title?: string }): string | undefined {
  const fixed = fixedModelTitle(model);
  if (fixed) return fixed;
  if (isAutoRouterModel(model)) return SMART_MODEL_FALLBACK_NAME;
  const title = model.title?.trim();
  if (!title || title === model.modelID || isOpaqueModelId(title)) return undefined;
  return title;
}

const MODEL_MAKERS: readonly [RegExp, string][] = [
  [/\bclaude\b/, "anthropic"], [/\b(gpt|codex|o[1-9])(\b|-|\d)/, "openai"], [/\b(gemini|gemma)\b/, "google"],
  [/\bqwen/i, "alibaba"], [/\bgrok\b/, "xai"], [/\bllama\b/, "meta"], [/\b(mistral|codestral|devstral|magistral)\b/, "mistral"], [/\bdeepseek\b/, "deepseek"],
];

/**
 * Who made a model, from its name: Claude is Anthropic's wherever it is served.
 * The picker shows this maker's logo, so a gateway or self-hosted provider
 * without a logo of its own still reads at a glance. Null when unknown.
 */
export function modelMakerId(model: ModelRef & { title?: string }): string | null {
  const text = `${model.title ?? ""} ${model.modelID}`.toLowerCase();
  return MODEL_MAKERS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** Only what is true about this model right now, without its provider (rows already show the logo and group). */
export function modelStateLabel(model: ModelOption): string | null {
  if (model.gatewayAuthorization) return t("ui.288685d3684c");
  if (model.organizationPinOrder !== undefined) return t("ui.265177009be8");
  return null;
}

export function modelSubtitle(model: ModelOption) {
  if (isAutoRouterModel(model)) return t("ui.8e66a8b3eccb");
  // Gateway models assigned to the member that wait on their own provider sign-in.
  if (model.gatewayAuthorization) return [model.description?.trim(), "Sign-in required"].filter(Boolean).join(" · ");
  return [model.description?.trim(), model.organizationPinOrder !== undefined ? "pinned by your org" : null].filter(Boolean).join(" · ");
}

export function withImportedModelMetadata(options: readonly ModelOption[], imports: Record<string, CloudImportedProvider>) {
  const pins = new Map<string, number>();
  const sources = new Map<string, ModelOption["source"]>();
  for (const provider of Object.values(imports)) {
    sources.set(provider.providerId, provider.source === "openwork_gateway" ? "gateway" : "cloud");
    for (const id of provider.pinnedModelIds ?? []) {
      const key = modelRefKey({ providerID: provider.providerId, modelID: id });
      if (provider.modelIds.includes(id) && !pins.has(key)) pins.set(key, pins.size);
    }
  }
  return options.map((option) => ({ ...option,
    source: sources.get(option.providerID) ?? option.source,
    organizationPinOrder: pins.get(modelRefKey(option)) ?? option.organizationPinOrder,
  }));
}

export type ModelCatalogOption = ModelOption;

/** Organization pins cannot be removed by a member. */
export function immutableModelPin(model: ModelCatalogOption) {
  return model.organizationPinOrder !== undefined;
}

export function orderedModelPins(options: readonly ModelCatalogOption[], personal: readonly ModelRef[]) {
  const available = options.filter((option) => !option.disabled);
  const byKey = new Map(available.map((option) => [modelRefKey(option), option]));
  const ordered = [
    ...available.filter((option) => option.organizationPinOrder !== undefined).sort((a, b) => a.organizationPinOrder! - b.organizationPinOrder!),
    ...personal.flatMap((model) => { const option = byKey.get(modelRefKey(model)); return option ? [option] : []; }),
  ];
  return [...new Map(ordered.map((option) => [modelRefKey(option), option])).values()];
}

export function nextPinnedModel(options: readonly ModelOption[], personal: readonly ModelRef[], current: ModelRef | null) {
  return nextFavoriteModel(orderedModelPins(options, personal), current);
}

export function nextModelSource(options: readonly ModelOption[], pins: readonly ModelOption[], current: ModelRef | null) {
  const available = [...pins, ...options].filter((option) => !option.disabled);
  const sources = [...new Set(available.map(modelSource))];
  if (sources.length < 2) return null;
  const source = current ? modelSource(options.find((option) => modelRefKey(option) === modelRefKey(current)) ?? current) : null;
  const index = source ? sources.indexOf(source) : -1;
  const next = sources[(index + 1) % sources.length];
  return available.find((option) => modelSource(option) === next) ?? null;
}

export type ModelGroup = { value: string; items: ModelOption[] };
export function modelGroups(options: readonly ModelOption[], personal: readonly ModelRef[], recent: readonly ModelRef[], query = ""): ModelGroup[] {
  const groups: ModelGroup[] = [];
  const shown = new Set<string>();
  const search = query.trim().toLowerCase();
  const available = options.filter((option) => !option.disabled);
  // `claim`: listed only here. Recent is a shortcut; its models still appear under their provider.
  const add = (value: string, candidates: readonly ModelOption[], claim = true) => {
    const items = candidates.filter((option) => {
      const key = modelRefKey(option);
      if (shown.has(key) || (search && !`${modelTitle(option)} ${modelSubtitle(option)} ${key}`.toLowerCase().includes(search))) return false;
      if (claim) shown.add(key);
      return true;
    });
    if (items.length) groups.push({ value, items });
  };
  // Smart Routers stand alone at the top, by name, wherever else they would be listed.
  add(AUTO_ROUTER_GROUP, available.filter(isAutoRouterModel)
    .sort((a, b) => modelTitle(a).localeCompare(modelTitle(b)) || a.modelID.localeCompare(b.modelID)));
  add("Pinned", orderedModelPins(available, personal));
  add("Recent", recent.flatMap((model) => available.filter((option) => modelRefKey(option) === modelRefKey(model))), false);
  add("Get3W Models", available.filter((option) => option.providerID === "openwork" || option.providerID === "get3w-account"));
  const providers = [...new Set(available.map((option) => option.providerID))].sort((a, b) => {
    const name = (id: string) => available.find((option) => option.providerID === id)?.description || id;
    return name(a).localeCompare(name(b));
  });
  for (const id of providers) {
    const models = available.filter((option) => option.providerID === id).sort((a, b) => modelTitle(a).localeCompare(modelTitle(b)));
    add(models[0]?.description || id, models);
  }
  return groups;
}

/**
 * The model to fall back to when `unavailable` stops working: the first other
 * model in the order the picker lists them (pinned, recent, then by provider)
 * that `usable` accepts. Null when nothing else can run.
 */
export function nextAvailableModel(
  options: readonly ModelOption[],
  personal: readonly ModelRef[],
  recent: readonly ModelRef[],
  unavailable: ModelRef,
  usable: (model: ModelOption) => boolean = () => true,
): ModelOption | null {
  const skip = modelRefKey(unavailable);
  return modelGroups(options, personal, recent).flatMap((group) => group.items)
    .find((option) => modelRefKey(option) !== skip && usable(option)) ?? null;
}

export function isPinModelShortcut(event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) {
  return event.key.toLowerCase() === "p" && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function isCycleModelSourceShortcut(event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) {
  return event.key.toLowerCase() === "m" && event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey;
}
