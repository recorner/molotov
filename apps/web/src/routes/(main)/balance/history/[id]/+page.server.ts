import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isStalePending } from '$lib/txStatus';

export const load: PageServerLoad = async ({ cookies, params }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id) throw redirect(302, '/auth/login');

  const id = Number(params.id);
  if (!Number.isFinite(id)) throw error(404, 'Transaction not found');

  const topUp = await prisma.topUp.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      amount: true,
      reference: true,
      completed: true,
      status: true,
      createdAt: true,
    },
  });

  if (!topUp) throw error(404, 'Transaction not found');

  // Lazily expire an abandoned, still-pending top-up on view.
  if (isStalePending(topUp.status, topUp.completed, topUp.createdAt)) {
    await prisma.topUp.update({ where: { id: topUp.id }, data: { status: 'expired' } });
    topUp.status = 'expired';
  }

  return { topUp };
};
