import type { ReactNode } from "react";

export function ComposerNoticeCard({ icon, title, detail, actions, children, testId }: {
  icon: ReactNode; title: ReactNode; detail?: ReactNode; actions?: ReactNode; children?: ReactNode; testId?: string;
}) {
  return (
    <section data-testid={testId} className="mx-auto mb-2 flex w-full max-w-3xl flex-col gap-3 rounded-[14px] border border-border bg-background py-3 pe-3 ps-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex shrink-0 text-foreground [&_svg]:size-4">{icon}</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-[13px] font-medium leading-5 text-foreground">{title}</h2>
          {detail ? <p className="text-xs leading-4 text-muted-foreground">{detail}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

