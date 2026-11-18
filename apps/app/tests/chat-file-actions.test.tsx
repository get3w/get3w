/** @jsxImportSource react */
import { afterAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
const ownsDom = !GlobalRegistrator.isRegistered;
if (ownsDom) GlobalRegistrator.register({ url: "http://localhost/" });
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { FileActions } = await import("../src/components/markdown/file-actions");
const { OpenTargetProvider } = await import("../src/lib/target-provider");
const { renderMarkdownHtml } = await import("../src/components/markdown/markdown-primitive");
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
afterAll(async () => { if (ownsDom) await GlobalRegistrator.unregister(); });

test("chat file references replace long paths with action slots and retain video previews", () => {
  const html = renderMarkdownHtml('[video](/Users/test/work/clip.mp4)\n\n[report](report.pdf)\n\n[site](https://example.com)', "chat");
  const host = document.createElement("div"); host.innerHTML = html;
  expect(host.querySelector("video")).not.toBeNull();
  expect(host.querySelector('[data-get3w-file-actions="/Users/test/work/clip.mp4"]')).not.toBeNull();
  expect(host.querySelector('[data-get3w-file-actions="report.pdf"]')).not.toBeNull();
  expect(host.querySelector('a[href="https://example.com"]')).not.toBeNull();
  expect(host.textContent).not.toContain("/Users/test");
});

test("local reveal uses the shared guarded opener and remote reveal stays disabled", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const calls: unknown[] = [];
  try {
    await act(async () => root.render(<OpenTargetProvider isLocalWorkspace workspaceRoot="/work" onOpenTarget={(target, options) => calls.push({ target, options })}><FileActions href="clip.mp4" /></OpenTargetProvider>));
    const buttons = host.querySelectorAll("button");
    expect(buttons.length).toBe(4);
    expect(buttons[0].textContent).toBe("clip.mp4");
    await act(async () => buttons[0].click());
    expect(calls).toMatchObject([{ target: { value: "clip.mp4" }, options: undefined }]);
    calls.length = 0;
    await act(async () => buttons[1].click());
    expect(calls).toMatchObject([{ target: { value: "clip.mp4" }, options: undefined }]);
    calls.length = 0;
    await act(async () => buttons[3].click());
    expect(calls).toMatchObject([{ target: { value: "clip.mp4" }, options: { external: true, reveal: true } }]);
    await act(async () => root.render(<OpenTargetProvider isLocalWorkspace={false} onOpenTarget={() => calls.push("remote")}><FileActions href="clip.mp4" /></OpenTargetProvider>));
    expect(host.querySelectorAll("button")[3].disabled).toBe(true);
    expect(host.querySelectorAll("button")[2].disabled).toBe(true);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("download resolves the owning workspace before saving and carries conversation scope", async () => {
  const { createGet3wServerClient } = await import("../src/app/lib/get3w-server");
  const client = createGet3wServerClient({ baseUrl: "http://localhost" });
  const calls: unknown[] = [];
  client.resolveArtifacts = async (...args) => {
    calls.push(args);
    return { items: [{ id: "file:clip.mp4", kind: "file", value: "clip.mp4", name: "clip.mp4", preview: "video", confidence: 100, reason: "verified", exists: true, fileScope: "conversation" }] };
  };
  client.downloadWorkspaceFile = async (...args) => { calls.push(args); return { data: new ArrayBuffer(4), contentType: "video/mp4" }; };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<OpenTargetProvider client={client} workspaceId="workspace" sessionId="session" workspaceRoot="/work"><FileActions href="/work/clip.mp4" /></OpenTargetProvider>));
    await act(async () => { host.querySelectorAll("button")[2].click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(calls).toMatchObject([
      ["workspace", [{ value: "/work/clip.mp4" }], { sessionId: "session" }],
      ["workspace", "clip.mp4", { sessionId: "session", fileScope: "conversation" }],
    ]);
    expect(host.querySelectorAll("button")[2].disabled).toBe(false);
  } finally { await act(async () => root.unmount()); host.remove(); }
});


test("each file keeps its own visible name above its actions, including encoded paths", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<OpenTargetProvider workspaceRoot="/work" onOpenTarget={() => {}}>
      <FileActions href="/work/regional%20sales.docx" />
      <FileActions href="/work/regional_rollup.csv" />
    </OpenTargetProvider>));
    const cards = host.querySelectorAll("[data-get3w-file-card]");
    expect(cards.length).toBe(2);
    for (const [index, name] of ["regional sales.docx", "regional_rollup.csv"].entries()) {
      expect(cards[index].querySelector("button")?.textContent).toBe(name);
      expect(cards[index].querySelector("[data-get3w-file-card-actions]")?.querySelectorAll("button").length).toBe(3);
      expect(cards[index].textContent).not.toContain("/work/");
    }
  } finally { await act(async () => root.unmount()); host.remove(); }
});
