import { rm } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const parentPid = Number.parseInt(process.argv[2] ?? "", 10);
const rootPath = process.argv[3];

function parentIsRunning() {
  try {
    process.kill(parentPid, 0);
    return true;
  } catch {
    return false;
  }
}

if (Number.isSafeInteger(parentPid) && parentPid > 0 && rootPath) {
  let attempts = 0;
  while (parentIsRunning() && attempts < 600) {
    attempts += 1;
    await setTimeout(100);
  }
  if (parentIsRunning()) process.exit(0);
  await rm(rootPath, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  }).catch(() => {
    process.exitCode = 1;
  });
}
