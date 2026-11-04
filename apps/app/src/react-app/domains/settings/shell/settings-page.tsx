/** @jsxImportSource react */
import type * as React from "react";
import {
  ArrowLeft,
  Bug,
  Cable,
  ChevronDown,
  CloudCog,
  Cog,
  FolderLock,
  Gauge,
  HardDriveDownload,
  Keyboard,
  Monitor,
  Paintbrush,
  Puzzle,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Terminal,
  UserCircle,
  Wrench,
  Zap,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "../../../../i18n";
import { isSettingsTabAllowed } from "../../../../app/cloud/desktop-app-restrictions";
import type { PlatformCapabilities } from "../../../../app/lib/platform-capabilities";
import type { SettingsTab } from "../../../../app/types";
import { isElectronRuntime } from "../../../../app/utils";
import { cn } from "@/lib/utils";
import { usePlatform } from "../../../kernel/platform";
import { useCheckDesktopRestriction } from "../../cloud/desktop-config-provider";
import {
  SettingsContent,
  SettingsPanel,
  SettingsPanelDescription,
  SettingsPanelHeading,
  SettingsPanelTitle,
  SettingsPanelToolbar,
  SettingsPanelToolbarActions,
  SettingsPanelToolbarButton,
  SettingsPanelToolbarMessage,
  SettingsPanelToolbarStatus,
} from "./panel";
import { SidebarDestination } from "../../session/sidebar/sidebar-destination";
import { useDesktopFeature } from "../../session/status/use-desktop-feature";

export function getSettingsTabIcon(tab: SettingsTab) {
  switch (tab) {
    case "ai":
      return Zap;
    case "preferences":
      return SlidersHorizontal;
    case "permissions":
      return FolderLock;
    case "cloud-account":
      return UserCircle;
    case "usage":
      return Gauge;
    case "connect":
      return Cable;
    case "cloud-marketplaces":
      return Store;
    case "cloud-providers":
      return CloudCog;
    case "skills":
      return Sparkles;
    case "extensions":
      return Puzzle;
    case "environment":
      return Terminal;
    case "advanced":
      return Wrench;
    case "import":
      return HardDriveDownload;
    case "appearance":
      return Paintbrush;
    case "shortcuts":
      return Keyboard;
    case "computer":
      return Monitor;
    case "updates":
      return RefreshCcw;
    case "recovery":
      return ShieldCheck;
    case "debug":
      return Bug;
    default:
      return Cog;
  }
}

export function getSettingsTabLabel(tab: SettingsTab) {
  switch (tab) {
    case "ai":
      return t("ui.5aef60a9519e");
    case "ollama":
      return "Ollama";
    case "preferences":
      return t("settings_ui.66962f72a088");
    case "permissions":
      return t("settings_ui.abccc78cc93c");
    case "cloud-account":
      return t("settings.tab_cloud_account");
    case "usage":
      return t("settings_ui.8d59829c1e15");
    case "connect":
      return t("settings.tab_connect");
    case "cloud-marketplaces":
      return t("settings.tab_cloud_marketplaces");
    case "cloud-providers":
      return t("settings.tab_cloud_providers");
    case "skills":
      return t("settings.tab_skills");
    case "extensions":
      return t("settings.tab_extensions");
    case "environment":
      return t("settings.tab_environment");
    case "advanced":
      return t("settings.tab_advanced");
    case "import":
      return t("settings.tab_import");
    case "appearance":
      return t("settings.tab_appearance");
    case "shortcuts":
      return t("ui.e9bef0b0f3c2");
    case "computer":
      return t("ui.7c4c06570e8e");
    case "updates":
      return t("settings.tab_updates");
    case "recovery":
      return t("settings.tab_recovery");
    case "debug":
      return t("settings.tab_debug");
    case "general":
      return t("settings_ui.74a883a037bc");
    default:
      return t("settings.tab_general");
  }
}

export function getSettingsTabDescription(tab: SettingsTab) {
  switch (tab) {
    case "ai":
      return t("ui.d1ac71397383");
    case "ollama":
      return t("ui.e11a5202da00");
    case "preferences":
      return t("ui.2d6cd4e7c403");
    case "permissions":
      return t("ui.0ee726fb23a8");
    case "cloud-account":
      return t("settings.tab_description_cloud_account");
    case "usage":
      return t("ui.052b6d3b44dd");
    case "connect":
      return t("settings.tab_description_connect");
    case "cloud-marketplaces":
      return t("settings.tab_description_cloud_marketplaces");
    case "cloud-providers":
      return t("settings.tab_description_cloud_providers");
    case "skills":
      return t("settings.tab_description_skills");
    case "extensions":
      return t("settings.tab_description_extensions");
    case "environment":
      return t("settings.tab_description_environment");
    case "advanced":
      return t("settings.tab_description_advanced");
    case "import":
      return t("settings.tab_description_import");
    case "appearance":
      return t("settings.tab_description_appearance");
    case "shortcuts":
      return t("ui.0afa2dc1fcf9");
    case "computer":
      return t("ui.70230f944f46");
    case "updates":
      return t("settings.tab_description_updates");
    case "recovery":
      return t("settings.tab_description_recovery");
    case "debug":
      return t("settings.tab_description_debug");
    case "general":
      return t("ui.a10ac15c0b68");
    default:
      return t("settings.tab_description_general");
  }
}

export function getWorkspaceSettingsTabs(): SettingsTab[] {
  return ["preferences", "permissions", "extensions", "import", "advanced"];
}

export function getGlobalSettingsTabs(
  developerMode: boolean,
  capabilities: Pick<PlatformCapabilities, "autoUpdate">,
  options: { computerUse?: boolean } = {},
): SettingsTab[] {
  const tabs: SettingsTab[] = ["ai", "ollama", "appearance", "shortcuts", "environment"];
  if (options.computerUse) tabs.push("computer");
  if (capabilities.autoUpdate) tabs.push("updates");
  if (developerMode) tabs.push("debug");
  return tabs;
}

export const CLOUD_SETTINGS_TABS: SettingsTab[] = [
  "cloud-account",
];

export function isSettingsTabBeta(_tab: SettingsTab) {
  return false;
}

export function isSettingsTabActive(activeTab: SettingsTab, tab: SettingsTab) {
  return activeTab === tab;
}

export function SettingsBetaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border border-amber-6/40 bg-amber-3/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-11",
        className,
      )}
    >
      {t("common.beta")}
    </span>
  );
}

