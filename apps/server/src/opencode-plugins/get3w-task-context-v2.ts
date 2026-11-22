import { readAlwaysOnCompletion } from "../always-on-completion.js";
import { readFile, readdir, stat, lstat, realpath } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, dirname, basename } from "node:path";
import { z } from "zod";

const stateSchema = z.object({ sessionId: z.string(), event: z.object({ id: z.string().optional(), messageId: z.string(), repairCount: z.number().optional(), phase: z.string().optional() }) });
const receiptSchema = z.object({ sessionId: z.string(), event: z.object({ messageId: z.string(), phase: z.literal("done"), createdAt: z.number(), resultRequired: z.boolean().optional(), verification: z.object({ status: z.string() }).optional() }) });
type Message = { id?: string; role: string; content?: unknown };
type EditableTool = { execute(input: unknown, call: { sessionID: string }): Promise<unknown> };
export type TaskContext = {
  tool?: { transform(callback: (editor: { list(): readonly { id: string }[]; update(id: string, update: (tool: EditableTool) => void): void }) => void): Promise<{ dispose(): Promise<void> }> };
  location?: { directory?: string };
  session: { hook(name: "context", callback: (event: { sessionID: string; messages: Message[] }) => Promise<void>): Promise<{ dispose(): Promise<void> }> };
};

