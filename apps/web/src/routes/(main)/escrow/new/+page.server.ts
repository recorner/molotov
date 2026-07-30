import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { notifyEscrow, uniquePublicId } from '$lib/escrow.server';
import { getFeeConfig } from '$lib/escrow-fee.server';
import { notify } from '$lib/notify.server';

export const load: PageServerLoad = async () => {
  return { feeConfig: await getFeeConfig() };
};

export const actions: Actions = {
  async create({ request, cookies }) {
    const me = userFromToken(cookies.get('__token'));
    if (!me?.id) return fail(401, { error: 'unauthorized' });

    const body = await request.formData();
    const title = (body.get('title') as string)?.trim();
    const description = ((body.get('description') as string) || '').trim();
    const role = body.get('role') as string; // 'buyer' | 'seller'
    const mode = (body.get('mode') as string) || 'username'; // 'username' | 'link'
    const counterparty = (body.get('counterparty') as string)?.trim().replace(/^@/, '');
    const amount = Number(body.get('amount'));

    if (!title || title.length > 80) return fail(400, { error: 'title', message: 'Enter a title (max 80 chars).' });
    if (description.length > 2000) return fail(400, { error: 'description', message: 'Description is too long.' });
    if (role !== 'buyer' && role !== 'seller') return fail(400, { error: 'role', message: 'Choose your role.' });
    if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000)
      return fail(400, { error: 'amount', message: 'Amount must be between $1 and $1,000,000.' });

    const publicId = await uniquePublicId();
    const isBuyer = role === 'buyer';

    if (mode === 'link') {
      // Counterparty unknown — create with the creator's side filled, the other side open for joining.
      const escrow = await prisma.escrow.create({
        data: {
          title, description, amount, publicId, creatorSide: role, createdById: me.id, status: 'PROPOSED',
          ...(isBuyer ? { buyerId: me.id, buyerName: me.username } : { sellerId: me.id, sellerName: me.username }),
          events: { create: { type: 'CREATED', actorId: me.id, message: `@${me.username} created a shareable escrow deal as the ${role}.` } },
        },
        select: { publicId: true },
      });
      await notifyEscrow(`🤝 <b>New escrow (link)</b> ${publicId}: ${title} ($${amount.toFixed(2)}) by @${me.username} (${role}).`);
      throw redirect(303, `/escrow/${escrow.publicId}`);
    }

    // Invite a known registered user by username.
    if (!counterparty) return fail(400, { error: 'counterparty', message: 'Enter the other party’s username (or switch to a shareable link).' });
    const other = await prisma.user.findUnique({ where: { username: counterparty }, select: { id: true, username: true } });
    if (!other) return fail(400, { error: 'counterparty', message: `No user named “${counterparty}”.` });
    if (other.id === me.id) return fail(400, { error: 'counterparty', message: 'You can’t open an escrow with yourself.' });

    const buyerId = isBuyer ? me.id : other.id;
    const sellerId = isBuyer ? other.id : me.id;

    const escrow = await prisma.escrow.create({
      data: {
        title, description, amount, publicId, creatorSide: role, buyerId, sellerId, createdById: me.id,
        buyerName: isBuyer ? me.username : other.username,
        sellerName: isBuyer ? other.username : me.username,
        events: { create: { type: 'CREATED', actorId: me.id, message: `@${me.username} proposed an escrow deal as the ${role}.` } },
      },
      select: { publicId: true },
    });
    await notifyEscrow(`🤝 <b>New escrow</b> ${publicId}: ${title} ($${amount.toFixed(2)}) — @${buyerId === me.id ? me.username : counterparty} (buyer) / @${sellerId === me.id ? me.username : counterparty} (seller).`);
    await notify(other.id, 'escrow', `New escrow deal · ${title}`, `@${me.username} invited you to an escrow deal for $${amount.toFixed(2)}.`, `/escrow/${publicId}`);
    throw redirect(303, `/escrow/${escrow.publicId}`);
  },
};
