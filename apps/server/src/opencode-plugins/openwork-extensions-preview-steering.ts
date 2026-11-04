export type OpenCodeContext = {
  agent?: string;
  sessionID?: string;
  messageID?: string;
  directory?: string;
  worktree?: string;
  workspaceId?: string;
  workspaceID?: string;
  /** The engine's permission prompt in the calling chat; resolves only once the person allows. */
  ask?: (request: { permission: string; patterns: string[]; always: string[]; metadata: Record<string, unknown> }) => Promise<void>;
};

type EngineMcpStatusRequest = {
  query?: {
    directory?: string;
  };
};

export type OpenWorkEngineMcpStatusClient = {
  mcp: {
    status: (request?: EngineMcpStatusRequest) => Promise<unknown>;
  };
};


export const OPENWORK_EXTENSION_DISCOVERY_INSTRUCTION =
  "Use openwork_query with id extension.actions to inspect the available local Get3W extension actions, then openwork_execute with id extension.call for the exact matching action. Only claim capabilities returned by the current tools. Respect local permissions and report unavailable connections without inventing setup steps.";

export const OPENWORK_ON_DEMAND_DISCOVERY_INSTRUCTION =
  "Use the current local tools and user-configured MCP connections. For skill creation, inspect the workspace and follow its local skill conventions. Do not assume an organization cloud library, remote skill catalog, or scheduled automation service is available.";