function SettingsSidebarTabLabel({ tab }: { tab: SettingsTab }) {
  return (
    <>
      <span>{getSettingsTabLabel(tab)}</span>
      {isSettingsTabBeta(tab) ? <SettingsBetaBadge className="ml-auto" /> : null}
    </>
  );
}

export type SettingsNavGroups = {
  hub: SettingsTab[];
  workspace: SettingsTab[];
  global: SettingsTab[];
  cloud: SettingsTab[];
};

/**
 * Every settings navigation surface (sidebar + compact section menu) reads its
 * tabs from here so platform capabilities, preview flags, and the
 * `allowControlSettings` desktop policy cannot drift between them. When the
 * organization blocks settings control, only the Cloud group remains.
 */
export function useSettingsNavGroups(developerMode: boolean): SettingsNavGroups {
  const platform = usePlatform();
  const checkRestriction = useCheckDesktopRestriction();
  // Computer use runs in the desktop app; the web app has no local computer.
  const computerUse = useDesktopFeature("computerUse") && isElectronRuntime();
  const allowed = (tabs: SettingsTab[]) =>
    tabs.filter((tab) => isSettingsTabAllowed({ tab, checkRestriction }));
  return {
    hub: allowed(["general"]),
    workspace: allowed(getWorkspaceSettingsTabs()),
    global: allowed(getGlobalSettingsTabs(developerMode, platform.capabilities, { computerUse })),
    cloud: allowed(CLOUD_SETTINGS_TABS),
  };
}

type SettingsPageProps = {
  activeTab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  developerMode: boolean;
  showUpdateToolbar?: boolean;
  updateToolbarTone?: string;
  updateToolbarTitle?: string;
  updateToolbarSpinning?: boolean;
  updateToolbarLabel?: string;
  updateToolbarActionLabel?: string | null;
  updateToolbarDisabled?: boolean;
  updateRestartBlockedMessage?: string | null;
  onUpdateToolbarAction?: () => void;
  children: React.ReactNode;
};

type SettingsSidebarProps = Pick<SettingsPageProps, "activeTab" | "onSelectTab" | "developerMode"> & {
  onClose: () => void;
  selectedWorkspaceId: string;
  selectedWorkspaceName: string;
  selectedWorkspaceColor: string;
  workspaces: Array<{ id: string; name: string; color: string }>;
  onSelectWorkspace: (workspaceId: string) => void;
};

