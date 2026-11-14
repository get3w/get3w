import { randomBytes } from "node:crypto";
import { z } from "zod";
import { serve } from "./serve-node.js";
import { OpenWorkExtensionsPreview } from "./opencode-plugins/openwork-extensions-preview.js";
import { openworkReadTransport, type OpenworkReadTransport } from "./opencode-plugins/openwork-read-transport.js";
import { createV2ReadAdapter, readV2SessionActivity } from "./opencode-v2-read-adapter.js";
import { isRecord } from "./workspace-kv-store.js";
import { createV2BrowserBridge } from "./opencode-v2-browser-bridge.js";
import { SESSION_GROUP_COMMAND_IDS } from "./opencode-plugins/openwork-session-groups.js";
import { loopbackFetch } from "./server-fetch.js";

const requestSchema = z.object({
  name: z.enum(["openwork_context", "openwork_query", "openwork_execute", "openwork_skills", "openwork_skill_read", "get3w_model_call", "task_log_evidence"]),
  input: z.unknown(),
  sessionId: z.string().max(256).optional(),
  // The calling tool's place in its chat, where a Drive approval is shown.
  caller: z.object({
    directory: z.string().min(1).max(4096), messageId: z.string().min(1).max(256),
    callId: z.string().min(1).max(256), agent: z.string().min(1).max(256).optional(),
  }).strict().optional(),
});
/** How long the person has to answer a Drive approval. */
const APPROVAL_WAIT_MS = 10 * 60_000;
const createdPermission = z.object({ data: z.object({ id: z.string(), effect: z.string() }) });
const repliedPermission = z.object({ type: z.literal("permission.replied"), data: z.object({ requestID: z.string(), reply: z.string() }) });

export type EngineConnection = { url: string; username: string; password: string };
export type EngineApproval = {
  directory: string; sessionId: string; messageId: string; callId: string; agent?: string;
  action: string; resources: string[]; metadata: Record<string, unknown>;
  /** How refusals name the request ("this upload") and what did not happen ("nothing was uploaded"). */
  subject: string; nothing: string;
};

/**
 * Asks the person in the calling chat through the engine's own permission
 * prompt and returns only once they allow this request. A rule that would
 * allow it without asking is refused, so no workspace or engine setting can
 * pre-approve it, and nothing is saved for later requests.
 */
