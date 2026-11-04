import { t } from "@/i18n";
/** @jsxImportSource react */
import {
  Page,
  PageBackground,
  PageDescription,
  PageHeader,
  PageTitle,
  PageTitlebarRegion,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { KeyRoundIcon, SkipForwardIcon, SparklesIcon } from "lucide-react";

type ProviderSelectionStepProps = {
  showOpenWorkModels?: boolean;
  onOpenWorkModels: () => void;
  onBringYourOwn: () => void;
  onSkip: () => void;
};

export function ProviderSelectionStep({
  showOpenWorkModels = true,
  onOpenWorkModels,
  onBringYourOwn,
  onSkip,
}: ProviderSelectionStepProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <PageBackground />
      <PageTitlebarRegion />

      <div className="relative z-10 mx-6 w-full max-w-md rounded-3xl border border-border bg-background px-8 py-10">
        <PageHeader className="mb-8 text-center">
          <PageTitle>{t("ui.e93e464b587e")}</PageTitle>
          <PageDescription>
            {t("ui.8bca37045bd8")}
          </PageDescription>
        </PageHeader>

        <div className="space-y-3">
          {showOpenWorkModels ? (
            <button
              type="button"
              className="flex w-full items-start gap-4 rounded-xl border border-blue-7/50 bg-blue-2/30 p-4 text-left transition-colors hover:bg-blue-3/40"
              onClick={onOpenWorkModels}
            >
              <SparklesIcon className="mt-0.5 size-5 shrink-0 text-blue-10" />
              <div>
                <div className="text-sm font-medium text-foreground">
                  {t("ui.9e7872ef9153")}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t("ui.a35881b2545a")}
                </div>
              </div>
            </button>
          ) : null}

          <button
            type="button"
            className="flex w-full items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
            onClick={onBringYourOwn}
          >
            <KeyRoundIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium text-foreground">
                {t("ui.75598d8b7f1f")}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t("ui.d0cad2bb66d1")}
              </div>
            </div>
          </button>

          <div className="pt-1 text-center">
            <Button variant="ghost" size="sm" onClick={onSkip}>
              <SkipForwardIcon className="mr-1.5 size-3.5" />
              {t("ui.ea782d9c321b")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
