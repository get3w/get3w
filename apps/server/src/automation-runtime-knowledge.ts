export function automationRuntimeKnowledge(_runtimeProvider?: string) {
  return [
    "Get3W has first-class personal Desktop Automations with immutable revisions and durable run history.",
    "For new scheduled work, use openwork_execute id automation.propose. It shows a review card; only the person's Create and activate action creates the automation.",
    "Clock schedules support once, daily, weekly and interval, using an IANA timezone. Each occurrence starts a fresh task in its pinned workspace with the selected model.",
    "The signed-in Get3W Desktop must be open to run scheduled work. Do not promise execution while the desktop is offline. The Automations page provides pause, resume, run now, archive, cancellation and run results.",
    "Cloud execution and meeting-triggered schedules are not available yet. Report this limitation accurately instead of creating a different schedule without the person's agreement.",
  ].map(line => `- ${line}`).join("\n");
}
