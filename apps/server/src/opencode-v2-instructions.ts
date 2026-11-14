import { execFile } from "node:child_process";
import { glob, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { workspaceOpencodeConfigCandidates } from "@openwork/paths";
import constants from "../../../constants.json" with { type: "json" };
import { readJsoncFile } from "./jsonc.js";
import { OPENWORK_AGENT_PROMPT, OPENWORK_CONNECT_ROUTING_INSTRUCTION } from "./openwork-agent-prompt.js";
import { NATIVE_MEDIA_TASK_SELECTION } from "./native-media-instructions.js";
import { automationRuntimeKnowledge } from "./automation-runtime-knowledge.js";

const CONNECT_DISCOVERY_INSTRUCTION = "Org-connected services, remote skills, Workflows, and Automations reach you through OpenWork Connect. Use the Code Mode catalog and search() to discover available tools, then call exact returned paths. When Connect exposes individual service tools, call them directly. For anything without a tool of its own, use Connect's search_capabilities and execute_capability: discover capabilities with the former and run exact returned names with the latter. Read remote skills with the available get_skill tool. Discover on demand; only name services and skills returned by discovery or the remote skill catalog.";

export const OPENWORK_V2_INSTRUCTION_KEY = "openwork.context";
export const OPENWORK_V2_CONFIGURED_INSTRUCTION_KEY = "openwork.configured-instructions";

/**
 * The pinned OpenCode 2.0.26 accepts the config `instructions` array but never
 * loads it; 2.0.30 does (anomalyco/opencode#55539). After that pin bump the
 * server only deletes this entry, clearing it from sessions that carried it.
 */
export const ENGINE_IGNORES_CONFIGURED_INSTRUCTIONS = constants.opencodeV2Version === "2.0.26";

// Leaves room for JSON escaping under the engine's 256 KiB entry limit.
const CONFIGURED_INSTRUCTIONS_MAX_BYTES = 192 * 1024;

const execFileAsync = promisify(execFile);

// Bun's node:fs glob never matches dot paths such as `.opencode/AGENTS.md`.
async function matchFiles(pattern: string, cwd: string) {
  const matches: string[] = [];
  const found = typeof process.versions.bun === "string"
    ? new Bun.Glob(pattern).scan({ cwd, dot: true })
    : glob(pattern, { cwd });
  for await (const match of found) matches.push(match);
  return matches.sort();
}

function insideRoot(root: string, path: string) {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

// Instruction documents only, never a file the engine asks before any agent
// reads (its default `*.env` and `*.env.*` read rules, `.env.example` aside).
function instructionDocument(path: string) {
  const name = basename(path);
  return /\.(?:md|mdc|markdown|txt)$/i.test(name) && !/\.env(?:$|\.(?!example$))/i.test(name);
}

/** The paths git ignores; none outside a repository or without git. Tracked files are never ignored. */
async function gitIgnored(cwd: string, paths: string[]) {
  if (paths.length === 0) return new Set<string>();
  try {
    const run = execFileAsync("git", ["check-ignore", "-z", "--stdin"], { cwd, timeout: 5_000 });
    run.child.stdin?.end(paths.join("\0"));
    const { stdout } = await run;
    return new Set(stdout.split("\0").filter(Boolean));
  } catch (error) {
    // Exit 1: nothing ignored. Without a repository there are no ignore rules;
    // a checkout git cannot read, or any other failure, throws.
    const { code, stderr } = error as { code?: unknown; stderr?: unknown };
    if (code === 1) return new Set<string>();
    if (code === 128 && typeof stderr === "string" && /not a git repository/i.test(stderr)) return new Set<string>();
    if (code === "ENOENT" && !(await stat(join(cwd, ".git")).catch(() => null))) return new Set<string>();
    throw error;
  }
}

/**
 * The workspace config's `instructions` files rendered the way OpenCode does,
 * or null when none load. A workspace's config may come from someone else, so
 * it can only send instruction documents that are part of the workspace:
 * Markdown or text files inside it that git does not ignore. Local files such
 * as `.env` or ignored notes, URLs and paths outside the workspace never load.
 */
export async function readConfiguredInstructions(workspaceRoot: string): Promise<string | null> {
  const sources = new Set<string>();
  for (const path of workspaceOpencodeConfigCandidates(workspaceRoot)) {
    const { data } = await readJsoncFile<{ instructions?: unknown }>(path, {}, { allowInvalid: true });
    if (!Array.isArray(data?.instructions)) continue;
    for (const source of data.instructions) if (typeof source === "string") sources.add(source);
  }
  if (sources.size === 0) return null;
  const root = await realpath(workspaceRoot);
  const files: { path: string; real: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (/^https?:\/\//i.test(source)) continue;
    const expanded = source.startsWith("~/") ? join(homedir(), source.slice(2)) : source;
    // Bun's glob ignores absolute patterns, so every match starts from the workspace.
    const pattern = (isAbsolute(expanded) ? relative(workspaceRoot, expanded) : expanded).split(sep).join("/");
    if (pattern === ".." || pattern.startsWith("../")) continue;
    for (const match of await matchFiles(pattern, workspaceRoot)) {
      const path = resolve(workspaceRoot, match);
      const real = await realpath(path).catch(() => null);
      if (!real || seen.has(real) || !insideRoot(root, real)) continue;
      // A link is judged by both its own name and the file it points to.
      if (!instructionDocument(path) || !instructionDocument(real)) continue;
      seen.add(real);
      // Git judges the file itself: a link's own path may cross a linked folder.
      files.push({ path, real, name: relative(root, real) });
    }
  }
  const ignored = await gitIgnored(workspaceRoot, files.map((file) => file.name));
  const blocks: string[] = [];
  let bytes = 0;
  for (const file of files) {
    if (ignored.has(file.name)) continue;
    const content = await readFile(file.real, "utf8").catch(() => null);
    if (content === null) continue;
    const block = `Instructions from: ${file.path}\n${content}`;
    const size = Buffer.byteLength(block);
    if (bytes + size > CONFIGURED_INSTRUCTIONS_MAX_BYTES) continue;
    bytes += size;
    blocks.push(block);
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

/** Operating instructions for the v2 engine; native skills are workspace files. */
export function buildOpenWorkV2Instructions(connectReady: boolean, modelGatewayReady = false, workspacePath?: string) {
  return {
    operatingInstructions: "You are Get3W, a personal assistant working on the user's local files. Preserve existing work, respect approvals, and use only discovered tools. Call one outer tool at a time, except independent native media_prepare or media_generate calls may run in parallel. Native tools require their declared arguments: read needs path, shell needs command, and execute needs code. Never use empty tool arguments as a probe.",
    context: `Use openwork_context to discover Get3W app reads. Use openwork_query session.search then session.read for other conversations. Use discovered session.group commands to manage sidebar groups. Save deliverables inside the user's workspace${workspacePath ? ` (${workspacePath})` : ""}, and use absolute Markdown file links so they can open the results. Engine scratch directories are temporary, not deliverable locations.`,
    connect: modelGatewayReady
      ? NATIVE_MEDIA_TASK_SELECTION + " Get3W Desktop provides native media_prepare and media_generate tools when the account connection is ready. For every requested image, video, speech, music or media editing task, call media_prepare directly with task_type and optional model, then call media_generate with its preparation_id and creative inputs matching the returned parameters. For independent candidates sharing a model and references, give each preparation a distinct stable task_key; retain it for retries of that candidate. Every candidate must fulfill the complete requested scene sequence. For independent tasks, issue all media_prepare calls together in parallel, then issue all ready media_generate calls together in parallel; never serialize independent media tasks. Complete prepare and generate for every requested task before ending the turn; one submitted task does not complete a request for several media types. Preparations belong to the original user message: prepare again in a later turn instead of reusing its preparation_id. After submitting, state only the submission status and do not describe unseen results. Respect the resolved generation policy. Omit defaulted output settings from media_generate inputs. Use its output_overrides only for output changes explicitly requested in the current user message; never infer a different aspect ratio or resolution from the subject. These are direct tools, not Code Mode functions or generic MCP capabilities. The host handles defaults, references, validation, quote, native approval, session identity, stable submission keys, persistence, background polling and saving results. Never discover media capabilities, write gateway scripts, handle quote IDs, poll results, sleep, download, read generated files just to display them, or build a web page to show a media result. The native task displays results once. If either native tool is absent, report that native media is unavailable and ask to reconnect; do not guess tool names or fall back to the legacy gateway. Use these native tools for generated illustrations inside office documents as well. Do not open an external generation app or website, invoke a third-party generation CLI or skill, or ask for provider credentials as a fallback. A local skill may compose the document but must obtain generated media through these native tools. If the native service cannot complete generation, report the concrete error and preserve work for retry. Use the native approval card for paid generation and never claim that a draft or quote is approval. For image edits, reuse the previous generated image URL. When two references are supplied, pass both URLs to a model that supports multiple image references. Preserve the original subject pixels with a foreground mask when changing a background; also preserve the cup from the original scene when it belongs to the subject. Never use a centered crop that clips the product. Keep all label text inside safe margins, and extend continuous scene content across the entire canvas. The native media task owns result preview and background status; do not duplicate them in the assistant response."
      : "Native Get3W media generation is unavailable because the account tools are not ready. For image, video, speech, music or media editing requests, report this status and ask to reconnect the Get3W account. Do not search for media tools, guess tool paths, use external websites, generation CLIs or generation skills, or read their credentials. Other tasks may use configured personal connections and local tools. Do not claim organization services are connected.",
    presentations: "For presentation requests, first save the page structure and image needs and wait for the user's confirmation before generating missing assets. Use only supplied or sourced product facts, including at the outline stage. A demo disclaimer does not permit inventing shelf life, freshness periods, brewing compatibility, ingredients, sensory performance or competitor deficiencies. Omit unsupported details instead of filling them with plausible marketing claims. Label proposal assumptions. Keep text editable, embed every image with alt text, and put image filenames, model request IDs and source assumptions in the relevant slide notes. Preserve aspect ratios and fit images within both width and height limits, leaving safe margins; width-only sizing can push portrait images below the slide. Before delivery, inspect every slide's actual geometry for out-of-bounds objects and unintended image/text overlaps, render every slide and visually inspect it. Correct clipping, source-image letterbox bars, stray icon fragments and font substitution before claiming success. Enable explicit text wrapping and size text boxes for their full contents, including footnotes; a box inside the slide does not prove its text fits. Inspect the final PPTX in the actual viewer as well as its PDF, since WPS and the PDF exporter can wrap text differently. Explicitly set both Latin and East Asian (DrawingML a:ea) fonts to the same installed Chinese sans-serif family; setting only the Latin font can still render Chinese as calligraphy in WPS. Verify that the chosen font is installed and used by the actual PPTX viewer and PDF exporter. Export PDF directly from the final PPTX; do not redraw or replace PDF text to hide a PPTX font problem, since that loses styling and breaks document parity. Check page numbers on the cover too. Preserve the first version and source files. For a change to one slide, keep other slides and their media unchanged and verify that isolation. Reopen final deliverables after the last write and provide clickable absolute Markdown links, not bare paths in code spans.",
    documents: "For Word or DOCX requests, create a real editable DOCX using available local document libraries or tools; do not hand a prose instruction to computer_open and assume an office app will author it. Discover installed apps before choosing a GUI workflow, and never require Microsoft Word to be installed just to produce a DOCX. First confirm the requested structure and missing illustrations when the user asks. Preserve supplied facts and full source content. Use native Title and Heading styles, editable tables, embedded images with alt text, and real TOC, PAGE, SEQ and REF/PAGEREF fields when requested. Update field results before delivery and after revisions; static text or an empty field is not a working automatic table of contents. Before claiming completion, inspect the saved ZIP/XML for requested header/footer parts, image media, image descriptions, paper dimensions, native tables and each requested field instruction. Check the rendered PDF page count against the requested count and compare all supplied warnings, FAQ and terms with the final text. A successful authoring command or PDF conversion proves none of these checks. Do not silently shorten supplied clauses or replace precise table values with summaries. For LibreOffice automation, refresh document indexes and text fields and save the refreshed DOCX before exporting PDF; exporting alone may leave an empty TOC. If a required check fails, keep working and describe the actual failure instead of presenting the file as complete. Export PDF from the actual final DOCX and render and visually inspect every page for page size, clipping, blank pages, missing glyphs and image bounds. Preserve originals and verify that a targeted revision changes only the requested paragraph and dependent field results, retaining styles and image bytes. Record generated illustration provenance from actual gateway results: model, request ID, quote and settled charge, not an invented provider or a reservation reported as actual cost. For consistent product appearance, use supplied reference images in a supported image-edit workflow or preserve original product pixels in a local composition; text-only generation of a similar package does not establish identity. Reopen final files and link them with absolute Markdown links.",
    automations: automationRuntimeKnowledge(),
    skillInstructions: "Use the native skill tool when a task matches an available local skill. Follow its instructions within the user's request. Never recover removed or denied skills from earlier context.",
    browser: "Use native browser tools for this conversation's built-in browser. Start with browser_tabs, observe before acting, and verify the result. Use browser_handoff for sign-in. Never use browser tools to control Get3W itself or claim access to external browser profiles.",
  };
}