/** Only runner-owned, checkpointed runs. Persisted history is never edited. */
export async function registerTaskContext(context: TaskContext) {
  const verifiedStarts = new Map<string, { messageId: string; checkpointTime: number }>();
  const registration = await context.session.hook("context", async event => {
    if (!context.location?.directory) return;
    try {
      const root = join(context.location.directory, ".get3w", "always-on");
      const state = stateSchema.parse(JSON.parse(await readFile(join(root, "state.json"), "utf8")));
      if (state.sessionId !== event.sessionID) return;
      const indexedStart = event.messages.findIndex(message => message.id === state.event.messageId && message.role === "user" && JSON.stringify(message.content).includes("ALWAYS_ON_MEMORY_INDEX_V1"));
      if (indexedStart >= 0) {
        // Indexed runs explicitly reload their goal and current memory index.
        // Never restore older snapshots when a checkpoint/receipt is missing:
        // they can contain notes the user has since disabled or deleted.
        event.messages.splice(0, indexedStart);
        return;
      }
      const checkpoint = await readFile(join(root, "checkpoint.md"), "utf8");
      if (!checkpoint.trim() || checkpoint.length > 24000) return;
      const start = event.messages.findIndex(message => message.id === state.event.messageId && message.role === "user");
      if (start <= 0) return;
      const checkpointTime = (await stat(join(root, "checkpoint.md"))).mtimeMs;
      const prior = verifiedStarts.get(event.sessionID);
      const verifiedContinuation = prior?.messageId === state.event.messageId && checkpointTime >= prior.checkpointTime;
      // Writing the next checkpoint must not restore old history in the same run.
      // The original prompt was already checked before that write. New runs must
      // prove their own checkpoint inclusion; receipts are still checked below.
      const indexed = JSON.stringify(event.messages[start].content).includes("ALWAYS_ON_MEMORY_INDEX_V1");
      if (!verifiedContinuation && !indexed && !JSON.stringify(event.messages[start].content).includes(JSON.stringify(checkpoint).slice(1, -1))) return;
      const known = new Set<string>();
      for (const file of await readdir(join(root, "runs"))) {
        if (!file.endsWith(".json")) continue;
        const parsed = receiptSchema.safeParse(JSON.parse(await readFile(join(root, "runs", file), "utf8")));
        if (parsed.success && parsed.data.sessionId === event.sessionID && (!parsed.data.event.resultRequired || parsed.data.event.verification?.status === "verified") && checkpointTime >= parsed.data.event.createdAt) known.add(parsed.data.event.messageId);
      }
      // A mixed legacy chat, failed run or manual follow-up needs its original context.
      if (event.messages.slice(0, start).some(message => message.role === "user" && (!message.id || !known.has(message.id)))) return;
      // Keep every message/tool pair in the active run, including tool continuations.
      verifiedStarts.set(event.sessionID, { messageId: state.event.messageId, checkpointTime: verifiedContinuation ? prior.checkpointTime : checkpointTime });
      event.messages.splice(0, start);
    } catch {
      // Missing/corrupt checkpoint or receipts: use the complete native context.
    }
  });
  const tools = await context.tool?.transform(editor => {
    for (const { id } of editor.list()) editor.update(id, tool => {
      const execute = tool.execute;
      tool.execute = async (input, call) => {
        if (context.location?.directory) {
          let state: z.infer<typeof stateSchema> | undefined;
          try { state = stateSchema.parse(JSON.parse(await readFile(join(context.location.directory, ".get3w/always-on/state.json"), "utf8"))); } catch { /* ordinary sessions have no runner state */ }
          if (state?.sessionId === call.sessionID && ["read", "write", "edit"].includes(id)) {
            const args = z.object({ path: z.string().optional(), filePath: z.string().optional() }).safeParse(input);
            const path = args.success ? args.data.path ?? args.data.filePath : undefined;
            if (path) {
              const directory = context.location.directory;
              const root = await realpath(directory);
              let target = resolve(directory, path);
              const missing: string[] = [];
              let ancestor = target;
              while (true) {
                const canonical = await realpath(ancestor).catch(() => null);
                if (canonical) { target = resolve(canonical, ...missing); break; }
                if (dirname(ancestor) === ancestor) break;
                missing.unshift(basename(ancestor)); ancestor = dirname(ancestor);
              }
              const local = relative(root, target).replaceAll("\\", "/");
              if (local === ".get3w/always-on/memory" || local.startsWith(".get3w/always-on/memory/")) throw Error("Use always_on_memory_read for enabled memory entries. Memory changes require user review.");
              if (id !== "read" && (local === ".get3w/always-on" || local.startsWith(".get3w/always-on/"))) {
                const legacyRepairRecord = state.event.repairCount && (local === ".get3w/always-on/checkpoint.md" || local === `.get3w/always-on/results/${state.event.id}.json`);
                if (!legacyRepairRecord) throw Error("Always-on runtime records are host-owned. Use always_on_complete for progress and completion; save source and candidate files outside .get3w/always-on.");
              }
            }
          }
          if (state?.sessionId === call.sessionID && state.event.id && id !== "always_on_complete") {
            const receipt = await readAlwaysOnCompletion(context.location.directory, { eventId: state.event.id, sessionId: call.sessionID, messageId: state.event.messageId });
            if (receipt) throw Error("This run is already committed. End the turn without further tool calls.");
          }
          if (id !== "always_on_complete" && state?.sessionId === call.sessionID && state.event.repairCount && ["submitting", "running", "waiting"].includes(state.event.phase ?? "")) {
            const data = z.object({ path: z.string().optional(), filePath: z.string().optional() }).safeParse(input);
            const path = data.success ? data.data.path ?? data.data.filePath : undefined;
            const root = await realpath(context.location.directory);
            const target = path ? resolve(context.location.directory, path) : root;
            // Find the workspace root in the supplied spelling before examining
            // descendants. macOS /var and /private/var can name the same root.
            let ancestor = target;
            const descendants: string[] = [];
            while (await realpath(ancestor).catch(() => null) !== root && dirname(ancestor) !== ancestor) {
              descendants.unshift(basename(ancestor)); ancestor = dirname(ancestor);
            }
            const local = await realpath(ancestor).catch(() => null) === root ? descendants.join("/") : relative(root, target);
            const permittedWrite = local === ".get3w/always-on/checkpoint.md" || local === `.get3w/always-on/results/${state.event.id}.json`;
            if (!["read", "write", "edit"].includes(id) || !path || !local || local === ".." || local.startsWith("../") || isAbsolute(local) || id !== "read" && !permittedWrite) throw Error("Record completion permits only local reads and writing this run's result and continuity records.");
            let part = root;
            for (const name of local.split("/")) {
              part = join(part, name);
              const info = await lstat(part).catch(error => { if (error.code === "ENOENT") return null; throw error; });
              if (info?.isSymbolicLink()) throw Error("Record completion cannot follow symbolic links.");
            }
          }
        }
        return execute.call(tool, input, call);
      };
    });
  });
  return async () => { await tools?.dispose(); await registration.dispose(); };
}
