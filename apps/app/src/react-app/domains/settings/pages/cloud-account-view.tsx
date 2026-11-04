import { Get3wAccount, openGet3wSignIn, useGet3wAccount } from "../../cloud/get3w-account";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { SettingsNotice, SettingsSection, SettingsSectionHeader, SettingsSectionHeaderContent,
  SettingsSectionHeaderTitle, SettingsStack } from "../settings-section";

export function CloudAccountView() {
  const account = useGet3wAccount();
  return <SettingsStack>
    <Get3wAccount />
    <SettingsSection>
      <SettingsSectionHeader><SettingsSectionHeaderContent>
        <SettingsSectionHeaderTitle>{t("ui.ddf6f9a613af")}</SettingsSectionHeaderTitle>
      </SettingsSectionHeaderContent></SettingsSectionHeader>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm" role="status">{account.user
          ? `${account.user.name} · ${account.status === "unavailable" ? t("ui.a1794783aab7") : t("ui.ca566c8968e7")}`
          : t("ui.80c6e7caffee")}</span>
        <Button variant="outline" onClick={() => openGet3wSignIn()}>
          {account.user ? t("ui.ddb585602c09") : t("ui.71513c6f6861")}
        </Button>
      </div>
      {account.error ? <SettingsNotice tone="error">{account.error}</SettingsNotice> : null}
    </SettingsSection>
  </SettingsStack>;
}
