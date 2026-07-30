import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { PENDING_EXPIRY_MINUTES } from '$lib/txStatus';

export const load: PageServerLoad = async ({ cookies, url }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id) {
    throw redirect(302, '/auth/login');
  }

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  // Lazily expire abandoned, still-pending top-ups (NOWPayments leaves them
  // "waiting" indefinitely). Safe: a late real payment still credits via IPN,
  // which gates on `completed`, not on status.
  await prisma.topUp.updateMany({
    where: {
      userId: user.id,
      completed: false,
      createdAt: { lt: new Date(Date.now() - PENDING_EXPIRY_MINUTES * 60_000) },
      status: { in: ['', 'pending', 'waiting', 'confirming', 'sending', 'partially_paid'] },
    },
    data: { status: 'expired' },
  });

  const [topUps, totalCount] = await Promise.all([
    prisma.topUp.findMany({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
        amount: true,
        reference: true,
        completed: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    }),
    prisma.topUp.count({
      where: {
        userId: user.id,
      },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  return {
    topUps,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};
