import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import argon from 'argon2';
import twofactor from 'node-2fa';

export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();

  const twoFactorEnabled = await prisma.user
    .findUnique({
      where: {
        id: user.id,
      },
      select: {
        twoFactorSecret: true,
      },
    })
    .then((user) => user?.twoFactorSecret != null);

  return {
    twoFactorEnabled,
  };
};

export const actions: Actions = {
  async updatePassword({ request, cookies }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user) return fail(401, { error: 'unauthorized' });

    const body = await request.formData();
    const password = body.get('current') as string;
    const newPassword = body.get('new') as string;
    const newPasswordConfirm = body.get('confirm') as string;

    if (!password || !newPassword || !newPasswordConfirm) return fail(400, { error: 'missing' });

    if (newPassword != newPasswordConfirm) return fail(400, { error: 'confirm' });

    const currentHash = await prisma.user
      .findUnique({
        where: {
          id: user.id,
        },
        select: {
          password: true,
        },
      })
      .then((user) => user?.password);
    if (!currentHash) return fail(500, { error: 'internal' });

    const valid = await argon.verify(currentHash, password);
    if (!valid) return fail(400, { error: 'password' });

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: await argon.hash(newPassword),
      },
    });

    return { success: true };
  },
  async disable2FA({ cookies }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user) return fail(401, { error: 'unauthorized' });

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        twoFactorSecret: null,
      },
    });

    return { success: true };
  },
  async enable2FA({ cookies, request }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user) return fail(401, { error: 'unauthorized' });

    const body = await request.formData();
    const secret = body.get('secret') as string;
    const code = body.get('code') as string;

    if (!secret || !code) return fail(400, { error: 'missing' });

    const valid = twofactor.verifyToken(secret, code);
    if (!valid || valid.delta != 0) return fail(400, { error: 'code' });

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        twoFactorSecret: secret,
      },
    });

    return { success: true };
  },
};
