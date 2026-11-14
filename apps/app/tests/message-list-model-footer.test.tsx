import { afterAll, afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { UIMessage } from "ai"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import type { ModelOption } from "../src/app/types"

GlobalRegistrator.register({ url: "https://web.example/" })
const previousAct = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT")
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
const { PlatformProvider, createDefaultPlatform } = await import("../src/react-app/kernel/platform")
const { MessageListProvider } = await import("../src/components/chat/message-list-provider")
const { DenAuthProvider } = await import("../src/react-app/domains/cloud/den-auth-provider")
const { Get3wAccount } = await import("../src/react-app/domains/cloud/get3w-account")
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
const { MessageList } = await import("../src/components/chat/message-list")
const { useModelPickerCatalogStore } = await import("../src/react-app/domains/session/models/model-collections-store")
const { useAutoRouteStore } = await import("../src/react-app/domains/session/sync/auto-route-store")
const { currentLocale, setLocale } = await import("../src/i18n")
let savedLocale: ReturnType<typeof currentLocale>
beforeEach(() => { savedLocale = currentLocale(); setLocale("en") })
afterEach(() => setLocale(savedLocale))
let mounted: { root: Root; container: HTMLElement } | null = null

afterEach(async () => {
  if (mounted) {
    const { root, container } = mounted
    await act(async () => root.unmount())
    container.remove()
    mounted = null
  }
  useModelPickerCatalogStore.setState({ bySession: {} })
  useAutoRouteStore.setState({ bySession: {} })
  Reflect.deleteProperty(window, "__GET3W_ACCOUNT__")
})
afterAll(() => {
  queryClient.clear()
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct)
  GlobalRegistrator.unregister()
})

function answer(id: string): UIMessage {
  return {
    id, role: "assistant",
    parts: [{ type: "text", text: "The document is ready." }],
    metadata: { opencode: { created: 1000, completed: 8000, replyModel: { providerID: "anthropic", modelID: "claude-sonnet", name: "Claude Sonnet", resolved: true } } },
  }
}
async function render(messages: UIMessage[], streaming = false, modelOptions?: readonly ModelOption[]) {
  if (modelOptions) useModelPickerCatalogStore.getState().publish("session_fixture", Symbol(), modelOptions)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  mounted = { root, container }
  await act(async () => root.render(createElement(MemoryRouter, {}, createElement(Get3wAccount), createElement(QueryClientProvider, { client: queryClient,
    children: createElement(DenAuthProvider, { children: createElement(PlatformProvider, {
    value: createDefaultPlatform(),
    children: createElement(MessageListProvider, {
      workspaceId: "workspace_fixture", sessionId: "session_fixture",
      showThinking: true, developerMode: false, displaySuggestions: false, providerConnectedCount: 0,
      dispatchAction: () => {}, setPrompt: () => {}, onRevertToUserMessage: () => {},
      onForkAtMessage: () => {}, onEditUserMessage: () => {},
      onMcpReconnect: async () => {}, onMcpReopenAuthorization: async () => {},
      children: createElement(MessageList, { messages, status: streaming ? "streaming" : "ready" }),
    }),
  }) }), }))))
  return container
}

