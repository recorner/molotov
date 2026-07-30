import { Role } from '@prisma/client';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import { PENDING_EXPIRY_MINUTES } from '$lib/txStatus';

export const load: PageServerLoad = async ({ parent, url }) => {
  const { user } = await parent();

  if (!user || !user.role.includes(Role.ADMIN)) {
    throw redirect(302, '/');
  }

  // Global lazy sweep: expire abandoned, still-pending deposits across all users
  // so the admin view reflects reality (a late real payment still credits via IPN).
  await prisma.topUp.updateMany({
    where: {
      completed: false,
      createdAt: { lt: new Date(Date.now() - PENDING_EXPIRY_MINUTES * 60_000) },
      status: { in: ['', 'pending', 'waiting', 'confirming', 'sending', 'partially_paid'] },
    },
    data: { status: 'expired' },
  });

  // Get query parameters for filtering
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '25');
  const status = url.searchParams.get('status') || 'all';
  const userId = url.searchParams.get('userId') ? parseInt(url.searchParams.get('userId')!) : null;
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const search = url.searchParams.get('search') || '';

  const offset = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  if (status !== 'all') {
    if (status === 'completed') {
      where.completed = true;
    } else if (status === 'pending') {
      where.completed = false;
      where.status = { in: ['pending', 'waiting'] };
    } else {
      where.status = status;
    }
  }

  if (userId) {
    where.userId = userId;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }
  }

  if (search) {
    where.OR = [
      {
        reference: {
          contains: search,
          mode: 'insensitive'
        }
      },
      {
        user: {
          username: {
            contains: search,
            mode: 'insensitive'
          }
        }
      }
    ];
  }

  // Get deposits with user information
  const [deposits, totalCount] = await Promise.all([
    prisma.topUp.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: offset
    }),
    prisma.topUp.count({ where })
  ]);

  // Get summary statistics
  const [totalStats, monthlyStats] = await Promise.all([
    prisma.topUp.aggregate({
      _sum: {
        amount: true
      },
      _count: true,
      where: {
        completed: true
      }
    }),
    prisma.topUp.aggregate({
      _sum: {
        amount: true
      },
      _count: true,
      where: {
        completed: true,
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    })
  ]);

  // Get status breakdown
  const [confirmedCount, pendingCount, failedCount, expiredCount] = await Promise.all([
    prisma.topUp.count({ where: { status: 'confirmed' } }),
    prisma.topUp.count({ where: { status: { in: ['pending', 'waiting'] } } }),
    prisma.topUp.count({ where: { status: 'failed' } }),
    prisma.topUp.count({ where: { status: 'expired' } })
  ]);

  const statusBreakdown = [
    { status: 'confirmed', _count: confirmedCount },
    { status: 'pending', _count: pendingCount },
    { status: 'failed', _count: failedCount },
    { status: 'expired', _count: expiredCount }
  ];

  // Get daily revenue for the last 30 days (for charts)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyRevenue = await prisma.topUp.groupBy({
    by: ['createdAt'],
    _sum: {
      amount: true
    },
    _count: true,
    where: {
      completed: true,
      createdAt: {
        gte: thirtyDaysAgo
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  // Process daily revenue data for charts
  const chartData = dailyRevenue.reduce((acc: any[], item) => {
    const date = item.createdAt.toISOString().split('T')[0];
    const existingEntry = acc.find(entry => entry.date === date);
    
    if (existingEntry) {
      existingEntry.amount += item._sum.amount || 0;
      existingEntry.count += item._count;
    } else {
      acc.push({
        date,
        amount: item._sum.amount || 0,
        count: item._count
      });
    }
    
    return acc;
  }, []);

  const totalPages = Math.ceil(totalCount / limit);

  return {
    deposits,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      limit,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    filters: {
      status,
      userId,
      startDate,
      endDate,
      search
    },
    stats: {
      total: {
        amount: totalStats._sum.amount || 0,
        count: totalStats._count
      },
      monthly: {
        amount: monthlyStats._sum.amount || 0,
        count: monthlyStats._count
      },
      statusBreakdown,
      chartData
    }
  };
};
