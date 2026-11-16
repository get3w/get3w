import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import type { ComposerAttachment } from "../src/app/types";
import { pendingDraftTextParts, pendingMessageParts } from "../src/react-app/domains/session/surface/use-displayed-messages";

const image = (id: string, name = `${id}.png`): ComposerAttachment => ({
  id, name, file: new File(["image"], name, { type: "image/png" }),
  mimeType: "image/png", kind: "image", size: 5, previewUrl: `blob:${id}`,
});
const visible = (parts: UIMessage["parts"]) => parts.map(part => part.type === "text" ? part.text : part.type === "file" ? part.url : part.type);
const uploaded = (name: string): UIMessage["parts"][number] => ({ type: "file", filename: name, mediaType: "image/png", url: `https://test.invalid/${name}` });
const draft = "将图片 [attachment a] 中杯子的缺口补齐";
const textParts = pendingDraftTextParts([{ type: "text", text: "将图片  中杯子的缺口补齐" }], draft);

describe("pending attachment order", () => {
  test("initial send keeps the image between the surrounding text", () => {
    expect(visible(pendingMessageParts("将图片  中杯子的缺口补齐", [image("a")], [], textParts).parts))
      .toEqual(["将图片 ", "blob:a", " 中杯子的缺口补齐"]);
  });
  test("first-task autosend keeps raw draft positions", () => {
    expect(visible(pendingMessageParts(draft, [image("a")]).parts)).toEqual(["将图片 ", "blob:a", " 中杯子的缺口补齐"]);
  });
  test("partial server text does not move the image", () => {
    expect(visible(pendingMessageParts("将图片  中杯子的缺口补齐", [image("a")], [{ type: "text", text: "将图片 " }], textParts).parts))
      .toEqual(["将图片 ", "blob:a", " 中杯子的缺口补齐"]);
  });
  test("uses uploaded files in draft order while other files are pending, even with duplicate names", () => {
    const parts = pendingDraftTextParts([], "前[attachment b]中[attachment a]后");
    const result = pendingMessageParts("前中后", [image("a", "same.png"), image("b", "same.png")], [uploaded("same.png")], parts);
    expect(visible(result.parts)).toEqual(["前", "blob:b", "中", "https://test.invalid/same.png", "后"]);
    expect(result.attachmentsReady).toBe(false);
  });
  test("all uploaded files with partial text still keep the full optimistic layout", () => {
    expect(visible(pendingMessageParts("将图片  中杯子的缺口补齐", [image("a")], [{ type: "text", text: "将图片 " }, uploaded("a.png")], textParts).parts))
      .toEqual(["将图片 ", "https://test.invalid/a.png", " 中杯子的缺口补齐"]);
  });
  test("complete server message retains authoritative order", () => {
    const server: UIMessage["parts"] = [{ type: "text", text: "将图片 " }, uploaded("a.png"), { type: "text", text: " 中杯子的缺口补齐" }];
    expect(pendingMessageParts("将图片  中杯子的缺口补齐", [image("a")], server, textParts)).toEqual({ parts: server, attachmentsReady: true, layoutPending: false });
  });
  test("pasted text and reference metadata survive the ordered preview", () => {
    const parts = pendingDraftTextParts([
      { type: "paste", id: "p", label: "1", text: "粘贴内容", lines: 1 },
      { type: "session", workspaceId: "ws", sessionId: "ses", title: "任务" },
    ], "[pasted text 1][attachment a][session ws ses 任务]");
    const result = pendingMessageParts("", [image("a")], [], parts);
    expect(visible(result.parts)).toEqual(["粘贴内容", "blob:a", "/workspace/ws/session/ses"]);
    expect(result.parts[0]).toMatchObject({ providerMetadata: { opencode: { pastedText: true } } });
    expect(result.parts[2]).toMatchObject({ providerMetadata: { opencode: { composerPill: { kind: "session" } } } });
  });
  test("legacy unpositioned files append, stale and repeated tokens do not duplicate files", () => {
    expect(visible(pendingMessageParts("文字", [image("a")]).parts)).toEqual(["文字", "blob:a"]);
    expect(visible(pendingMessageParts("[attachment missing][attachment a][attachment a]", [image("a"), image("b")]).parts)).toEqual(["blob:a", "blob:b"]);
  });
});
