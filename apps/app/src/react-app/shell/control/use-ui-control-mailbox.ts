import { useEffect, type RefObject } from "react";
import type { Get3wAffordanceRequest } from "@get3w/types/get3w-affordance";
import {
  createGet3wServerClient,
  type Get3wUiControlRequest,
} from "../../../app/lib/get3w-server";
import { resolveGet3wConnection } from "../get3w-connection";
import type { Get3wControlAPI } from "./control-provider";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function hasAffordanceId(input: unknown): input is Get3wAffordanceRequest {
  return input !== null
    && typeof input === "object"
    && "id" in input
    && typeof input.id === "string"
    && input.id.trim().length > 0;
}

async function handleRequest(item: Get3wUiControlRequest, api: Get3wControlAPI): Promise<unknown> {
  if (item.kind === "context") return { ok: true, context: api.context() };
  if (!hasAffordanceId(item.input)) {
    return { ok: false, error: "Missing Get3W affordance id." };
  }
  if (item.kind === "query") return api.query(item.input);
  return api.command(item.input);
}

export function useUiControlMailbox(apiRef: RefObject<Get3wControlAPI | null>): void {
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;

    let mounted = true;
    const controller = new AbortController();

    async function poll(): Promise<void> {
      while (mounted) {
        try {
          // Resolve again after each poll so switching servers or signing in
          // cannot leave this window answering a previous server's mailbox.
          const connection = await resolveGet3wConnection();
          if (!mounted) return;
          if (!connection.normalizedBaseUrl || !connection.resolvedToken) {
            await wait(3_000);
            continue;
          }
          const client = createGet3wServerClient({
            baseUrl: connection.normalizedBaseUrl,
            token: connection.resolvedToken,
            hostToken: connection.resolvedHostToken,
          });
          const { items } = await client.listUiControlPending({ wait: true, signal: controller.signal });
          if (!mounted) return;
          for (const item of items) {
            let result: unknown;
            try {
              const api = apiRef.current;
              if (!api) throw new Error("Get3W control surface is not available yet.");
              result = await handleRequest(item, api);
            } catch (error) {
              result = { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
            await client.replyUiControl(item.id, result);
          }
        } catch {
          if (mounted) await wait(2_000);
        }
      }
    }

    void poll();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [apiRef]);
}
