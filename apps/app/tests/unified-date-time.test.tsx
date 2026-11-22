import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationScheduleFields } from "../src/react-app/domains/automations/automation-schedule-fields";
import { setLocale } from "../src/i18n";

test("automation once, daily and weekly reuse shared calendar and time selectors", () => {
  setLocale("zh");
  for (const schedule of [
    {kind:"once",timezone:"Asia/Shanghai",at:Date.now()+86400000},
    {kind:"daily",timezone:"Asia/Shanghai",hour:8,minute:50},
    {kind:"weekly",timezone:"Asia/Shanghai",hour:8,minute:50,daysOfWeek:[1]},
  ] satisfies import("@get3w/types/automations").AutomationSchedule[]) {
    const markup=renderToStaticMarkup(createElement(AutomationScheduleFields,{schedule,onChange:()=>{}}));
    expect(markup).toContain("data-time-picker");
    expect(markup).not.toContain('type="time"');
    expect(markup).not.toContain('type="datetime-local"');
    if(schedule.kind==="once") expect(markup).toContain("data-followup-date-time");
    else {expect(markup).toContain("08");expect(markup).toContain("50");}
  }
});

test("interval windows reuse the time picker and retain end-of-day semantics", () => {
  const markup = renderToStaticMarkup(createElement(AutomationScheduleFields, {
    schedule: { kind: "interval", timezone: "Asia/Shanghai", everyHours: 2, daysOfWeek: [1], startHour: 23, endHour: 24 },
    onChange: () => {},
  }));
  expect(markup.match(/data-time-picker/g)).toHaveLength(2);
  expect(markup).toContain("当天结束");
  expect(markup).toContain('id="automation-window-start"');
  expect(markup).toContain('id="automation-window-end"');
});

test("schedule labels target actionable date and time triggers", () => {
  for (const schedule of [
    { kind: "once", timezone: "Asia/Shanghai", at: Date.now() + 86400000 },
    { kind: "daily", timezone: "Asia/Shanghai", hour: 8, minute: 50 },
  ] satisfies import("@get3w/types/automations").AutomationSchedule[]) {
    const markup = renderToStaticMarkup(createElement(AutomationScheduleFields, { schedule, onChange: () => {} }));
    const id = schedule.kind === "once" ? "automation-once-at" : "automation-time";
    expect(markup).toMatch(new RegExp(`<button[^>]*id="${id}"`));
    expect(markup).not.toContain(`<div id="${id}"`);
  }
});


test("Desktop forms keep date and time editors on shared controls", () => {
  const violations: string[] = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        const source = readFileSync(path, "utf8");
        if (/type\s*=\s*(?:["'](?:date|time|datetime-local|month|week)["']|\{["'](?:date|time|datetime-local|month|week)["']\})/.test(source)) violations.push(path);
        if (source.includes('from "react-day-picker"') && !path.endsWith("/components/ui/date-time-picker.tsx")) violations.push(path);
      }
    }
  }
  visit(join(import.meta.dir, "../src"));
  visit(join(import.meta.dir, "../../desktop/electron"));
  expect(violations).toEqual([]);
});
