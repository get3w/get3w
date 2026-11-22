import { test, expect } from "bun:test";
import { setLocale } from "../src/i18n";
import { alwaysOnErrorText } from "../src/react-app/domains/workspace/always-on-error";

test("empty response guidance preserves the recovery distinction in both locales", () => {
 const message = "模型返回了空响应，且未保存完成回执。本次运行未确认完成；请检查已有成果，再补全记录或前往对话处理。";
 try {
  setLocale("zh");
  expect(alwaysOnErrorText(message)).toContain("模型返回了空响应");
  expect(alwaysOnErrorText(message)).toContain("补全记录");
  setLocale("en");
  expect(alwaysOnErrorText(message)).toContain("empty response without saving a completion receipt");
  expect(alwaysOnErrorText("本次运行未确认完成，请检查聊天及已产生的成果后再继续。")).not.toContain("empty response");
 } finally { setLocale("zh"); }
});
