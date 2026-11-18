/** @jsxImportSource react */
import { useCallback } from "react";

import type { McpDirectoryInfo } from "../../../app/constants";
import { evaluateEnablement, type EnablementContext } from "../../../app/enablement";
import type { Get3wServerClient } from "../../../app/lib/get3w-server";
import { getExtensionConfigSlot, type ExtensionConfigContext } from "./extension-registry";
import type { LocalProviderInstallInput, LocalProviderSyncInput } from "./openai-image-extension";

type SettingsExtensionControllerInput = {
  get3wServerClient: Get3wServerClient | null;
  hostGet3wServerClient: Get3wServerClient | null;
  enablementContext: EnablementContext;
  restartLocalServer?: () => Promise<boolean>;
  localProvider: {
    busy: boolean;
    status: string | null;
    error: string | null;
    onInstall: (input: LocalProviderInstallInput) => void | Promise<void>;
    onSync: (input: LocalProviderSyncInput) => void | Promise<void>;
  };
};

export function useSettingsExtensionController(input: SettingsExtensionControllerInput) {
  const configContextForEntry = useCallback((entry: McpDirectoryInfo): ExtensionConfigContext => ({
    get3wServerClient: input.get3wServerClient,
    hostGet3wServerClient: input.hostGet3wServerClient,
    restartLocalServer: input.restartLocalServer,
    localProvider: input.localProvider,
  }), [input]);

  const configSlotForEntry = useCallback(
    (entry: McpDirectoryInfo) => getExtensionConfigSlot(entry, configContextForEntry(entry)),
    [configContextForEntry],
  );

  const isConnected = useCallback((entry: McpDirectoryInfo) => {
    const enablement = entry.extensionManifest?.enablement;
    return enablement ? evaluateEnablement(enablement, input.enablementContext).active : false;
  }, [input.enablementContext]);

  return {
    configContextForEntry,
    configSlotForEntry,
    isConnected,
  };
}
