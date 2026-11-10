import {
  agentContextDiagnosticsReportSchema,
  type AgentContextDiagnosticsReport,
  type AgentContextDiagnosticsRequest,
} from "@openwork/types/agent-context-diagnostics";

export function collectAgentContextDiagnosticObservations(): AgentContextDiagnosticsRequest {
  return {
    organizationConnectionsProbe: { status: "skipped", code: "signed_out", totalCount: 0, truncated: false },
    organizationConnections: [],
  };
}

export function serializeAgentContextDiagnosticsReport(report: AgentContextDiagnosticsReport) {
  const sanitized = agentContextDiagnosticsReportSchema.parse(report);
  return JSON.stringify(sanitized, null, 2);
}
