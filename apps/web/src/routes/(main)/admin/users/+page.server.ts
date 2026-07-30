import prisma from '$lib/prisma';
import type { PageServerLoad } from './$types';

const PER_PAGE = 10;

export const load: PageServerLoad = async ({ url }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const q = (url.searchParams.get('q') || '').trim();

  const where = q ? { username: { contains: q, mode: 'insensitive' as const } } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        role: true,
        balance: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
    page,
    total,
    q,
    users,
  };
};
