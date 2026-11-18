/** @jsxImportSource react */
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isMacPlatform } from "@/app/utils";
import { t } from "@/i18n";
import { NotificationBell } from "../../../shell/notification-center";
import { useBrandAppName, useBrandLogoUrl } from "../../cloud/brand-theme";
import { resolveExtensionIconSrc } from "../../../design-system/extension-icon-src";

export type ConversationHistoryControls = {
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (direction: "back" | "forward") => void;
};

function SidebarToggle({ surface }: { surface: "sidebar" | "main" }) {
  const { open, openMobile, isMobile } = useSidebar();
  return (
    <SidebarTrigger
      data-sidebar-toggle={surface}
      data-testid={`${surface}-sidebar-toggle`}
      className="size-8! rounded-lg text-muted-foreground transition-colors hover:bg-muted titlebar-no-drag"
      aria-expanded={isMobile ? openMobile : open}
      aria-keyshortcuts={isMacPlatform() ? "Meta+B" : "Control+B"}
      title={`${t("ui.041aefc44394")} (${isMacPlatform() ? "⌘B" : "Ctrl+B"})`}
      onClick={() => {
        if (isMobile) return;
        // The clicked control moves with the sidebar. Keep keyboard focus on
        // its visible counterpart rather than inside the now-inert panel.
        requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(`[data-sidebar-toggle="${open ? "main" : "sidebar"}"]`)?.focus({ preventScroll: true });
        });
      }}
    />
  );
}

export function SidebarTitlebar({ history }: { history?: ConversationHistoryControls }) {
  return (
    <div data-sidebar-titlebar className="window-titlebar mac-window-controls-inset flex shrink-0 items-center gap-1 px-2 titlebar-drag">
      <SidebarToggle surface="sidebar" />
      {history ? (
        <div className="ml-auto flex gap-0.5 titlebar-no-drag" role="group" aria-label={t("ui.d15fd27e4a7d")}>
          <Button variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            aria-label={t("ui.6d68ad65e78d")} title={t("ui.6d68ad65e78d")}
            data-conversation-history-control="back" disabled={!history.canGoBack} onClick={() => history.onNavigate("back")}>
            <ArrowLeft strokeWidth={1.5} />
          </Button>
          <Button variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            aria-label={t("ui.9c02f1ff23fd")} title={t("ui.9c02f1ff23fd")}
            data-conversation-history-control="forward" disabled={!history.canGoForward} onClick={() => history.onNavigate("forward")}>
            <ArrowRight strokeWidth={1.5} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Brand beside the current page title, independent of sidebar visibility. */
export function HeaderBrand() {
  const logo = useBrandLogoUrl();
  const name = useBrandAppName();
  return <div data-header-brand className="flex min-w-0 shrink-0 items-center gap-1.5 max-sm:max-w-24">
    <img src={logo || resolveExtensionIconSrc("/get3w-sidebar-mark.svg")} alt={logo ? name : ""}
      className={logo ? "max-h-7 max-w-28 object-contain max-sm:max-w-24" : "size-5 shrink-0 object-contain dark:invert"} />
    {!logo ? <span className="truncate text-[15px] font-medium tracking-[-0.4px]" title={name}>{name}</span> : null}
  </div>;
}

/** Search and activity always live at the right of the main header. */
export function SidebarActions({ onOpenSessionSearch }: { onOpenSessionSearch?: () => void }) {
  return (
    <div data-sidebar-actions className="flex shrink-0 items-center gap-0.5 titlebar-no-drag">
      {onOpenSessionSearch ? (
        <Tooltip>
          <TooltipTrigger render={
            <Button variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground transition-colors hover:bg-muted"
              aria-label={t("workspace_list.search_sessions")}
              aria-keyshortcuts={isMacPlatform() ? "Meta+Shift+F" : "Control+Shift+F"}
              onClick={onOpenSessionSearch}>
              <Search strokeWidth={1.5} />
            </Button>
          } />
          <TooltipContent>{t("workspace_list.search_sessions")} ({isMacPlatform() ? "⌘⇧F" : "Ctrl+Shift+F"})</TooltipContent>
        </Tooltip>
      ) : null}
      <NotificationBell align="end" />
    </div>
  );
}

export function MainSidebarControls() {
  const { open, isMobile } = useSidebar();
  if (open && !isMobile) return null;
  return <div className="flex shrink-0 items-center titlebar-no-drag"><SidebarToggle surface="main" /></div>;
}
