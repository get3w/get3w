
import {
  buildDenAuthUrl,
  getDenInferenceUrl,
  isSelfHostedControlPlane,
  HOSTED_DEFAULT_DEN_BASE_URL,
  readDenBootstrapConfig,
  readDenSettings,
} from "../../../app/lib/den";
import { denSettingsChangedEvent } from "../../../app/lib/den-session-events";
import { useSyncExternalStore } from "react";

export const GET3W_MODELS_PROVIDER_ID = "get3w";
export const GET3W_MODELS_PROMO_HIDDEN_KEY = "get3w.get3wModelsPromo.hidden";
export const GET3W_MODELS_PROMO_LAST_SHOWN_KEY = "get3w.get3wModelsPromo.lastShownAt";
export const GET3W_MODELS_STARTUP_PROMO_SHOWN_KEY = "get3w.get3wModelsPromo.startupShown";
export const get3wModelsPromoChangedEvent = "get3w-get3w-models-promo-changed";
export const GET3W_MODELS_PROMO_REPEAT_MS = 6 * 60 * 60 * 1000;

export function areGet3WModelsPromosDisabled() { return true; }
export function isGet3WModelsPromoEligibleForDenBaseUrl(_baseUrl: string) { return false; }
export function isGet3WModelsPromoEligible() { return false; }
export function useGet3WModelsPromoEligibility() { return false; }

export type Get3WModelPreview = {
  id: string;
  title: string;
  subtitle: string;
};

export function hasGet3WModelsProvider(providerIds: readonly string[]) {
  return providerIds.some((id) => id.trim().toLowerCase() === GET3W_MODELS_PROVIDER_ID);
}

/** Local engine has Get3W Models connected with at least one selectable model. */
export function hasGet3WModelsAvailable(input: {
  providerConnectedIds: readonly string[];
  providers: ReadonlyArray<{ id: string; models?: Record<string, unknown> | null }>;
}) {
  if (!hasGet3WModelsProvider(input.providerConnectedIds)) return false;
  const get3w = input.providers.find(
    (provider) => provider.id.trim().toLowerCase() === GET3W_MODELS_PROVIDER_ID,
  );
  return Object.keys(get3w?.models ?? {}).length > 0;
}

export function shouldShowGet3WModelsSyncing(input: {
  entitled: boolean;
  available: boolean;
  workspaceReady: boolean;
  reloadPending: boolean;
}) {
  return input.entitled && !input.available && input.workspaceReady && input.reloadPending;
}

export function getGet3WModelsActionUrl(
  isSignedIn: boolean,
  authMode: "sign-in" | "sign-up" = "sign-in",
) {
  return "https://get3w.com";
}

export function isGet3WModelsPromoHidden() {
  if (areGet3WModelsPromosDisabled()) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GET3W_MODELS_PROMO_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function hideGet3WModelsPromo() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GET3W_MODELS_PROMO_HIDDEN_KEY, "1");
    window.dispatchEvent(new Event(get3wModelsPromoChangedEvent));
  } catch {}
}

export function wasGet3WModelsStartupPromoShown() {
  if (!isGet3WModelsPromoEligible()) return true;
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(GET3W_MODELS_STARTUP_PROMO_SHOWN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markGet3WModelsStartupPromoShown() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GET3W_MODELS_STARTUP_PROMO_SHOWN_KEY, "1");
  } catch {}
}

export function shouldShowGet3WModelsPromo(now = Date.now()) {
  if (!isGet3WModelsPromoEligible() || typeof window === "undefined" || isGet3WModelsPromoHidden()) return false;
  try {
    const lastShown = Number(window.localStorage.getItem(GET3W_MODELS_PROMO_LAST_SHOWN_KEY) ?? "0");
    return !Number.isFinite(lastShown) || now - lastShown >= GET3W_MODELS_PROMO_REPEAT_MS;
  } catch {
    return true;
  }
}
