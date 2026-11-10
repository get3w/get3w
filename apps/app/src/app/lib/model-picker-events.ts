export const openComposerModelPickerEvent = "openwork-open-composer-model-picker";

/** Opens the composer's model picker for a session, focused on the first alternative model. */
export function openAlternativeModelPicker(sessionId: string) {
  window.dispatchEvent(new CustomEvent(openComposerModelPickerEvent, { detail: { sessionId, focusAlternative: true } }));
}

/** Shows Settings > AI in the current workspace. */
export function openProviderSettings() {
  const workspace = window.location.hash.match(/^#(\/workspace\/[^/]+)/)?.[1] ?? "";
  window.location.hash = `${workspace}/settings/ai`;
}
