import { useMemo } from "react";
import type { UIMessage } from "ai";
import type { ComposerAttachment, ComposerPart } from "../../../../app/types";
import { resolveAttachmentFileMetadata } from "../sync/attachment-file-part";
import type { ComposerSessionState } from "./composer-state-store";
import { resolvePastedTextPlaceholders } from "./composer/pasted-text";
import { decodeComposerMentionValue } from "./composer/mention-encoding";
import { COMPOSER_DRAFT_TOKEN_RE, composerPillFromPart, composerPillText, parseComposerPillToken } from "./composer/composer-pills";

/**
 * Text parts for a pending user turn, built from the draft's parts so composer
 * pills and pasted text render as chips before the server echoes the message.
 * Returns undefined when the draft has neither and plain text is enough.
 */
export function pendingDraftTextParts(parts: readonly ComposerPart[], draftText?: string): UIMessage["parts"] | undefined {
  // Keep attachment markers until previews can be inserted at their original positions.
  if (draftText && /\[attachment [^\]]+\]/.test(draftText)) {
    return draftText.split(COMPOSER_DRAFT_TOKEN_RE).flatMap<UIMessage["parts"][number]>((segment) => {
      if (!segment) return [];
      const pill = parseComposerPillToken(segment);
      if (pill) return [{ type: "text", text: composerPillText(pill), state: "done", providerMetadata: { opencode: { composerPill: pill } } }];
      const paste = parts.find((part) => part.type === "paste" && segment === `[pasted text ${part.label}]`);
      const mentionValue = segment.startsWith("@") ? decodeComposerMentionValue(segment.slice(1)) : undefined;
      const mention = parts.find((part) => (part.type === "agent" && mentionValue === part.name) || (part.type === "file" && mentionValue === part.path) || (part.type === "computer" && mentionValue === part.target));
      const richPart = paste ?? mention;
      return (richPart ? pendingDraftTextParts([richPart]) : undefined) ?? [{ type: "text", text: segment, state: "done" }];
    });
  }
  const hasChip = parts.some((part) => part.type === "skill" || part.type === "connect-skill" || part.type === "connector" || part.type === "computer" || part.type === "session" || part.type === "paste" || part.type === "agent" || part.type === "file");
  if (!hasChip) return undefined;
  return parts.flatMap<UIMessage["parts"][number]>((part) => {
    switch (part.type) {
      case "skill":
      case "connect-skill":
      case "connector":
      case "computer":
      case "session": {
        const pill = composerPillFromPart(part);
        return [{ type: "text", text: composerPillText(pill), state: "done", providerMetadata: { opencode: { composerPill: pill } } }];
      }
      case "text":
        return part.text ? [{ type: "text", text: part.text, state: "done" }] : [];
      case "paste":
        return part.text ? [{ type: "text", text: part.text, state: "done", providerMetadata: { opencode: { pastedText: true } } }] : [];
      case "agent":
        return [{ type: "text", text: `@${part.name}`, state: "done", providerMetadata: { opencode: { agentMention: part.name } } }];
      case "file":
        return [{ type: "text", text: `@${part.path}`, state: "done", providerMetadata: { opencode: { fileMention: part.path } } }];
    }
  });
}

export function pendingMessageParts(text: string, attachments: ComposerAttachment[], serverParts: UIMessage["parts"] = [], textParts?: UIMessage["parts"]) {
  const parts = [...serverParts];
  if (text && !parts.some((part) => part.type === "text" && part.text)) parts.unshift(...(textParts ?? [{ type: "text", text }]));
  const matched = new Set<number>();
  let attachmentsReady = true;
  const filesById = new Map<string, UIMessage["parts"][number]>();
  for (const attachment of attachments) {
    const filename = resolveAttachmentFileMetadata(attachment.file).filename;
    // Compression can change an image's extension, but never its submitted bytes here.
    const compressedFilename = attachment.kind === "image"
      ? resolveAttachmentFileMetadata({ name: `${attachment.file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`, type: "image/jpeg" }).filename
      : filename;
    const index = serverParts.findIndex((part, index) => !matched.has(index) && part.type === "file"
      && (part.filename === filename || part.filename === compressedFilename));
    if (index >= 0) matched.add(index);
    const part = serverParts[index];
    const usable = part?.type === "file" && (attachment.kind === "image"
      ? part.mediaType.startsWith("image/") && /^(data:image\/|https?:\/\/)/.test(part.url)
      : /^(data:|file:\/\/|https?:\/\/)/.test(part.url));
    if (usable) {
      filesById.set(attachment.id, part);
      continue;
    }
    attachmentsReady = false;
    const preview = { type: "file", filename: attachment.name, mediaType: attachment.mimeType, url: attachment.previewUrl ?? "" } satisfies UIMessage["parts"][number];
    filesById.set(attachment.id, preview);
    if (part) parts[parts.indexOf(part)] = preview;
    else parts.push(preview);
  }
  const source = textParts ?? [{ type: "text", text } satisfies UIMessage["parts"][number]];
  const hasPositions = source.some((part) => part.type === "text" && /\[attachment [^\]]+\]/.test(part.text));
  // Partial server events can contain only one text/file part. Keep the entire
  // optimistic layout until the server has the text and every attachment.
  const visibleText = (items: UIMessage["parts"]) => items.flatMap((part) => part.type === "text" ? [part.text] : []).join("");
  const expectedText = visibleText(source).replace(/\[attachment [^\]]+\]/g, "");
  if (hasPositions && (!attachmentsReady || visibleText(serverParts) !== expectedText)) {
    const ordered: UIMessage["parts"] = [];
    for (const part of source) {
      if (part.type !== "text") { ordered.push(part); continue; }
      for (const segment of part.text.split(/(\[attachment [^\]]+\])/g)) {
        const id = segment.match(/^\[attachment ([^\]]+)\]$/)?.[1];
        if (id) {
          const file = filesById.get(id);
          if (file) { ordered.push(file); filesById.delete(id); }
        } else if (segment) ordered.push({ ...part, text: segment });
      }
    }
    ordered.push(...filesById.values());
    return { parts: ordered, attachmentsReady, layoutPending: true };
  }
  return { parts, attachmentsReady, layoutPending: false };
}

type DisplayComposer = Pick<ComposerSessionState, "draft" | "attachments" | "pasteParts">;

export function useDisplayedMessages(input: {
  messages: UIMessage[];
  extraMessages: UIMessage[];
  sessionId: string;
  autoSending: boolean;
  composer: DisplayComposer;
  autoSendComposer?: DisplayComposer;
}) {
  const { messages, extraMessages, sessionId } = input;
  // Ordinary composer edits are not transcript inputs. A captured autosend
  // likewise stays independent of the next draft being typed.
  const composer = input.autoSending ? input.autoSendComposer ?? input.composer : undefined;
  const draft = composer?.draft;
  const attachments = composer?.attachments;
  const pasteParts = composer?.pasteParts;
  return useMemo(() => {
    const pending: UIMessage[] = [];
    if (draft !== undefined && attachments && pasteParts && (draft.trim() || attachments.length)) {
      pending.push({
        id: `${sessionId}:first-send`,
        role: "user",
        parts: pendingMessageParts(resolvePastedTextPlaceholders(draft, pasteParts), attachments).parts,
      });
    }
    if (!pending.length && !extraMessages.length) return messages;
    return [...messages, ...pending, ...extraMessages];
  }, [messages, extraMessages, sessionId, draft, attachments, pasteParts]);
}
