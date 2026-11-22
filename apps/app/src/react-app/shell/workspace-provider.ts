import * as React from "react";

import type { Get3wServerClient } from "@/app/lib/get3w-server";
import type { Client } from "@/app/types";

type WorkspaceContextValue = {
  client: Client | null;
  opencodeBaseUrl: string;
  get3wServerClient: Get3wServerClient | null;
  workspaceId: string;
  workspaceType?: string;
  selectedWorkspaceRoot: string;
};

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

type WorkspaceProviderProps = {
  client: Client | null;
  opencodeBaseUrl?: string;
  get3wServerClient?: Get3wServerClient | null;
  workspaceId?: string;
  workspaceType?: string;
  selectedWorkspaceRoot: string;
  children: React.ReactNode;
};

export function WorkspaceProvider({
  client,
  opencodeBaseUrl = "",
  get3wServerClient = null,
  workspaceId = "",
  selectedWorkspaceRoot,
  workspaceType,
  children,
}: WorkspaceProviderProps) {
  const value = React.useMemo(
    () => ({ client, opencodeBaseUrl, get3wServerClient, workspaceId, selectedWorkspaceRoot, workspaceType }),
    [client, opencodeBaseUrl, get3wServerClient, workspaceId, selectedWorkspaceRoot, workspaceType],
  );

  return React.createElement(WorkspaceContext.Provider, { value }, children);
}

/** Like useWorkspace, but null when rendered outside a WorkspaceProvider. */
export function useWorkspaceMaybe() {
  return React.use(WorkspaceContext);
}

export function useWorkspace() {
  const context = React.use(WorkspaceContext);

  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }

  return context;
}
