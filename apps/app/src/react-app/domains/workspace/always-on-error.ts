import { t } from "@/i18n";
import { presentOpencodeSessionError } from "../session/sync/session-error";

export function alwaysOnErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("模型返回了空响应，且未保存完成回执。")) return t("workspace.error.always_on_empty_response");
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const stateKey = typeof code === "string" ? code : message.includes("数据缺失") ? "always_on_state_missing"
    : message.includes("数据已损坏") ? "always_on_state_invalid" : message.includes("无法读取持续运行数据") ? "always_on_state_unreadable"
    : message.includes("本次运行未确认完成") || message.includes("本次运行没有返回结果") ? "always_on_incomplete" : null;
  if(typeof code==="string"&&["attention_engine_required","attention_goal_blocked","attention_cancel_pending","attention_cancel_unavailable","attention_invalid_cancel","attention_resume_blocked","attention_invalid_answer","attention_conflict","attention_stale","attention_full","attention_changed"].includes(code))return t(`workspace.error.${code}`);
  if(typeof code==="string"&&["outbox_unreadable","outbox_full","delivery_conflict"].includes(code))return t(`workspace.error.${code}`);
  if (typeof code === "string" && code.startsWith("memory_") && ["memory_unreadable", "memory_invalid", "memory_conflict", "memory_full", "memory_missing"].includes(code)) return t(`workspace.error.${code}`);
  if (stateKey && ["always_on_state_missing", "always_on_state_invalid", "always_on_state_unreadable", "always_on_incomplete", "result_unavailable", "result_needs_review", "run_active"].includes(stateKey)) return t(`workspace.error.${stateKey}`);
  if (/Get3W (?:request failed|inference unavailable|stream interrupted)|provider\./i.test(message)) {
    const copy = presentOpencodeSessionError({ message });
    return [copy.title, copy.description].filter(Boolean).join(" ");
  }
  return message;
}
