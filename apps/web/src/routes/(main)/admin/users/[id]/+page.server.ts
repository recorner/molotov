import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { Role } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import argon from 'argon2';

export const load: PageServerLoad = async ({ params }) => {
  const user = await prisma.user.findUnique({
    where: {
      id: Number(params.id),
    },
    select: {
      id: true,
      username: true,
      role: true,
      balance: true,
      createdAt: true,
      topUps: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
        select: {
          amount: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          orders: true,
          topUps: true,
        },
      },
    },
  });

  if (!user) throw error(404, 'User not found');

  return {
    selected: user,
    roles: Object.values(Role),
  };
};

export const actions: Actions = {
  async updatePassword({ params, request, cookies }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user || !user.role.includes(Role.ADMIN)) throw fail(401, { error: 'unauthorized' });

    const body = await request.formData();

    const password = body.get('password') as string;
    const confirm = body.get('confirm') as string;
    if (!password || !confirm) throw fail(400, { error: 'bad request' });
    if (password !== confirm) throw fail(400, { error: 'mismatch' });

    const hash = await argon.hash(password);
    await prisma.user.update({
      where: {
        id: Number(params.id),
      },
      data: {
        password: hash,
      },
    });

    return { success: true };
  },
  async adjustBalance({ params, request, cookies }) {
    const admin = userFromToken(cookies.get('__token'));
    if (!admin || !admin.role.includes(Role.ADMIN)) return fail(401, { error: 'unauthorized' });

    const body = await request.formData();
    const amount = Number(body.get('amount'));
    const mode = (body.get('mode') as string) || 'add'; // 'add' | 'set'

    if (!Number.isFinite(amount)) return fail(400, { error: 'invalid amount' });

    const target = await prisma.user.findUnique({
      where: { id: Number(params.id) },
      select: { balance: true },
    });
    if (!target) return fail(404, { error: 'user not found' });

    const newBalance = mode === 'set' ? amount : target.balance + amount;
    if (newBalance < 0) return fail(400, { error: 'negative' });

    const updated = await prisma.user.update({
      where: { id: Number(params.id) },
      data: { balance: newBalance },
      select: { balance: true },
    });

    return { success: true, balance: updated.balance };
  },
  async updateRoles({ params, request, cookies }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user || !user.role.includes(Role.ADMIN)) throw fail(401, { error: 'unauthorized' });

    const body = await request.formData();

    const roles = body.getAll('roles');

    await prisma.user.update({
      where: {
        id: Number(params.id),
      },
      data: {
        role: {
          set: roles as Role[],
        },
      },
    });

    return { success: true };
  },
};
