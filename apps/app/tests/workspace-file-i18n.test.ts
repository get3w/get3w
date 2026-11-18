import { afterEach, expect, test } from "bun:test"
import en from "../src/i18n/locales/en"
import zh from "../src/i18n/locales/zh"
import { setLocale } from "../src/i18n"
import { workspaceFileFailure } from "../src/lib/workspace-file-activity"
import { describeChatToolFailure } from "../src/components/tools/error-attribution"

afterEach(() => setLocale("en"))

test("first-party activity translations have matching keys and placeholders", () => {
  const english = new Map(Object.entries(en).filter(([key]) => key.startsWith("activity.")))
  const chinese = new Map(Object.entries(zh).filter(([key]) => key.startsWith("activity.")))
  expect([...english.keys()].sort()).toEqual([...chinese.keys()].sort())
  for (const [key, value] of english) {
    expect(value.match(/\{\w+\}/g)?.sort() ?? []).toEqual(chinese.get(key)?.match(/\{\w+\}/g)?.sort() ?? [])
  }
})

test("known workspace errors and connection failures have localized guidance", () => {
  setLocale("zh")
  expect(workspaceFileFailure("Workspace file request failed: Invalid deliverable identity or extension")).toContain("扩展名")
  expect(workspaceFileFailure("Use a safe workspace-relative path")).toContain("工作区")
  expect(workspaceFileFailure("unrecognized internal error")).toContain("技术详情")
  expect(describeChatToolFailure("504 timed out")).toContain("服务未及时响应")
  expect(describeChatToolFailure("401 unauthorized")).toContain("登录设置")
  expect(describeChatToolFailure("403 forbidden")).toContain("无权")
  setLocale("en")
  expect(describeChatToolFailure("504 timed out")).toContain("didn’t respond in time")
})
