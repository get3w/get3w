import { expect, test } from "bun:test";
import { createElement } from "react";
import { MemoryRouter } from "react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationsPage } from "../src/react-app/domains/automations/automations-page";
import { currentLocale, setLocale } from "../src/i18n";

test("personal automations provides a localized sign-in action before loading account data", () => {
  const previous = currentLocale();
  try {
    setLocale("zh");
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AutomationsPage)));
    expect(markup).toContain("登录后创建自动化");
    expect(markup).not.toContain("后续版本");
    setLocale("en");
    expect(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AutomationsPage)))).toContain("Sign in to create automations");
  } finally { setLocale(previous); }
});
