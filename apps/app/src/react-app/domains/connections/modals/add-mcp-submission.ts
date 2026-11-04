import type { McpDirectoryInfo } from "@/app/constants";
import type { McpConnectResult } from "../store";

export async function submitMcpEntry(
  onAdd: (entry: McpDirectoryInfo) => Promise<McpConnectResult>,
  entry: McpDirectoryInfo,
  fallbackError: string,
): Promise<string | null> {
  try {
    const result = await onAdd(entry);
    return result.ok ? null : result.error;
  } catch (error) {
    return error instanceof Error ? error.message : fallbackError;
  }
}
