import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AlwaysOnDelivery } from "@get3w/types/workspace";
import type { WorkspaceInfo } from "./types.js";
import { openHistoryDatabase } from "./opencode-v2-history-store.js";
import { ApiError } from "./errors.js";
const itemSchema = z.object({ notBefore: z.number().int().safe().positive().optional(), expiresAt: z.number().int().safe().positive().optional(), id: z.string(), resultId: z.string(), title: z.string().max(200), text: z.string().max(4000), sessionId: z.string(), messageId: z.string(), status: z.enum(["pending", "sending", "submitted", "failed", "cancelled", "unconfirmed", "blocked"]), createdAt: z.number(), attempts: z.number(), submittedAt: z.number().optional(), lastAttemptAt: z.number().optional(), error: z.enum(["send_failed", "preference_off", "uncertain"]).optional(), claim: z.string().optional() });
const schema = z.object({ version: z.literal(1), items: z.array(itemSchema).max(5000) });
const queues = new Map<string, Promise<unknown>>();
async function pathFor(w: WorkspaceInfo) {
    if (w.workspaceType !== "always-on")
        throw new ApiError(404, "not_found", "Always-on workspace not found");
    try {
        for (const path of [w.path, join(w.path, ".get3w"), join(w.path, ".get3w/always-on")]) {
            const info = await lstat(path);
            if (info.isSymbolicLink() || !info.isDirectory())
                throw Error("Invalid workspace path");
        }
    }
    catch {
        throw new ApiError(409, "outbox_unreadable", "Workspace runtime is unavailable");
    }
    let path = w.path;
    for (const part of [".get3w", "always-on", "outbox", "messages.json"]) {
        path = join(path, part);
        try {
            const info = await lstat(path);
            if (info.isSymbolicLink() || (part === "messages.json" ? !info.isFile() || info.size > 24000000 : !info.isDirectory()))
                throw Error("Invalid path");
        }
        catch (e) {
            if (!(e && typeof e === "object" && "code" in e && e.code === "ENOENT"))
                throw new ApiError(409, "outbox_unreadable", "Outbox cannot be read safely");
        }
    }
    return path;
}
async function read(w: WorkspaceInfo) { const path = await pathFor(w); try {
    return schema.parse(JSON.parse(await readFile(path, "utf8")));
}
catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT")
        return { version: 1 as const, items: [] };
    throw new ApiError(409, "outbox_unreadable", "Outbox cannot be read safely");
} }
async function update<T>(w: WorkspaceInfo, apply: (state: z.infer<typeof schema>) => T | Promise<T>) {
    const key = w.path;
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
        const path = await pathFor(w);
        const folder = join(w.path, ".get3w/always-on/outbox");
        await mkdir(folder, { recursive: true });
        const lockPath = join(folder, "lock.sqlite");
        try {
            const info = await lstat(lockPath);
            if (info.isSymbolicLink() || !info.isFile())
                throw new ApiError(409, "outbox_unreadable", "Invalid outbox lock");
        }
        catch (e) {
            if (!(e && typeof e === "object" && "code" in e && e.code === "ENOENT"))
                throw e;
        }
        const db = await openHistoryDatabase(lockPath);
        try {
            db.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
            const state = await read(w);
            const before = JSON.stringify(state);
            const result = await apply(state);
            schema.parse(state);
            const serialized = JSON.stringify(state);
            if(Buffer.byteLength(serialized,"utf8")>24000000)throw new ApiError(409,"outbox_full","Outbox is full");
            if (serialized !== before) {
                await pathFor(w);
                const temp = `${path}.${randomUUID()}.tmp`;
                try {
                    await writeFile(temp, serialized, { mode: 0o600, flag: "wx" });
                    await rename(temp, path);
                }
                finally {
                    await rm(temp, { force: true });
                }
            }
            return result;
        }
        finally {
            db.close();
        }
    });
    queues.set(key, next);
    try {
        return await next;
    }
    finally {
        if (queues.get(key) === next)
            queues.delete(key);
    }
}
function expire(items: z.infer<typeof itemSchema>[]) { for (const item of items)
    if (item.status === "sending" && Date.now() - (item.lastAttemptAt ?? 0) > 60000) {
        item.status = "unconfirmed";
        item.error = "uncertain";
        delete item.claim;
    } }
