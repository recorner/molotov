import prisma from '$lib/prisma';
import type { PageServerLoad } from './$types';

const ACTIVE = ['PROPOSED', 'ACCEPTED', 'FUNDED', 'DELIVERED', 'DISPUTED'];

export const load: PageServerLoad = async ({ url }) => {
  const filter = url.searchParams.get('filter') || 'active'; // active | disputed | all

  const where =
    filter === 'disputed' ? { status: 'DISPUTED' as const } : filter === 'all' ? {} : { status: { in: ACTIVE as any } };

  const [escrows, all] = await Promise.all([
    prisma.escrow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, publicId: true, title: true, amount: true, fee: true, status: true, isGuest: true, createdAt: true,
        buyerName: true, sellerName: true,
        buyer: { select: { username: true } },
        seller: { select: { username: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.escrow.findMany({ select: { status: true, amount: true, fee: true } }),
  ]);

  const heldStatuses = new Set(['FUNDED', 'DELIVERED', 'DISPUTED']);
  const stats = {
    total: all.length,
    active: all.filter((e) => ACTIVE.includes(e.status)).length,
    disputed: all.filter((e) => e.status === 'DISPUTED').length,
    held: all.filter((e) => heldStatuses.has(e.status)).reduce((s, e) => s + e.amount, 0),
    completed: all.filter((e) => e.status === 'COMPLETED').length,
  };

  const revenueRow = await prisma.settings.findUnique({ where: { key: 'escrow_revenue' }, select: { value: true } });
  const revenue = revenueRow ? parseFloat(revenueRow.value) || 0 : 0;

  return { escrows, stats, revenue, filter };
};
