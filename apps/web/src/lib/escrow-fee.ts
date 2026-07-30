/** Browser-safe escrow fee model. */

export interface FeeConfig {
  /** flat fee (USD) applied to deals below `threshold` */
  flat: number;
  /** USD boundary: below → flat fee, at/above → percent fee */
  threshold: number;
  /** percent fee applied to deals at/above `threshold` */
  percent: number;
}

export const DEFAULT_FEE: FeeConfig = { flat: 5, threshold: 100, percent: 5 };

/** Platform escrow fee for a given amount (rounded to cents, never exceeds the amount). */
export function computeFee(amount: number, cfg: FeeConfig = DEFAULT_FEE): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const raw = amount < cfg.threshold ? cfg.flat : (amount * cfg.percent) / 100;
  return Math.round(Math.min(raw, amount) * 100) / 100;
}

export function feeLabel(cfg: FeeConfig = DEFAULT_FEE): string {
  return `$${cfg.flat.toFixed(2)} on deals under $${cfg.threshold}, ${cfg.percent}% at or above`;
}
