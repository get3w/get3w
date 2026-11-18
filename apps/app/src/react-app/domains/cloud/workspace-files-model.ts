import type { Get3wServerClient, Get3wWorkspaceCatalogEntry } from "@/app/lib/get3w-server";

export const parentDirectory = (path: string) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const fileName = (path: string) => path.split("/").at(-1) ?? path;
export const joinFilePath = (directory: string, name: string) => directory ? `${directory}/${name}` : name;

/** Follow every page, including workspaces containing more than 10,000 entries. */
export async function loadFilePages(client: Get3wServerClient, workspaceId: string, options: { directory?: string; query?: string; showSystem?: boolean }) {
  const items: Get3wWorkspaceCatalogEntry[] = [];
  let after: string | undefined;
  let incomplete = false;
  do {
    const page = await client.browseWorkspaceFiles(workspaceId, { ...options, after });
    items.push(...page.items);
    incomplete ||= Boolean(page.incomplete);
    if (!page.truncated) break;
    if (!page.nextAfter || page.nextAfter === after) throw new Error("File listing could not advance. Refresh to try again.");
    after = page.nextAfter;
  } while (true);
  return { items, incomplete };
}
