/** @jsxImportSource react */
import { useEffect } from "react";

import { startGlobalQueueDrainer } from "./global-queue-drainer";
import { startQueuedDraftPersistence } from "./queued-draft-persistence";

export function GlobalQueueDrainerBridge() {
  useEffect(() => startQueuedDraftPersistence(), []);
  return <ActivatedGlobalQueueDrainerBridge />;
}

function ActivatedGlobalQueueDrainerBridge() {
  useEffect(() => startGlobalQueueDrainer(), []);
  return null;
}
