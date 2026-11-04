/** @jsxImportSource react */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test } from "bun:test";
import { GeneralSettingsView } from "../src/react-app/domains/settings/pages/general-view";
import { setLocale } from "../src/i18n";
const props = { developerMode: true, onNavigateTab: () => {}, onSendFeedback: () => {}, onJoinDiscord: () => {}, onReportIssue: () => {} };
afterEach(()=>setLocale("zh"));
test("actual settings overview renders Chinese and switches back to English",()=>{
 setLocale("zh");const zh=renderToStaticMarkup(<GeneralSettingsView {...props}/>);
 for(const label of ["偏好设置","权限","外观","快捷键","环境","更新"])expect(zh).toContain(label);
 for(const label of ["Preferences","Permissions","Keyboard shortcuts","Appearance"])expect(zh).not.toContain(label);
 setLocale("en");const en=renderToStaticMarkup(<GeneralSettingsView {...props}/>);
 for(const label of ["Preferences","Permissions","Appearance"])expect(en).toContain(label);
 setLocale("zh");expect(renderToStaticMarkup(<GeneralSettingsView {...props}/>)).toBe(zh);
});

test("connector labels follow locale without changing machine states", async () => {
 const { recordedConnectorLabel } = await import("../src/react-app/domains/settings/connector-readiness");
 setLocale("zh");expect(recordedConnectorLabel("Ready")).toBe("已就绪");expect(recordedConnectorLabel("Change setting")).toBe("更改设置");
 setLocale("en");expect(recordedConnectorLabel("Set up")).toBe("Set up");expect(recordedConnectorLabel("Ready")).toBe("Ready");
});

test("automation schedule uses the app locale while keeping the timezone", async () => {
 const { formatAutomationSchedule } = await import("../src/react-app/domains/automations/automation-format");
 const schedule = {kind: "daily", hour: 9, minute: 30, timezone: "Asia/Shanghai"} as const;
 setLocale("zh");expect(formatAutomationSchedule(schedule)).toBe("每天 · 09:30 · Asia/Shanghai");
 setLocale("en");expect(formatAutomationSchedule(schedule)).toBe("Daily · 09:30 · Asia/Shanghai");
});
