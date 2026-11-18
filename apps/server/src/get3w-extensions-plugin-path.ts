import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

declare global {
  namespace NodeJS {
    interface Process {
      resourcesPath?: string;
    }
  }
}

function resourcesPathFromAppAsarPath(path: string): string | null {
  const match = /[\\/]app\.asar(?:[\\/]|$)/.exec(path);
  return match ? path.slice(0, match.index) : null;
}

export function get3wPluginPath(name: string, here?: string): string {
  const pluginDir = process.env.GET3W_EXTENSIONS_PLUGIN_DIR;
  if (pluginDir) {
    return join(pluginDir, `${name}.js`);
  }

  here = here ?? dirname(fileURLToPath(import.meta.url));
  const resourcesPath = resourcesPathFromAppAsarPath(here);
  if (resourcesPath) {
    const electronResourcesPath = process.resourcesPath?.includes("app.asar") ? resourcesPath : process.resourcesPath?.trim();
    return join(electronResourcesPath || resourcesPath, "opencode-plugins", `${name}.js`);
  }

  const extension = basename(here) === "dist" ? "js" : "ts";
  return join(here, "opencode-plugins", `${name}.${extension}`);
}

export const get3wExtensionsPreviewPluginPath = () => get3wPluginPath("get3w-extensions-preview");
export const get3wChromeDevtoolsPluginPath = () => get3wPluginPath("get3w-chrome-devtools");
export const get3wComputerUsePluginPath = () => get3wPluginPath("get3w-computer-use");
export const get3wCapabilitiesKnowledgePluginPath = () => get3wPluginPath("get3w-capabilities-knowledge");
export const get3wAnthropicAdaptiveThinkingPluginPath = () => get3wPluginPath("get3w-anthropic-adaptive-thinking");
export const get3wAnthropicToolSchemaPluginPath = () => get3wPluginPath("get3w-anthropic-tool-schema");
export const get3wOfficeAttachmentsPluginPath = () => get3wPluginPath("get3w-office-attachments");
export const get3wSpreadsheetsPluginPath = () => get3wPluginPath("get3w-spreadsheets");
export const get3wPdfAttachmentsPluginPath = () => get3wPluginPath("get3w-pdf-attachments");
export const get3wTitleRecoveryPluginPath = () => get3wPluginPath("get3w-title-recovery");
export const get3wGatewayQuotaPluginPath = () => get3wPluginPath("get3w-gateway-quota");
export const get3wGatewayQuotaV2PluginPath = () => get3wPluginPath("get3w-gateway-quota-v2");
export const get3wContextV2PluginPath = () => get3wPluginPath("get3w-context-v2");
export const get3wProviderFiltersV2PluginPath = () => get3wPluginPath("get3w-provider-filters-v2");
export const get3wMcpResultsV2PluginPath = () => get3wPluginPath("get3w-mcp-results-v2");
export const get3wMcpReadinessV2PluginPath = () => get3wPluginPath("get3w-mcp-readiness-v2");
export const get3wVisibleReasoningV2PluginPath = () => get3wPluginPath("get3w-visible-reasoning-v2");
export const get3wAutoRouteV2PluginPath = () => get3wPluginPath("get3w-auto-route-v2");
export const get3wAgentPermissionsV2PluginPath = () => get3wPluginPath("get3w-agent-permissions-v2");

export const taskLogEvidenceV2PluginPath = () => get3wPluginPath("task-log-evidence-v2");

export const get3wBackgroundShellV2PluginPath = () => get3wPluginPath("get3w-background-shell-v2");