export async function askEngineApproval(engine: EngineConnection | undefined, approval: EngineApproval, signal: AbortSignal): Promise<void> {
  const { subject, nothing } = approval;
  if (!engine) throw new Error(`Get3W cannot ask for your approval right now, so ${nothing}.`);
  const location = `location[directory]=${encodeURIComponent(approval.directory)}`;
  const authorization = `Basic ${Buffer.from(`${engine.username}:${engine.password}`).toString("base64")}`;
  const watching = new AbortController();
  const stop = AbortSignal.any([signal, watching.signal]);
  try {
    // Subscribe first so the answer cannot arrive unseen.
    const events = await loopbackFetch(new URL(`/api/event?${location}`, engine.url), { headers: { authorization, accept: "text/event-stream" }, signal: stop });
    if (!events.ok || !events.body) throw new Error(`Get3W could not ask for your approval, so ${nothing}.`);
    const response = await loopbackFetch(new URL(`/api/session/${encodeURIComponent(approval.sessionId)}/permission?${location}`, engine.url), {
      method: "POST", headers: { authorization, "content-type": "application/json" }, signal: stop,
      body: JSON.stringify({
        action: approval.action, resources: approval.resources, save: [], metadata: approval.metadata,
        source: { type: "tool", messageID: approval.messageId, id: approval.callId }, ...(approval.agent ? { agent: approval.agent } : {}),
      }),
    });
    const created = createdPermission.safeParse(await response.json().catch(() => null));
    if (!response.ok || !created.success) throw new Error(`Get3W could not ask for your approval, so ${nothing}.`);
    if (created.data.data.effect === "deny") throw new Error(`Your permissions do not allow ${subject}, so ${nothing}.`);
    if (created.data.data.effect !== "ask") throw new Error(`${subject[0]?.toUpperCase()}${subject.slice(1)} was not shown to you for approval, so ${nothing}.`);
    const reader = events.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`The approval closed before you answered, so ${nothing}.`);
      const frames = (buffered + chunk.value).split(/\r?\n\r?\n/);
      buffered = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
        let event: unknown;
        try { event = JSON.parse(data); } catch { continue; }
        const replied = repliedPermission.safeParse(event);
        if (!replied.success || replied.data.data.requestID !== created.data.data.id) continue;
        if (replied.data.data.reply === "once" || replied.data.data.reply === "always") return;
        throw new Error(`You declined ${subject}, so ${nothing}.`);
      }
    }
  } finally {
    watching.abort();
  }
}
// Only sidebar-group, session create/send and question-answer commands can
// write through the generic affordance path. Automation proposals are inert:
// the person explicitly creates one in the renderer.
const commandIds: readonly string[] = [
  ...SESSION_GROUP_COMMAND_IDS, "session.create", "session.send", "session.question.answer", "automation.propose",
];
const questionReplyRoute = /^\/workspace\/[^/]+\/opencode2\/api\/session\/[^/]+\/form\/[^/]+\/reply$/;
// Best-effort window commands session.create and session.send follow up with.
const windowCommandIds: readonly string[] = ["workspace.reload_sessions", "session.open"];
const sessionWriteRoute = /^\/workspace\/([^/]+)\/opencode\/session(?:\/([^/]+)\/prompt_async)?$/;
/** A v2 question-form reply as sent: a path the URL parser would normalize is refused. */
export function isQuestionReplyPath(path: string): boolean {
  return questionReplyRoute.test(path) && new URL(path, "http://127.0.0.1").pathname === path;
}
type Post = (path: string, body: Record<string, unknown>) => Promise<unknown>;
/**
 * session.create and session.send write the v1 session and prompt_async
 * shapes; v2 takes the same session, model and prompt on its native routes.
 * Returns undefined for any other path, which is then refused.
 */
export async function postV2SessionWrite(path: string, body: Record<string, unknown>, post: Post): Promise<unknown> {
  const match = sessionWriteRoute.exec(path);
  if (!match || new URL(path, "http://127.0.0.1").pathname !== path) return undefined;
  const base = `/workspace/${match[1]}/opencode2/api/session`;
  const sessionId = match[2];
  if (!sessionId) {
    const created = await post(base, { ...(typeof body.title === "string" ? { title: body.title } : {}), ...(isRecord(body.model) ? { model: body.model } : {}) });
    const row = isRecord(created) && "data" in created ? created.data : created;
    const info = isRecord(row) && isRecord(row.info) ? row.info : row;
    if (!isRecord(info) || typeof info.id !== "string") throw new Error("Invalid engine session response");
    const model = info.model;
    return {
      id: info.id, title: typeof info.title === "string" ? info.title : null,
      model: isRecord(model) && typeof model.providerID === "string" && typeof model.id === "string" ? model : null,
    };
  }
  const model = isRecord(body.model) ? body.model : undefined;
  if (model && typeof model.providerID === "string" && typeof model.modelID === "string") {
    await post(`${base}/${sessionId}/model`, { model: {
      providerID: model.providerID, id: model.modelID, ...(typeof body.variant === "string" ? { variant: body.variant } : {}),
    } });
  }
  const parts = Array.isArray(body.parts) ? body.parts : [];
  const text = parts.map(part => isRecord(part) && part.type === "text" && typeof part.text === "string" ? part.text : "").join("");
  await post(`${base}/${sessionId}/prompt`, {
    text, ...(typeof body.messageID === "string" ? { id: body.messageID } : {}), delivery: "steer",
  });
  return null;
}
const sessionGroupRoute = /^\/workspace\/[^/]+\/session-groups(?:\/assignments\/[^/]+|\/[^/]+)?$/;
/** A session-group route as sent: a path the URL parser would normalize (dot segments) is refused. */
export function isSessionGroupWritePath(path: string): boolean {
  const url = new URL(path, "http://127.0.0.1");
  const [rawPath = "", rawQuery] = path.split("?", 2);
  if (url.pathname !== rawPath || url.hash) return false;
  if (rawQuery !== undefined && [...url.searchParams.keys()].some(key => key !== "destinationGroupId")) return false;
  return sessionGroupRoute.test(rawPath);
}
// Advertise only what this bridge executes. Native MCP discovery owns remote
// tool names; v1 executor spellings and unregistered commands do not belong here.
function bridgeAffordances(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(bridgeAffordances);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
    key === "affordances" || key === "availableAffordances"
      ? Array.isArray(entry) ? entry.filter(item => isRecord(item)
        && (item.kind === "query" || commandIds.includes(String(item.id)))
        && (!isRecord(item.executor) || item.executor.kind === "openwork")) : entry
      : bridgeAffordances(entry)]));
}

