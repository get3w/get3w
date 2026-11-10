import { createHash } from "node:crypto";
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const fingerprint = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

/** One verified native account/org/chat connection. Never accepts agent prices. */
export function createModelSubmitGuard({sessionId, now=Date.now}) {
  const capabilities=new Map(), quotes=new Map(), approved=new Map();
  const requireValidQuote=(call, allowExpired=false)=>{
    const args=call.arguments;
    const quote=quotes.get(args?.quote_id);
    if(!quote || quote.slug!==args.slug || quote.inputsHash!==fingerprint(args.inputs)) throw Error("quote_required: Obtain a quote for these exact inputs on this chat connection.");
    if(!allowExpired && quote.expiresAt<=now()) throw Error("quote_expired: Request a fresh quote.");
    return quote;
  };
  return {
    prepare(message) {
      if(Array.isArray(message)) throw Error("invalid_request: Batched model calls are not supported.");
      if(message?.method!=="tools/call") return null;
      // These endpoints author/read drafts only; their cloud handlers enforce
      // ownership and cannot submit paid model work. Keep unknown tools denied.
      if (["prepare_app", "create_app", "update_app", "read_app", "save_artifact_view", "save_react_artifact_view", "read_artifact_view"].includes(message.params?.name)) return null;
      if(message.params?.name!=="execute_capability" && message.params?.name!=="search_capabilities") throw Error("invalid_request: Unsupported gateway tool.");
      if(message.params.name==="search_capabilities") return {type:"search"};
      const call=message.params.arguments;
      const metadata=capabilities.get(call?.name);
      if(!metadata) throw Error(`capability_required: "${String(call?.name)}" was not discovered on this chat connection. This is a tool-name/discovery error, not an account permission or balance denial. Discover the exact capability with search_capabilities to find the exact quote, submit and result names; do not guess names. Already discovered names: ${[...capabilities.keys()].join(", ") || "none"}.`);
      if(typeof metadata.handler!=="string" || !metadata.handler) throw Error("gateway_upgrade_required: Trusted capability metadata is unavailable. Reconnect after updating the gateway.");
      if(metadata.handler!=="get3w.submit") return {type:metadata.handler,call};
      if(call.arguments.session_id!==sessionId || !call.idempotency_key || call.idempotency_key!==call.arguments.idempotency_key) throw Error("session_mismatch: Use the current chat and the same inner and outer submission key.");
      const hash=fingerprint(call.arguments), previous=approved.get(call.idempotency_key);
      if(previous && previous!==hash) throw Error("idempotency_conflict: Keep the original submission payload.");
      const quote=requireValidQuote(call, previous===hash);
      return {type:"get3w.submit",call,quote,hash,alreadyApproved:previous===hash};
    },
    approve(context) {
      if (approved.get(context.call.idempotency_key) === context.hash) return;
      requireValidQuote(context.call);
      approved.set(context.call.idempotency_key,context.hash);
    },
    observe(context,payload) {
      if(!context || payload?.error || payload?.result?.isError) return;
      const value=payload?.result?.structuredContent;
      if(context.type==="search") {
        if(!Array.isArray(value?.data)) throw Error("Invalid gateway discovery response");
        for(const row of value.data) if(typeof row.name==="string") capabilities.set(row.name,row);
      }
      if(context.type!=="get3w.quote" || value?.status!=="succeeded") return;
      const quote=value.result;
      if(quote?.currency!=="USD" || typeof quote.discounted_price!=="string" || !/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(quote.discounted_price)
        || typeof quote.quote_id!=="string" || quote.slug!==context.call.arguments.slug || !Number.isSafeInteger(quote.expires_at)) throw Error("Invalid gateway quote response");
      quotes.set(quote.quote_id,{quoteId:quote.quote_id,slug:quote.slug,sessionId,amountUsd:quote.discounted_price,expiresAt:quote.expires_at*1000,inputsHash:fingerprint(context.call.arguments.inputs)});
    },
  };
}
