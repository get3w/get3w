import { afterAll, afterEach, describe, expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { DynamicToolUIPart, UIMessage } from "ai"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { setLocale } from "../src/i18n"
import { getCapabilityCallSentence } from "../src/lib/capability-call"
import { get3wNativeFailure, get3wNativeSentence } from "../src/lib/get3w-native-activity"

GlobalRegistrator.register({ url: "https://web.example/" })
setLocale("en")
const previousAct = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT")
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
afterAll(() => {
  queryClient.clear()
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct)
  GlobalRegistrator.unregister()
})

const { PlatformProvider, createDefaultPlatform } = await import("../src/react-app/kernel/platform")
const { MessageListProvider } = await import("../src/components/chat/message-list-provider")
const { DenAuthProvider } = await import("../src/react-app/domains/cloud/den-auth-provider")
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
const { MessageList } = await import("../src/components/chat/message-list")

function native(toolName: string, input: Record<string, unknown>, output?: unknown): DynamicToolUIPart {
  return output === undefined
    ? { type: "dynamic-tool", toolName, toolCallId: `call_${toolName}_${JSON.stringify(input).length}`, state: "input-available", input }
    : { type: "dynamic-tool", toolName, toolCallId: `call_${toolName}_${JSON.stringify(input).length}`, state: "output-available", input, output }
}

describe("Get3W's own app tools read as sentences", () => {
  test("resource uploads have native activity labels and failures remain visible", () => {
    const upload = native("resource_upload", { path: "/workspace/source.png" }, { status: "ready", resource: { url: "https://files.test/source.png" } })
    expect(getCapabilityCallSentence(upload)).toMatchObject({ present: "Uploading resource", past: "Uploaded resource", failure: "Resource upload failed" })
    expect(get3wNativeFailure(upload)).toBeNull()
    expect(get3wNativeFailure(native("resource_upload", {}, { status: "error", error: { message: "Resource upload failed; retry uploading" } }))).toBe("Resource upload failed; retry uploading")
  })
  test("queries and commands name what the person sees, never affordance or group ids", () => {
    const search = native("get3w_query", { id: "session.search", args: { query: "quarterly plan" } }, { results: [] })
    expect(get3wNativeSentence(search)?.past).toBe("Searched your chats for “quarterly plan”")
    const read = native("get3w_query", { id: "session.read", args: { sessionId: "ses_8f2kq0aa" } }, { title: "Quarterly plan", messages: [] })
    expect(get3wNativeSentence(read)?.past).toBe("Read “Quarterly plan”")
    const move = native("get3w_execute", { id: "session.group.move", args: { sessionId: "ses_8f2kq0aa", groupId: "grp_8f2kq0aa" } },
      { ok: true, sessionId: "ses_8f2kq0aa", title: "Quarterly plan", groupId: "grp_8f2kq0aa", label: "Done" })
    expect(get3wNativeSentence(move)?.past).toBe("Moved “Quarterly plan” to “Done”")
    const running = native("get3w_execute", { id: "session.group.move", args: { sessionId: "ses_8f2kq0aa", groupId: "grp_8f2kq0aa" } })
    expect(get3wNativeSentence(running)?.present).toBe("Moving a chat to another group")
    for (const part of [search, read, move, running]) {
      const sentence = get3wNativeSentence(part)
      expect(`${sentence?.present} ${sentence?.past} ${sentence?.failure}`).not.toMatch(/ses_|grp_|session\.|get3w_/)
    }
    expect(get3wNativeSentence(native("get3w_query", { id: "workspace.list" }, {}))?.past).toBe("Looked up workspace list")
  })

  test("a command whose result says it did not happen is a failure", () => {
    const refused = native("get3w_execute", { id: "session.group.remove", args: { groupId: "Done" } }, { ok: false, error: "Unknown group Done" })
    expect(get3wNativeFailure(refused)).toBe("Unknown group Done")
    expect(get3wNativeFailure(native("get3w_execute", { id: "session.group.create", args: { label: "Done" } }, { ok: true, label: "Done", created: true }))).toBeNull()
  })
})

let mounted: { root: Root; container: HTMLElement } | null = null
afterEach(async () => {
  if (!mounted) return
  const { root, container } = mounted
  await act(async () => root.unmount())
  container.remove()
  mounted = null
})

