import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { Get3WMark, ProviderIcon } from "../src/react-app/design-system/provider-icon";

function paths(markup: string) {
  return [...markup.matchAll(/<path\b[^>]*>/g)].map(([path]) => ({
    d: path.match(/\bd="([^"]*)"/)?.[1],
    fillRule: path.match(/\bfill-rule="([^"]*)"/)?.[1],
  }));
}

const canonicalMark = readFileSync(new URL("../public/get3w-mark.svg", import.meta.url), "utf8");
const canonicalPaths = paths(canonicalMark);

function expectGet3WMark(markup: string) {
  expect(markup).toContain(`viewBox="${canonicalMark.match(/viewBox="([^"]+)"/)?.[1]}"`);
  expect(markup).toContain('fill="currentColor"');
  expect(markup).toContain('aria-label="Get3W"');
  expect(paths(markup)).toEqual(canonicalPaths);
  expect(markup).not.toContain("<img");
  expect(markup).not.toContain("https://");
  expect(markup).not.toMatch(/fill="(?:#|white|black)/);
}

describe("Get3W provider brand mark", () => {
  test.each([
    { providerId: "get3w" },
    { providerId: "  get3w  " },
    { providerId: "550e8400-e29b-41d4-a716-446655440000", providerName: "Get3W" },
    { providerId: "550e8400-e29b-41d4-a716-446655440000", providerName: "  get3w Cloud  " },
  ])("uses the themed inline mark for $providerId / $providerName", (props) => {
    expectGet3WMark(renderToStaticMarkup(createElement(ProviderIcon, {
      ...props,
      baseUrl: "https://api.example.com/v1",
    })));
  });

  test("preserves provider size and wrapper classes", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, {
      providerId: "get3w", size: 28, className: "text-gray-12 provider-brand",
    }));
    expectGet3WMark(markup);
    expect(markup).toContain('<div class="text-gray-12 provider-brand"');
    expect(markup).toContain("width:28px;height:28px");
    expect(markup).toContain('width="28" height="28"');
  });

  test("shared mark keeps canonical geometry and evenodd transparent cutouts", () => {
    const markup = renderToStaticMarkup(createElement(Get3WMark));
    expect(canonicalPaths.length).toBeGreaterThan(0);

    expectGet3WMark(markup);
    expect(markup).toContain('width="16" height="16"');
    // The canonical subpaths form holes, not background-colored overlays.

    expect(markup).not.toMatch(/<(?:rect|circle|image)\b/);
  });

  test("shared mark accepts its own size and className", () => {
    const markup = renderToStaticMarkup(createElement(Get3WMark, {
      size: 32, className: "text-gray-12 shared-brand",
    }));
    expectGet3WMark(markup);
    expect(markup).toContain('width="32" height="32" class="text-gray-12 shared-brand"');
  });
});

describe("other provider icons", () => {
  test.each([
    { providerId: "openai", pathStart: "M22.28 9.82", paint: 'fill="currentColor"' },
    { providerId: "opencode", pathStart: "M12 2L2 7l10 5 10-5-10-5Z", paint: 'stroke="currentColor"' },
  ])("keeps $providerId's existing inline logo", ({ providerId, pathStart, paint }) => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { providerId }));
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain(`d="${pathStart}`);
    expect(markup).toContain(paint);
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain('aria-label="Get3W"');
  });

  test("unrelated providers still use their remote image", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { providerId: "google" }));
    expect(markup).toContain('<img src="https://cdn.simpleicons.org/googlegemini"');
    expect(markup).not.toContain("<svg");
  });

  test("opaque unrelated providers still use the configured URL's favicon", () => {
    const markup = renderToStaticMarkup(createElement(ProviderIcon, {
      providerId: "550e8400-e29b-41d4-a716-446655440000", providerName: "Custom provider", baseUrl: "https://api.example.com/v1",
    }));
    expect(markup).toContain('<img src="https://www.google.com/s2/favicons?sz=64&amp;domain=example.com"');
    expect(markup).not.toContain("<svg");
  });
});
