import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { appendAgentInstructions, createInstructionSection } from "./agent-instruction-compose.js";
import { correctWorkspaceRoot, workspaceFileGuidance, workspaceFileHooks } from "./workspace-file-destinations.js";

/**
 * Get3W Capabilities Knowledge Plugin
 *
 * Injects knowledge about Get3W's capabilities into the agent's system
 * prompt so it can proactively help users with:
 * - Adding AI providers (including local models via Ollama)
 * - Fixing authorized folders
 * - Connect, Library, and custom MCP servers
 * - Using Get3W Cloud
 * - Finding Get3W docs before falling back to code
 * - Other sessions, skills, automations, plugins
 *
 * Each rule lives in exactly one place: Connect tool mechanics are in the base
 * agent prompt, readiness in the runtime steering, app control and browser
 * mechanics in the extensions plugin, and live catalogs in their own sections.
 */

const OPENWORK_CAPABILITIES_KNOWLEDGE = `You are running inside Get3W Desktop.
Use configured personal model providers, local files, conversation history, local skills/plugins and personal MCP connections.
Manage providers in Settings > AI Providers, folders in Settings > Permissions and extensions in Settings > Library.
Get3W account login and account settings use the native Get3W account control.
Organization Gateway, cloud apps, shared organization Library, remote tasks and cloud automations are unavailable in this edition.
Discover actual tools before using them and never promise unavailable services.
For another conversation use native session search/read tools; never infer its contents from files.
Use local product documentation only when it matches this personal edition.`;

const docsSearchArgsSchema = z.object({
  query: z.string().min(1).describe("Get3W docs search query, for example 'connect slack mcp'."),
  limit: z.number().int().min(1).max(10).optional().describe("Maximum number of matching docs to return."),
});

const docsReadArgsSchema = z.object({
  path: z.string().min(1).describe("Docs-relative path returned by openwork_docs_search, for example start-here/connect-your-stack/connect-services.mdx."),
});

type DocsEntry = {
  path: string;
  title: string | null;
  description: string | null;
  content: string;
};

let docsCache: Promise<DocsEntry[]> | null = null;

function docsCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    process.env.OPENWORK_DOCS_DIR?.trim() ?? "",
    join(here, "..", "openwork-docs"),
    join(here, "..", "..", "openwork-docs"),
    resolve(here, "..", "..", "..", "..", "packages", "docs"),
    resolve(here, "..", "..", "..", "..", "..", "packages", "docs"),
  ].filter(Boolean);
}

async function existingDocsDir(): Promise<string | null> {
  for (const candidate of docsCandidates()) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) return candidate;
    } catch {
      // Try the next layout.
    }
  }
  return null;
}

async function docsFiles(root: string, dir = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "images" || entry.name === "logo") continue;
      const nested = await docsFiles(root, path);
      files.push(...nested);
    } else if (entry.isFile() && /\.(md|mdx|json)$/i.test(entry.name) && entry.name !== "openapi.json") {
      files.push(path);
    }
  }
  return files;
}

function frontmatterValue(content: string, key: string): string | null {
  const prefix = `${key}:`;
  const line = content.split("\n").find((entry) => entry.startsWith(prefix));
  const raw = line?.slice(prefix.length).trim();
  if (!raw) return null;
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

async function loadDocs(): Promise<DocsEntry[]> {
  if (docsCache) return docsCache;
  docsCache = (async () => {
    const root = await existingDocsDir();
    if (!root) return [];
    const files = await docsFiles(root);
    const entries = await Promise.all(files.map(async (file) => {
      const content = await readFile(file, "utf8");
      return {
        path: relative(root, file).replace(/\\/g, "/"),
        title: frontmatterValue(content, "title"),
        description: frontmatterValue(content, "description"),
        content,
      };
    }));
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  })();
  return docsCache;
}

function scoreDoc(entry: DocsEntry, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const path = entry.path.toLowerCase();
  const title = entry.title?.toLowerCase() ?? "";
  const description = entry.description?.toLowerCase() ?? "";
  const content = entry.content.toLowerCase();
  return terms.reduce((score, term) => {
    if (path.includes(term)) score += 8;
    if (title.includes(term)) score += 6;
    if (description.includes(term)) score += 4;
    if (content.includes(term)) score += 1;
    return score;
  }, 0);
}

function excerpt(content: string, query: string): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = content.toLowerCase();
  const index = terms.reduce((best, term) => {
    const next = lower.indexOf(term);
    return next >= 0 && (best < 0 || next < best) ? next : best;
  }, -1);
  const start = Math.max(0, index - 160);
  const from = index >= 0 ? start : 0;
  return content.slice(from, from + 500).replace(/\s+/g, " ").trim();
}

export const OpenWorkCapabilitiesKnowledge = async (context?: Parameters<typeof workspaceFileHooks>[0]) => ({
  ...workspaceFileHooks(context),
  "experimental.chat.system.transform": async (_input: unknown, output: { system: string[] }) => {
    if (context?.directory) correctWorkspaceRoot(output.system, context.directory);
    appendAgentInstructions(output.system,
      createInstructionSection("capabilities-knowledge", OPENWORK_CAPABILITIES_KNOWLEDGE),
      ...(context?.directory ? [createInstructionSection("workspace-files", workspaceFileGuidance(context.directory))] : []));
  },
  tool: {
    openwork_docs_search: {
      description: "Search the bundled Get3W documentation. Use this first for Get3W product questions before inspecting implementation code.",
      args: docsSearchArgsSchema.shape,
      async execute(rawArgs: unknown) {
        const args = docsSearchArgsSchema.parse(rawArgs);
        const docs = await loadDocs();
        const matches = docs
          .map((entry) => ({ entry, score: scoreDoc(entry, args.query) }))
          .filter((match) => match.score > 0)
          .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
          .slice(0, args.limit ?? 5)
          .map((match) => ({
            path: match.entry.path,
            title: match.entry.title,
            description: match.entry.description,
            excerpt: excerpt(match.entry.content, args.query),
          }));
        return JSON.stringify({ ok: true, matches }, null, 2);
      },
    },
    openwork_docs_read: {
      description: "Read a bundled Get3W documentation page by docs-relative path returned from openwork_docs_search.",
      args: docsReadArgsSchema.shape,
      async execute(rawArgs: unknown) {
        const args = docsReadArgsSchema.parse(rawArgs);
        const normalized = args.path.replace(/^\/+/, "");
        if (normalized.split("/").includes("..")) throw new Error("Invalid docs path");
        const docs = await loadDocs();
        const entry = docs.find((doc) => doc.path === normalized);
        if (!entry) throw new Error(`Get3W docs page not found: ${normalized}`);
        return JSON.stringify(entry, null, 2);
      },
    },
  },
});
