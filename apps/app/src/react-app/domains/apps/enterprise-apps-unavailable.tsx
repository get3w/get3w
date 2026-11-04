import { useLocale } from "@/i18n";
export function EnterpriseAppsUnavailable() {
  const locale = useLocale();
  return <p role="status" className="p-6 text-sm text-muted-foreground">{locale === "zh" ? "此版本暂不提供云端应用。聊天中的本地文件和产物仍可使用。" : "Cloud apps are unavailable in this edition. Local chat files and artifacts remain available."}</p>;
}
