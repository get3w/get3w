import { useCallback } from "react";
import type { ModelRef } from "@/app/types";
import { isDesktopRuntime } from "@/app/lib/runtime-env";
import { useWorkspaceMaybe } from "../shell/workspace-provider";
import { setWorkspaceDefaultModel, workspaceModelScope } from "./model-config";

export function useWorkspaceModelProfile() {
  return "local";
}

export function useSetWorkspaceDefaultModel() {
  const workspace = useWorkspaceMaybe();
  const profileId = useWorkspaceModelProfile();
  const scope = workspaceModelScope({ profileId, workspaceId: workspace?.workspaceId ?? "",
    opencodeBaseUrl: workspace?.opencodeBaseUrl ?? "", localRuntime: isDesktopRuntime() });
  const profile = scope?.profileId;
  const runtime = scope?.runtime;
  const workspaceId = scope?.workspaceId;
  const setDefault = useCallback((model: ModelRef, variant: string | null = null) => {
    if (!profile || !runtime || !workspaceId) return false;
    return setWorkspaceDefaultModel({ profileId: profile, runtime, workspaceId }, model, variant);
  }, [profile, runtime, workspaceId]);
  return scope ? setDefault : undefined;
}
