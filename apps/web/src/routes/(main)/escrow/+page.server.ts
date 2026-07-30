import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getFeeConfig } from '$lib/escrow-fee.server';
import { notifyEscrow, randomToken, uniquePublicId } from '$lib/escrow.server';

const emailOk = (s: string) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const load: PageServerLoad = async ({ cookies }) => {
  const me = userFromToken(cookies.get('__token'));

  // Guests get the public "start a deal" experience right here at /escrow.
  if (!me?.id) {
    return { guest: true as const, feeConfig: await getFeeConfig() };
  }

  const escrows = await prisma.escrow.findMany({
    where: { OR: [{ buyerId: me.id }, { sellerId: me.id }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, publicId: true, title: true, amount: true, status: true, createdAt: true,
      buyerId: true, sellerId: true,
      buyer: { select: { username: true } },
      seller: { select: { username: true } },
    },
  });

  return { guest: false as const, escrows, meId: me.id };
};

export const actions: Actions = {
  // Public guest create — unauthenticated visitors start a deal right at /escrow.
  async guestCreate({ request, cookies }) {
    const body = await request.formData();
    const title = (body.get('title') as string)?.trim();
    const description = ((body.get('description') as string) || '').trim();
    const role = body.get('role') as string;
    const yourName = (body.get('yourName') as string)?.trim();
    const yourEmail = ((body.get('yourEmail') as string) || '').trim();
    const yourTelegram = ((body.get('yourTelegram') as string) || '').trim().replace(/^@/, '');
    const otherName = ((body.get('otherName') as string) || '').trim();
    const otherEmail = ((body.get('otherEmail') as string) || '').trim();
    const otherTelegram = ((body.get('otherTelegram') as string) || '').trim().replace(/^@/, '');
    const amount = Number(body.get('amount'));

    if (!yourName || yourName.length > 60) return fail(400, { error: 'yourName', message: 'Enter your name.' });
    if (!emailOk(yourEmail)) return fail(400, { error: 'yourEmail', message: 'Enter a valid email.' });
    if (!emailOk(otherEmail)) return fail(400, { error: 'otherEmail', message: 'Enter a valid email for the other party.' });
    if (!title || title.length > 80) return fail(400, { error: 'title', message: 'Enter a title.' });
    if (description.length > 2000) return fail(400, { error: 'description', message: 'Description is too long.' });
    if (role !== 'buyer' && role !== 'seller') return fail(400, { error: 'role', message: 'Choose your role.' });
    if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000)
      return fail(400, { error: 'amount', message: 'Amount must be $1–$1,000,000.' });

    const creatorToken = randomToken();
    const publicId = await uniquePublicId();
    const isBuyer = role === 'buyer';

    const escrow = await prisma.escrow.create({
      data: {
        title, description, amount, isGuest: true, creatorSide: role, status: 'PROPOSED',
        publicId,
        buyerToken: isBuyer ? creatorToken : null,
        sellerToken: isBuyer ? null : creatorToken,
        buyerName: isBuyer ? yourName : otherName || null,
        buyerEmail: isBuyer ? yourEmail || null : otherEmail || null,
        buyerTelegram: isBuyer ? yourTelegram || null : otherTelegram || null,
        sellerName: isBuyer ? otherName || null : yourName,
        sellerEmail: isBuyer ? otherEmail || null : yourEmail || null,
        sellerTelegram: isBuyer ? otherTelegram || null : yourTelegram || null,
        events: { create: { type: 'CREATED', message: `${yourName} created an escrow deal as the ${role}.` } },
      },
      select: { id: true },
    });

    await notifyEscrow(`🤝 <b>Guest escrow created</b> ${publicId}: ${title} ($${amount.toFixed(2)}) by ${yourName} (${role}).`);
    cookies.set(`esc_${publicId}`, creatorToken, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 180 });
    throw redirect(303, `/escrow/${publicId}`);
  },
};
