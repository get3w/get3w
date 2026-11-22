import { expect, test } from "bun:test";
import { createGet3wServerClient } from "../src/app/lib/get3w-server";
import type { AlwaysOnDeliveryChange } from "@get3w/types/workspace";

test("outbox actions cross the HTTP boundary as objects, serialized exactly once", async () => {
  const original = globalThis.fetch;
  const changes: AlwaysOnDeliveryChange[] = [
    { action: "claim" },
    { action: "finish", id: "delivery", claim: "claim", result: "submitted" },
    { action: "retry", id: "delivery" },
    { action: "cancel", id: "delivery" },
    { action: "resolve_sent", id: "delivery" },
    { action: "resolve_cancel", id: "delivery" },
  ];
  const received: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    expect(new URL(String(input)).pathname).toBe("/workspaces/fixture/always-on/outbox");
    expect(init?.method).toBe("POST");
    expect(typeof init?.body).toBe("string");
    received.push(JSON.parse(String(init?.body)));
    return Response.json(null);
  };
  try {
    const client = createGet3wServerClient({ baseUrl: "http://localhost:1234" });
    for (const change of changes) await client.changeAlwaysOnOutbox("fixture", change);
    expect(received).toEqual(changes);
  } finally {
    globalThis.fetch = original;
  }
});
