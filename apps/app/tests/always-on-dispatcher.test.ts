import { test, expect } from "bun:test";
import { dispatchAlwaysOnNotification } from "../src/react-app/domains/workspace/always-on-dispatcher";
import type { AlwaysOnDeliveryChange } from "@get3w/types/workspace";
const item = { id: "event", resultId: "event", title: "Fixture", text: "Report ready", sessionId: "session", messageId: "message", status: "sending" as const, createdAt: 1, attempts: 1, claim: "token" };
test("dispatcher submits once and acknowledges system submission", async () => {
    const calls: AlwaysOnDeliveryChange[] = [];
    let href = "";
    const client = { changeAlwaysOnOutbox: async (_: string, c: AlwaysOnDeliveryChange) => { calls.push(c); return c.action === "claim" ? item : null; } };
    await dispatchAlwaysOnNotification(client, "workspace", true, async (input) => { href = input.href ?? ""; return { ok: true }; });
    expect(href).toBe("/workspace/workspace/session/session?runMessage=message");
    expect(calls[1]).toEqual({ action: "finish", id: "event", claim: "token", result: "submitted" });
});
test("disabled preferences block; failed submission permits explicit retry; uncertain IPC stays claimed", async () => {
    for (const mode of ["off", "failed", "uncertain"]) {
        const calls: AlwaysOnDeliveryChange[] = [];
        let sends = 0;
        const client = { changeAlwaysOnOutbox: async (_: string, c: AlwaysOnDeliveryChange) => { calls.push(c); return c.action === "claim" ? item : null; } };
        const run = dispatchAlwaysOnNotification(client, "workspace", mode !== "off", async () => { sends++; if (mode === "uncertain")
            throw Error("IPC lost"); return { ok: false, reason: "unsupported" }; });
        if (mode === "uncertain") {
            await expect(run).rejects.toThrow();
            expect(calls).toHaveLength(1);
        }
        else {
            await run;
            expect(calls[1]).toMatchObject({ result: mode === "off" ? "blocked" : "failed" });
        }
        expect(sends).toBe(mode === "off" ? 0 : 1);
    }
});
test("lost persistence acknowledgement never resubmits the same notification", async () => {
    let claimed = false;
    let sends = 0;
    let finishes = 0;
    const client = { changeAlwaysOnOutbox: async (_: string, change: AlwaysOnDeliveryChange) => {
        if (change.action === "claim") {
            if (claimed) return null;
            claimed = true;
            return item;
        }
        finishes++;
        throw Error("Acknowledgement lost after native submission");
    } };
    await expect(dispatchAlwaysOnNotification(client, "workspace", true, async () => { sends++; return { ok: true }; })).rejects.toThrow();
    await dispatchAlwaysOnNotification(client, "workspace", true, async () => { sends++; return { ok: true }; });
    expect(sends).toBe(1);
    expect(finishes).toBe(1);
});