test("generated results stay between reply prose and the hover-only footer", async () => {
  Reflect.set(window, "__GET3W_ACCOUNT__", {
    status: async () => ({ status: "signed_in", user: { id: "fixture" }, error: null, pending: false }),
    taskCatalog: async () => ({ catalog_version: "fixture", expiresAt: Date.now() + 60000, offline: false, models: [] }),
    modelTasks: async () => ({ items: [
      { key: "image", messageId: "reply", slug: "demo/text-to-image", status: "completed", requestId: "image", updatedAt: 1, chargedUsd: "0.028571", outputs: ["https://xianchou.com/cup.jpg"] },
      { key: "video", messageId: "reply", slug: "demo/text-to-video", status: "processing", requestId: "video", updatedAt: 1, outputs: [] },
    ] }),
  })
  const container = await render([answer("reply"), { id: "follow-up", role: "user", parts: [{ type: "text", text: "Next question" }] }])
  const results = container.querySelector('[data-model-task="image"]')?.closest("section")
  expect(results).not.toBeNull()
  expect(container.querySelectorAll('[data-model-task="image"]').length).toBe(1)
  expect(results?.previousElementSibling?.textContent).toContain("The document is ready.")
  expect(container.querySelector('[data-testid="reply-actions"]')).not.toBeNull()
  expect(results?.querySelector('[data-model-task="video"]')).not.toBeNull()
  expect(results?.textContent).not.toContain("USD")
  expect(results?.querySelector("img")?.getAttribute("src")).toBe("https://xianchou.com/cup.jpg")
  expect(container.textContent).toContain("Next question")
})

test("completed reply model stays in the footer and reveals on hover", async () => {
  const container = await render([answer("reply")])
  const labels = container.querySelectorAll('[data-testid="reply-model"]')
  expect(labels.length).toBe(1)
  const label = labels[0]
  expect(label.textContent).toBe("Replied with Claude Sonnet")
  expect(label.closest('[data-testid="completed-work-rail"]')).toBeNull()
  expect(label.className).toContain("opacity-0")
  expect(label.className).toContain("group-hover/message-group:opacity-100")
  expect(label.className).toContain("group-focus-within/message-group:opacity-100")
  expect(label.className).not.toContain("max-lg:opacity-100")
  expect(label.querySelector('[aria-hidden="true"]')?.className).toContain("size-3")
  expect(label.querySelector("svg")).not.toBeNull()
  expect(container.querySelector('[data-testid="completed-work-rail"]')?.textContent).toBe("Worked for 7s")
  expect(label.previousElementSibling?.className).toContain("group-focus-within/message-group:opacity-100")
  expect(label.className).toContain("pointer-coarse:opacity-100")
  expect(label.className).toContain("motion-reduce:transition-none")
  expect(label.className).toContain("dark:text-foreground/70")
})

test("collapsed steps retain duration without a visible count or duplicate footer model", async () => {
  const steps: UIMessage[] = Array.from({ length: 6 }, (_, index) => ({
    id: `step_${index}`, role: "assistant",
    parts: [{ type: "reasoning", text: `Checked section ${index + 1}.` }],
    metadata: { opencode: { created: 1000 + index * 1000 } },
  }))
  const container = await render([...steps, answer("reply")])
  const rail = container.querySelector('[data-testid="completed-work-rail"]')
  expect(rail?.tagName).toBe("BUTTON")
  // The text-first summary keeps only the duration; step details remain in the fold.
  expect([...(rail?.querySelectorAll("span:not([aria-hidden])") ?? [])].map((span) => span.textContent)).toEqual(["Worked for 7s"])
  expect(rail?.getAttribute("aria-label")).toBe("Worked for 7s, 6 steps. Show steps")
  expect(rail?.textContent).not.toContain("Claude Sonnet")
  expect(rail?.getAttribute("aria-label")).not.toContain("Claude Sonnet")
  expect(container.querySelectorAll('[data-testid="reply-model"]').length).toBe(1)
})

test("older turns keep their footer hover-only", async () => {
  const container = await render([answer("first"), { id: "user", role: "user", parts: [{ type: "text", text: "Check again." }] }, answer("last")])
  const labels = container.querySelectorAll('[data-testid="reply-model"]')
  expect(labels.length).toBe(2)
  expect(labels[0].className.split(" ")).toContain("opacity-0")
  expect(labels[1].className.split(" ")).toContain("opacity-0")
  expect(labels[0].className).toContain("group-hover/message-group:opacity-100")
  expect(labels[1].className).toContain("group-hover/message-group:opacity-100")
})

