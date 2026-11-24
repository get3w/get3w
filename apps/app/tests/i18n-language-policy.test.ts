import { afterEach, expect, test } from "bun:test";
import { currentLocale, DEFAULT_LANGUAGE, initLocale, isLanguage, LANGUAGE_OPTIONS, LANGUAGES, setLocale } from "../src/i18n";
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  setLocale(DEFAULT_LANGUAGE);
});
function storage(value: string | null) {
  const values = new Map<string, string>();
  if (value !== null) values.set("get3w.language", value);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, next: string) => values.set(key, next),
  } } });
  return values;
}
test("only Simplified Chinese and English are offered, Chinese first", () => {
  expect(LANGUAGES).toEqual(["zh", "en"]);
  expect(LANGUAGE_OPTIONS.map(option => option.value)).toEqual(["zh", "en"]);
  for (const value of ["ja", "vi", "pt-BR", "th", "fr", "ca", "es", "ru"]) expect(isLanguage(value)).toBe(false);
});
test("fresh and retired language preferences initialize to Chinese", () => {
  for (const previous of [null, "ja", "ru", "invalid"]) {
    const values = storage(previous);
    setLocale("en");
    if (previous === null) values.delete("get3w.language");
    else values.set("get3w.language", previous);
    expect(initLocale()).toBe("zh");
    expect(currentLocale()).toBe("zh");
    expect(values.get("get3w.language")).toBe("zh");
  }
});
test("existing English choice is preserved", () => {
  storage("en");
  expect(initLocale()).toBe("en");
});

test("market defaults apply only when no valid preference was saved", () => {
  for (const defaultLanguage of ["zh", "en"] as const) {
    storage(null);
    expect(initLocale(defaultLanguage)).toBe(defaultLanguage);
    for (const saved of ["zh", "en"] as const) {
      storage(saved);
      expect(initLocale(defaultLanguage)).toBe(saved);
    }
  }
});
