import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { error, fail } from '@sveltejs/kit';
import { Role } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';
import { NOWPAYMENTS_API_URL } from '$lib/nowpayments';
import { getFeeConfig } from '$lib/escrow-fee.server';
import { computeFee } from '$lib/escrow-fee';
import { notifyEscrow, payoutGuestSeller, randomToken } from '$lib/escrow.server';
import { notify } from '$lib/notify.server';

/** Notify the registered party on the opposite side of `actorSide`. */
function notifyOther(e: any, actorSide: 'buyer' | 'seller' | null, type: string, title: string, body = '') {
  const otherId = actorSide === 'buyer' ? e.sellerId : actorSide === 'seller' ? e.buyerId : null;
  return notify(otherId, type, title, body, `/escrow/${e.publicId}`);
}

const FULL = {
  id: true, publicId: true, title: true, description: true, amount: true, fee: true, status: true,
  isGuest: true, creatorSide: true, shareToken: true, buyerToken: true, sellerToken: true,
  buyerId: true, sellerId: true, createdById: true,
  buyerName: true, sellerName: true, buyerEmail: true, sellerEmail: true,
  fundingRef: true, payoutAddress: true, payoutCurrency: true, createdAt: true,
} as const;

async function loadByCode(code: string) {
  return prisma.escrow.findUnique({ where: { publicId: code }, select: FULL });
}

function viewerFor(e: any, meId: number | null, cookieTok: string | undefined) {
  if (meId && e.buyerId === meId) return { side: 'buyer' as const, auth: 'account' as const };
  if (meId && e.sellerId === meId) return { side: 'seller' as const, auth: 'account' as const };
  if (cookieTok && cookieTok === e.buyerToken) return { side: 'buyer' as const, auth: 'guest' as const };
  if (cookieTok && cookieTok === e.sellerToken) return { side: 'seller' as const, auth: 'guest' as const };
  return { side: null, auth: null };
}

function joinInfo(e: any) {
  const joinSide = e.creatorSide === 'buyer' ? 'seller' : 'buyer';
  const open =
    joinSide === 'buyer' ? !e.buyerId && !e.buyerToken : !e.sellerId && !e.sellerToken;
  return { joinSide, open };
}

