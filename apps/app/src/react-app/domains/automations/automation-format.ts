import { t, currentLocale } from "@/i18n";
import { formatAutomationSchedule as formatSchedule } from "@openwork/types/automation-schedule";
import type { AutomationRun } from "@openwork/types/automations";

type RunReceiptState = Pick<AutomationRun, "status" | "error" | "attemptCount" | "startedAt">;

type RunNotice = {
  variant: "default" | "destructive";
  title: string;
  message: string;
};

export function automationRunNotice(run: RunReceiptState): RunNotice | null {
  if (!run.error) return null;
  if (run.status === "skipped" && run.error.code === "runner_unavailable") {
    if (run.attemptCount === 0 && run.startedAt == null) {
      return {
        variant: "default",
        get title() { return t("ui.da6dbfe1a95d"); },
        message: t("automation_ui.never_started", { reason: run.error.message.trim() || t("automation_ui.runner_unavailable") }),
      };
    }
    return {
      variant: "destructive",
      get title() { return t("ui.6d527bebbeb5"); },
      message: t("automation_ui.attempted", { reason: run.error.message }),
    };
  }
  return {
    variant: "destructive",
    title: run.status === "failed" && run.error.code === "lease_lost" ? t("automation_ui.interrupted") : run.error.code,
    message: run.error.message,
  };
}

export function runStatusLabel(run: RunReceiptState) {
  const notice = automationRunNotice(run);
  if (notice && ((run.status === "skipped" && run.error?.code === "runner_unavailable")
    || (run.status === "failed" && run.error?.code === "lease_lost"))) {
    return notice.title;
  }
  if (run.status === "skipped" && (run.error?.code === "model_access_lost" || run.error?.code === "provider_unavailable")) {
    return t("automation_ui.model_unavailable");
  }
  const keys: Record<string, string> = { succeeded: "automation_ui.completed", failed: "automation_ui.failed", skipped: "automation_ui.skipped", queued: "automation_ui.queued", running: "automation_ui.running", cancelled: "automation_ui.cancelled", pending: "automation_ui.pending" };
  return keys[run.status] ? t(keys[run.status]) : run.status.replaceAll("_", " ");
}

export function formatAutomationTime(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value).toLocaleString(currentLocale() === "zh" ? "zh-CN" : "en-US") : "—";
}

/** One shared label for every schedule kind; Den web and the agent listing use the same one. */
export function formatAutomationSchedule(...args: Parameters<typeof formatSchedule>) {
  const locale = args[1] ?? (currentLocale() === "zh" ? "zh-CN" : "en-US");
  const text = formatSchedule(args[0], locale);
  if (currentLocale() !== "zh") return text;
  return text.replace(/^Once/, "单次").replace(/^Daily/, "每天").replace(/^Weekly/, "每周")
    .replace(/^Every hour/, "每小时").replace(/^Every (\d+) hours/, "每 $1 小时")
    .replace(/^After each meeting \(\+(\d+) min\)/, "每次会议结束 $1 分钟后")
    .replace(/^After each meeting/, "每次会议结束后").replace(/^(\d+) min before each meeting ends/, "每次会议结束前 $1 分钟")
    .replace(/^As each meeting starts/, "每次会议开始时").replace(/^(\d+) min before each meeting/, "每次会议开始前 $1 分钟")
    .replace(/^(\d+) min into each meeting/, "每次会议开始 $1 分钟后")
    .replace(/with people outside the organization/, "包含组织外部参会者").replace(/titles containing/, "标题包含");
}