test("an Auto reply renders the Get3W mark beside the routed name", async () => {
  const message = answer("reply")
  message.metadata = { opencode: { replyModel: {
    requestedProviderID: "openwork", providerID: "openai", modelID: "gpt-6", name: "GPT-6", resolved: true,
  } } }
  const container = await render([message])
  const label = container.querySelector('[data-testid="reply-model"]')
  expect(label?.textContent).toBe("Replied with GPT-6")
  expect(label?.querySelector('svg[aria-label="Get3W"]')).not.toBeNull()
  expect(label?.querySelector('svg[aria-label="Get3W"]')?.closest('[aria-hidden="true"]')).not.toBeNull()
})

test("a Smart Router reply names the model the gateway chose, with its thinking level", async () => {
  const smart = "openwork-smart-ar_engineering"
  const autoAnswer = (id: string, created: number, completed: number): UIMessage => ({ ...answer(id), metadata: { opencode: { created, completed,
    replyModel: { providerID: "openwork-auto", modelID: smart, requestedProviderID: "openwork-auto", requestedModelID: smart } } } })
  const auto = [
    { providerID: "openwork-auto", modelID: "openwork-smart-ar_design", title: "Smart: Design", description: "Smart Model Router" },
    { providerID: "openwork-auto", modelID: smart, title: "Smart: Engineering", description: "Smart Model Router" },
  ]
  const before = await render([autoAnswer("reply", 1000, 8000)], false, auto)
  expect(before.querySelector('[data-testid="reply-model"]')?.textContent).toBe("Replied with Smart: Engineering")
  await act(async () => useAutoRouteStore.getState().publish("session_fixture", [
    { at: 1500, provider: "anthropic", model: "claude-haiku-5-5", name: "Claude Haiku 5.5", thinking: "high" },
  ]))
  const label = before.querySelector('[data-testid="reply-model"]')
  expect(label?.textContent).toBe("Replied with Claude Haiku 5.5 · High")
  expect(before.textContent).not.toContain("openwork-auto")
  expect(before.textContent).not.toContain("openwork-smart-")
})

test("a gateway reply uses the picker's human title without requesting an opaque provider logo", async () => {
  const message = answer("reply")
  message.metadata = { opencode: { replyModel: { providerID: "ipr_fixture", modelID: "gwm_fixture" } } }
  const container = await render([message], false, [{ providerID: "ipr_fixture", modelID: "gwm_fixture", title: "GPT-6 Luna", description: "OpenAI" }])
  const label = container.querySelector('[data-testid="reply-model"]')
  expect(label?.textContent).toBe("Replied with GPT-6 Luna")
  expect(container.textContent).not.toContain("ipr_")
  expect(container.textContent).not.toContain("gwm_")
  expect(label?.querySelector("img")).toBeNull()
  expect(label?.querySelector('[aria-hidden="true"]')?.className).toContain("size-3")
})

test("the footer follows its own session picker's catalog when it arrives", async () => {
  const message = answer("reply")
  message.metadata = { opencode: { replyModel: { providerID: "ipr_fixture", modelID: "gwm_fixture" } } }
  const container = await render([message])
  expect(container.querySelector('[data-testid="reply-model"]')).toBeNull()
  const owner = Symbol()
  await act(async () => useModelPickerCatalogStore.getState().publish("other_session", owner, [
    { providerID: "ipr_fixture", modelID: "gwm_fixture", title: "Another session's model", description: "OpenAI" },
  ]))
  expect(container.querySelector('[data-testid="reply-model"]')).toBeNull()
  await act(async () => useModelPickerCatalogStore.getState().publish("session_fixture", owner, [
    { providerID: "ipr_fixture", modelID: "gwm_fixture", title: "GPT-6 Luna", description: "OpenAI" },
  ]))
  expect(container.querySelector('[data-testid="reply-model"]')?.textContent).toBe("Replied with GPT-6 Luna")
})

