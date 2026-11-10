/** @jsxImportSource react */
import { useEffect } from "react";

import { t } from "../../../i18n";
import { useBootState } from "../../shell/boot-state";
import { resolveExtensionIconSrc } from "@/react-app/design-system/extension-icon-src";
import {
  Page,
  PageTitlebarRegion,
} from "@/components/page";
import { DitherBackdrop } from "@/components/dither-backdrop";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollAreaViewport } from "@/components/ui/scroll-area";
import { useShellConfig } from "../../shell/shell-config";

type WelcomePageProps = {
  onGetStarted: () => void;
  getStartedLabel?: string;
  busy?: boolean;
  error?: string | null;
  manualFolder?: string;
  onManualFolderChange?: (value: string) => void;
  onUseManualFolder?: () => void;
  showManualFolder?: boolean;
  onSignIn?: () => void;
};

export function WelcomePage({
  onGetStarted,
  getStartedLabel,
  busy,
  error,
  manualFolder,
  onManualFolderChange,
  onUseManualFolder,
  showManualFolder,
  onSignIn,
}: WelcomePageProps) {
  const { config: shellConfig } = useShellConfig();
  const appName = shellConfig.appName;
  const { markRouteReady } = useBootState();

  // The boot splash overlay stays mounted (and swallows clicks) until the
  // first route marks itself ready. Welcome is a terminal route, so mark it
  // immediately.
  useEffect(() => {
    markRouteReady();
  }, [markRouteReady]);

  return (
    <Page className="min-h-dvh">
      <PageTitlebarRegion />

      <ScrollArea className="relative z-10">
        <ScrollAreaViewport>
          <div className="relative flex min-h-dvh items-center justify-center px-6 py-16">
            {/* Paper first-load spec: subtle black pixel-dither mosaic over a
                near-white ground. `dark:invert` flips the pixels to white so
                the texture survives dark mode. */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.1] dark:invert">
              <DitherBackdrop />
            </div>

            <div className="relative z-10 w-full max-w-[720px] rounded-3xl border border-border bg-background px-8 pb-12 pt-10 sm:px-16 sm:pb-16 sm:pt-14">
              <div className="flex items-center gap-2.5">
                <img
                  src={resolveExtensionIconSrc("/openwork-mark.svg")}
                  alt=""
                  width={26}
                  height={26}
                  className="shrink-0 dark:invert"
                  aria-hidden="true"
                />
                <span className="text-[15px] font-semibold tracking-tight text-foreground">
                  {appName}
                </span>
              </div>

              <div className="mt-10 flex flex-col gap-2.5 sm:mt-14">
                <h1 className="text-[30px] font-semibold leading-[38px] tracking-[-0.03em] text-foreground sm:text-[38px] sm:leading-[46px]">
                  {t("welcome.title")}
                </h1>
                <p className="text-[15px] leading-[23px] text-muted-foreground">
                  {t("welcome.subtitle")}
                </p>
              </div>

              <div className="mt-11 flex flex-col gap-3">
                {onSignIn ? (
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full text-[15px] font-semibold"
                    onClick={onSignIn}
                    disabled={busy}
                    data-testid="welcome-signin"
                  >
                    {t("welcome.sign_in_cloud")}
                  </Button>
                ) : null}

                <Button
                  type="button"
                  size="lg"
                  variant={onSignIn ? "outline" : "default"}
                  className="h-12 w-full text-[15px] font-medium"
                  onClick={onGetStarted}
                  disabled={busy}
                  data-testid="welcome-use-without-cloud"
                >
                  {busy
                    ? t("welcome.creating_workspace")
                    : (getStartedLabel || t("welcome.use_without_cloud"))}
                </Button>



                {error ? (
                  <p className="text-center text-xs text-destructive">{error}</p>
                ) : null}

                {showManualFolder ? (
                  <div className="rounded-xl border border-dashed border-border p-3">
                    <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                      {t("ui.7f1499fd8f2f")}
                      <input
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-ring"
                        value={manualFolder ?? ""}
                        onChange={(event) => onManualFolderChange?.(event.target.value)}
                        placeholder={t("ui.dc671f2cc70f")}
                      />
                    </label>
                    <Button
                      className="mt-2 w-full"
                      variant="outline"
                      onClick={onUseManualFolder}
                      disabled={busy || !manualFolder?.trim()}
                    >
                      {t("ui.30cbaeca91c8")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </ScrollAreaViewport>
      </ScrollArea>
    </Page>
  );
}
