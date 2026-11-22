import { t } from "@/i18n";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import fuzzysort from "fuzzysort";
import { Blocks, Check, Minus, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { DenApiError } from "@/app/lib/den";
import type { BuiltMcpAppCatalogEntry } from "@/app/lib/built-mcp-app-catalog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAppsClient } from "../apps/use-apps";
import { McpAppTile, type DashboardLaunchEndpoint } from "./mcp-app-tile";
import { DashboardMasonry } from "./dashboard-masonry";
import { dashboardTileCacheScopeKey } from "./dashboard-tile-cache";
import { readBuiltDashboardApps, subscribeBuiltDashboardApps, writeBuiltDashboardApps } from "./built-dashboard-placement";

export { readBuiltDashboardApps } from "./built-dashboard-placement";

export function builtDashboardScope(
  scope: ReturnType<typeof useAppsClient>["scope"],
) {
  return `get3w:personal-mcp-apps:v1:${JSON.stringify(scope)}`;
}

export function useBuiltDashboardApps() {
  const context = useAppsClient();
  const key = builtDashboardScope(context.scope);
  const [placement, setPlacement] = useState<{ key: string; ids: string[] }>(
    () => ({ key, ids: readBuiltDashboardApps(key) }),
  );
  const ids =
    placement.key === key ? placement.ids : readBuiltDashboardApps(key);
  const currentPlacement = useRef({ key, ids });
  currentPlacement.current = { key, ids };
  useEffect(() => {
    const sync = (next: string[]) => {
      currentPlacement.current = { key, ids: next };
      setPlacement({ key, ids: next });
    };
    const unsubscribe = subscribeBuiltDashboardApps(key, sync);
    sync(readBuiltDashboardApps(key));
    return unsubscribe;
  }, [key]);
  const query = useQuery({
    queryKey: ["built-dashboard-apps", ...context.scope],
    enabled: Boolean(context.client && context.identityVerified),
    queryFn: async () => {
      if (!context.client) throw new Error("Sign in to browse artifacts.");
      try {
        return await context.client.listBuiltMcpApps();
      } catch (error) {
        // Older deployments did not have a member-accessible App catalog.
        if (
          error instanceof DenApiError &&
          (error.status === 404 || error.status === 403)
        )
          return null;
        throw error;
      }
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
    retry: false,
  });
  const apps = context.identityVerified && !query.isError ? (query.data ?? []) : [];
  return {
    ...context,
    query,
    apps,
    ids,
    ready: context.identityVerified && query.isSuccess && query.data !== null,
    cacheScopeKey: `${dashboardTileCacheScopeKey(context.userId)}.built.${JSON.stringify(context.scope)}`,
    setAdded: (appId: string, added: boolean) => {
      if (
        !context.identityVerified ||
        !apps.some((app) => app.connectionId === appId)
      )
        return;
      const current = currentPlacement.current.key === key ? currentPlacement.current.ids : readBuiltDashboardApps(key);
      const next = added
        ? [...new Set([...current, appId])]
        : current.filter((id) => id !== appId);
      setPlacement({ key, ids: next });
      currentPlacement.current = { key, ids: next };
      writeBuiltDashboardApps(key, next);
    },
  };
}

export type BuiltDashboardApps = ReturnType<typeof useBuiltDashboardApps>;

export function BuiltAppPicker({
  built,
  onAdded,
}: {
  built: BuiltDashboardApps;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const matching = useMemo(
    () =>
      search.trim()
        ? fuzzysort
            .go(search, built.apps, {
              keys: ["title", "description", "pluginName"],
            })
            .map((result) => result.obj)
        : built.apps,
    [built.apps, search],
  );
  return (
    <Command
      items={matching}
      filter={null}
      value={search}
      onValueChange={setSearch}
    >
      <CommandInput
        aria-label={t("desktop.copy.c71436cce0eb")}
        placeholder={t("desktop.copy.547051149227")}
        className="h-14 border-b! pr-10"
      />
      <p className="px-4 pt-3 text-xs text-muted-foreground">{search.trim() ? t("desktop.text.98abff28a940") : t("desktop.text.e00c3eb50bc1")} <span className="ml-1 tabular-nums">{matching.length}</span></p>
      <CommandEmpty>{t("desktop.copy.585d60ee4d34")}</CommandEmpty>
      {/* Long catalogs scroll here so the search field and footer stay in the dialog. */}
      <CommandPanel className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-width:thin] [&>[data-slot=scroll-area]]:h-auto">
        <CommandList>
          {(app: BuiltMcpAppCatalogEntry) => (
            <CommandItem
              key={app.connectionId}
              value={app}
              aria-label={t("desktop.dynamic.2cc06c85e772", { name: app.title })}
              disabled={built.ids.includes(app.connectionId)}
              onClick={() => {
                built.setAdded(app.connectionId, true);
                toast(t("desktop.dynamic.ec0b1e3c1e90", { name: app.title }), { id: "personal-dashboard-placement", action: { label: t("desktop.text.a8283ade3185"), onClick: () => built.setAdded(app.connectionId, false) } });
                onAdded();
              }}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background"><Blocks className="size-4 text-muted-foreground" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{app.title}</span><span className="block truncate text-xs text-muted-foreground">{app.pluginName}</span></span>
              <span className="text-xs text-muted-foreground">
                {built.ids.includes(app.connectionId) ? (
                  <Check className="size-4" aria-label={t("desktop.copy.6b02e0d363a4")} />
                ) : (
                  t("desktop.text.9fd728c66c9a")
                )}
              </span>
            </CommandItem>
          )}
        </CommandList>
      </CommandPanel>
      <div className="flex justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground"><span>{t("desktop.copy.b2f9774cbb86")}</span><span aria-hidden="true">{t("desktop.copy.d08b0fe234ee")}</span></div>
    </Command>
  );
}

export function BuiltDashboardTiles({
  built,
  fallbackEndpoints,
  onAdd,
}: {
  built: BuiltDashboardApps;
  fallbackEndpoints?: DashboardLaunchEndpoint[];
  onAdd?: () => void;
}) {
  const personal = built.apps.filter((app) =>
    built.ids.includes(app.connectionId),
  );
  if (built.query.isPending && built.identityVerified)
    return <Skeleton className="mb-4 h-12 w-full" />;
  if (built.query.isError)
    return (
      <div className="mb-4 flex items-center gap-2">
        <p role="alert" className="text-sm">
          {t("desktop.copy.c1caaacc83b6")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void built.query.refetch()}
        >
          {t("desktop.copy.d8b8392e2c54")}
        </Button>
      </div>
    );
  if (!personal.length) return null;
  return (
    <section className="mb-8" aria-label={t("desktop.copy.aa63a3222556")}>
      <DashboardMasonry>
        {personal.map((app) => (
          <McpAppTile
            key={app.connectionId}
            cacheScopeKey={built.cacheScopeKey}
            fallbackEndpoints={fallbackEndpoints}
            entry={{
              ...app,
              kind: "mcp",
              id: `personal:${app.connectionId}`,
              launchArguments: { input: {} },
              autoLaunch: true,
            }}
            renderActions={({ onRefresh, refreshing, badge }) => (
              <BuiltDashboardTileMenu
                app={app}
                badge={badge}
                onRefresh={onRefresh}
                refreshing={refreshing}
                onRemove={() => {
                  built.setAdded(app.connectionId, false);
                  toast(t("desktop.dynamic.ad6173859d5e", { name: app.title }), { id: "personal-dashboard-placement", action: { label: t("desktop.text.a8283ade3185"), onClick: () => built.setAdded(app.connectionId, true) } });
                }}
              />
            )}
          />
        ))}
        {onAdd ? <button type="button" onClick={onAdd} className="flex min-h-64 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"><Plus className="size-5" />{t("desktop.copy.870812926ec5")}{built.apps.length > personal.length ? <span className="text-xs">{built.apps.length - personal.length} {t("desktop.copy.fb51e548732c")}</span> : null}</button> : null}
      </DashboardMasonry>
    </section>
  );
}

/** Personal artifact actions. */
function BuiltDashboardTileMenu({
  app,
  badge,
  onRefresh,
  refreshing,
  onRemove,
}: {
  app: BuiltMcpAppCatalogEntry;
  badge?: ReactNode;
  onRefresh?: () => void;
  refreshing: boolean;
  onRemove: () => void;
}) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-7 bg-background/90" aria-label={t("desktop.dynamic.79baf5743cef", { name: app.title })} title={t("desktop.dynamic.79baf5743cef", { name: app.title })} />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block">{app.title}</span>
              {badge}
            </DropdownMenuLabel>
            {onRefresh ? <DropdownMenuItem disabled={refreshing} aria-label={t("desktop.dynamic.564fad4c3452", { name: app.title })} onClick={onRefresh}><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />{t("desktop.copy.0e9161011702")}</DropdownMenuItem> : null}
            <DropdownMenuItem aria-label={t("desktop.dynamic.25f2b49f5157", { name: app.title })} onClick={onRemove}><Minus className="size-4" />{t("desktop.copy.6bdaf987088f")}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
