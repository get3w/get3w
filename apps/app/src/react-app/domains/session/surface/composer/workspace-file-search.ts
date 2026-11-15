import type { OpenworkServerClient } from "@/app/lib/openwork-server";

/** Search the filesystem catalog, including generated and git-ignored files. */
export async function searchWorkspaceMentionFiles(client: OpenworkServerClient | null, workspaceId: string, query: string, engineFallback: () => Promise<string[]>): Promise<string[]> {
  if (!client) return engineFallback();
  try {
    const page = await client.browseWorkspaceFiles(workspaceId, { query: query.trim(), showSystem: false });
    return page.items.map(entry => entry.kind === "dir" ? `${entry.path}/` : entry.path);
  } catch {
    // Keep file references available while the workspace server reconnects.
    return engineFallback();
  }
}
