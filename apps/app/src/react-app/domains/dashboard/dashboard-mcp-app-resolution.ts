import { timeMcpApp } from "@get3w/types/mcp-app-timing";
import { mcpAppResolutionRetryDelayMs } from "@/app/lib/mcp-app-resolution"
import type {
  Get3wMcpAppLaunchReference,
  Get3wMcpAppResource,
  Get3wServerClient,
} from "@/app/lib/get3w-server"

type McpAppResolutionEndpoint = {
  client: Pick<Get3wServerClient, "resolveMcpApp" | "releaseMcpApp">
  workspaceId: string
}

type ResolveDashboardMcpAppOptions<TEndpoint extends McpAppResolutionEndpoint> = {
  endpoints: TEndpoint[]
  projectedToolName: string
  expected: Pick<Get3wMcpAppResource, "serverName" | "toolName" | "resourceUri">
  launch?: Get3wMcpAppLaunchReference
  isActive?: (endpoint: TEndpoint) => boolean
  wait?: (delayMs: number) => Promise<void>
}

/** Resolve the exact saved app before sending its arguments or launch approval. */
export async function resolveDashboardMcpApp<TEndpoint extends McpAppResolutionEndpoint>({
  endpoints,
  projectedToolName,
  expected,
  launch,
  isActive = () => true,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
}: ResolveDashboardMcpAppOptions<TEndpoint>): Promise<{ endpoint: TEndpoint; app: Get3wMcpAppResource } | null> {
  let attemptIndex = 0
  let pending = endpoints
  while (true) {
    let resolveFailure: unknown = null
    let retryDelayMs: number | null = null
    const retryEndpoints: TEndpoint[] = []
    for (const endpoint of pending) {
      if (!isActive(endpoint)) continue
      try {
        // Discovery needs the binding, never the saved tool input or approval.
        const reference = launch ? { ...launch, arguments: {} } : undefined
        const { app } = await timeMcpApp("dashboard.discovery-resolve", () => endpoint.client.resolveMcpApp(endpoint.workspaceId, projectedToolName, reference, { sessionId: null, readOnly: false }))
        if (isActive(endpoint) && app && app.serverName === expected.serverName
          && app.toolName === expected.toolName && app.resourceUri === expected.resourceUri) return { endpoint, app }
        if (app?.launchId) await endpoint.client.releaseMcpApp(endpoint.workspaceId, app.launchId).catch(() => undefined)
      } catch (cause) {
        if (!isActive(endpoint)) continue
        resolveFailure ??= cause
        const delay = mcpAppResolutionRetryDelayMs(cause, attemptIndex)
        if (delay !== null) {
          retryDelayMs = delay
          retryEndpoints.push(endpoint)
        }
      }
    }
    if (!resolveFailure) return null
    if (retryDelayMs === null) throw resolveFailure
    await wait(retryDelayMs)
    pending = retryEndpoints
    attemptIndex += 1
  }
}
