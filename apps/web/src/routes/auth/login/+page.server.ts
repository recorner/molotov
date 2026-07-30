import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import argon from 'argon2';
import jwt from 'jsonwebtoken';
import n2fa from 'node-2fa';
import { notify } from '$lib/notify.server';

export const actions: Actions = {
  async login({ cookies, request }) {
    const body = await request.formData();

    const username = body.get('username');
    const password = body.get('password');
    const dest = (body.get('redirect') as string) || '/';
    const safeDest = dest.startsWith('/') && !dest.startsWith('//') ? dest : '/';

    if (typeof username !== 'string' || !RegExp('[a-zA-Z0-9_]{3,16}').test(username)) {
      return fail(400, { error: 'credentials' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return fail(400, { error: 'credentials' });
    }

    const user = await prisma.user.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        twoFactorSecret: true,
      },
    });

    if (!user || !(await argon.verify(user.password, password))) {
      return fail(400, { error: 'credentials' });
    }

    if (user.twoFactorSecret) {
      cookies.set(
        '2fa',
        jwt.sign(
          {
            toAuthenticate: user.id,
          },
          process.env.JWT_SECRET || '1',
          {
            expiresIn: '5m',
          }
        ),
        {
          path: '/',
          maxAge: 1000 * 60 * 5,
          httpOnly: true,
          sameSite: 'lax',
        }
      );
      return fail(400, { error: '2fa' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        username: user.username,
      },
      process.env.JWT_SECRET || '1',
      {
        expiresIn: '2d',
      }
    );

    cookies.set('__token', token, {
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 2,
      httpOnly: true,
      sameSite: 'lax',
    });

    await notify(user.id, 'login', 'New sign-in to Sereni', 'Your account was just accessed. If this wasn’t you, change your password.', '/account');
    throw redirect(302, safeDest);
  },

  async twofactor({ cookies, request }) {
    if (!cookies.get('2fa')) return fail(400, { error: 'credentials' });

    const body = await request.formData();
    const code = body.get('code');

    if (typeof code !== 'string' || !RegExp('[0-9]{6}').test(code)) return fail(400, { error: 'code' });

    let data: any;
    try {
      data = jwt.verify(cookies.get('2fa'), process.env.JWT_SECRET || '1');
    } catch (e) {
      return fail(400, { error: 'credentials' });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: data.toAuthenticate,
      },
      select: {
        id: true,
        username: true,
        twoFactorSecret: true,
        role: true,
      },
    });
    if (!user || !user.twoFactorSecret) return fail(400, { error: 'credentials' });

    const verification = n2fa.verifyToken(user.twoFactorSecret, code);
    if (!verification || verification.delta !== 0) return fail(400, { error: 'code' });

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        username: user.username,
      },
      process.env.JWT_SECRET || '1',
      {
        expiresIn: '2d',
      }
    );

    cookies.set('__token', token, {
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 2,
      httpOnly: true,
      sameSite: 'lax',
    });

    cookies.delete('2fa', { path: '/' });

    throw redirect(302, '/');
  },
};
