import { expect, test } from "bun:test";

import type { ModelOption } from "../src/app/types";
import {
  AUTO_ROUTER_GROUP,
  fixedModelTitle,
  isAutoRouterModel,
  managesOwnBehavior,
  modelGroups,
  modelSource,
  modelSubtitle,
  modelTitle,
  nonDefaultModelSummary,
  publicModelTitle,
} from "../src/react-app/domains/models/model-catalog";

function option(providerID: string, modelID: string, title: string, description: string): ModelOption {
  return { providerID, modelID, title, description, behaviorTitle: "Effort", behaviorLabel: "Default", behaviorDescription: "", behaviorValue: null, isFree: false };
}

const router = option("openwork-auto", "openwork-smart-ar_engineering", "Smart: Engineering", "Smart Model Router");
const design = option("openwork-auto", "openwork-smart-ar_design", "Smart: Design", "Smart Model Router");
const opus = option("anthropic", "opus", "Claude Opus", "Anthropic");

test("Smart is the first entry, in its own group, even when pinned or recent", () => {
  const groups = modelGroups([opus, router], [router], [router]);
  expect(groups[0]).toEqual({ value: AUTO_ROUTER_GROUP, items: [router] });
  expect(groups.slice(1).flatMap((group) => group.items).some(isAutoRouterModel)).toBe(false);
});

test("two Smart Routers are both listed first, by name, whatever order the engine reports them in", () => {
  for (const options of [[opus, router, design], [design, opus, router]]) {
    const groups = modelGroups(options, [design], []);
    expect(groups[0]).toEqual({ value: AUTO_ROUTER_GROUP, items: [design, router] });
    expect(groups[0]?.items.map(modelTitle)).toEqual(["Smart: Design", "Smart: Engineering"]);
    expect(groups.slice(1).flatMap((group) => group.items).some(isAutoRouterModel)).toBe(false);
  }
});

test("Smart models are named by their router", () => {
  expect(isAutoRouterModel(router)).toBe(true);
  expect(isAutoRouterModel(design)).toBe(true);
  expect(isAutoRouterModel(opus)).toBe(false);
  expect(modelTitle(router)).toBe("Smart: Engineering");
  expect(publicModelTitle(design)).toBe("Smart: Design");
  expect(fixedModelTitle(router)).toBe("Smart: Engineering");
  expect(modelSubtitle(router)).toBe("Picks the best model for each task");
});

test("a Smart model without a name never shows its id", () => {
  const unnamed = { providerID: "openwork-auto", modelID: "openwork-smart-ar_x" };
  expect(fixedModelTitle(unnamed)).toBeUndefined();
  expect(modelTitle(unnamed)).toBe("Smart");
  expect(publicModelTitle({ ...unnamed, title: "openwork-smart-ar_x" })).toBe("Smart");
});

test("Smart is an Get3W Gateway model with no effort of its own", () => {
  expect(modelSource({ ...router, source: "cloud" })).toBe("gateway");
  expect(managesOwnBehavior(router)).toBe(true);
  expect(managesOwnBehavior(design)).toBe(true);
  expect(nonDefaultModelSummary(router, "high", "High")).toBeNull();
  expect(nonDefaultModelSummary(opus, "high", "High")).toBe("High");
});

test("without a Smart Router there is no Smart group", () => {
  expect(modelGroups([opus], [], []).some((group) => group.value === AUTO_ROUTER_GROUP)).toBe(false);
});