test("a metadata-free native completion marker keeps the answer's model footer", async () => {
  const message = answer("reply")
  message.metadata = { opencode: { replyModel: { providerID: "ipr_fixture", modelID: "gwm_fixture" } } }
  const container = await render([message, { id: "completion", role: "assistant", parts: [] }], false, [
    { providerID: "ipr_fixture", modelID: "gwm_fixture", title: "GPT-6 Luna", description: "OpenAI" },
  ])
  expect(container.querySelector('[data-testid="reply-model"]')?.textContent).toBe("Replied with GPT-6 Luna")
})

test("an unknown gateway identity stays hidden without a catalog title", async () => {
  const message = answer("reply")
  message.metadata = { opencode: { replyModel: { providerID: "ipr_fixture", modelID: "gwm_fixture", resolved: true } } }
  const container = await render([message], false, [{ providerID: "ipr_other", modelID: "gwm_fixture", title: "Another model", description: "OpenAI" }])
  expect(container.querySelector('[data-testid="reply-model"]')).toBeNull()
  expect(container.querySelector('img[src*="ipr_"]')).toBeNull()
})

test("a streaming reply does not claim a completed model", async () => {
  const container = await render([answer("reply")], true)
  expect(container.querySelector('[data-testid="reply-model"]')).toBeNull()
})

function streamingAnswer(id: string, parts: UIMessage["parts"] = [{ type: "text", text: "Writing the document" }]): UIMessage {
  return {
    id, role: "assistant", parts,
    metadata: { opencode: { created: 1000, replyModel: { providerID: "anthropic", modelID: "claude-sonnet", name: "Claude Sonnet", resolved: true } } },
  }
}

test("live model: the Working line names the model writing this turn, revealed on hover", async () => {
  const container = await render([{ id: "u1", role: "user", parts: [{ type: "text", text: "Write it" }] }, streamingAnswer("reply")], true)
  const line = container.querySelector('[data-loading-message="working"]')
  const caption = line?.querySelector("[data-working-model]")
  // Right after the timer, on the same line, outside the shimmer.
  expect(line?.textContent).toMatch(/^Working \S+ · Writing with Claude Sonnet$/)
  expect(caption?.closest(".ow-text-shimmer")).toBeNull()
  expect(caption?.previousElementSibling?.className).toContain("ow-text-shimmer")
  // Revealed by hovering the Working line; always shown on touch.
  expect(line?.className).toContain("group/working")
  expect(caption?.className).toContain("opacity-0")
  expect(caption?.className).toContain("group-hover/working:opacity-100")
  expect(caption?.className).toContain("pointer-coarse:opacity-100")
  // The finished-reply footer is not involved while streaming.
  expect(container.querySelector('[data-testid="reply-model"]')).toBeNull()
})

test("live model: it is there while the turn only runs steps, before any text", async () => {
  const container = await render([{ id: "u1", role: "user", parts: [{ type: "text", text: "Write it" }] }, streamingAnswer("reply", [{ type: "dynamic-tool", toolName: "bash", toolCallId: "c1", state: "input-available", input: { command: "ls", description: "list files" } }])], true)
  expect(container.querySelector("[data-working-model]")?.textContent).toBe(" · Writing with Claude Sonnet")
})

test("live model: a new turn never shows the previous turn's model", async () => {
  const container = await render([
    { id: "u1", role: "user", parts: [{ type: "text", text: "First" }] },
    answer("reply_1"),
    { id: "u2", role: "user", parts: [{ type: "text", text: "Second" }] },
  ], true)
  expect(container.querySelector('[data-loading-message]')).not.toBeNull()
  expect(container.querySelector("[data-working-model]")).toBeNull()
})

test("missing model metadata never invents a footer", async () => {
  const container = await render([{ id: "reply", role: "assistant", parts: [{ type: "text", text: "Ready." }] }])
  expect(container.querySelector('[data-testid="reply-model"]')).toBeNull()
})


