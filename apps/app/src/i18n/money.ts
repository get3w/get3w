import { currentLocale, type Language } from "./index";

// Matches api/managers/charge_manager/core.py USD_TO_CNY billing policy.
// This is a platform conversion rate, not a live foreign-exchange quote.
export const USD_TO_CNY = 7;

export function formatMoney(amount: string | number, sourceCurrency: string, language: Language = currentLocale()): string {
  if (typeof amount === "string" && !/^[+-]?\d+(?:\.\d+)?$/.test(amount)) return "—";
  const value = Number(amount);
  const source = sourceCurrency.toUpperCase();
  if (!Number.isFinite(value) || (source !== "USD" && source !== "CNY")) return "—";
  const currency = language === "zh" ? "CNY" : "USD";
  const converted = source === currency ? value : source === "USD" ? value * USD_TO_CNY : value / USD_TO_CNY;
  return new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 6,
  }).format(converted);
}
