import { expect, test } from "bun:test";
import { DEN_CONNECTOR_SETUP_PATH, DEN_DASHBOARD_LINKS, denConnectorSetupUrl, denDashboardUrl } from "../src/app/lib/den-dashboard-links";

// URL contracts only. Availability of hosted pages requires separate API/UI acceptance.
test("dashboard URLs preserve the configured service origin and route query", () => {
  for (const link of Object.keys(DEN_DASHBOARD_LINKS) as Array<keyof typeof DEN_DASHBOARD_LINKS>) {
    const url = new URL(denDashboardUrl("https://account.example.test/base/", link));
    expect(url.origin).toBe("https://account.example.test");
    expect(url.pathname + url.search).toBe(DEN_DASHBOARD_LINKS[link]);
  }
  expect(denDashboardUrl("https://account.example.test/", "modelConnections"))
    .toBe("https://account.example.test/dashboard/library?show=models");
});

test("connector URLs encode an identifier as one path segment", () => {
  expect(denConnectorSetupUrl(" https://account.example.test/ ", "drive/team?#"))
    .toBe(`https://account.example.test${DEN_CONNECTOR_SETUP_PATH}drive%2Fteam%3F%23`);
});

test("incomplete connector settings do not produce a navigation target", () => {
  expect(denConnectorSetupUrl("  ", "drive")).toBeNull();
  expect(denConnectorSetupUrl("https://account.example.test", "  ")).toBeNull();
});
