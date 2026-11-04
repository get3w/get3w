import { useCallback, useEffect, useRef, useState } from "react";
import type { DenAuthStatus } from "../cloud/den-auth-provider";
import type { OpenworkCloudMcpProviderModelContext, OpenworkServerClient } from "../../../app/lib/openwork-server";
import {
  IDLE_CLOUD_MCP_SUBMISSION_GATE_STATE,
  type CloudMcpSubmissionGateState,
  type CloudMcpSubmissionResult,
} from "./cloud-mcp-submit-readiness";

// Personal chat keeps duplicate-submit and workspace-change cancellation safety.
// Sending never waits for a retired organization Gateway or account resolution.
export function useCloudMcpSubmitReadiness(input: {
  cloudAuthStatus: DenAuthStatus;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  providerModel?: OpenworkCloudMcpProviderModelContext;
}) {
  const [state, setState] = useState<CloudMcpSubmissionGateState>(IDLE_CLOUD_MCP_SUBMISSION_GATE_STATE);
  const pending = useRef(new Map<() => Promise<void>, Promise<CloudMcpSubmissionResult>>());
  const mounted = useRef(true);
  const scopeKey = JSON.stringify([input.client?.baseUrl, input.workspaceId, input.providerModel]);
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  useEffect(() => {
    setState(IDLE_CLOUD_MCP_SUBMISSION_GATE_STATE);

  }, [scopeKey]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const submit = useCallback((submission: { skipGate?: boolean; send: () => Promise<void> }): Promise<CloudMcpSubmissionResult> => {
    const capturedScope = scopeKey;
    const existing = pending.current.get(submission.send);
    if (existing) return existing;
    const task = Promise.resolve().then(async (): Promise<CloudMcpSubmissionResult> => {
      if (!mounted.current) return { outcome: "cancelled", reason: "unmounted" };
      if (currentScope.current !== capturedScope) return { outcome: "cancelled", reason: "context_changed" };
      setState({ ...IDLE_CLOUD_MCP_SUBMISSION_GATE_STATE, status: "sending" });
      await submission.send();
      return { outcome: "sent", bypassed: true };
    }).finally(() => {
      pending.current.delete(submission.send);
      if (mounted.current && currentScope.current === capturedScope && !pending.current.size) {
        setState(IDLE_CLOUD_MCP_SUBMISSION_GATE_STATE);
      }
    });
    pending.current.set(submission.send, task);
    return task;
  }, [scopeKey]);
  const clearFailure = useCallback(() => setState(IDLE_CLOUD_MCP_SUBMISSION_GATE_STATE), []);
  return { state, submit, clearFailure };
}
