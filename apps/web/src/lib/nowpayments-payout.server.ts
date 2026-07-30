import twofactor from 'node-2fa';
import { NOWPAYMENTS_API_URL } from './nowpayments';

/**
 * Best-effort automated crypto payout via the NOWPayments Payouts API.
 *
 * Requires (all optional — if missing, payouts fall back to an admin-queued
 * manual payout so funds are never lost):
 *   NOWPAYMENTS_API_KEY            (already used for payments)
 *   NOWPAYMENTS_EMAIL              account email (for JWT auth)
 *   NOWPAYMENTS_PASSWORD           account password
 *   NOWPAYMENTS_PAYOUT_2FA_SECRET  TOTP secret used to verify the payout batch
 *
 * Flow: estimate USD→crypto → auth (JWT) → create payout → verify with 2FA code.
 */

export type PayoutResult =
  | { ok: true; ref: string; cryptoAmount: number }
  | { ok: false; reason: 'not_configured' | 'error'; message?: string };

export function isPayoutConfigured(): boolean {
  return Boolean(
    process.env.NOWPAYMENTS_API_KEY &&
      process.env.NOWPAYMENTS_EMAIL &&
      process.env.NOWPAYMENTS_PASSWORD &&
      process.env.NOWPAYMENTS_PAYOUT_2FA_SECRET
  );
}

async function estimateCrypto(usd: number, currency: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${NOWPAYMENTS_API_URL}/v1/estimate?amount=${usd}&currency_from=usd&currency_to=${currency.toLowerCase()}`,
      { headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY! } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const amt = parseFloat(data.estimated_amount);
    return Number.isFinite(amt) ? amt : null;
  } catch {
    return null;
  }
}

/** Send a USD-valued payout to a crypto address. Returns ok=false/not_configured to trigger manual fallback. */
export async function sendPayout(usdAmount: number, currency: string, address: string): Promise<PayoutResult> {
  if (!isPayoutConfigured()) return { ok: false, reason: 'not_configured' };

  try {
    const cryptoAmount = await estimateCrypto(usdAmount, currency);
    if (!cryptoAmount) return { ok: false, reason: 'error', message: 'Could not estimate payout amount.' };

    // 1) JWT auth
    const authRes = await fetch(`${NOWPAYMENTS_API_URL}/v1/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.NOWPAYMENTS_EMAIL, password: process.env.NOWPAYMENTS_PASSWORD }),
    });
    if (!authRes.ok) return { ok: false, reason: 'error', message: 'Payout auth failed.' };
    const { token } = await authRes.json();

    // 2) Create payout batch
    const createRes = await fetch(`${NOWPAYMENTS_API_URL}/v1/payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.NOWPAYMENTS_API_KEY!,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ipn_callback_url: process.env.PAYMENT_CALLBACK_URL,
        withdrawals: [{ address, currency: currency.toLowerCase(), amount: cryptoAmount }],
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return { ok: false, reason: 'error', message: err?.message || 'Payout creation failed.' };
    }
    const batch = await createRes.json();
    const batchId = batch.id;

    // 3) Verify with a fresh TOTP code
    const code = twofactor.generateToken(process.env.NOWPAYMENTS_PAYOUT_2FA_SECRET!)?.token;
    if (code) {
      await fetch(`${NOWPAYMENTS_API_URL}/v1/payout/${batchId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NOWPAYMENTS_API_KEY!,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ verification_code: code }),
      }).catch(() => {});
    }

    return { ok: true, ref: String(batchId), cryptoAmount };
  } catch (e: any) {
    return { ok: false, reason: 'error', message: e?.message };
  }
}
