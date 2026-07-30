import { Role } from '@prisma/client';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import prisma from '$lib/prisma';

export const load: PageServerLoad = async ({ parent, params }) => {
  const { user } = await parent();
  if (!user || !user.role.includes(Role.ADMIN)) throw redirect(302, '/');

  const id = Number(params.id);
  if (!Number.isFinite(id)) throw error(404, 'Deposit not found');

  const deposit = await prisma.topUp.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          balance: true,
          createdAt: true,
          role: true,
        },
      },
    },
  });

  if (!deposit) throw error(404, 'Deposit not found');

  // A few quick stats about this depositor for context.
  const [userTotal, userCount] = await Promise.all([
    prisma.topUp.aggregate({ _sum: { amount: true }, where: { userId: deposit.userId, completed: true } }),
    prisma.topUp.count({ where: { userId: deposit.userId } }),
  ]);

  return {
    deposit,
    depositor: {
      lifetimeDeposited: userTotal._sum.amount || 0,
      depositCount: userCount,
    },
  };
};
