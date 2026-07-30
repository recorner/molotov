import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { findOrCreateDM } from '$lib/chat.server';

export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();

  const orders = await prisma.order.findMany({
    where: { buyer: { id: user.id } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      status: true,
      cart: {
        select: {
          delivered: true,
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              type: true,
              seller: { select: { username: true, id: true } },
            },
          },
        },
      },
    },
  });

  const shaped = orders.map((o) => ({
    ...o,
    total: o.cart.reduce((s, e) => s + (e.product?.price ?? 0) * e.quantity, 0),
    itemCount: o.cart.reduce((s, e) => s + e.quantity, 0),
  }));

  return { orders: shaped };
};

export const actions: Actions = {
  async messageSeller({ cookies, request }) {
    const me = userFromToken(cookies.get('__token'));
    if (!me?.id) return fail(401, { error: 'unauthorized' });
    const sellerId = Number((await request.formData()).get('sellerId'));
    if (!sellerId || sellerId === me.id) return fail(400, { error: 'invalid' });
    const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { id: true } });
    if (!seller) return fail(404, { error: 'Seller not found.' });
    const id = await findOrCreateDM(me.id, sellerId);
    throw redirect(303, `/chat/${id}`);
  },
};
