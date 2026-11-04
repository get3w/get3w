import { expect, test } from "bun:test";
import { LocalEngineReload } from "../src/local-engine-reload.js";

async function until(check: () => boolean) {
  const deadline = Date.now() + 1500;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("reload condition timed out");
    await Bun.sleep(5);
  }
}

test("busy engines defer and pending local changes coalesce until idle", async () => {
  let busy = true, probes = 0, reloads = 0;
  const service = new LocalEngineReload({ retryMs: 2,
    engineBusy: async () => { probes++; return busy; },
    reloadEngine: async () => { reloads++; return { action: "updated_live" }; },
  });
  try {
    service.markReloadPending(); service.markReloadPending();
    await until(() => probes >= 2);
    expect(reloads).toBe(0);
    busy = false;
    await until(() => reloads === 1);
    await Bun.sleep(20);
    expect(reloads).toBe(1);
  } finally { service.stop(); }
});

test("probe errors, reload failures and skipped outcomes all retain pending work", async () => {
  let probes = 0, reloads = 0, warnings = 0;
  const service = new LocalEngineReload({ retryMs: 2,
    engineBusy: async () => { if (++probes === 1) throw new Error("unknown activity"); return false; },
    reloadEngine: async () => {
      reloads++;
      if (reloads === 1) throw new Error("retry me");
      if (reloads === 2) return { action: "skipped", reason: "unchanged" };
      return { action: "reloaded_in_place" };
    }, logger: { warn: () => { warnings++; } },
  });
  try {
    service.markReloadPending();
    await until(() => reloads === 3);
    await Bun.sleep(20);
    expect(reloads).toBe(3); expect(warnings).toBe(2);
  } finally { service.stop(); }
});

test("changes during an in-flight reload are applied serially in a second pass", async () => {
  let reloads = 0, release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service = new LocalEngineReload({ retryMs: 2, engineBusy: async () => false,
    reloadEngine: async () => { if (++reloads === 1) await gate; return { action: "updated_live" }; },
  });
  try {
    service.markReloadPending();
    await until(() => reloads === 1);
    service.markReloadPending();
    await Bun.sleep(15); expect(reloads).toBe(1);
    release?.();
    await until(() => reloads === 2);
    await Bun.sleep(20); expect(reloads).toBe(2);
  } finally { release?.(); service.stop(); }
});

test("stop cancels scheduled work and prevents new reloads", async () => {
  let reloads = 0;
  const service = new LocalEngineReload({ retryMs: 2, engineBusy: async () => false,
    reloadEngine: async () => { reloads++; return { action: "updated_live" }; },
  });
  service.markReloadPending(); service.stop(); service.markReloadPending();
  await Bun.sleep(25); expect(reloads).toBe(0);
});
