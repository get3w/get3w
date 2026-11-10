import { z } from "zod";
import { currentLocale } from "@/i18n";
import { automationDesktopRunnerPresenceSchema, automationDetailSchema, automationListSchema, automationRunSchema, automationRunRangeSchema, automationRunReceiptSchema, type CreateAutomation, type UpdateAutomation } from "@openwork/types/automations";

export function createPersonalAutomationClient(userId: string) {
  async function request(path: string, method = "GET", body?: unknown) {
    const bridge = window.__GET3W_ACCOUNT__?.automations;
    const zh = currentLocale() === "zh";
    if (!bridge) throw Error(zh ? "请重启 Get3W 后使用自动化。" : "Restart Get3W to enable automations.");
    const result = await bridge({userId, path, method, ...(body === undefined ? {} : {body})}).catch(() => {
      throw Error(zh ? "无法连接自动化服务。请检查连接后重试。" : "Could not connect to the automation service. Check your connection and retry.");
    });
    if (!result.ok) {
      const failure = z.object({error: z.object({code: z.string()})}).safeParse(result.json);
      const messages: Record<string, [string, string]> = {
        schedule_has_no_future_run: ["请选择未来的运行时间。", "Choose a future run time."],
        invalid_timezone: ["请输入有效的 IANA 时区，例如 Asia/Shanghai。", "Enter a valid IANA timezone, such as Asia/Shanghai."],
        invalid_schedule: ["请检查运行日期、时间和重复计划。", "Check the run date, time, and repeat schedule."],
        automation_needs_attention: ["请先处理模型连接问题，再启用自动化。", "Resolve the model connection issue, then resume the automation."],
        automation_archived: ["此自动化已归档，无法修改或运行。", "This automation is archived and cannot be changed or run."],
      };
      const message = failure.success ? messages[failure.data.error.code] : undefined;
      if (message) throw Error(message[currentLocale() === "zh" ? 0 : 1]);
      if (result.status === 401) throw Error(zh ? "请重新登录 Get3W。" : "Sign in to Get3W again.");
      if (result.status === 404) throw Error(zh ? "此自动化暂不可用。请刷新列表，或更新 Get3W API。" : "This automation is unavailable. Update the Get3W API or refresh the list.");
      throw Error(zh ? `自动化请求失败（${result.status}），请重试。` : `Automation request failed (${result.status}). Try again.`);
    }
    return result.json;
  }
  return {
    async presence() {
      // An older API leaves presence unknown rather than reporting a false outage.
      try { return automationDesktopRunnerPresenceSchema.parse(await request("/v1/automation-runner/presence")); }
      catch { return null; }
    },
    async list() {
      const items = [];
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        const page = automationListSchema.parse(await request(`/v1/automations?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`));
        items.push(...page.items); cursor = page.nextCursor;
        if (cursor) {
          if (seen.has(cursor)) throw Error(currentLocale() === "zh" ? "列表未能完整加载，请重试。" : "The complete list could not be loaded. Try again.");
          seen.add(cursor);
        }
      } while (cursor);
      return {items, nextCursor: null};
    },
    async get(id: string) { return automationDetailSchema.parse(await request(`/v1/automations/${encodeURIComponent(id)}`)); },
    async create(input: CreateAutomation) { return automationDetailSchema.parse(await request("/v1/automations", "POST", input)); },
    async update(id: string, input: UpdateAutomation) { return automationDetailSchema.parse(await request(`/v1/automations/${encodeURIComponent(id)}`, "PATCH", input)); },
    async state(id: string, active: boolean) { return automationDetailSchema.parse(await request(`/v1/automations/${encodeURIComponent(id)}/${active ? "activate" : "deactivate"}`, "POST", {})); },
    async run(id: string) { const result = await request(`/v1/automations/${encodeURIComponent(id)}/run`, "POST", {}); return z.object({run: automationRunSchema}).parse(result).run; },
    async runs(id: string) {
      const items = [];
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        const page = automationRunRangeSchema.parse(await request(`/v1/automations/${encodeURIComponent(id)}/runs?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`));
        items.push(...page.items); cursor = page.nextCursor;
        if (cursor) {
          if (seen.has(cursor)) throw Error(currentLocale() === "zh" ? "列表未能完整加载，请重试。" : "The complete list could not be loaded. Try again.");
          seen.add(cursor);
        }
      } while (cursor);
      return {items, nextCursor: null};
    },
    async receipt(id: string, runId: string) { return automationRunReceiptSchema.parse(await request(`/v1/automations/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`)); },
    async cancel(id: string, runId: string) { return z.object({run: automationRunSchema}).parse(await request(`/v1/automations/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/cancel`, "POST", {})).run; },
    async archive(id: string) { return automationDetailSchema.parse(await request(`/v1/automations/${encodeURIComponent(id)}`, "DELETE")); },
  };
}
