import { z } from "zod";
import { server as browserTools } from "./openwork-chrome-devtools.js";
import { server as computerTools } from "./openwork-computer-use.js";
import { addProviderSafeTool } from "./provider-safe-tool-schema.js";

const browserResult = z.object({
  content: z.array(z.union([z.object({ type: z.literal("text"), text: z.string() }),
    z.object({ type: z.literal("file"), uri: z.string(), mime: z.string() })])),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type ToolCall = { signal: AbortSignal; sessionID: string; messageID?: string; id?: string; agent?: string };
type Tool = {
  name: string;
  description: string;
  input: Record<string, unknown>;
  options: { codemode: boolean };
  execute(input: unknown, context: ToolCall): Promise<z.infer<typeof browserResult>>;
};
type Context = {
  session?: { hook(name: "prompt", callback: () => void | Promise<void>): Promise<{ dispose(): Promise<void> }> };
  location?: { directory?: string };
  options: { url: string; token: string; browser?: { url: string; token: string } };
  tool: {
    transform(callback: (editor: { add(tool: Tool): void }) => void): Promise<{ dispose(): Promise<void> }>;
    reload?(): Promise<void>;
  };
};

// Separate credentials authorize local app reads, sidebar commands and
// conversation-scoped browser and computer operations.
// Neither grants arbitrary host APIs or other Get3W app commands.
export default {
  id: "openwork.context",
  async setup(context: Context) {
    const browser = context.options.browser;
    const browserDefinitions = browser ? (await browserTools()).tool : undefined;
    const computerDefinitions = browser ? (await computerTools()).tool : undefined;
    // Browser and computer tools share one bridge but are offered separately.
    // Everything the model reads about a capability (tool descriptions and the
    // rules folded into them) arrives only with that capability's tools, so a
    // prompt never describes something this chat cannot use. Keep it that way:
    // browser text must not point at computer_* tools, and new instructions
    // that mention a gated capability belong in that capability's tools.
    // Computer tools follow the desktop's `computerUse` feature, checked again
    // before each prompt. Without a prompt hook and registry reload the choice
    // could not change later, so they stay offered.
    const gated = typeof context.tool.reload === "function" && context.session !== undefined;
    const computerOffered = async (current: boolean) => {
      if (!browser || !gated) return true;
      try {
        const response = await fetch(new URL("/computer", browser.url), {
          redirect: "error", signal: AbortSignal.timeout(5_000), headers: { Authorization: `Bearer ${browser.token}` },
        });
        const body: unknown = response.ok ? await response.json() : undefined;
        return body && typeof body === "object" && "offered" in body && typeof body.offered === "boolean" ? body.offered : current;
      } catch {
        return current;
      }
    };
    let computerOn = await computerOffered(true);
    const registration = await context.tool.transform(editor => {
      for (const name of ["openwork_context", "openwork_query", "openwork_execute"]) {
        addProviderSafeTool(editor, {
          name,
          description: name === "openwork_context"
            ? "Read Get3W app context and available affordances. Use this to discover session.search and session.read for other conversations, session.group commands for sidebar groups, session.create and session.send to start or message other sessions, session.question.list and session.question.answer for questions another session is waiting on, and automation.propose for scheduled work."
            : name === "openwork_query"
              ? "Read an Get3W affordance without changing the app or navigating. Use the exact id and arguments from openwork_context; session.read includes live background-agent activity."
              : "Run an Get3W command listed in openwork_context: change sidebar groups, create or message sessions, answer another session's pending question with the person's answers, or propose an Automation for the person to review and create. A proposal does not create, activate, or run anything. Use the exact id and arguments from openwork_context.",
          input: name === "openwork_context" ? { type: "object", properties: {}, additionalProperties: false } : {
            type: "object", properties: { id: { type: "string" }, args: { type: "object", additionalProperties: true } },
            required: ["id"], additionalProperties: false,
          },
          options: { codemode: true },
          async execute(input, call) {
            call.signal.throwIfAborted();
            const response = await fetch(context.options.url, {
              method: "POST", redirect: "error", signal: call.signal,
              headers: { Authorization: `Bearer ${context.options.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                name, input, sessionId: call.sessionID,
                // A command that asks first shows its approval at this call in the chat.
                ...(name === "openwork_execute" && context.location?.directory && call.messageID && call.id ? {
                  caller: { directory: context.location.directory, messageId: call.messageID, callId: call.id, ...(call.agent ? { agent: call.agent } : {}) },
                } : {}),
              }),
            });
            if (!response.ok) throw new Error(`Get3W ${name === "openwork_execute" ? "command" : "read"} failed (${response.status})`);
            return { content: [{ type: "text", text: await response.text() }] };
          },
        });
      }
      const bridged = { ...browserDefinitions, ...(computerOn ? computerDefinitions : undefined) };
      if (browser) for (const [name, definition] of Object.entries(bridged)) {
        addProviderSafeTool(editor, {
          name, description: definition.description,
          input: z.toJSONSchema(z.object(definition.args)),
          options: { codemode: false },
          async execute(input, call) {
            const response = await fetch(browser.url, {
              method: "POST", redirect: "error", signal: call.signal,
              headers: { Authorization: `Bearer ${browser.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ name, input, sessionId: call.sessionID }),
            });
            if (!response.ok) throw new Error(`${name.startsWith("computer_") ? "Computer" : "Browser"} request failed (${response.status})`);
            return browserResult.parse(await response.json());
          },
        });
      }
    });
    const promptHook = browser && gated && context.session ? await context.session.hook("prompt", async () => {
      const next = await computerOffered(computerOn);
      if (next === computerOn) return;
      computerOn = next;
      await context.tool.reload?.();
    }) : undefined;
    return async () => { await promptHook?.dispose(); await registration.dispose(); };
  },
};
