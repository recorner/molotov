/** Server-only escrow helpers (Telegram notifications, tokens, payouts). */
import crypto from 'crypto';
import prisma from './prisma';
import { sendPayout } from './nowpayments-payout.server';

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_GROUP_ID;

/** Post an escrow event to the admin Telegram channel (best-effort, never throws). */
export async function notifyEscrow(text: string): Promise<void> {
  if (!BOT || !CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch {
    /* ignore notification failures */
  }
}

/** Cryptographically-random URL-safe token for per-party guest access (kept in a cookie). */
export function randomToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

// Unambiguous alphabet (no 0/O/1/I/L) for short, shareable deal IDs.
const SHORT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function shortId(len = 5): string {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += SHORT_ALPHABET[bytes[i] % SHORT_ALPHABET.length];
  return s;
}

/** Generate a 5-char publicId not already used. */
export async function uniquePublicId(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const id = shortId(5);
    const existing = await prisma.escrow.findUnique({ where: { publicId: id }, select: { id: true } });
    if (!existing) return id;
  }
  return shortId(7); // extremely unlikely fallback
}

/**
 * Pay out a completed guest deal to the seller's crypto address.
 * Always records a Payout (source of truth so funds are never lost), then
 * attempts an automated NOWPayments payout; falls back to admin-queued PENDING.
 */
export async function payoutGuestSeller(escrow: {
  id: number;
  amount: number;
  fee: number;
  payoutAddress: string | null;
  payoutCurrency: string | null;
  sellerName: string | null;
}): Promise<{ automated: boolean }> {
  const net = Math.round((escrow.amount - escrow.fee) * 100) / 100;
  const address = escrow.payoutAddress || '';
  const currency = (escrow.payoutCurrency || 'btc').toLowerCase();

  const payout = await prisma.payout.create({
    data: {
      amount: net,
      address,
      currency,
      escrowId: escrow.id,
      guestName: escrow.sellerName,
      status: 'PENDING',
    },
    select: { id: true },
  });

  const result = address ? await sendPayout(net, currency, address) : { ok: false as const, reason: 'error' as const };

  if (result.ok) {
    await prisma.payout.update({
      where: { id: payout.id },
      data: { status: 'COMPLETED', providerRef: result.ref, paidAt: new Date() },
    });
    await notifyEscrow(`💸 Escrow #${escrow.id}: auto-payout sent ($${net.toFixed(2)} → ${currency.toUpperCase()} ${address}).`);
    return { automated: true };
  }

  await notifyEscrow(
    `💸 Escrow #${escrow.id}: payout of $${net.toFixed(2)} to ${currency.toUpperCase()} ${address} is QUEUED for manual send (automated payout ${
      'reason' in result && result.reason === 'not_configured' ? 'not configured' : 'failed'
    }).`
  );
  return { automated: false };
}
