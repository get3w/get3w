import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const capabilities = z.object({ protocol: z.literal("get3w-deferred-questions"), version: z.literal(1), actions: z.array(z.string()) });
const required = ["bind", "pause", "list", "read", "answer", "commit", "resume", "cancel"];
export function supportsDeferredQuestions(value: unknown): boolean {
  const parsed = capabilities.safeParse(value);
  return parsed.success && required.every(action => parsed.data.actions.includes(action));
}
/** Unknown commands on legacy engines are unsupported, never a startup failure. */
export async function probeDeferredQuestions(bin: string, env: Record<string, string>): Promise<boolean> {
  try {
    const { stdout } = await promisify(execFile)(bin, ["--get3w-capabilities"], { env, timeout: 10000, maxBuffer: 16384, windowsHide: true });
    return supportsDeferredQuestions(JSON.parse(stdout));
  } catch { return false; }
}
