/** Shared, browser-safe escrow metadata + helpers. */

export type EscrowStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'FUNDED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'DISPUTED'
  | 'REFUNDED';

export type EscrowTone = 'success' | 'pending' | 'failed' | 'info';

interface StatusMeta {
  label: string;
  tone: EscrowTone;
  /** Short explanation of what this status means / what happens next. */
  hint: string;
}

export const ESCROW_STATUS: Record<EscrowStatus, StatusMeta> = {
  PROPOSED: { label: 'Awaiting acceptance', tone: 'pending', hint: 'Waiting for the other party to accept the deal.' },
  ACCEPTED: { label: 'Awaiting funding', tone: 'pending', hint: 'Both parties agreed. The buyer needs to fund the escrow.' },
  FUNDED: { label: 'Funded — in progress', tone: 'info', hint: 'Funds are held safely. The seller delivers, then the buyer releases.' },
  DELIVERED: { label: 'Delivered — awaiting release', tone: 'info', hint: 'Seller marked delivery. Buyer confirms to release the funds.' },
  COMPLETED: { label: 'Completed', tone: 'success', hint: 'Funds released to the seller. The deal is done.' },
  DECLINED: { label: 'Declined', tone: 'failed', hint: 'The other party declined the deal.' },
  CANCELLED: { label: 'Cancelled', tone: 'failed', hint: 'The deal was cancelled before funding.' },
  DISPUTED: { label: 'In dispute', tone: 'failed', hint: 'A dispute was opened. An admin will review and resolve it.' },
  REFUNDED: { label: 'Refunded', tone: 'failed', hint: 'Funds were returned to the buyer.' },
};

export const ESCROW_TONE_CLASSES: Record<EscrowTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export const ESCROW_TONE_DOT: Record<EscrowTone, string> = {
  success: 'bg-emerald-400',
  pending: 'bg-amber-400',
  info: 'bg-sky-400',
  failed: 'bg-red-400',
};

export const ACTIVE_STATUSES: EscrowStatus[] = ['PROPOSED', 'ACCEPTED', 'FUNDED', 'DELIVERED', 'DISPUTED'];

export const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Deal created',
  ACCEPTED: 'Deal accepted',
  DECLINED: 'Deal declined',
  CANCELLED: 'Deal cancelled',
  FUNDED: 'Escrow funded',
  DELIVERED: 'Marked delivered',
  COMPLETED: 'Funds released',
  DISPUTED: 'Dispute opened',
  REFUNDED: 'Buyer refunded',
  MESSAGE: 'Message',
};