function SettingsSidebarGroup(props: {
  label: string;
  tabs: SettingsTab[];
  activeTab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
}) {
  if (props.tabs.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{props.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {props.tabs.map((tab) => {
            const Icon = getSettingsTabIcon(tab);
            return (
              <SidebarDestination
                key={tab}
                active={isSettingsTabActive(props.activeTab, tab)}
                icon={Icon}
                label={getSettingsTabLabel(tab)}
                labelContent={<SettingsSidebarTabLabel tab={tab} />}
                onSelect={() => props.onSelectTab(tab)}
              />
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function SettingsSidebar(props: SettingsSidebarProps) {
  const groups = useSettingsNavGroups(props.developerMode);

  return (
    <Sidebar collapsible="icon" className="mac:**:data-[sidebar=sidebar]:bg-transparent">
      <div className="hidden h-10 mac:block mac:titlebar-drag" />
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={props.onClose}>
              <ArrowLeft size={14} />
              <span>{t("dashboard.back_to_app")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton type="button">
                    <span className="truncate">{props.selectedWorkspaceName}</span>
                    <ChevronDown className="ml-auto" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent className="w-(--anchor-width)">
                {props.workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.id}
                    onClick={() => props.onSelectWorkspace(workspace.id)}
                    disabled={workspace.id === props.selectedWorkspaceId}
                  >
                    <span className="truncate">{workspace.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Top-level hub entry */}
        {groups.hub.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    isActive={isSettingsTabActive(props.activeTab, "general")}
                    aria-current={isSettingsTabActive(props.activeTab, "general") ? "page" : undefined}
                    tooltip={getSettingsTabLabel("general")}
                    onClick={() => props.onSelectTab("general")}
                  >
                    <Cog />
                    <span>{getSettingsTabLabel("general")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SettingsSidebarGroup
          label={t("settings.group_workspace")}
          tabs={groups.workspace}
          activeTab={props.activeTab}
          onSelectTab={props.onSelectTab}
        />
        <SettingsSidebarGroup
          label={t("settings.group_global")}
          tabs={groups.global}
          activeTab={props.activeTab}
          onSelectTab={props.onSelectTab}
        />
        <SettingsSidebarGroup
          label={t("settings.group_cloud")}
          tabs={groups.cloud}
          activeTab={props.activeTab}
          onSelectTab={props.onSelectTab}
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export function SettingsPageHeading({ activeTab }: Pick<SettingsPageProps, "activeTab">) {
  return (
    <SettingsPanelHeading>
      <SettingsPanelTitle>{getSettingsTabLabel(activeTab)}</SettingsPanelTitle>
      <SettingsPanelDescription>{getSettingsTabDescription(activeTab)}</SettingsPanelDescription>
    </SettingsPanelHeading>
  );
}

export function SettingsPage(props: SettingsPageProps) {
  return (
    <SettingsContent>
      {props.activeTab !== "extensions" && props.activeTab !== "ai" ? <SettingsPanel>
        <SettingsPageHeading activeTab={props.activeTab} />

        {props.showUpdateToolbar && props.activeTab === "general" ? (
          <SettingsPanelToolbar>
            <SettingsPanelToolbarActions>
              <SettingsPanelToolbarStatus
                tone={props.updateToolbarTone}
                title={props.updateToolbarTitle}
                spinning={props.updateToolbarSpinning}
              >
                {props.updateToolbarLabel}
              </SettingsPanelToolbarStatus>
              {props.updateToolbarActionLabel ? (
                <SettingsPanelToolbarButton
                  onClick={props.onUpdateToolbarAction}
                  disabled={props.updateToolbarDisabled}
                  title={props.updateRestartBlockedMessage ?? ""}
                >
                  {props.updateToolbarActionLabel}
                </SettingsPanelToolbarButton>
              ) : null}
            </SettingsPanelToolbarActions>
            {props.updateRestartBlockedMessage ? (
              <SettingsPanelToolbarMessage>{props.updateRestartBlockedMessage}</SettingsPanelToolbarMessage>
            ) : null}
          </SettingsPanelToolbar>
        ) : null}
      </SettingsPanel> : null}

      {props.children}
    </SettingsContent>
  );
}
