import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "https://web.example/" });
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { LocalProvider, useLocal } = await import("../src/react-app/kernel/local-provider");
const { createClientV2 } = await import("../src/app/lib/opencode-v2-adapter");
const { LOCAL_PREFERENCES_KEY, readShowThinkingPreference } = await import("../src/react-app/kernel/local-preferences-storage");
const { setLocale } = await import("../src/i18n");
const { splitV2Prompt } = await import("../src/app/lib/v2-prompt-context");

const base = "http://127.0.0.1:9/workspace/ws_1/opencode2";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
  setLocale("zh");
});
afterAll(() => GlobalRegistrator.unregister());

async function sentPromptMetadata(onText?: (text: string) => void): Promise<unknown> {
  let prompt: unknown;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/prompt")) {
        prompt = await request.json();
        if (prompt && typeof prompt === "object") {
          const text = Reflect.get(prompt,"text");
          if (typeof text === "string") onText?.(text);
        }
      }
      if (path.endsWith("/message")) return Response.json({ data: [] });
      if (request.method === "GET") return Response.json({ location: {}, data: { id: "ses_1", agent: "build" } });
      return new Response(null, { status: 204 });
    },
  });
  const client = createClientV2(base, "/tmp/ws", { token: "t" });
  const result = await client.session.promptAsync({
    sessionID: "ses_1",
    model: { providerID: "anthropic", modelID: "claude" },
    parts: [{ type: "text", text: "hello" }],
  });
  expect(result.error).toBeUndefined();
  return prompt && typeof prompt === "object" ? Reflect.get(prompt, "metadata") : undefined;
}

test("each prompt carries Settings › Show model reasoning to the engine", async () => {
  window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify({ showThinking: false, showThinkingResetToOff: true }));
  expect(await sentPromptMetadata()).toEqual({ get3w: { showReasoning: false } });

  window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify({ showThinking: true, showThinkingResetToOff: true }));
  expect(await sentPromptMetadata()).toEqual({ get3w: { showReasoning: true } });
});

test("automatic titles follow the current Desktop language without changing visible user text", async () => {
  for (const language of ["zh", "en", "zh"] as const) {
    setLocale(language);
    let sent = "";
    await sentPromptMetadata(text => { sent = text; });
    const parsed = splitV2Prompt(sent);
    expect(parsed.segments).toEqual([{kind:"text",text:"hello"}]);
    expect(parsed.context).toContain(`Desktop language setting: ${language === "en" ? "English" : "Simplified Chinese (简体中文)"}`);
    expect(parsed.context).toContain("This setting applies only to the conversation title, not the answer.");
  }
});

test("title context is sent only on the first successful turn, including after reopening a chat", async () => {
  const prompts: string[] = [];
  const stored = new Set<string>(["existing", "forked"]);
  let historyReads = 0;
  let failNextPrompt = false;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      const sessionID = path.split("/session/")[1]?.split("/")[0] ?? "";
      if (path.endsWith("/message")) {
        historyReads += 1;
        return Response.json({ data: stored.has(sessionID) ? [{ id: "prior-message" }] : [] });
      }
      if (path.endsWith("/prompt")) {
        const body: unknown = await request.json();
        prompts.push(String(Reflect.get(Object(body), "text")));
        if (failNextPrompt) {
          failNextPrompt = false;
          return new Response(null, { status: 500 });
        }
        stored.add(sessionID);
      }
      if (request.method === "GET") return Response.json({ data: { id: sessionID } });
      return new Response(null, { status: 204 });
    },
  });
  const client = createClientV2(base, "/tmp/ws", { token: "t" });
  const send = (sessionID: string, target = client) => target.session.promptAsync({
    sessionID,
    model: { providerID: "anthropic", modelID: "claude" },
    parts: [{ type: "text", text: "continue" }, { type: "text", synthetic: true, text: "Other context" }],
  });
  await send("new");
  setLocale("en");
  await send("new");
  expect(historyReads).toBe(1);
  await send("existing");
  await send("forked");
  await send("new", createClientV2(base, "/tmp/ws", { token: "t" }));
  expect(splitV2Prompt(prompts[0] ?? "").context).toContain("Desktop language setting:");
  for (const prompt of prompts.slice(1)) {
    expect(splitV2Prompt(prompt).context).toBe("Other context");
    expect(splitV2Prompt(prompt).segments).toEqual([{ kind: "text", text: "continue" }]);
  }
  failNextPrompt = true;
  expect((await send("retry")).error).toBeDefined();
  expect((await send("retry")).error).toBeUndefined();
  for (const prompt of prompts.slice(-2)) {
    expect(splitV2Prompt(prompt).context).toContain("Desktop language setting: English");
  }
});

test("an unset preference sends the setting's default (off)", async () => {
  expect(await sentPromptMetadata()).toEqual({ get3w: { showReasoning: false } });
});

test("saved preferences from before the reset are treated as off", async () => {
  window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify({ showThinking: true }));
  expect(readShowThinkingPreference()).toBe(false);
  window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify({ showThinking: true, showThinkingResetToOff: true }));
  expect(readShowThinkingPreference()).toBe(true);
});

async function mountLocal() {
  let current: { showThinking: boolean } | null = null;
  function Probe() {
    current = useLocal().prefs;
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(LocalProvider, { children: createElement(Probe) })));
  await act(async () => root.unmount());
  return { prefs: current, stored: JSON.parse(window.localStorage.getItem(LOCAL_PREFERENCES_KEY) ?? "null") };
}

test("the app switches existing users off once, then keeps their choice", async () => {
  window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify({ showThinking: true, analyticsEnabled: false }));
  window.localStorage.setItem("get3w.showThinking", "true");
  const first = await mountLocal();
  expect(first.prefs?.showThinking).toBe(false);
  expect(first.stored).toMatchObject({ showThinking: false, showThinkingResetToOff: true, analyticsEnabled: false });
  expect(window.localStorage.getItem("get3w.showThinking")).toBeNull();

  window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify({ ...first.stored, showThinking: true }));
  const second = await mountLocal();
  expect(second.prefs?.showThinking).toBe(true);
});

test("a fresh install starts with Show model reasoning off", async () => {
  expect((await mountLocal()).prefs?.showThinking).toBe(false);
});
