import { t } from "@/i18n";
/** @jsxImportSource react */
import { useState } from "react";

import {
  PageBackground,
  PageDescription,
  PageHeader,
  PageTitle,
  PageTitlebarRegion,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  BotIcon,
  GithubIcon,
  MessageCircleIcon,
  SearchIcon,
  SkipForwardIcon,
  UsersIcon,
} from "lucide-react";

export type AttributionSource =
  | "ai_assistant"
  | "search"
  | "social"
  | "github"
  | "friend_or_colleague";

type AttributionOption = {
  source: AttributionSource;
  label: string;
  description: string;
  icon: typeof BotIcon;
};

const options: AttributionOption[] = [
  {
    source: "ai_assistant",
    get label() { return t("ui.c59fb741b17e"); },
    description: "ChatGPT, Claude, Gemini, Perplexity...",
    icon: BotIcon,
  },
  {
    source: "search",
    get label() { return t("ui.49c266baaaa7"); },
    description: "Google, Bing, DuckDuckGo...",
    icon: SearchIcon,
  },
  {
    source: "social",
    get label() { return t("ui.b904a7715560"); },
    description: "X, LinkedIn, YouTube, Reddit...",
    icon: MessageCircleIcon,
  },
  {
    source: "github",
    get label() { return t("ui.615bfbd97e29"); },
    get description() { return t("ui.17e9d07f5bd6"); },
    icon: GithubIcon,
  },
  {
    source: "friend_or_colleague",
    get label() { return t("ui.f7e92aacf351"); },
    get description() { return t("ui.3a8471dde44b"); },
    icon: UsersIcon,
  },
];

type AttributionStepProps = {
  onSubmit: (source: AttributionSource, aiPrompt?: string) => void;
  onSkip: () => void;
};

/**
 * Self-reported attribution survey shown once during onboarding.
 * When the user picks "AI assistant" we ask which prompt led them
 * here — first-party data on how answer engines describe Get3W.
 */
export function AttributionStep({ onSubmit, onSkip }: AttributionStepProps) {
  const [aiSelected, setAiSelected] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <PageBackground />
      <PageTitlebarRegion />

      <div className="relative z-10 mx-6 w-full max-w-md rounded-3xl border border-border bg-background px-8 py-10">
        <PageHeader className="mb-8 text-center">
          <PageTitle>{t("ui.f90db0868e05")}</PageTitle>
          <PageDescription>
            {t("ui.b7733e3fb2e3")}
          </PageDescription>
        </PageHeader>

        {aiSelected ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">
              {t("ui.72d2a3dd131d")}
            </div>
            <Textarea
              autoFocus
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              placeholder={'e.g. "best open source alternative to Claude Cowork"'}
              rows={3}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSubmit("ai_assistant")}
              >
                {t("ui.8a1de155738b")}
              </Button>
              <Button size="sm" onClick={() => onSubmit("ai_assistant", aiPrompt)}>
                {t("ui.31fbef162594")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {options.map((option) => (
              <button
                key={option.source}
                type="button"
                className="flex w-full items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
                onClick={() => {
                  if (option.source === "ai_assistant") {
                    setAiSelected(true);
                    return;
                  }
                  onSubmit(option.source);
                }}
              >
                <option.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {option.label}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {option.description}
                  </div>
                </div>
              </button>
            ))}

            <div className="pt-1 text-center">
              <Button variant="ghost" size="sm" onClick={onSkip}>
                <SkipForwardIcon className="mr-1.5 size-3.5" />
                {t("ui.28d03596d24e")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
