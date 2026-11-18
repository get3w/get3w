import { t } from "@/i18n";
// Owned here: reload vocabulary is part of the extension manifest contract.
// types.ts re-exports it for the rest of the app.
export type ReloadReason = "plugins" | "skills" | "mcp" | "config" | "agents" | "commands";

export type Get3WExtensionSourceFormat =
  | "agent-plugin"
  | "get3w-builtin"
  | "get3w-extension-manifest"
  | "claude-plugin"
  | "opencode-plugin"
  | "mcp-directory"
  | "manual";

export type Get3WExtensionSource = {
  format: Get3WExtensionSourceFormat;
  trusted: boolean;
  origin?: "builtin" | "den" | "workspace" | "local";
  reference?: string;
};

export type Get3WExtensionResourceType =
  | "skill"
  | "agent"
  | "command"
  | "tool"
  | "mcp"
  | "opencode-plugin"
  | "provider"
  | "hook"
  | "context"
  | "secret"
  | "file"
  | "local-service"
  | "native-binary";

export type Get3WExtensionResource = {
  type: Get3WExtensionResourceType;
  id: string;
  label?: string;
  description?: string;
  path?: string;
  command?: string[];
  envKey?: string;
  packageName?: string;
  providerId?: string;
  mcpServerName?: string;
  localCommandRef?: "get3w.uiMcp";
  required?: boolean;
};

export type Get3WExtensionContributionType =
  | "settings-panel"
  | "setup-instructions"
  | "composer-prompt"
  | "session-side-panel"
  | "session-rail-item"
  | "control-actions"
  | "server-route"
  | "native-capability"
  | "test-action";

export type Get3WExtensionContribution = {
  type: Get3WExtensionContributionType;
  ref?: string;
  label?: string;
  description?: string;
  prompt?: string;
  location?: "settings-detail" | "composer" | "session-right-pane" | "session-rail" | "server" | "native";
};

export type Get3WExtensionSetup = {
  instructions?: string;
  primaryCta?: string;
  secondaryCta?: string;
  requiredEnv?: string[];
  testActionRef?: string;
};

export type Get3WExtensionLifecycle = {
  reload?: ReloadReason[];
  detection?: string[];
};

// ---------------------------------------------------------------------------
// Enablement — declarative conditions for extension "active" state
// ---------------------------------------------------------------------------

export type EnablementConditionType =
  | "mcp-connected"
  | "provider-connected"
  | "env-set"
  | "toggle-enabled";

export type EnablementCondition = {
  type: EnablementConditionType;
  /** What to check — MCP server name, plugin id, env key, etc. */
  ref: string;
  /** Human-readable label shown in the UI. */
  label: string;
};

/** Result of evaluating a single enablement condition at runtime. */
export type EnablementResult = {
  condition: EnablementCondition;
  met: boolean;
};

export type Get3WExtensionManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  preview?: boolean;
  source: Get3WExtensionSource;
  icon?: {
    src?: string;
    simpleIconSlug?: string;
  };
  composer?: {
    prompt: string;
  };
  setup?: Get3WExtensionSetup;
  resources: Get3WExtensionResource[];
  contributions?: Get3WExtensionContribution[];
  lifecycle?: Get3WExtensionLifecycle;
  /** Declarative conditions that must ALL be true for the extension to be "active". */
  enablement?: EnablementCondition[];
  defaultEnabled?: boolean;
  defaultHidden?: boolean;
  platform?: Array<"darwin" | "linux" | "windows" | "web">;
};

export type Get3WExtensionPlatform = NonNullable<Get3WExtensionManifest["platform"]>[number];

export function extensionContribution(
  manifest: Get3WExtensionManifest | undefined,
  type: Get3WExtensionContributionType,
): Get3WExtensionContribution | undefined {
  return manifest?.contributions?.find((contribution) => contribution.type === type);
}

export function extensionResource(
  manifest: Get3WExtensionManifest | undefined,
  type: Get3WExtensionResourceType,
): Get3WExtensionResource | undefined {
  return manifest?.resources.find((resource) => resource.type === type);
}

export function isTrustedBuiltInExtension(manifest: Get3WExtensionManifest | undefined): boolean {
  return manifest?.source.origin === "builtin" && manifest.source.trusted;
}

export const BUILT_IN_GET3W_EXTENSION_MANIFESTS: Get3WExtensionManifest[] = [
  {
    schemaVersion: 1,
    id: "get3w-browser",
    name: "Get3W Browser",
    get description() { return t("ui.5227c89ab4d5"); },
    source: { format: "get3w-builtin", origin: "builtin", trusted: true },
    icon: { src: "/get3w-mark.svg" },
    composer: { prompt: "Use the Get3W Browser extension to " },
    setup: {
      instructions: "Get3W Browser is ready by default in desktop workspaces.",
    },
    resources: [
      {
        type: "opencode-plugin",
        id: "get3w-chrome-devtools",
        get label() { return t("ui.e0afe8c48cfb"); },
        required: true,
      },
    ],
    contributions: [
      { type: "settings-panel", ref: "get3w.browser.settings", location: "settings-detail" },
      { type: "session-side-panel", ref: "get3w.browser.panel", location: "session-right-pane" },
      { type: "composer-prompt", prompt: "Use the Get3W Browser extension to ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "get3w-browser", get label() { return t("ui.92c1cdfdf4cb"); } },
    ],
    lifecycle: { reload: ["plugins", "agents"] },
    defaultEnabled: true,
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "ollama",
    name: "Ollama",
    get description() { return t("ui.94f7642df031"); },
    source: { format: "get3w-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-ollama.svg" },
    composer: { prompt: "Use the Ollama extension to " },
    setup: {
      instructions: "Run Ollama locally, choose or pull a model, then add it as an OpenCode provider.",
      primaryCta: "Add Ollama model",
      get secondaryCta() { return t("ui.db4b670541c0"); },
    },
    resources: [
      { type: "local-service", id: "ollama-api", label: "Ollama API", description: "http://localhost:11434", required: true },
      { type: "provider", id: "ollama", providerId: "ollama", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "get3w.ollama.settings", location: "settings-detail" },
      { type: "test-action", ref: "get3w.ollama.listModels", get label() { return t("ui.9ee317607c70"); } },
      { type: "composer-prompt", prompt: "Use the Ollama extension to ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "ollama", get label() { return t("ui.906e987afc7f"); } },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:ollama"] },
  },
];
