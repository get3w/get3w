import { openGet3wSignIn, useGet3wAccount } from "../../cloud/get3w-account";
/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  LogOut,
  MessageCircleMore,
  MoreHorizontal,
  Settings,
  Sparkles,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { usePlatform } from "../../../kernel/platform";
import { useDenAuth } from "../../cloud/den-auth-provider";
import { useDesktopRestriction } from "../../cloud/desktop-config-provider";
import { useControlAction, type OpenworkControlAction } from "../../../shell/control/control-provider";
import { useShellConfig } from "../../../shell/shell-config";
import type { OpenworkServerStatus } from "../../../../app/lib/openwork-server";
import {
  openWorkConnectAttentionTitle,
  resolveOpenWorkConnectStatus,
  type OpenWorkConnectStatus,
} from "../../connections/openwork-connect-status";
import type { SessionCloudMcpMaintenanceState } from "../../connections/use-session-mcp-maintenance";

const DOCS_URL = "https://get3w.com";
const BOOT_STARTED_AT = Date.now();
const INITIALIZING_MS = 15_000;

type StatusDotVariant = "connected" | "loading" | "partial" | "disconnected";

function StatusDot({ variant }: { variant: StatusDotVariant }) {
  return (
    <span className="relative flex size-2 shrink-0 items-center justify-center">
      {variant === "loading" ? (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-9/35" />
      ) : null}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          variant === "connected" && "bg-green-9",
          variant === "loading" && "bg-amber-9",
          variant === "partial" && "bg-amber-9",
          variant === "disconnected" && "bg-red-9",
        )}
      />
    </span>
  );
}

type RuntimeStatus = {
  variant: StatusDotVariant;
  label: string;
  detail: string | null;
};

type RuntimeStatusInput = {
  clientConnected: boolean;
  openworkServerStatus: OpenworkServerStatus;
  initializing: boolean;
  reloadBusy?: boolean;
  reloadError?: string | null;
};

export function resolveRuntimeStatus(input: RuntimeStatusInput): RuntimeStatus {
  if (input.reloadBusy) {
    return {
      variant: "loading",
      label: t("status.reloading_config"),
      detail: t("config.reload_now_desc"),
    };
  }
  if (input.reloadError) {
    return { variant: "disconnected", label: t("system.reload_failed"), detail: input.reloadError };
  }
  // This row renders app-scoped facts only. Per-session loading (messages
  // still fetching, a model verdict still pending) stays in the pane and the
  // composer — one session's state must not paint the whole app as booting.
  if (input.openworkServerStatus === "disconnected" && input.initializing) {
    return {
      variant: "loading",
      label: t("session.preparing_workspace"),
      detail: t("session.loading_detail"),
    };
  }
  if (input.clientConnected) {
    return { variant: "connected", label: t("status.ready_for_tasks"), detail: null };
  }
  if (input.openworkServerStatus === "limited") {
    return { variant: "partial", label: t("status.limited_mode"), detail: t("status.limited_hint") };
  }
  return {
    variant: "disconnected",
    label: t("status.disconnected_label"),
    detail: t("status.disconnected_hint"),
  };
}

function connectDotVariant(status: OpenWorkConnectStatus): StatusDotVariant {
  if (status.state === "ready") return "connected";
  if (status.state === "checking") return "loading";
  return "disconnected";
}

/**
 * Non-developer mode shows one status row: the runtime status, unless
 * Get3W Connect needs attention (or is the only signal available).
 * Developer mode keeps the two separate rows.
 */
export function resolveCollapsedStatus(
  runtime: RuntimeStatus | null,
  connect: OpenWorkConnectStatus | null,
): RuntimeStatus | null {
  if (runtime && runtime.variant !== "connected") return runtime;
  if (connect && connect.state === "needs_attention") {
    return {
      variant: "disconnected",
      label: `Get3W Connect: ${connect.label}`,
      detail: connect.description,
    };
  }
  if (runtime) return runtime;
  if (connect) {
    return {
      variant: connectDotVariant(connect),
      label: `Get3W Connect: ${connect.label}`,
      detail: connect.description,
    };
  }
  return null;
}

function accountInitials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export type AccountStatusMenuProps = {
  clientConnected: boolean;
  openworkServerStatus: OpenworkServerStatus;
  developerMode: boolean;
  /** Hidden until a workspace is selected, matching the old status bar. */
  showConnectionStatus: boolean;
  providerConnectedIds: string[];
  mcpConnectedCount: number;
  reloadBusy?: boolean;
  reloadError?: string | null;
  openWorkConnectState?: SessionCloudMcpMaintenanceState;
  showSettingsButton?: boolean;
  onOpenAccountSettings?: () => void;
  onSendFeedback?: () => void;
};

/**
 * Sidebar footer control: the signed-in account plus the live status the app
 * used to show in a full-width bottom status bar.
 */
export function AccountStatusMenu(props: AccountStatusMenuProps) {
  const account = useGet3wAccount();
  const platform = usePlatform();
  const { config } = useShellConfig();
  const user = account.user;
  const status = props.showConnectionStatus ? resolveRuntimeStatus({
    clientConnected: props.clientConnected, openworkServerStatus: props.openworkServerStatus,
    initializing: false, reloadBusy: props.reloadBusy, reloadError: props.reloadError,
  }) : null;
  return <div className="flex w-full items-center gap-1">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="min-w-0 flex-1 justify-start" data-testid="account-status-menu" data-runtime-state={status?.variant} />}>
        <UserRound className="size-4 shrink-0" />
        <span className="truncate">{user?.name || t("account.sign_in")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        {status ? <div role="status" className="px-2 py-1.5 text-xs text-muted-foreground">{status.label}</div> : null}
        <DropdownMenuItem onClick={() => openGet3wSignIn()}><UserRound className="size-4" />{user ? t("settings.tab_cloud_account") : t("account.sign_in")}</DropdownMenuItem>
        {props.showSettingsButton !== false ? <DropdownMenuItem onClick={props.onOpenAccountSettings}><Settings className="size-4" />{t("status.settings")}</DropdownMenuItem> : null}
        {config.docsButton ? <DropdownMenuItem onClick={() => platform.openLink(DOCS_URL)}><BookOpen className="size-4" />{t("status.docs")}</DropdownMenuItem> : null}
        {config.feedbackButton && props.onSendFeedback ? <DropdownMenuItem onClick={props.onSendFeedback}><MessageCircleMore className="size-4" />{t("status.feedback")}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
