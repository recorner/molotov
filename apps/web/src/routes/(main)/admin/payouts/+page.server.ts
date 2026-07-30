import prisma from '$lib/prisma';
import { PayoutStatus, Role } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';
import { userFromToken } from '$lib/util';
import { fail } from '@sveltejs/kit';
import { notify } from '$lib/notify.server';

const PER_PAGE = 12;

export const load: PageServerLoad = async ({ url }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const status = url.searchParams.get('status') || 'all';

  const where = status !== 'all' ? { status: status as PayoutStatus } : {};

  const [payouts, total, pendingAgg, paidAgg, counts] = await Promise.all([
    prisma.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        address: true,
        amount: true,
        createdAt: true,
        paidAt: true,
        status: true,
        currency: true,
        guestName: true,
        escrowId: true,
        providerRef: true,
        rejectedReason: true,
        userId: true,
        user: { select: { id: true, username: true } },
      },
    }),
    prisma.payout.count({ where }),
    prisma.payout.aggregate({ _sum: { amount: true }, _count: true, where: { status: PayoutStatus.PENDING } }),
    prisma.payout.aggregate({ _sum: { amount: true }, _count: true, where: { status: PayoutStatus.COMPLETED } }),
    prisma.payout.groupBy({ by: ['status'], _count: true }),
  ]);

  const countOf = (s: PayoutStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return {
    payouts,
    page,
    status,
    pages: Math.ceil(total / PER_PAGE) || 1,
    stats: {
      pendingCount: pendingAgg._count,
      pendingAmount: pendingAgg._sum.amount || 0,
      paidCount: paidAgg._count,
      paidAmount: paidAgg._sum.amount || 0,
      rejectedCount: countOf(PayoutStatus.REJECTED),
    },
  };
};

export const actions: Actions = {
  async approve({ cookies, request }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user || !user.role.includes(Role.ADMIN)) return fail(401, { error: 'unauthorized' });

    const id = Number((await request.formData()).get('id'));
    const payout = await prisma.payout.findUnique({ where: { id }, select: { id: true, userId: true, amount: true, status: true } });
    if (!payout) return fail(404, { error: 'not found' });
    if (payout.status !== PayoutStatus.PENDING) return fail(400, { error: 'already processed' });

    await prisma.payout.update({
      where: { id: payout.id },
      data: { status: PayoutStatus.COMPLETED, paidAt: new Date() },
    });

    if (payout.userId) {
      await notify(payout.userId, 'payout', 'Payout sent', `Your payout of $${payout.amount.toFixed(2)} has been marked as paid.`);
    }

    return { success: true };
  },

  async reject({ cookies, request }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user || !user.role.includes(Role.ADMIN)) return fail(401, { error: 'unauthorized' });

    const body = await request.formData();
    const id = Number(body.get('id'));
    const reason = (body.get('reason') as string)?.trim() || 'Rejected by admin';

    const payout = await prisma.payout.findUnique({ where: { id }, select: { id: true, userId: true, amount: true, status: true } });
    if (!payout) return fail(404, { error: 'not found' });
    if (payout.status !== PayoutStatus.PENDING) return fail(400, { error: 'already processed' });

    // Refund the held balance back to the registered user (guest payouts have no balance to refund).
    await prisma.$transaction(async (tx) => {
      await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.REJECTED, rejectedReason: reason } });
      if (payout.userId) {
        await tx.user.update({ where: { id: payout.userId }, data: { balance: { increment: payout.amount } } });
      }
    });

    if (payout.userId) {
      await notify(payout.userId, 'payout', 'Payout rejected', `Your payout of $${payout.amount.toFixed(2)} was rejected and refunded. Reason: ${reason}`);
    }

    return { success: true };
  },
};