/** Process-local app-read and browser endpoints, closed with their engine.
 * Build this host entry as one bundle: packaged desktops relocate engine plugin
 * files, and the shared factory and its request-local transport must use the
 * same AsyncLocalStorage instance rather than separately bundled copies. */
export async function createV2ContextBridge(
  hostRequest: (path: string, init?: RequestInit) => Promise<unknown>,
  engine?: () => EngineConnection | undefined,
) {
  const token = randomBytes(32).toString("base64url");
  const plugin = await OpenWorkExtensionsPreview();
  const server = await serve({ hostname: "127.0.0.1", port: 0, fetch: async request => {
    if (request.headers.get("authorization") !== `Bearer ${token}`) return new Response(null, { status: 401 });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/read") return new Response(null, { status: 404 });
    try {
      const chunks: Uint8Array[] = []; let bytes = 0;
      if (request.body) for await (const chunk of request.body) {
        bytes += chunk.byteLength;
        if (bytes > 40_000_000) return new Response(null, { status: 413 });
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.length > 40_000_000) return new Response(null, { status: 413 });
      const call = requestSchema.parse(JSON.parse(text));
      if (call.name !== "task_log_evidence" && text.length > 64_000) return new Response(null, { status: 413 });
      let deadline = AbortSignal.timeout(60_000);
      const read = (path: string, init?: RequestInit) => {
        const signal = AbortSignal.any([request.signal, deadline, ...(init?.signal ? [init.signal] : [])]);
        signal.throwIfAborted();
        return hostRequest(path, { ...init, signal });
      };
      if (call.name === "task_log_evidence") {
        return Response.json(await read("/experimental/task-log-evidence", {method:"POST",body:JSON.stringify(call)}));
      }
      if (call.name === "get3w_model_call") {
        deadline = AbortSignal.timeout(APPROVAL_WAIT_MS);
        if (!call.sessionId || !call.caller) throw new Error("Conversation context required");
        return Response.json(await read("/experimental/model-call", {method:"POST",body:JSON.stringify(call)}));
      }
      // Older engine plugins may still ask for retired organization catalogs.
      // Answer locally without reading credentials or calling a cloud endpoint.
      if (call.name === "openwork_skills") return Response.json({ ok: true, skills: [] });
      if (call.name === "openwork_skill_read") return Response.json({ ok: false, reason: "unavailable" }, { status: 404 });
      const transport: OpenworkReadTransport = {
        engine: "v2",
        activity: (workspaceId: string, sessionId: string) => readV2SessionActivity(path => read(path), workspaceId, sessionId),
        get: createV2ReadAdapter(path => read(path)),
        // v1 still serves sessions created there (e.g. by headless callers)
        // after the one-shot history import. Plain GETs through the host's v1
        // mount keep its workspace ownership checks.
        other: { engine: "v1", get: path => read(path) },
        post: async (path: string, body: Record<string, unknown>, signal?: AbortSignal) => {
          const execute = call.name === "openwork_execute";
          if (execute && path !== "/experimental/ui-control/request") {
            const written = await postV2SessionWrite(path, body, (target, payload) => read(target, { method: "POST", body: JSON.stringify(payload) }));
            if (written !== undefined) return written;
            if (isQuestionReplyPath(path)) return read(path, { method: "POST", body: JSON.stringify(body), signal });
          }
          const windowCommand = execute && body.kind === "command" && isRecord(body.input) && windowCommandIds.includes(String(body.input.id));
          if (path !== "/experimental/ui-control/request" || (!["context", "query"].includes(String(body.kind)) && !windowCommand)) {
            throw new Error("Only Get3W reads are available");
          }
          return read(path, { method: "POST", body: JSON.stringify(body), signal });
        },
        ...(call.name === "openwork_execute" ? {
          send: async (method: "POST" | "PATCH" | "DELETE", path: string, body?: Record<string, unknown>) => {
            if (!isSessionGroupWritePath(path)) throw new Error("Only Get3W session group changes are available");
            return read(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
          },
        } : {}),
      };
      const result = await openworkReadTransport.run(transport, async () => {
        if (call.name === "openwork_query") return plugin.tool.openwork_query.execute(call.input);
        if (call.name === "openwork_execute") {
          const id = isRecord(call.input) ? String(call.input.id) : "";
          if (!commandIds.includes(id)) throw new Error(`${id || "This command"} is not available here; only session group changes, session.create, session.send, session.question.answer and automation proposals are`);
          const { sessionId, caller } = call;
          // Commands that ask first (answering another session's question)
          // ask in the calling chat through the engine's own prompt.
          const ask = sessionId && caller ? async (approval: { permission: string; patterns: string[]; metadata: Record<string, unknown> }) => {
            await askEngineApproval(engine?.(), {
              directory: caller.directory, sessionId, messageId: caller.messageId, callId: caller.callId, ...(caller.agent ? { agent: caller.agent } : {}),
              action: approval.permission, resources: approval.patterns, metadata: approval.metadata,
              subject: "answering this question", nothing: "the question was not answered",
            }, AbortSignal.any([request.signal, AbortSignal.timeout(APPROVAL_WAIT_MS)]));
            // The writes after an approval get their own budget.
            deadline = AbortSignal.timeout(60_000);
          } : undefined;
          return plugin.tool.openwork_execute.execute(call.input, { ...(sessionId ? { sessionID: sessionId } : {}), ...(ask ? { ask } : {}) });
        }
        const context: unknown = JSON.parse(await plugin.tool.openwork_context.execute());
        const filtered = bridgeAffordances(context);
        return JSON.stringify(isRecord(filtered) ? { ...filtered, instructions: {
          context: "Use openwork_query for the discovered read-only affordances and openwork_execute for session.group commands, session.create, session.send, session.question.answer or automation.propose. An automation proposal only shows a review card; it does not create, activate, or run anything. When Code Mode exposes these tools, discover their exact paths with search and compose them there, preserving exceptions and verifying the resulting groups. For other conversations, use session.search then session.read. Session reads include current activity and background-agent counts."
        } } : filtered);
      });
      return new Response(result, { headers: { "Content-Type": "application/json" } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Get3W read failed" }, { status: 400 });
    }
  } });
  const browser = await createV2BrowserBridge().catch(async error => { await server.stop(); await plugin.dispose(); throw error; });
  return { url: `http://127.0.0.1:${server.port}/read`, token, browser: { url: browser.url, token: browser.token },
    close: async () => { await browser.close(); await server.stop(); await plugin.dispose(); } };
}