export async function enqueueAlwaysOnDelivery(w: WorkspaceInfo, input: {
    id: string;
    resultId?: string;
    expiresAt?: number;
    notBefore?: number;
    title: string;
    text: string;
    sessionId: string;
    messageId: string;
}) {
    return update(w, state => { if (state.items.some(i => i.id === input.id))
        return; if (state.items.length >= 5000)
        throw new ApiError(409, "outbox_full", "Outbox is full"); state.items.unshift({ ...input, resultId: input.resultId ?? input.id, status: "pending", createdAt: Date.now(), attempts: 0 }); });
}
export async function readAlwaysOnOutbox(w: WorkspaceInfo): Promise<AlwaysOnDelivery[]> { const state = await read(w); expire(state.items); return state.items.map(({ claim, ...item }) => item); }
const changeSchema = z.discriminatedUnion("action", [
    z.object({ action: z.enum(["retry", "cancel", "resolve_sent", "resolve_cancel"]), id: z.string() }),
    z.object({ action: z.literal("claim") }),
    z.object({ action: z.literal("finish"), id: z.string(), claim: z.string(), result: z.enum(["submitted", "failed", "blocked"]) }),
]);
export async function changeAlwaysOnOutbox(w: WorkspaceInfo, input: unknown) {
    const parsed = changeSchema.safeParse(input);
    if (!parsed.success)
        throw new ApiError(400, "invalid_action", "Invalid delivery action");
    await pathFor(w);
    return update(w, async (state) => {
        expire(state.items);
        const c = parsed.data;
        if (c.action === "claim") {
            // Pausing stops new claims, never revokes an already submitted notification.
            const runtime = join(w.path, ".get3w/always-on/state.json");
            const info = await lstat(runtime);
            if (info.isSymbolicLink() || !info.isFile() || info.size > 8000000)
                throw new ApiError(409, "outbox_unreadable", "Runtime cannot be read safely");
            const current = z.object({ paused:z.boolean() }).parse(JSON.parse(await readFile(runtime,"utf8")));
            const paused=current.paused;
            for(const queued of state.items) {
                if(queued.expiresAt !== undefined && queued.expiresAt <= Date.now() && ["pending","failed","blocked"].includes(queued.status))queued.status="cancelled";
            }
            if (paused)
                return null;
            const item = state.items.find(i => i.status === "pending" && (i.notBefore === undefined || i.notBefore <= Date.now()));
            if (!item)
                return null;
            item.status = "sending";
            item.claim = randomUUID();
            item.attempts++;
            item.lastAttemptAt = Date.now();
            return { ...item };
        }
        const item = state.items.find(i => i.id === c.id);
        if (!item)
            throw new ApiError(404, "not_found", "Delivery not found");
        if (c.action === "finish") {
            if (item.status !== "sending" || item.claim !== c.claim)
                throw new ApiError(409, "delivery_conflict", "Delivery changed");
            item.status = c.result;
            if (c.result === "submitted") item.submittedAt ??= Date.now();
            item.error = c.result === "failed" ? "send_failed" : c.result === "blocked" ? "preference_off" : undefined;
            delete item.claim;
        }
        else if (c.action === "retry") {
            if (!["failed", "blocked"].includes(item.status))
                throw new ApiError(409, "delivery_conflict", "Delivery cannot be retried");
            item.status = "pending";
            delete item.error;
        }
        else if (c.action === "cancel") {
            if (!["pending", "failed", "blocked"].includes(item.status))
                throw new ApiError(409, "delivery_conflict", "Delivery cannot be cancelled");
            item.status = "cancelled";
            delete item.error;
        }
        else {
            if (item.status !== "unconfirmed")
                throw new ApiError(409, "delivery_conflict", "Delivery does not need verification");
            item.status = c.action === "resolve_sent" ? "submitted" : "cancelled";
            // Manual resolution confirms submission, but does not establish its time.
            delete item.error;
        }
        return null;
    });
}
