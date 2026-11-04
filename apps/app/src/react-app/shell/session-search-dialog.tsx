import { t } from "@/i18n";
/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { ClockIcon, TypeIcon } from "lucide-react";

import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandDialogTitle,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandHeader,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from "@/components/ui/command";
import { formatRelativeTime } from "@/app/utils";
import {
  dedupeSearchableSessions,
  rankSearchableSessions,
  type SearchableSession,
} from "@/react-app/domains/session/search/session-search";

const RECENT_LIMIT = 15;
const RESULT_LIMIT = 50;

type ResultItem = {
  id: string;
  kind: "recent" | "title";
  session: SearchableSession;
};

type ResultGroup = {
  value: string;
  items: ResultItem[];
};

export type SessionSearchDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Every session across workspaces. */
  sessions: SearchableSession[];
  onOpenSession: (workspaceId: string, sessionId: string) => void;
};

/**
 * Session search across every workspace by title (Cmd/Ctrl+Shift+F), newest
 * message first. With an empty query it lists recent sessions. Sub-agent
 * sessions are left out upstream; they open from their parent's task card.
 */
export function SessionSearchDialog(props: SessionSearchDialogProps) {
  const [query, setQuery] = useState("");
  const sessions = useMemo(() => dedupeSearchableSessions(props.sessions), [props.sessions]);

  useEffect(() => {
    if (!props.open) {
      setQuery("");
    }
  }, [props.open]);

  const trimmedQuery = query.trim();

  const groups = useMemo<ResultGroup[]>(() => {
    if (!trimmedQuery) {
      const recent = rankSearchableSessions(sessions, "", RECENT_LIMIT).map((session) => ({
        id: `recent:${session.workspaceId}:${session.sessionId}`,
        kind: "recent" as const,
        session,
      }));
      return recent.length > 0 ? [{ value: t("ui.8c4f3d130762"), items: recent }] : [];
    }

    const titleItems = rankSearchableSessions(sessions, trimmedQuery, RESULT_LIMIT).map((session) => ({
      id: `title:${session.workspaceId}:${session.sessionId}`,
      kind: "title" as const,
      session,
    }));
    return titleItems.length > 0 ? [{ value: t("ui.6fa3cbf451b2"), items: titleItems }] : [];
  }, [sessions, trimmedQuery]);

  const resultCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.items.length, 0),
    [groups],
  );

  const emptyText = trimmedQuery ? t("ui.91f3984baa56") : t("ui.0e25da739ad6");
  const statusText = trimmedQuery
    ? `${resultCount.toLocaleString()} ${resultCount === 1 ? "result" : "results"}`
    : t("ui.8c4f3d130762");

  return (
    <CommandDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <CommandDialogPopup>
        <CommandDialogTitle>{t("ui.8cb650539ec8")}</CommandDialogTitle>
        <Command
          items={groups}
          filter={null}
          value={query}
          onValueChange={setQuery}
        >
          <CommandHeader>
            <CommandInput className="w-full" placeholder={t("ui.ad9212258275")} />
          </CommandHeader>
          <CommandPanel>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandList>
              {(group: ResultGroup) => (
                <CommandGroup key={group.value} items={group.items}>
                  <CommandGroupLabel className="flex items-center gap-1.5">
                    {group.value}
                    <span className="font-normal text-muted-foreground/72 tabular-nums">
                      {group.items.length.toLocaleString()}
                    </span>
                  </CommandGroupLabel>
                  <CommandCollection>
                    {(item: ResultItem) => (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        onClick={() => {
                          props.onClose();
                          props.onOpenSession(item.session.workspaceId, item.session.sessionId);
                        }}
                      >
                        <span className="mr-2 shrink-0">
                          {item.kind === "title"
                            ? <TypeIcon className="size-4 text-muted-foreground" />
                            : <ClockIcon className="size-4 text-muted-foreground" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.session.title}</span>
                          <div className="truncate text-muted-foreground text-xs">
                            {item.session.workspaceTitle}
                          </div>
                        </div>
                        <CommandShortcut className="ps-3">
                          {formatRelativeTime(item.session.updatedAt)}
                        </CommandShortcut>
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <span>{statusText}</span>
            <span>{t("ui.43b01cccc643")}</span>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
