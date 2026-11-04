import { rolloverOutcomeApplied, type RolloverOutcome } from "./engine-pool.js";

type Options = {
  reloadEngine: () => Promise<RolloverOutcome>;
  engineBusy: () => Promise<boolean>;
  logger?: { warn: (message: string, metadata?: Record<string, unknown>) => void };
  retryMs?: number;
};

/** Applies pending local configuration once the engine can reload safely.
 * This coordinator never reads account credentials or contacts a control plane. */
export class LocalEngineReload {
  private pending = false;
  private stopped = false;
  private running = false;
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly options: Options) {}

  markReloadPending(): void {
    if (this.stopped) return;
    this.pending = true;
    this.revision++;
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (this.stopped || this.running || this.timer || !this.pending) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.apply();
    }, this.options.retryMs ?? 15_000);
    this.timer.unref?.();
  }

  private async apply(): Promise<void> {
    if (this.stopped || this.running || !this.pending) return;
    this.running = true;
    const revision = this.revision;
    try {
      // Failed activity probes retain pending work; they never permit a reload.
      if (await this.options.engineBusy() || this.stopped) return;
      const outcome = await this.options.reloadEngine();
      if (!this.stopped && revision === this.revision && rolloverOutcomeApplied(outcome)) this.pending = false;
    } catch (error) {
      this.options.logger?.warn("Local engine configuration reload deferred", {
        message: error instanceof Error ? error.message : "reload failed",
      });
    } finally {
      this.running = false;
      this.schedule();
    }
  }
}
