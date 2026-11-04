import { useSyncExternalStore } from "react";
import en from "./locales/en";
import zh from "./locales/zh";
export const LANGUAGE_PREF_KEY = "openwork.language";

/**
 * Supported languages
 */
export type Language = "zh" | "en";
export const DEFAULT_LANGUAGE: Language = "zh";
export type Locale = Language;

/**
 * All supported languages - single source of truth
 */
export const LANGUAGES: Language[] = ["zh", "en"];

/**
 * Language options for UI - single source of truth
 */
export const LANGUAGE_OPTIONS = [
  { value: "zh", label: "Chinese (Simplified)", nativeName: "简体中文" },
  { value: "en", label: "English", nativeName: "English" },
] as const satisfies ReadonlyArray<{ value: Language; label: string; nativeName: string }>;

const PLURAL_SUFFIX_EMPTY_LANGUAGES = new Set<Language>(["zh"]);

/**
 * Current translation strings use an English-style plural suffix placeholder.
 * Some locales render the noun without a visible plural marker, so we keep
 * that suffix empty for them.
 */
export const pluralSuffix = (locale: Language, count: number): string => {
  if (PLURAL_SUFFIX_EMPTY_LANGUAGES.has(locale)) {
    return "";
  }

  return count === 1 ? "" : "s";
};

/**
 * Translation maps
 */
const TRANSLATIONS: Record<Language, Record<string, string>> = { zh, en };

/**
 * Type guard to validate if a value is a Language
 * Replaces long chains like: value === "en" || value === "zh"
 */
export const isLanguage = (value: unknown): value is Language => {
  return typeof value === "string" && LANGUAGES.includes(value as Language);
};

let localeValue: Language = DEFAULT_LANGUAGE;
const localeListeners = new Set<() => void>();
export const subscribeLocale = (listener: () => void) => {
  localeListeners.add(listener);
  return () => { localeListeners.delete(listener); };
};
export const useLocale = (): Language => useSyncExternalStore(subscribeLocale, currentLocale, () => DEFAULT_LANGUAGE);

/**
 * Get current locale
 */
export const currentLocale = (): Language => locale();
function locale(): Language {
  return localeValue;
}

/**
 * Set locale and persist to localStorage
 */
export const setLocale = (newLocale: Language) => {
  if (!isLanguage(newLocale)) {
    console.warn(`Invalid locale: ${newLocale}, falling back to "zh"`);
    newLocale = DEFAULT_LANGUAGE;
  }

  const changed = localeValue !== newLocale;
  localeValue = newLocale;

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", newLocale);
  }

  // Persist to localStorage
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LANGUAGE_PREF_KEY, newLocale);
    } catch (e) {
      console.warn("Failed to persist language preference:", e);
    }
  }
  if (typeof window !== "undefined") void window.__OPENWORK_I18N__?.setLanguage(newLocale).catch(() => {});
  if (changed) for (const listener of localeListeners) listener();
};

/**
 * Resolve a translation entry with the locale → English → null fallback chain.
 */
const lookupEntry = (loc: Language, candidateKey: string): string | null => {
  if (TRANSLATIONS[loc]?.[candidateKey]) return TRANSLATIONS[loc][candidateKey];
  if (loc !== "en" && TRANSLATIONS.en?.[candidateKey]) return TRANSLATIONS.en[candidateKey];
  return null;
};

const pluralRulesByLanguage: Record<Language, Intl.PluralRules> = {
  zh: new Intl.PluralRules("zh"),
  en: new Intl.PluralRules("en"),
};
const pluralRule = (loc: Language, count: number): Intl.LDMLPluralRule => {
  return pluralRulesByLanguage[loc].select(count);
};

/**
 * Pick the right key variant for a count. Tries `${key}_zero` (only when count === 0),
 * then `${key}_${rule}` (e.g. `_one` / `_other`), then `${key}_other`, then the bare
 * key. Asian locales (no grammatical plural) define only the bare key and hit the
 * final step. Each candidate runs through the locale → English fallback so an
 * untranslated key still resolves to the English `_one` / `_other` variant.
 */
const resolvePluralKey = (loc: Language, key: string, count: number): string => {
  const candidates: string[] = [];
  if (count === 0) candidates.push(`${key}_zero`);
  candidates.push(`${key}_${pluralRule(loc, count)}`, `${key}_other`, key);

  for (const candidate of candidates) {
    if (lookupEntry(loc, candidate) !== null) return candidate;
  }
  return key;
};

/**
 * Translation function with fallback behavior.
 * - Locale fallback: target language → English → key itself.
 * - Plural fallback: when params include a numeric `count`, the lookup picks
 *   `${key}_one` / `${key}_other` (or `${key}_zero` when count === 0) per
 *   `Intl.PluralRules`, and falls back to the bare key when no variants exist.
 */
type TranslationParams = Record<string, string | number> & { lng?: Language };

export const t = (
  key: string,
  paramsOrLocale?: TranslationParams | Language,
  legacyParams?: Record<string, string | number>,
): string => {
  const params = legacyParams ?? (typeof paramsOrLocale === "string" ? undefined : paramsOrLocale);
  const loc: Language = typeof paramsOrLocale === "string"
    ? paramsOrLocale
    : isLanguage(params?.lng)
      ? params.lng
      : locale();

  const lookupKey =
    typeof params?.count === "number" ? resolvePluralKey(loc, key, params.count) : key;

  const result = lookupEntry(loc, lookupKey);
  if (result === null) return key;

  if (!params) return result;

  let out = result;
  for (const [k, v] of Object.entries(params)) {
    if (k === "lng") continue;
    // A placeholder can appear more than once ("{name} … your {name} app").
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
};

/**
 * Initialize locale from localStorage
 * Call this during app initialization
 */
export const initLocale = (): Language => {
  let selected: Language = DEFAULT_LANGUAGE;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_PREF_KEY);
      if (isLanguage(stored)) selected = stored;
    } catch (e) {
      console.warn("Failed to read language preference:", e);
    }
  }
  // Also normalizes retired locale preferences, without changing a saved English choice.
  setLocale(selected);
  return selected;
};

declare global {
  interface Window { __OPENWORK_I18N__?: { setLanguage: (language: Language) => Promise<void> }; }
}