async function render(parts: UIMessage["parts"]) {
  const created = Date.UTC(2026, 9, 27, 12)
  const messages: UIMessage[] = [
    { id: "user_1", role: "user", parts: [{ type: "text", text: "Tidy my chats." }], metadata: { opencode: { created } } },
    { id: "reply_1", role: "assistant", parts: [...parts, { type: "text", text: "Done." }], metadata: { opencode: { created: created + 100, completed: created + 3_100 } } },
  ]
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  mounted = { root, container }
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient,
    children: createElement(DenAuthProvider, { children: createElement(PlatformProvider, {
    value: createDefaultPlatform(),
    children: createElement(MessageListProvider, {
      workspaceId: "workspace_fixture", sessionId: "session_fixture",
      showThinking: false, developerMode: false, displaySuggestions: false, providerConnectedCount: 1,
      dispatchAction: () => {}, setPrompt: () => {}, onRevertToUserMessage: () => {},
      onForkAtMessage: () => {}, onEditUserMessage: () => {},
      onMcpReconnect: async () => { throw new Error("Unexpected reconnect") },
      onMcpReopenAuthorization: async () => {},
      children: createElement(MessageList, { messages, status: "ready", activityStatus: "idle" }),
    }),
  }) }), })))
  return container
}

const context = native("get3w_context", {}, { affordances: [{ id: "session.search" }] })
const search = native("get3w_query", { id: "session.search", args: { query: "plan" } }, { results: [] })
const discovery = native("get3w-cloud_search_capabilities", { query: "people" }, { matches: [{ name: "getOrg" }] })
const create = native("get3w_execute", { id: "session.group.create", args: { label: "Done" } }, { ok: true, groupId: "grp_8f2kq0aa", label: "Done", created: true })

describe("the turn's rail", () => {
  test("a clean turn folds; catalog lookups (app context, Cloud search) are not steps; Get3W rows carry its mark", async () => {
    const container = await render([context, discovery, search, create])
    const rail = container.querySelector<HTMLElement>('[data-testid="completed-work-rail"]')
    expect(rail?.getAttribute("aria-label")).toBe("Worked for 3s, 2 steps. Show steps")
    await act(async () => rail?.click())
    const rows = [...container.querySelectorAll("[data-capability-call]")].map((row) => row.textContent)
    expect(rows).toEqual(["Searched your chats for “plan”", "Created the “Done” group"])
    expect(container.querySelectorAll('[data-capability-call] [data-connector-icon="get3w"]')).toHaveLength(2)
    expect(container.textContent).not.toMatch(/get3w_|session\.group|grp_|Used context|Searched your connections/)
  })

  test("a turn with a refused command stays open with the failure inline", async () => {
    const refused = native("get3w_execute", { id: "session.group.remove", args: { groupId: "Done" } }, { ok: false, error: "Unknown group Done" })
    const container = await render([search, refused])
    expect(container.querySelector('[data-testid="completed-work-rail"]')).toBeNull()
    const failed = [...container.querySelectorAll("[data-capability-call]")].find((row) => row.textContent?.includes("Couldn't remove"))
    expect(failed?.textContent).toContain("Unknown group Done")
    expect(failed?.querySelector(".text-red-11")).not.toBeNull()
    expect(failed?.querySelector('[data-testid="tool-details-toggle"]')).not.toBeNull()
  })
})

describe("localized first-party activity", () => {
  afterEach(() => setLocale("en"))

  test("historical workspace failures switch language live and keep raw details", async () => {
    const errorText = "Workspace result location unavailable"
    const part: DynamicToolUIPart = { type: "dynamic-tool", toolName: "workspace_file", toolCallId: "workspace_failure", state: "output-error", input: { action: "plan", extension: "json" }, errorText }
    const container = await render([part])
    const row = container.querySelector<HTMLElement>('[data-capability-call="workspace_file"]')
    expect(row?.textContent).toContain("Couldn't plan the workspace file")
    await act(async () => setLocale("zh"))
    expect(row?.textContent).toContain("无法规划工作区文件")
    expect(row?.textContent).toContain("工作区文件位置不可用")
    expect(row?.textContent).not.toContain(errorText)
    await act(async () => row?.querySelector<HTMLButtonElement>('[data-testid="tool-details-toggle"]')?.click())
    expect(row?.textContent).toContain(errorText)
    expect(part.errorText).toBe(errorText)
    await act(async () => setLocale("en"))
    expect(row?.textContent).toContain("Couldn't plan the workspace file")
  })

  test("workspace operations and app commands use Chinese without altering user content", () => {
    setLocale("zh")
    for (const [action, expected] of [["plan", "已规划工作区文件"], ["register", "已登记工作区文件"], ["resolve", "已定位工作区文件"]]) {
      expect(getCapabilityCallSentence(native("workspace_file", { action }))?.past).toBe(expected)
    }
    expect(get3wNativeSentence(native("get3w_query", { id: "session.search", args: { query: "Quarterly plan" } }))?.past).toContain("已搜索聊天")
    expect(get3wNativeSentence(native("get3w_query", { id: "session.read" }, { title: "Quarterly plan" }))?.past).toContain("Quarterly plan")
    expect(get3wNativeFailure(native("get3w_execute", {}, { ok: false }))).toBe("Get3W 无法完成此操作。")
  })
})
