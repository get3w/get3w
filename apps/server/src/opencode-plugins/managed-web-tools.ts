import { z } from "zod";
type Call = { signal: AbortSignal; sessionID: string; messageID?: string; id?: string; agent?: string };
type Result = { content: { type: "text"; text: string }[]; output: unknown; metadata?: Record<string, unknown> };
type Context = {
  location?: { directory?: string };
  options: { url: string; token: string };
  permission: { assert(input: { action: string; resources: string[]; save: string[]; metadata: Record<string, unknown>; sessionID: string; agent?: string; source: { type: "tool"; messageID: string; id: string } }): Promise<void> };
};
const source = z.object({ url: z.string(), title: z.string().optional(), content: z.string().optional() });
const searchResult = z.object({ request_id: z.string(), provider: z.string(), results: z.array(source) });
const fetchResult = z.object({ request_id: z.string(), provider: z.string(), url: z.string(), title: z.string().optional(), content: z.string() });
const observationContent = (value: unknown): { type: "text"; text: string } => ({ type: "text", text: `Host observation: ${JSON.stringify(value)}` });
const savedObservation = z.object({ observation: z.object({ id: z.string(), sha256: z.string(), started_at: z.number(), observed_at: z.number() }) });
export function managedWebExecute(context: Context, operation: "search" | "fetch") {
  return async (raw: unknown, call: Call): Promise<Result> => {
    if (!call.messageID || !call.id || !context.location?.directory) throw Error("Web tool conversation unavailable");
    const input = operation === "search" ? z.object({ query: z.string().trim().min(1).max(4000) }).parse(raw) : z.object({ url: z.string().url(), format: z.enum(["markdown", "text", "html"]).optional() }).parse(raw);
    const body = "query" in input ? { query: input.query } : { url: input.url };
    await context.permission.assert({ action: operation === "search" ? "websearch" : "webfetch", resources: ["query" in input ? input.query : input.url], save: ["*"], metadata: body, sessionID: call.sessionID, agent: call.agent, source: { type: "tool", messageID: call.messageID, id: call.id } });
    const startedAt = Date.now();
    const response = await fetch(context.options.url, { method: "POST", redirect: "error", signal: call.signal, headers: { Authorization: `Bearer ${context.options.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "web_tool", input: { operation, body }, sessionId: call.sessionID, caller: { directory: context.location.directory, messageId: call.messageID, callId: call.id } }) });
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null);
      const parsed = z.object({error:z.string().max(1000)}).safeParse(failure);
      throw Error(parsed.success ? parsed.data.error : "Get3W web service unavailable; sign in and retry");
    }
    const payload: unknown = await response.json();
    // Host clock and call identity describe the observation, never publication.
    const saved = savedObservation.safeParse(payload);
    const observation = { call_id: call.id, observed_at: Date.now(), started_at: startedAt,
      ...(saved.success ? { observation: saved.data.observation } : {}),
    };
    if (operation === "search") {
      const result = searchResult.parse(payload);
      const text = result.results.map(r => `Title: ${r.title ?? r.url}\nURL: ${r.url}\nHighlights: ${r.content ?? ""}`).join("\n---\n") || "No search results found.";
      return { content: [...(saved.success ? [observationContent(saved.data.observation)] : []), { type: "text", text }], output: { provider: result.provider, results: result.results.map(item => ({ ...item, time: {} })), ...(saved.success ? { observation: saved.data.observation } : {}) }, metadata: { provider: result.provider, request_id: result.request_id, ...observation } };
    }
    const result = fetchResult.parse(payload);
    // Preserve the provider's page content without executing or inventing markup.
    const text = "format" in input && input.format === "html"
      ? `<pre>${result.content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>`
      : result.content;
    const format = "format" in input ? input.format ?? "markdown" : "markdown";
    const contentType = format === "html" ? "text/html" : format === "text" ? "text/plain" : "text/markdown";
    return { content: [...(saved.success ? [observationContent(saved.data.observation)] : []), { type: "text", text }], output: { url: result.url, contentType, format, output: text, ...(saved.success ? { observation: saved.data.observation } : {}) }, metadata: { provider: result.provider, request_id: result.request_id, ...observation } };
  };
}
