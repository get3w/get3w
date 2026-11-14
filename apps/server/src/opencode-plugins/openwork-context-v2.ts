import { z } from "zod";
import { server as browserTools } from "./openwork-chrome-devtools.js";
import { server as computerTools } from "./openwork-computer-use.js";
import { addProviderSafeTool } from "./provider-safe-tool-schema.js";
import { GET3W_CHAT_TOOLS } from "../get3w-chat-tools.js";
import { mcpToolId } from "../opencode-v2-mcp-readiness.js";

import { NATIVE_MEDIA_TASK_SELECTION } from "../native-media-instructions.js";

const GET3W_ACCOUNT_MCP = "get3w-account";

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
  options: { codemode: boolean; pinned?: boolean };
  execute(input: unknown, context: ToolCall): Promise<z.infer<typeof browserResult>>;
};
type ModelTool = { execute(input: unknown, call: ToolCall): Promise<{ output: unknown }> };
const modelCallError = z.object({ error: z.object({ message: z.string() }) });
const modelCallResult = z.object({ result: z.unknown() });
type Context = {
  session?: { hook(name: "prompt", callback: () => void | Promise<void>): Promise<{ dispose(): Promise<void> }> };
  location?: { directory?: string };
  options: { url: string; token: string; browser?: { url: string; token: string } };
  tool: {
    transform(callback: (editor: {
      add(tool: Tool): void;
      get?(id: string): unknown;
      remove?(id: string): void;
      update?(id: string, change: (tool: ModelTool) => void): void;
    }) => void): Promise<{ dispose(): Promise<void> }>;
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
      // Native media tools are direct engine tools, never Code Mode scripts.
      const readinessMarker=mcpToolId(GET3W_ACCOUNT_MCP,"native_media_ready");
      const nativeMediaReady=Boolean(editor.get?.(readinessMarker));
      // The marker establishes transport readiness; it is never a model action.
      if(nativeMediaReady)editor.remove?.(readinessMarker);
      if(nativeMediaReady) for(const name of ["media_prepare","media_generate"]) {
        addProviderSafeTool(editor,{
          name, options:{codemode:false,pinned:true},
          description:name==="media_prepare"
            ? NATIVE_MEDIA_TASK_SELECTION + " Prepare native media. task_type uses exact run types: text-to-image, image-to-image, text-to-video, reference-to-video, first-to-video, first-last-to-video, video-edit, text-to-speech, text-to-music. Optional model must be exact. Unknown types return supported_task_types; retry this native tool using that list, never discover gateway tools. For multiple candidates of the same model, set a distinct stable task_key per candidate (candidate-1, candidate-2); reuse that key only to retry the same task. References use named model input fields. First prepare without references to learn supported fields, then bind local references in prepare after copying external files into the workspace. Never pass local paths to generate. Returns preparation_id, parameter schema, defaults and missing inputs. Prepare independent requested media tasks in parallel. Do not write scripts."
            : "Start a prepared native media task. Supply preparation_id and creative inputs matching its parameters. Omit defaulted settings from inputs; the host already applies them. Only when the current user message explicitly requests a different output setting, put that setting in output_overrides. Never choose output_overrides yourself. Host handles defaults, validation, quote, approval, durable submission and background polling. Submit independent prepared tasks in parallel. Returns a task id immediately after submission. Do not poll, sleep, download, read or duplicate the result preview; the native task shows and saves results.",
          input:name==="media_prepare"?{type:"object",properties:{task_type:{type:"string",description:NATIVE_MEDIA_TASK_SELECTION},model:{type:"string"},task_key:{type:"string",minLength:1,maxLength:120},references:{type:"object",additionalProperties:true}},required:["task_type"],additionalProperties:false}
            :{type:"object",properties:{preparation_id:{type:"string"},inputs:{type:"object",additionalProperties:true},output_overrides:{type:"object",description:"Output settings explicitly requested in the current user message; omit otherwise.",additionalProperties:true}},required:["preparation_id","inputs"],additionalProperties:false},
          async execute(input,call){
            if(!context.location?.directory||!call.messageID)throw Error("Native media conversation unavailable");
            const response=await fetch(context.options.url,{method:"POST",redirect:"error",signal:call.signal,
              headers:{Authorization:`Bearer ${context.options.token}`,"Content-Type":"application/json"},
              body:JSON.stringify({name:"get3w_model_call",input:{name,arguments:input},sessionId:call.sessionID,caller:{directory:context.location.directory,messageId:call.messageID,...(call.id?{callId:call.id}:{})}})});
            const payload:unknown=await response.json();const result=modelCallResult.safeParse(payload);
            if(!response.ok||!result.success)throw Error("Native media service unavailable; reconnect the account and retry");
            const native=z.object({structuredContent:z.unknown()}).parse(result.data.result);
            return {content:[{type:"text",text:JSON.stringify(native.structuredContent)}]};
          },
        });
      }
      // Route Get3W account tools through the host bridge so the engine, not the
      // model's arguments, supplies the conversation the paid call belongs to.
      for (const name of GET3W_CHAT_TOOLS) {
        const id = mcpToolId(GET3W_ACCOUNT_MCP, name);
        if (!editor.get?.(id)) continue;
        editor.update?.(id, tool => {
          tool.execute = async (input, call) => {
            call.signal.throwIfAborted();
            const directory = context.location?.directory;
            if (!directory || !call.messageID || !call.sessionID) throw new Error("Conversation context is unavailable");
            const response = await fetch(context.options.url, {
              method: "POST", redirect: "error", signal: call.signal,
              headers: { Authorization: `Bearer ${context.options.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ name: "get3w_model_call", input: { name, arguments: input }, sessionId: call.sessionID,
                caller: { directory, messageId: call.messageID, ...(call.id ? { callId: call.id } : {}), ...(call.agent ? { agent: call.agent } : {}) } }),
            });
            const payload: unknown = await response.json().catch(() => null);
            const failed = modelCallError.safeParse(payload);
            if (failed.success) throw new Error(failed.data.error.message);
            const done = modelCallResult.safeParse(payload);
            if (!response.ok || !done.success) throw new Error(`Get3W model call failed (${response.status})`);
            return { output: done.data.result };
          };
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
