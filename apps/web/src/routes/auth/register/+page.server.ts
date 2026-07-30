import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import argon from 'argon2';
import jwt from 'jsonwebtoken';

const STRONG_PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

export const actions: Actions = {
  async register({ request, cookies }) {
    const body = await request.formData();

    const username = (body.get('username') as string)?.trim();
    const password = body.get('password') as string;
    const confirmPassword = body.get('confirmPassword') as string;
    let telegram = (body.get('telegramUsername') as string)?.trim() || '';
    telegram = telegram.replace(/^@/, '');

    if (!username || !password || !confirmPassword) return fail(400, { error: 'missing' });

    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) return fail(400, { error: 'username' });

    // Telegram handle is mandatory — it's the account-recovery channel.
    if (!/^[a-zA-Z0-9_]{4,32}$/.test(telegram)) return fail(400, { error: 'telegram' });

    if (password !== confirmPassword) return fail(400, { error: 'confirmPassword' });

    // Strong password: 8+ chars, at least one lowercase, one uppercase, one special char.
    if (!STRONG_PW.test(password)) return fail(400, { error: 'password' });

    try {
      const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (existing) return fail(400, { error: 'taken' });

      const newUser = await prisma.user.create({
        data: {
          username,
          password: await argon.hash(password),
          role: ['BUYER'],
          telegram,
        },
        select: { id: true, username: true, role: true },
      });

      // Auto sign-in (no backup-codes step). Recovery is handled via Telegram.
      const token = jwt.sign(
        { id: newUser.id, role: newUser.role, username: newUser.username },
        process.env.JWT_SECRET || '1',
        { expiresIn: '2d' }
      );
      cookies.set('__token', token, {
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 * 2,
        httpOnly: true,
        sameSite: 'lax',
      });
    } catch (error) {
      console.error('Registration error:', error);
      return fail(500, { error: 'server' });
    }

    throw redirect(303, '/');
  },
};
