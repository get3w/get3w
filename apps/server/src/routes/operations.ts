import { recordAudit } from "../audit.js";
import { ApiError } from "../errors.js";
import type { ServerConfig, TokenScope, WorkspaceInfo } from "../types.js";
import { shortId } from "../utils.js";
import { addRoute, type RequestContext, type Route } from "./registry.js";

type JsonResponse = (data: unknown, status?: number) => Response;
type ReadJsonBody = (request: Request) => Promise<Record<string, unknown>>;

interface RegisterOperationRoutesOptions {
  routes: Route[];
  config: ServerConfig;
  jsonResponse: JsonResponse;
  readJsonBody: ReadJsonBody;
  requireClientScope: (ctx: RequestContext, required: TokenScope) => void;
  resolveWorkspace: (config: ServerConfig, id: string) => Promise<WorkspaceInfo>;
  reloadOpencodeEngine: (config: ServerConfig, workspace: WorkspaceInfo) => Promise<void>;
}

export function registerOperationRoutes(options: RegisterOperationRoutesOptions): void {
  const {
    routes,
    config,
    jsonResponse,
    readJsonBody,
    requireClientScope,
    resolveWorkspace,
    reloadOpencodeEngine,
  } = options;

  addRoute(routes, "GET", "/workspace/:id/events", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const sinceRaw = ctx.url.searchParams.get("since");
    const since = sinceRaw ? Number(sinceRaw) : undefined;
    const items = ctx.reloadEvents.list(workspace.id, since);
    return jsonResponse({ items, cursor: ctx.reloadEvents.cursor(), workspaceId: workspace.id, disabled: false });
  });

  addRoute(routes, "POST", "/workspace/:id/engine/reload", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    requireClientScope(ctx, "collaborator");

    await reloadOpencodeEngine(config, workspace);

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "engine.reload",
      target: workspace.baseUrl ?? "opencode",
      summary: "Reloaded workspace engine",
      timestamp: Date.now(),
    });

    return jsonResponse({ ok: true, reloadedAt: Date.now() });
  });

  addRoute(routes, "GET", "/approvals", "host", async (ctx) => {
    return jsonResponse({ items: ctx.approvals.list() });
  });

  addRoute(routes, "POST", "/workspace/:id/approvals/model-task", "host-token", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const slug = typeof body.slug === "string" ? body.slug : "";
    const quoteId = typeof body.quoteId === "string" ? body.quoteId : "";
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId) || !slug.trim() || !quoteId.trim() || slug.length > 200 || quoteId.length > 100) {
      throw new ApiError(400, "invalid_model_approval", "Invalid model approval request");
    }
    const quote = body.quote;
    if (!quote || typeof quote !== "object" || Array.isArray(quote)
      || Reflect.get(quote,"quoteId")!==quoteId || Reflect.get(quote,"slug")!==slug || Reflect.get(quote,"sessionId")!==sessionId
      || typeof Reflect.get(quote,"amountUsd")!=="string" || typeof Reflect.get(quote,"expiresAt")!=="number") {
      throw new ApiError(400,"quote_required","A verified host quote is required");
    }
    const result = await ctx.approvals.requestModelTaskApproval({
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      quote:{quoteId,slug,sessionId,amountUsd:Reflect.get(quote,"amountUsd"),expiresAt:Reflect.get(quote,"expiresAt")},
      policy:{autoApproveBelowUsd:"0",maxSessionUsd:"0"},sessionCommittedUsd:"0",
    });
    return jsonResponse({ ok: result.allowed, allowed: result.allowed, id: result.id, reason: result.reason ?? null });
  });

  addRoute(routes, "POST", "/approvals/:id", "host", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const reply = body.reply === "allow" ? "allow" : "deny";
    const pending = ctx.approvals.list().find(item => item.id === ctx.params.id);
    if (pending?.action === "model.submit" && ctx.actor?.type !== "host") {
      throw new ApiError(403, "host_required", "Model approval requires the Desktop host");
    }
    const result = ctx.approvals.respond(ctx.params.id, reply);
    if (!result) {
      throw new ApiError(404, "approval_not_found", "Approval request not found");
    }
    return jsonResponse({ ok: true, allowed: result.allowed });
  });
}
