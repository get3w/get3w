/** Tools whose calls require engine-owned conversation identity. */
export const GET3W_CHAT_TOOLS: readonly string[] = [
  "search_capabilities", "execute_capability", "media_prepare", "media_generate",
  "prepare_app", "create_app", "update_app", "read_app",
  "save_artifact_view", "save_react_artifact_view", "read_artifact_view",
];