async function fetchPayment(id: string) {
  try {
    const res = await fetch(`${NOWPAYMENTS_API_URL}/v1/payment/${id}`, {
      headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY! },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export const load: PageServerLoad = async ({ params, cookies }) => {
  const e = await loadByCode(params.code);
  if (!e) throw error(404, 'Deal not found — check your link.');

  const me = userFromToken(cookies.get('__token'));
  let meBalance = 0;
  let isAdmin = false;
  if (me?.id) {
    const u = await prisma.user.findUnique({ where: { id: me.id }, select: { balance: true, role: true } });
    meBalance = u?.balance ?? 0;
    isAdmin = !!u?.role.includes(Role.ADMIN);
  }

  const cookieTok = cookies.get(`esc_${e.publicId}`);
  const viewer = viewerFor(e, me?.id ?? null, cookieTok);
  const { joinSide, open } = joinInfo(e);

  // Lazy crypto-funding confirmation
  let funding: any = null;
  if (e.fundingRef && (e.status === 'ACCEPTED' || e.status === 'PROPOSED')) {
    const pay = await fetchPayment(e.fundingRef);
    if (pay) {
      if (['confirmed', 'finished'].includes(pay.payment_status)) {
        const fee = computeFee(e.amount, await getFeeConfig());
        await prisma.escrow.update({
          where: { id: e.id },
          data: { status: 'FUNDED', fundedAt: new Date(), fee, events: { create: { type: 'FUNDED', message: `Buyer funded the escrow ($${e.amount.toFixed(2)}).` } } },
        });
        e.status = 'FUNDED'; e.fee = fee;
      } else {
        funding = { address: pay.pay_address, amount: pay.pay_amount, currency: pay.pay_currency, status: pay.payment_status };
      }
    }
  }

  const isParty = !!viewer.side;
  const canSee = isParty || isAdmin || (open && !me?.id) || (open && !!me?.id);

  // Mark the OTHER party's messages as read by this viewer (WhatsApp-style receipts).
  if (isParty) {
    const myName = viewer.side === 'buyer' ? e.buyerName : e.sellerName;
    await prisma.escrowMessage.updateMany({
      where: {
        escrowId: e.id,
        readAt: null,
        ...(me?.id ? { NOT: { senderId: me.id } } : { NOT: { senderName: myName } }),
      },
      data: { readAt: new Date() },
    });
  }

  const events = await prisma.escrowEvent.findMany({ where: { escrowId: e.id }, orderBy: { createdAt: 'asc' }, select: { id: true, type: true, message: true, createdAt: true } });
  const messages =
    isParty || isAdmin
      ? await prisma.escrowMessage.findMany({ where: { escrowId: e.id }, orderBy: { createdAt: 'asc' }, select: { id: true, body: true, createdAt: true, senderId: true, senderName: true, fromAdmin: true, readAt: true, sender: { select: { avatar: true } } } })
      : [];

  // Counterparty (registered) for last-seen + avatar display.
  const otherId = viewer.side === 'buyer' ? e.sellerId : viewer.side === 'seller' ? e.buyerId : null;
  let counterparty: { lastSeen: Date | null; avatar: string | null } | null = null;
  if (otherId) {
    counterparty = await prisma.user.findUnique({ where: { id: otherId }, select: { lastSeen: true, avatar: true } });
  }

  const feeConfig = await getFeeConfig();

  return {
    deal: {
      id: e.id, publicId: e.publicId, title: e.title, description: e.description, amount: e.amount, fee: e.fee,
      status: e.status, creatorSide: e.creatorSide, buyerName: e.buyerName, sellerName: e.sellerName,
      payoutAddress: e.payoutAddress, isGuest: e.isGuest,
    },
    viewer, isAdmin, isParty, joinSide, joinOpen: open, canSee, counterparty,
    me: me?.id ? { id: me.id, username: me.username, balance: meBalance } : null,
    funding, events, messages, feeConfig,
  };
};

// ---- action helpers ----
function actor(cookies: any) {
  return userFromToken(cookies.get('__token')) as { id: number; username: string; role: Role[] } | null;
}
function getViewer(e: any, cookies: any) {
  const me = actor(cookies);
  const v = viewerFor(e, me?.id ?? null, cookies.get(`esc_${e.publicId}`));
  return { me, ...v };
}

export const actions: Actions = {
  // Accept / decline for a registered counterparty invited by username.
  async accept({ params, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    const v = getViewer(e, cookies);
    if (!v.side || v.side === e.creatorSide) return fail(403, { error: 'Only the invited party can accept.' });
    if (e.status !== 'PROPOSED') return fail(400, { error: 'This deal can no longer be accepted.' });
    await prisma.escrow.update({ where: { id: e.id }, data: { status: 'ACCEPTED', acceptedAt: new Date(), events: { create: { type: 'ACCEPTED', actorId: v.me?.id ?? null, message: `${v.me?.username ? '@' + v.me.username : 'The invited party'} accepted the deal.` } } } });
    await notifyEscrow(`✅ Escrow #${e.publicId} accepted.`);
    return { success: true };
  },
  async decline({ params, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    const v = getViewer(e, cookies);
    if (!v.side || v.side === e.creatorSide) return fail(403, { error: 'Only the invited party can decline.' });
    if (e.status !== 'PROPOSED') return fail(400, { error: 'This deal can no longer be declined.' });
    await prisma.escrow.update({ where: { id: e.id }, data: { status: 'DECLINED', closedAt: new Date(), events: { create: { type: 'DECLINED', actorId: v.me?.id ?? null, message: 'The invited party declined the deal.' } } } });
    return { success: true };
  },

  async join({ params, request, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    if (e.status !== 'PROPOSED') return fail(400, { error: 'This deal can no longer be joined.' });
    const { joinSide, open } = joinInfo(e);
    if (!open) return fail(400, { error: 'Someone has already joined this deal.' });

    const me = actor(cookies);
    const body = await request.formData();

    if (me?.id) {
      // join with account
      if (e.buyerId === me.id || e.sellerId === me.id) return fail(400, { error: 'You are already in this deal.' });
      await prisma.escrow.update({
        where: { id: e.id },
        data: {
          status: 'ACCEPTED', acceptedAt: new Date(),
          ...(joinSide === 'buyer' ? { buyerId: me.id, buyerName: me.username } : { sellerId: me.id, sellerName: me.username }),
          events: { create: { type: 'ACCEPTED', actorId: me.id, message: `@${me.username} joined as the ${joinSide}.` } },
        },
      });
      await notifyEscrow(`✅ Escrow #${e.publicId}: @${me.username} joined as ${joinSide}.`);
      await notifyOther(e, joinSide, 'escrow', `Deal joined · ${e.title}`, `@${me.username} joined your escrow as the ${joinSide}.`);
      return { success: true };
    }

    // join as guest
    const name = (body.get('name') as string)?.trim();
    const email = ((body.get('email') as string) || '').trim();
    const telegram = ((body.get('telegram') as string) || '').trim().replace(/^@/, '');
    if (!name) return fail(400, { error: 'Enter your name.' });
    const token = randomToken();
    await prisma.escrow.update({
      where: { id: e.id },
      data: {
        status: 'ACCEPTED', acceptedAt: new Date(),
        ...(joinSide === 'buyer'
          ? { buyerToken: token, buyerName: name, buyerEmail: email || null, buyerTelegram: telegram || null }
          : { sellerToken: token, sellerName: name, sellerEmail: email || null, sellerTelegram: telegram || null }),
        events: { create: { type: 'ACCEPTED', message: `${name} joined as the ${joinSide}.` } },
      },
    });
    cookies.set(`esc_${e.publicId}`, token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 180 });
    await notifyEscrow(`✅ Escrow #${e.publicId}: ${name} joined as ${joinSide}.`);
    return { success: true };
  },

  async fund({ params, request, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    const v = getViewer(e, cookies);
    if (v.side !== 'buyer') return fail(403, { error: 'Only the buyer can fund.' });
    if (e.status !== 'ACCEPTED') return fail(400, { error: 'The other party must join before funding.' });

    const body = await request.formData();
    const method = (body.get('method') as string) || 'crypto';
    const cur = ((body.get('currency') as string) || 'btc').toLowerCase();

    if (method === 'balance' && v.auth === 'account' && v.me) {
      const u = await prisma.user.findUnique({ where: { id: v.me.id }, select: { balance: true } });
      if (!u || u.balance < e.amount) return fail(400, { error: `Insufficient balance. You need $${e.amount.toFixed(2)}.` });
      const fee = computeFee(e.amount, await getFeeConfig());
      await prisma.$transaction([
        prisma.user.update({ where: { id: v.me.id }, data: { balance: { decrement: e.amount } } }),
        prisma.escrow.update({ where: { id: e.id }, data: { status: 'FUNDED', fundedAt: new Date(), fee, events: { create: { type: 'FUNDED', actorId: v.me.id, message: `Buyer funded $${e.amount.toFixed(2)} from balance.` } } } }),
      ]);
      await notifyEscrow(`💰 Escrow #${e.publicId} funded from balance ($${e.amount.toFixed(2)}).`);
      await notifyOther(e, 'buyer', 'escrow', `Escrow funded · ${e.title}`, `The buyer funded $${e.amount.toFixed(2)} — you can deliver now.`);
      return { success: true };
    }

    // crypto funding (account buyer who chose crypto, or guest buyer)
    const res = await fetch(`${NOWPAYMENTS_API_URL}/v1/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.NOWPAYMENTS_API_KEY! },
      body: JSON.stringify({ price_amount: e.amount, price_currency: 'USD', pay_currency: cur, ipn_callback_url: process.env.PAYMENT_CALLBACK_URL, order_id: `escrow_${e.id}`, order_description: `Escrow ${e.publicId} funding` }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return fail(400, { error: err?.message || 'Could not start funding. Try a larger amount or another coin.' });
    }
    const pay = await res.json();
    await prisma.escrow.update({ where: { id: e.id }, data: { fundingRef: String(pay.payment_id) } });
    return { success: true, funding: { address: pay.pay_address, amount: pay.pay_amount, currency: pay.pay_currency } };
  },

  async setPayout({ params, request, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    const v = getViewer(e, cookies);
    if (v.side !== 'seller') return fail(403, { error: 'Only the seller can set a payout address.' });
    const body = await request.formData();
    const address = (body.get('address') as string)?.trim();
    const currency = ((body.get('currency') as string) || 'btc').toLowerCase();
    if (!address || address.length < 12) return fail(400, { error: 'Enter a valid payout address.' });
    await prisma.escrow.update({ where: { id: e.id }, data: { payoutAddress: address, payoutCurrency: currency } });
    return { success: true };
  },

  async deliver({ params, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    const v = getViewer(e, cookies);
    if (v.side !== 'seller') return fail(403, { error: 'Only the seller can mark delivery.' });
    if (e.status !== 'FUNDED') return fail(400, { error: 'You can only mark delivery on a funded deal.' });
    await prisma.escrow.update({ where: { id: e.id }, data: { status: 'DELIVERED', deliveredAt: new Date(), events: { create: { type: 'DELIVERED', actorId: v.me?.id ?? null, message: 'Seller marked the order delivered.' } } } });
    await notifyEscrow(`📦 Escrow #${e.publicId}: seller marked delivery.`);
    await notifyOther(e, 'seller', 'escrow', `Order delivered · ${e.title}`, 'The seller marked delivery. Release the funds when you’re satisfied.');
    return { success: true };
  },

  async release({ params, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    const v = getViewer(e, cookies);
    if (v.side !== 'buyer') return fail(403, { error: 'Only the buyer can release.' });
    if (e.status !== 'FUNDED' && e.status !== 'DELIVERED') return fail(400, { error: 'Only a funded deal can be released.' });

    const net = Math.round((e.amount - e.fee) * 100) / 100;
    if (e.sellerId) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: e.sellerId }, data: { balance: { increment: net } } }),
        prisma.escrow.update({ where: { id: e.id }, data: { status: 'COMPLETED', completedAt: new Date(), closedAt: new Date(), events: { create: { type: 'COMPLETED', actorId: v.me?.id ?? null, message: `Buyer released $${net.toFixed(2)} to the seller (fee $${e.fee.toFixed(2)}).` } } } }),
      ]);
      const { addEscrowRevenue } = await import('$lib/escrow-fee.server');
      if (e.fee > 0) await addEscrowRevenue(e.fee);
      await notifyEscrow(`🎉 Escrow #${e.publicId} completed → $${net.toFixed(2)} to seller's balance.`);
    } else {
      if (!e.payoutAddress) return fail(400, { error: 'The seller needs to set a payout address first.' });
      await prisma.escrow.update({ where: { id: e.id }, data: { status: 'COMPLETED', completedAt: new Date(), closedAt: new Date(), events: { create: { type: 'COMPLETED', actorId: v.me?.id ?? null, message: `Buyer released $${net.toFixed(2)} to the seller (fee $${e.fee.toFixed(2)}).` } } } });
      const { addEscrowRevenue } = await import('$lib/escrow-fee.server');
      if (e.fee > 0) await addEscrowRevenue(e.fee);
      await payoutGuestSeller(e);
    }
    await notifyOther(e, 'buyer', 'escrow', `Funds released · ${e.title}`, `The buyer released $${net.toFixed(2)} to you.`);
    return { success: true };
  },

  async dispute({ params, request, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    const v = getViewer(e, cookies);
    if (!v.side) return fail(403, { error: 'Not a party.' });
    if (e.status !== 'FUNDED' && e.status !== 'DELIVERED') return fail(400, { error: 'Only a funded deal can be disputed.' });
    const reason = ((await request.formData()).get('reason') as string)?.trim().slice(0, 500) || 'No reason given.';
    await prisma.escrow.update({ where: { id: e.id }, data: { status: 'DISPUTED', events: { create: { type: 'DISPUTED', actorId: v.me?.id ?? null, message: `${v.side} opened a dispute: ${reason}` } } } });
    await notifyEscrow(`⚠️ <b>DISPUTE</b> on escrow #${e.publicId} (${v.side}). Reason: ${reason}`);
    await notifyOther(e, v.side, 'escrow', `Dispute opened · ${e.title}`, 'The other party opened a dispute. An admin will review the chat.');
    return { success: true };
  },

  async cancel({ params, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    const v = getViewer(e, cookies);
    const isCreatorSide = v.side && v.side === e.creatorSide;
    if (!isCreatorSide) return fail(403, { error: 'Only the creator can cancel.' });
    if (e.status !== 'PROPOSED' && e.status !== 'ACCEPTED') return fail(400, { error: 'Funded deals can’t be cancelled — open a dispute.' });
    await prisma.escrow.update({ where: { id: e.id }, data: { status: 'CANCELLED', closedAt: new Date(), events: { create: { type: 'CANCELLED', actorId: v.me?.id ?? null, message: 'Creator cancelled the deal.' } } } });
    return { success: true };
  },

  async resolveRelease({ params, cookies }) {
    const me = actor(cookies);
    if (!me?.role?.includes(Role.ADMIN)) return fail(403, { error: 'Admins only.' });
    const e = await loadByCode(params.code);
    if (!e || e.status !== 'DISPUTED') return fail(400, { error: 'Only a disputed deal can be resolved.' });
    const net = Math.round((e.amount - e.fee) * 100) / 100;
    const { addEscrowRevenue } = await import('$lib/escrow-fee.server');
    if (e.sellerId) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: e.sellerId }, data: { balance: { increment: net } } }),
        prisma.escrow.update({ where: { id: e.id }, data: { status: 'COMPLETED', completedAt: new Date(), closedAt: new Date(), events: { create: { type: 'COMPLETED', actorId: me.id, message: `Admin released $${net.toFixed(2)} to the seller.` } } } }),
      ]);
    } else {
      await prisma.escrow.update({ where: { id: e.id }, data: { status: 'COMPLETED', completedAt: new Date(), closedAt: new Date(), events: { create: { type: 'COMPLETED', actorId: me.id, message: `Admin released $${net.toFixed(2)} to the seller.` } } } });
      await payoutGuestSeller(e);
    }
    if (e.fee > 0) await addEscrowRevenue(e.fee);
    await notifyEscrow(`🧑‍⚖️ Escrow #${e.publicId} resolved → seller.`);
    return { success: true };
  },

  async resolveRefund({ params, cookies }) {
    const me = actor(cookies);
    if (!me?.role?.includes(Role.ADMIN)) return fail(403, { error: 'Admins only.' });
    const e = await loadByCode(params.code);
    if (!e || e.status !== 'DISPUTED') return fail(400, { error: 'Only a disputed deal can be resolved.' });
    if (e.buyerId) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: e.buyerId }, data: { balance: { increment: e.amount } } }),
        prisma.escrow.update({ where: { id: e.id }, data: { status: 'REFUNDED', closedAt: new Date(), events: { create: { type: 'REFUNDED', actorId: me.id, message: `Admin refunded $${e.amount.toFixed(2)} to the buyer.` } } } }),
      ]);
    } else {
      await prisma.escrow.update({ where: { id: e.id }, data: { status: 'REFUNDED', closedAt: new Date(), events: { create: { type: 'REFUNDED', actorId: me.id, message: `Admin refunded $${e.amount.toFixed(2)} to the buyer (send manually).` } } } });
      await notifyEscrow(`↩️ Escrow #${e.publicId}: manual guest refund of $${e.amount.toFixed(2)} needed.`);
    }
    await notifyEscrow(`🧑‍⚖️ Escrow #${e.publicId} resolved → buyer refund.`);
    return { success: true };
  },

  async adminBlock({ params, cookies }) {
    const me = actor(cookies);
    if (!me?.role?.includes(Role.ADMIN)) return fail(403, { error: 'Admins only.' });
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    if (!['PROPOSED', 'ACCEPTED', 'FUNDED', 'DELIVERED'].includes(e.status)) return fail(400, { error: 'This deal can’t be frozen.' });
    await prisma.escrow.update({ where: { id: e.id }, data: { status: 'DISPUTED', events: { create: { type: 'DISPUTED', actorId: me.id, message: 'An admin froze this deal pending review.' } } } });
    await notifyEscrow(`🛑 Escrow #${e.publicId} frozen by admin.`);
    return { success: true };
  },

  async message({ params, request, cookies }) {
    const e = await loadByCode(params.code);
    if (!e) return fail(404, { error: 'not found' });
    const v = getViewer(e, cookies);
    const isAdmin = !!v.me?.role?.includes(Role.ADMIN);
    if (!v.side && !isAdmin) return fail(403, { error: 'Not a party.' });
    const text = ((await request.formData()).get('body') as string)?.trim();
    if (!text) return fail(400, { error: 'empty' });
    const name = v.side === 'buyer' ? e.buyerName : v.side === 'seller' ? e.sellerName : v.me?.username;
    await prisma.escrowMessage.create({ data: { escrowId: e.id, senderId: v.me?.id ?? null, senderName: name || 'User', fromAdmin: isAdmin && !v.side, body: text.slice(0, 2000) } });
    await notifyOther(e, v.side, 'message', `New message · ${e.title}`, `${name || 'Someone'}: ${text.slice(0, 80)}`);
    return { success: true, sent: true };
  },
};
