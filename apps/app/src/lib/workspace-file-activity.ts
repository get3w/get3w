import { t } from "@/i18n";

/** Translate known first-party failures for display; raw details remain untouched. */
export function workspaceFileFailure(text: string | undefined): string {
  const detail = (text ?? "").replace(/^Workspace file request failed:\s*/, "").trim();
  if (detail === "Workspace result location unavailable") return t("activity.workspace.unavailable");
  if (detail === "Invalid deliverable identity or extension") return t("activity.workspace.invalid_extension");
  if (detail === "Use a safe workspace-relative path" || detail === "Deliverable folder must be inside the workspace without symbolic links") return t("activity.workspace.invalid_path");
  if (detail === "Workspace result is no longer available") return t("activity.workspace.missing");
  return t("activity.workspace.failed");
}
