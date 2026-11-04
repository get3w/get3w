import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationsPage } from "../src/react-app/domains/automations/automations-page";
import { currentLocale, setLocale } from "../src/i18n";

test("personal automations reports availability without login or cloud controls", () => {
  const previous = currentLocale();
  try {
    for (const [locale, expected] of [["zh", "定时自动化将在后续版本提供"], ["en", "Scheduled automations will be available in a future version"]] as const) {
      setLocale(locale);
      const markup = renderToStaticMarkup(createElement(AutomationsPage, { onSignIn: () => { throw new Error("unexpected sign in"); } }));
      expect(markup).toContain(expected);
      expect(markup).not.toContain("<button");
      expect(markup).not.toContain("<a ");
    }
  } finally { setLocale(previous); }
});
