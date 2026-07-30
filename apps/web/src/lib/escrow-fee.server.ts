import prisma from './prisma';
import { DEFAULT_FEE, type FeeConfig } from './escrow-fee';

const KEYS = {
  flat: 'escrow_fee_flat',
  threshold: 'escrow_fee_threshold',
  percent: 'escrow_fee_percent',
};

/** Read the configurable escrow fee from Settings, falling back to defaults. */
export async function getFeeConfig(): Promise<FeeConfig> {
  const rows = await prisma.settings.findMany({
    where: { key: { in: Object.values(KEYS) } },
    select: { key: true, value: true },
  });
  const m = new Map(rows.map((r) => [r.key, parseFloat(r.value)]));
  const num = (k: string, d: number) => {
    const v = m.get(k);
    return v !== undefined && Number.isFinite(v) ? v : d;
  };
  return {
    flat: num(KEYS.flat, DEFAULT_FEE.flat),
    threshold: num(KEYS.threshold, DEFAULT_FEE.threshold),
    percent: num(KEYS.percent, DEFAULT_FEE.percent),
  };
}

export async function setFeeConfig(cfg: FeeConfig): Promise<void> {
  const entries: [string, number][] = [
    [KEYS.flat, cfg.flat],
    [KEYS.threshold, cfg.threshold],
    [KEYS.percent, cfg.percent],
  ];
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.settings.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    )
  );
}

/** Accumulate platform escrow revenue (best-effort running total). */
export async function addEscrowRevenue(amount: number): Promise<void> {
  const key = 'escrow_revenue';
  const row = await prisma.settings.findUnique({ where: { key }, select: { value: true } });
  const current = row ? parseFloat(row.value) || 0 : 0;
  const next = Math.round((current + amount) * 100) / 100;
  await prisma.settings.upsert({
    where: { key },
    create: { key, value: String(next) },
    update: { value: String(next) },
  });
}
