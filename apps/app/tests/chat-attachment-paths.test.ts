import { expect, test } from "bun:test";
import { isChatAttachmentUrl, workspaceInboxPath } from "../src/react-app/domains/session/sync/attachment-file-part";

test("attachment paths use the runtime-neutral Get3W directory", () => {
 expect(workspaceInboxPath("chat-attachments/session/image.png")).toBe(".get3w/inbox/chat-attachments/session/image.png");
 for(const prefix of [".get3w"]) {
  expect(isChatAttachmentUrl(`file:///workspace/${prefix}/inbox/chat-attachments/session/image.png`)).toBe(true);
 }
 expect(isChatAttachmentUrl("file:///workspace/images/image.png")).toBe(false);
});
