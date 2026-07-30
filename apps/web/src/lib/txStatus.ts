/** Shared display helpers for top-up / payment statuses. */

export type TxTone = 'success' | 'pending' | 'failed';

export interface TxDisplay {
  tone: TxTone;
  label: string;
}

/**
 * How long an unpaid top-up stays "pending" before we treat it as expired.
 * NOWPayments often leaves abandoned `/v1/payment` payments in "waiting"
 * indefinitely, so we expire them on our side after this window. A late real
 * payment still credits via the IPN / status check (those gate on `completed`,
 * not on status), so expiring locally never drops a genuine payment.
 */
export const PENDING_EXPIRY_MINUTES = 60;

const PENDING_STATES = new Set(['', 'pending', 'waiting', 'confirming', 'sending', 'partially_paid']);

export function isStalePending(status: string | null | undefined, completed: boolean, createdAt: string | Date): boolean {
  if (completed) return false;
  const s = (status || '').toLowerCase();
  if (!PENDING_STATES.has(s)) return false;
  const ageMin = (Date.now() - new Date(createdAt).getTime()) / 60000;
  return ageMin > PENDING_EXPIRY_MINUTES;
}

export function txDisplay(
  status: string | null | undefined,
  completed: boolean,
  createdAt?: string | Date
): TxDisplay {
  const s = (status || '').toLowerCase();
  if (completed || s === 'confirmed' || s === 'finished') {
    return { tone: 'success', label: 'Completed' };
  }
  if (s === 'failed') return { tone: 'failed', label: 'Failed' };
  if (s === 'expired') return { tone: 'failed', label: 'Expired' };
  if (s === 'refunded') return { tone: 'failed', label: 'Refunded' };

  // Time-based expiry for abandoned payments still stuck in a pending state.
  if (createdAt && isStalePending(status, completed, createdAt)) {
    return { tone: 'failed', label: 'Expired' };
  }

  if (s === 'partially_paid') return { tone: 'pending', label: 'Partially paid' };
  if (s === 'confirming') return { tone: 'pending', label: 'Confirming' };
  if (s === 'sending') return { tone: 'pending', label: 'Finalizing' };
  return { tone: 'pending', label: 'Pending' };
}

export const TONE_CLASSES: Record<TxTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export const TONE_DOT: Record<TxTone, string> = {
  success: 'bg-emerald-400',
  pending: 'bg-amber-400',
  failed: 'bg-red-400',
};