test("video stays after its generation call before later processing and reply text",async()=>{
  Reflect.set(window,"__GET3W_ACCOUNT__",{
    status:async()=>({status:"signed_in",user:{id:"fixture"},error:null,pending:false}),
    taskCatalog:async()=>({catalog_version:"fixture",expiresAt:Date.now()+60000,offline:false,models:[]}),
    modelTasks:async()=>({items:[{key:"generated-video",messageId:"user",slug:"demo/text-to-video",status:"completed",requestId:"request-video",updatedAt:1,outputs:["https://xianchou.com/video.mp4"]}]}),
  });
  const message=answer("generation");
  message.parts=[
    {type:"text",text:"Starting the video."},
    {type:"dynamic-tool",toolName:"media_generate",toolCallId:"generate",state:"output-available",input:{},output:{task_id:"generated-video",request_id:"request-video",status:"submitted"}},
    {type:"text",text:"Now processing the generated file."},
    {type:"dynamic-tool",toolName:"bash",toolCallId:"process",state:"output-available",input:{command:"echo processed"},output:"processed"},
    {type:"text",text:"The final summary."},
  ];
  const container=await render([{id:"user",role:"user",parts:[{type:"text",text:"Generate a video"}]},message,answer("later")]);
  const result=container.querySelector('[data-model-task="generated-video"]');
  expect(result).not.toBeNull();
  expect(container.querySelectorAll('[data-model-task="generated-video"]').length).toBe(1);
  const section=result?.closest("section");
  expect(section?.parentElement?.nextElementSibling?.textContent).toContain("Now processing the generated file.");
  expect(section?.closest('[data-message-id]')?.getAttribute("data-message-id")).toBe("generation");
  expect(result?.querySelector("video")).not.toBeNull();
});

test("all native generation categories keep progress and results at their own calls",async()=>{
 const types=["text-to-image","text-to-video","text-to-speech","text-to-music","text-to-panorama","digital-human","text-to-3d","image-to-layers","image-upscale","speech-to-text","video-edit","video-extend","video-upscale"];
 const tasks=types.map((type,index)=>({key:`task-${index}`,messageId:"user",slug:`demo/model/${type}`,status:index%2?"processing":"completed",createdAt:Date.now()-30000,estimatedDuration:90,requestId:`request-${index}`,updatedAt:1,reservedUsd:"1.000000",chargedUsd:"0.500000",outputs:type==="text-to-image"?["https://xianchou.com/image.avif"]:type==="text-to-speech"?["https://xianchou.com/speech.flac"]:[]}));
 Reflect.set(window,"__GET3W_ACCOUNT__",{
  status:async()=>({status:"signed_in",user:{id:"fixture"},error:null,pending:false}),
  taskCatalog:async()=>({catalog_version:"fixture",expiresAt:Date.now()+60000,offline:false,models:[]}),
  modelTasks:async()=>({items:tasks}),
 });
 const message=answer("native");
 message.parts=tasks.flatMap(task=>[
  {type:"dynamic-tool",toolName:"media_generate",toolCallId:task.key,state:"output-available",input:{},output:{task_id:task.key,request_id:task.requestId}},
  {type:"text",text:`After ${task.key}`},
 ]);
 const container=await render([{id:"user",role:"user",parts:[{type:"text",text:"Generate media"}]},message]);
 for(const task of tasks){
  const rows=container.querySelectorAll(`[data-model-task="${task.key}"]`);expect(rows.length).toBe(1);
  const row=rows[0];expect(row.closest("section")?.parentElement?.nextElementSibling?.textContent).toContain(`After ${task.key}`);
  expect(row.querySelector('[role="progressbar"]')!==null).toBe(task.status==="processing");
  expect(row.textContent).not.toContain("USD");
  expect(row.textContent).not.toContain("Stop waiting");expect(row.textContent).not.toContain("Retrieve result");
  if(task.slug.endsWith("text-to-image"))expect(row.querySelector("img")?.getAttribute("src")).toBe("https://xianchou.com/image.avif");
  if(task.slug.endsWith("text-to-speech"))expect(row.querySelector("button")?.textContent).toContain("Play audio");
 }
});
