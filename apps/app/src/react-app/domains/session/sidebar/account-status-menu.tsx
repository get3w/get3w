import { resolveExtensionIconSrc } from "@/react-app/design-system/extension-icon-src";
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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { currentLocale, t } from "@/i18n";
import { usePlatform } from "../../../kernel/platform";
import { useDenAuth } from "../../cloud/den-auth-provider";
import { useDesktopRestriction } from "../../cloud/desktop-config-provider";
import { useControlAction, type Get3wControlAction } from "../../../shell/control/control-provider";
import { useShellConfig } from "../../../shell/shell-config";
import type { Get3wServerStatus } from "../../../../app/lib/get3w-server";
import {
  get3wConnectAttentionTitle,
  resolveGet3WConnectStatus,
  type Get3WConnectStatus,
} from "../../connections/get3w-connect-status";
import type { SessionCloudMcpMaintenanceState } from "../../connections/use-session-mcp-maintenance";

const DOCS_URL = "https://get3w.com/docs/desktop-app/";
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
  get3wServerStatus: Get3wServerStatus;
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
  if (!input.clientConnected && input.initializing) {
    return {
      variant: "loading",
      label: t("status.workspace_connecting"),
      detail: null,
    };
  }
  if (input.clientConnected) {
    return { variant: "connected", label: t("status.workspace_connected"), detail: null };
  }
  if (input.get3wServerStatus === "limited") {
    return { variant: "partial", label: t("status.limited_mode"), detail: t("status.limited_hint") };
  }
  return {
    variant: "disconnected",
    label: t("status.workspace_disconnected"),
    detail: t("status.workspace_disconnected_hint"),
  };
}

function connectDotVariant(status: Get3WConnectStatus): StatusDotVariant {
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
  connect: Get3WConnectStatus | null,
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
  get3wServerStatus: Get3wServerStatus;
  developerMode: boolean;
  /** Hidden until a workspace is selected, matching the old status bar. */
  showConnectionStatus: boolean;
  providerConnectedIds: string[];
  mcpConnectedCount: number;
  initializing?: boolean;
  reloadBusy?: boolean;
  reloadError?: string | null;
  get3wConnectState?: SessionCloudMcpMaintenanceState;
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
    clientConnected: props.clientConnected, get3wServerStatus: props.get3wServerStatus,
    initializing: props.initializing ?? false, reloadBusy: props.reloadBusy, reloadError: props.reloadError,
  }) : null;
  return <div className="flex min-w-0 flex-1 items-center gap-1">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-12 min-w-0 flex-1 justify-start gap-3 px-2 text-sm font-normal" data-testid="account-status-menu" data-runtime-state={status?.variant} />}>
        <Avatar className="size-7 after:border-0">
          {user ? <AvatarImage src={user.avatar_url || resolveExtensionIconSrc("/default-avatar.png")} alt="" /> : null}
          <AvatarFallback>{user ? accountInitials(user.name, "") : <UserRound className="size-4" />}</AvatarFallback>
        </Avatar>
        <span className="truncate">{user?.name || t("account.sign_in")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        {status ? <div role="status" className="px-2 py-1.5 text-xs text-muted-foreground"><span title={status.detail ?? undefined}>{status.label}</span></div> : null}
        <DropdownMenuItem onClick={() => openGet3wSignIn()}><UserRound className="size-4" />{user ? t("settings.tab_cloud_account") : t("account.sign_in")}</DropdownMenuItem>
        {props.showSettingsButton !== false ? <DropdownMenuItem onClick={props.onOpenAccountSettings}><Settings className="size-4" />{t("status.settings")}</DropdownMenuItem> : null}
        {config.docsButton ? <DropdownMenuItem onClick={() => platform.openLink(currentLocale() === "zh" ? "https://get3w.com/docs/zh/desktop-app/" : DOCS_URL)}><BookOpen className="size-4" />{t("status.docs")}</DropdownMenuItem> : null}
        {config.feedbackButton && props.onSendFeedback ? <DropdownMenuItem onClick={props.onSendFeedback}><MessageCircleMore className="size-4" />{t("status.feedback")}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
    {props.showSettingsButton !== false ? <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground"
      data-testid="account-settings-button" aria-label={t("status.settings")} title={t("status.settings")}
      onClick={props.onOpenAccountSettings}><Settings className="size-4" /></Button> : null}
  </div>;
}
