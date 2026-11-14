import { sanitizeDiagnosticValue } from "../diagnostic-sanitizer.js";
type Exchange = { sessionID: string; kind?: string; model?: unknown; request: Request; response: Response };
type Context = {
  options: { url: string; token: string };
  location?: { directory?: string };
  session: { hook(name: "http.response", callback: (event: Exchange) => Promise<void>): Promise<{ dispose(): Promise<void> }> };
};
/** Actual model HTTP evidence, without modifying the provider request or response. */
export default {
  id: "get3w.task-log-evidence",
  async setup(context: Context) {
    const pending = new Set<AbortController>();
    const registration = await context.session.hook("http.response", async event => {
      const controller = new AbortController(); pending.add(controller);
      const exchangeId = crypto.randomUUID();
      const send = async (type: string, payload: unknown) => {
        const response = await fetch(context.options.url, { method: "POST", redirect: "error",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          headers: { Authorization: `Bearer ${context.options.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "task_log_evidence", sessionId: event.sessionID,
            input: { type, directory: context.location?.directory, payload: sanitizeDiagnosticValue(typeof payload === "object" && payload !== null ? { ...payload, exchange_id: exchangeId } : payload) } }),
        });
        if (!response.ok) throw new Error("Task evidence capture unavailable");
        await response.body?.cancel();
      };
      const post = async (type: string, payload: unknown) => {
        const json = JSON.stringify(sanitizeDiagnosticValue(typeof payload === "object" && payload !== null ? {...payload, exchange_id: exchangeId} : payload));
        if (json.length <= 500000) return send(type, JSON.parse(json));
        const group = crypto.randomUUID(); const width = 500000;
        for (let index = 0; index * width < json.length; index++) {
          await send("evidence.chunk", {group, index, count: Math.ceil(json.length / width), original_type: type,
            encoding: "json", chunk: json.slice(index * width, (index + 1) * width)});
        }
      };
      let request: Request | undefined; let response: Response | undefined;
      try { request = event.request.clone(); } catch { /* Explicitly reported below. */ }
      try { response = event.response.clone(); } catch { /* Explicitly reported below. */ }
      void (async () => {
        await post("model.http.request", { model: event.model, kind: event.kind,
          url: event.request.url, method: event.request.method,
          body: request ? await request.text() : null, unavailable: request ? [] : ["Request body already consumed by runtime"] });
        await post("model.http.response", { status: event.response.status,
          request_id: event.response.headers.get("x-request-id") ?? event.response.headers.get("x-get3w-request-id"),
          provider_task_id: event.response.headers.get("x-task-id"), content_type: event.response.headers.get("content-type") });
        if (!response?.body) { await post("capture.error", { reason: "Model response body unavailable" }); return; }
        const reader = response.body.getReader(); const decoder = new TextDecoder(); const chunks: string[] = []; let complete = false;
        try {
          while (!controller.signal.aborted) {
            const next = await reader.read(); if (next.done) { complete = true; break; }
            chunks.push(decoder.decode(next.value, { stream: true }));
          }
          chunks.push(decoder.decode());
        } finally {
          await post("model.output", {text:chunks.join(""), complete});
          await reader.cancel().catch(() => {});
        }
      })().catch(async () => {
        if (!controller.signal.aborted) await post("capture.error", {reason:"Model HTTP evidence incomplete"}).catch(() => {});
      }).finally(() => { pending.delete(controller); controller.abort(); });
    });
    return async () => { await registration.dispose(); for (const controller of pending) controller.abort(); };
  },
};
