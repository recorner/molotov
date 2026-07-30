import prisma from '$lib/prisma';
import { ProductTags } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';
import { userFromToken } from '$lib/util';
import { fail } from '@sveltejs/kit';
import { notify } from '$lib/notify.server';

export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const products = await prisma.product.findMany({
    where: {
      seller: { id: user.id },
      NOT: { tags: { has: ProductTags.DELETED } },
    },
    select: {
      id: true,
      name: true,
      price: true,
      cartEntries: {
        select: { quantity: true, createdAt: true },
      },
    },
  });

  // Per-product roll-ups (lifetime + last 7 days).
  const perProduct = products.map((p) => {
    let units = 0;
    let revenue = 0;
    let units7d = 0;
    let revenue7d = 0;
    for (const e of p.cartEntries) {
      units += e.quantity;
      revenue += e.quantity * p.price;
      if (new Date(e.createdAt) >= weekAgo) {
        units7d += e.quantity;
        revenue7d += e.quantity * p.price;
      }
    }
    return { id: p.id, name: p.name, price: p.price, units, revenue, units7d, revenue7d };
  });

  const unitsLifetime = perProduct.reduce((a, p) => a + p.units, 0);
  const revenueLifetime = perProduct.reduce((a, p) => a + p.revenue, 0);
  const sales = perProduct.reduce((a, p) => a + p.units7d, 0); // 7-day units (kept name)
  const revenue7d = perProduct.reduce((a, p) => a + p.revenue7d, 0);

  const salesByProduct = perProduct
    .filter((p) => p.units7d > 0)
    .map((p) => ({ name: p.name, value: p.units7d, revenue: p.revenue7d }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Sales per day for the last 7 days (normalized so every day appears).
  const allSales = await prisma.cartEntry.findMany({
    where: {
      product: { seller: { id: user.id } },
      createdAt: { gte: weekAgo },
    },
    select: { createdAt: true, quantity: true },
  });

  const salesPerDay: { date: string; label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toLocaleDateString('en-GB');
    const value = allSales
      .filter((e) => new Date(e.createdAt).toLocaleDateString('en-GB') === key)
      .reduce((a, e) => a + e.quantity, 0);
    salesPerDay.push({ date: key, label: d.toLocaleDateString('en-US', { weekday: 'short' }), value });
  }

  const pendingPayout = await prisma.payout.aggregate({
    _sum: { amount: true },
    _count: true,
    where: { userId: user.id, status: 'PENDING' },
  });

  return {
    sales,
    revenue7d,
    unitsLifetime,
    revenueLifetime,
    productCount: products.length,
    salesByProduct,
    salesPerDay,
    pendingPayout: { amount: pendingPayout._sum.amount || 0, count: pendingPayout._count },
  };
};

export const actions: Actions = {
  async payout({ cookies, request }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user) return fail(401, { error: 'unauthorized' });

    const body = await request.formData();
    const amount = Number(body.get('amount'));

    // ^[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93}$
    const address = body.get('address') as string;
    if (!address || !/^[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93}$/.test(address)) return fail(400, { error: 'address' });

    const seller = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        balance: true,
      },
    });

    if (!seller || seller.balance < amount) return fail(400, { error: 'insufficient' });

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        balance: {
          decrement: amount,
        },
      },
    });

    const payout = await prisma.payout.create({
      data: {
        address,
        amount,
        user: {
          connect: {
            id: user.id,
          },
        },
      },
    });

    if (!payout) return fail(500, { error: 'internal' });

    await notify(user.id, 'payout', 'Payout requested', `Your payout of $${amount.toFixed(2)} is being processed.`, '/balance/history');

    return { success: true };
  },
  async contact({ cookies, request }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user) return fail(401, { error: 'unauthorized' });

    const body = await request.formData();
    let telegram = body.get('telegram') as string;
    if (!telegram) return fail(400, { error: 'missing' });

    if (telegram[0] === '@') telegram = telegram.slice(1);

    const contact = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        telegram,
      },
    });

    if (!contact) return fail(500, { error: 'internal' });

    return { success: true };
  },
};
