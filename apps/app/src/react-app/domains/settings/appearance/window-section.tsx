/** @jsxImportSource react */
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import type { AppearanceViewProps } from "../pages/appearance-view";
import { useUiStateStore } from "../../../shell/ui-state-store";
import {
  LayoutSection,
  LayoutSectionDescription,
  LayoutSectionHeader,
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutSectionTitle,
} from "../settings-layout";

interface WindowSectionProps
  extends Pick<AppearanceViewProps, "busy" | "hideTitlebar" | "toggleHideTitlebar"> {}

export function WindowSection(props: WindowSectionProps) {
  const applicationMenuVisible = useUiStateStore((state) => state.applicationMenuVisible);
  const setApplicationMenuVisible = useUiStateStore((state) => state.setApplicationMenuVisible);

  return (
    <LayoutSection>
      <LayoutSectionHeader>
        <LayoutSectionTitle>{t("settings.window_title")}</LayoutSectionTitle>
        <LayoutSectionDescription>{t("settings.window_appearance_desc")}</LayoutSectionDescription>
      </LayoutSectionHeader>

      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("settings.hide_titlebar")}</LayoutSectionItemTitle>
          <LayoutSectionItemDescription>{t("settings.hide_titlebar_desc")}</LayoutSectionItemDescription>
          <LayoutSectionItemHeaderActions>
            <Switch
              checked={props.hideTitlebar}
              disabled={props.busy}
              onCheckedChange={props.toggleHideTitlebar}
            />
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>
      </LayoutSectionItem>

      <LayoutSectionItem className="hidden windows:flex linux:flex">
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("ui.16a7e4a7fa72")}</LayoutSectionItemTitle>
          <LayoutSectionItemDescription>{t("ui.7c6a63d14a32")}</LayoutSectionItemDescription>
          <LayoutSectionItemHeaderActions>
            <Switch
              aria-label={t("ui.16a7e4a7fa72")}
              checked={applicationMenuVisible}
              disabled={props.busy}
              onCheckedChange={setApplicationMenuVisible}
            />
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>
      </LayoutSectionItem>
    </LayoutSection>
  );
}
