import { Context, Effect, Option, Schema, Scope } from "effect";

// The pinned engine's shell.remove publishes a synthetic completion that wakes
// its owner. Scope this compatibility shim to explicitly stopped shells only.
type SyntheticInput = { text?: string; sessionID: string; metadata?: Record<string, unknown>; resume?: boolean; delivery?: string };
class NativeSession extends Context.Service<NativeSession, {
  synthetic: (input: SyntheticInput) => Effect.Effect<unknown>;
}>()("@opencode/Session") {}
class NativeShell extends Context.Service<NativeShell, {
  get: (id: string) => Effect.Effect<{ metadata?: Record<string, unknown> }>;
  remove: (id: string) => Effect.Effect<void>;
}>()("@opencode/Shell") {}
const inputSchema = Schema.Struct({ shellID: Schema.String, sessionID: Schema.String });
const definition = {
  id: "get3w.background-shell",
  methods: { stop: {
    input: { type: "object", properties: { shellID: { type: "string" }, sessionID: { type: "string" } }, required: ["shellID", "sessionID"], additionalProperties: false },
    output: { type: "object", properties: { stopped: { const: true } }, required: ["stopped"], additionalProperties: false },
  } }, events: {},
};
export function quietShellNotice(input: SyntheticInput, stopped: ReadonlyMap<string, string>): SyntheticInput {
  const id = input.metadata?.shellID;
  if (input.metadata?.source !== "shell" || typeof id !== "string" || stopped.get(id) !== input.sessionID) return input;
  return { ...input, text: "The user explicitly stopped this background task. Keep it stopped unless the user asks to restart it.", resume: false, delivery: "queue", metadata: { ...input.metadata, state: "cancelled", get3wUserStopped: true } };
}
type Registration = { dispose: Effect.Effect<void> };
type PluginContext = {
  app: { version: string };
  rpc: { register: (schema: typeof definition, handlers: { stop: (input: unknown) => Effect.Effect<{ stopped: true }> }) => Effect.Effect<Registration, never, Scope.Scope> };
};
export default {
  id: definition.id,
  effect: (ctx: PluginContext) => Effect.gen(function* () {
    if (ctx.app.version !== "2.2.0") return yield* Effect.die(new Error("Review background shell compatibility before changing the engine pin"));
    const stopped = new Map<string, string>();
    let restore: (() => void) | undefined;
    yield* Effect.addFinalizer(() => Effect.sync(() => restore?.()));
    yield* ctx.rpc.register(definition, {
      stop: (value: unknown) => Effect.gen(function* () {
        // Native location services are available during RPC dispatch, rather
        // than during the process-wide plugin setup.
        const native = yield* Effect.context();
        const sessionService = Context.getOption(native, NativeSession);
        const shellService = Context.getOption(native, NativeShell);
        if (Option.isNone(sessionService) || Option.isNone(shellService)) return yield* Effect.die(new Error("Native background task services are unavailable"));
        const sessions = sessionService.value;
        const shells = shellService.value;
        if (!restore) {
          const original = sessions.synthetic;
          const patched = (input: SyntheticInput) => original(quietShellNotice(input, stopped));
          sessions.synthetic = patched;
          restore = () => { if (sessions.synthetic === patched) sessions.synthetic = original; };
        }
        const input = Schema.decodeUnknownSync(inputSchema)(value);
        const shell = yield* shells.get(input.shellID);
        if (shell.metadata?.sessionID !== input.sessionID) return yield* Effect.die(new Error("Background task does not belong to this conversation"));
        stopped.set(input.shellID, input.sessionID);
        // Retain cancellation intent for delayed notifications, with bounded memory.
        if (stopped.size > 4096) { const oldest = stopped.keys().next().value; if (oldest) stopped.delete(oldest); }
        yield* shells.remove(input.shellID).pipe(Effect.tapError(() => Effect.sync(() => { stopped.delete(input.shellID); })), Effect.orDie);
        return { stopped: true };
      }),
    });
  }),
};
