import { approveCostReservation, readCostRun, reconcileCostReservation } from "../task-cost-settings.js";
import { isRecord } from "../workspace-kv-store.js";
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
    const runKey=typeof body.runKey==="string"?body.runKey:undefined;
    const submissionKey=typeof body.submissionKey==="string"&&body.submissionKey.length<=256?body.submissionKey:undefined;
    const verifiedQuote={quoteId,slug,sessionId,amountUsd:Reflect.get(quote,"amountUsd"),expiresAt:Reflect.get(quote,"expiresAt")};
    if(submissionKey){
      const run=runKey?await readCostRun(config,runKey):null;
      if(run&&(run.workspaceId!==workspace.id))throw new ApiError(403,"invalid_cost_scope","Run belongs to another workspace");
      const allowed=await approveCostReservation(config,{key:JSON.stringify([workspace.id,sessionId,submissionKey]),run:run?runKey:undefined,quoteId,amountUsd:verifiedQuote.amountUsd,expiresAt:verifiedQuote.expiresAt},async budget=>{
        const result=await ctx.approvals.requestExplicitModelApproval({workspaceId:workspace.id,actor:ctx.actor??{type:"host"},summary:`${slug}: USD ${verifiedQuote.amountUsd}`,modelTask:{...verifiedQuote,...(run?{approvalSessionId:run.sessionId}:{}),budget}});
        return result.allowed;
      });
      return jsonResponse({ok:allowed,allowed});
    }
    const result = await ctx.approvals.requestModelTaskApproval({
      workspaceId: workspace.id,actor:ctx.actor??{type:"host"},quote:verifiedQuote,
      policy:{autoApproveBelowUsd:"0",maxSessionUsd:"0"},sessionCommittedUsd:"0",
    });
    return jsonResponse({ ok: result.allowed, allowed: result.allowed, id: result.id, reason: result.reason ?? null });
  });

  addRoute(routes,"POST","/workspace/:id/approvals/model-task/reconcile","host-token",async ctx=>{
    const workspace=await resolveWorkspace(config,ctx.params.id);
    const body=await readJsonBody(ctx.request);
    if(typeof body.sessionId!=="string"||typeof body.submissionKey!=="string"||!isRecord(body.result))throw new ApiError(400,"invalid_cost_result","Verified result required");
    const value=body.result;
    const billing=isRecord(value.billing)?value.billing:null;
    const charged=billing&&isRecord(billing.charged)?billing.charged:null;
    const chargedUsd=charged&&typeof charged.usd==="string"?charged.usd:undefined;
    // Only an explicit upstream release or a definitive pre-submission failure
    // releases a reservation. A timeout or detached task remains reserved.
    const released=(billing?.reservation_released===true&&chargedUsd===undefined)||body.notSubmitted===true;
    if(released||chargedUsd!==undefined)await reconcileCostReservation(config,JSON.stringify([workspace.id,body.sessionId,body.submissionKey]),{released,chargedUsd,quoteId:typeof body.quoteId==="string"?body.quoteId:undefined});
    return jsonResponse({ok:true});
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
