import type { RemovePhase } from "./remove-background";

/** Share of the removal's progress bar given to fetching the model (the rest is decode, inference, encode). */
const DOWNLOAD_SHARE = 0.6;

/**
 * Folds the library's progress events (`fetch:<asset>` with bytes, `compute:<step>` with steps of 4) into one
 * fraction. Downloads come first; once computing starts they count as done (cached runs skip straight there).
 */
export class RemovalProgress {
  private fetches = new Map<string, { current: number; total: number }>();
  private computeStep = -1;

  /** `expected`: estimated bytes per asset not yet reporting, so the bar does not jump back when the next one starts. */
  constructor(expected: Record<string, number> = {}) {
    for (const [key, total] of Object.entries(expected)) this.fetches.set(key, { current: 0, total });
  }

  update(key: string, current: number, total: number): { fraction: number; phase: RemovePhase } {
    if (key.startsWith("compute:")) this.computeStep = Math.max(this.computeStep, total > 0 ? current / total : 0);
    else if (key.startsWith("fetch:") && total > 0) this.fetches.set(key, { current: Math.min(current, total), total });
    return this.value();
  }

  value(): { fraction: number; phase: RemovePhase } {
    if (this.computeStep >= 0) return { fraction: DOWNLOAD_SHARE + (1 - DOWNLOAD_SHARE) * this.computeStep, phase: "compute" };
    let cur = 0;
    let tot = 0;
    for (const f of this.fetches.values()) {
      cur += f.current;
      tot += f.total;
    }
    return { fraction: tot > 0 ? DOWNLOAD_SHARE * (cur / tot) : 0, phase: "download" };
  }
}
