import { t } from "@/i18n";
import { useCallback, useEffect, useState } from "react"
import { connectionActionPayloadSchema, type ConnectionActionPayload } from "@openwork/types/connection-action-app"
import { type DenExternalMcpConnection } from "@/app/lib/den"
import { cn } from "@/lib/utils"
import { useOptionalMessageList } from "./message-list-provider"

// The native connection card reads a connection report from this tool's results.
const CONNECTION_TOOL_NAME = "openwork-cloud_connection_action"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The App a launch result opened, as Den summarizes it: its title and the capabilities its tools run. */
function launchedApp(result: { structuredContent?: Record<string, unknown> } | null | undefined) {
  const app = result?.structuredContent?.app
  if (!isRecord(app) || !Array.isArray(app.tools)) return null
  return {
    title: typeof app.title === "string" ? app.title : null,
    capabilities: app.tools.flatMap(tool => isRecord(tool) && typeof tool.capability === "string" ? [tool.capability] : []),
  }
}

/** Connections an App built in Get3W calls through its tools (`mcp:<connectionId>:<tool>`). */
export function connectionIdsUsedByApp(result: { structuredContent?: Record<string, unknown> } | null | undefined): string[] {
  const ids = (launchedApp(result)?.capabilities ?? []).flatMap((capability) => {
    const match = /^mcp:([^:]+):./.exec(capability)
    return match?.[1] ? [match[1]] : []
  })
  return [...new Set(ids)]
}

/**
 * What the viewer must do before the App's connection tools can run, from the
 * live connection list. Connections the viewer cannot see stay quiet: their
 * tools report access to the App itself.
 */
export function signInPromptsForConnections(connectionIds: readonly string[], connections: readonly DenExternalMcpConnection[]): ConnectionActionPayload[] {
  return connectionIds.flatMap((connectionId): ConnectionActionPayload[] => {
    const connection = connections.find(item => item.id === connectionId)
    if (!connection) return []
    const base = { schemaVersion: "1" as const, connectionId, connectionName: connection.name }
    if (connection.issuerReviewRequired) {
      return [{ ...base, state: "reauth_required" as const, actor: "organization_admin" as const, action: null,
        message: `${connection.name} is blocked until an organization admin reviews its sign-in.` }]
    }
    if (connection.credentialMode === "shared") {
      return connection.connected ? [] : [{ ...base, state: "needs_connection" as const, actor: "organization_admin" as const, action: null,
        message: `${connection.name} is not connected yet.` }]
    }
    if (connection.authType !== "oauth") return []
    if (connection.connectedForMe && !(connection.needsReconnect && connection.reconnectActionOwner !== "organization_admin")) return []
    const reconnect = connection.connectedForMe
    return [{
      ...base,
      state: reconnect ? "reauth_required" as const : "needs_connection" as const,
      actor: "member" as const,
      message: reconnect ? `Your ${connection.name} sign-in expired.` : `You haven't connected your ${connection.name} account yet.`,
      action: { type: reconnect ? "reconnect" as const : "connect" as const, label: reconnect ? t("ui.51fbe1dc8a73") : t("ui.bfd402b2f6f3"), surface: "openwork_your_connections" as const },
    }]
  })
}

/** A bound App tool that failed because the viewer has not signed in (or must sign in again). */
export function signInPromptFromToolResult(result: { isError?: boolean; structuredContent?: unknown } | null | undefined): ConnectionActionPayload | null {
  if (result?.isError !== true) return null
  const parsed = connectionActionPayloadSchema.safeParse(result.structuredContent)
  if (!parsed.success || (parsed.data.state !== "needs_connection" && parsed.data.state !== "reauth_required")) return null
  return parsed.data
}

function withPrompt(prompts: ConnectionActionPayload[], next: ConnectionActionPayload) {
  return prompts.some(prompt => prompt.connectionId === next.connectionId) ? prompts : [...prompts, next]
}

/**
 * Sign-in prompts for one open App: connections its tools use that the viewer
 * has not signed in to, found when it opens and whenever a tool reports one.
 */
export function useMcpAppSignIn(result: { structuredContent?: Record<string, unknown> } | null | undefined) {
  const [prompts, setPrompts] = useState<ConnectionActionPayload[]>([])
  const connectionIds = connectionIdsUsedByApp(result).join("\n")
  const appTitle = launchedApp(result)?.title ?? null


  const reportToolResult = useCallback((toolResult: { isError?: boolean; structuredContent?: unknown }) => {
    const prompt = signInPromptFromToolResult(toolResult)
    if (prompt) setPrompts(current => withPrompt(current, prompt))
  }, [])
  const signedIn = useCallback((connectionId: string) => {
    setPrompts(current => current.filter(prompt => prompt.connectionId !== connectionId))
  }, [])
  return { prompts, appTitle, reportToolResult, signedIn }
}

/** One sign-in row per connection, above the App; signing in reloads the App. */
export function McpAppSignInPrompts(_props: { prompts: ConnectionActionPayload[]; className?: string; appTitle: string | null; scope: string; onSignedIn: (id: string) => void }) { return null; }
