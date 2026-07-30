import { redirect, type Actions } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import jwt from 'jsonwebtoken';
import prisma from '$lib/prisma';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
  // Public, login-free surfaces: the escrow entry + deal pages.
  // `/` is NOT public here — the home page is the signed-in dashboard and its
  // loader dereferences `user`. (The public landing it was paired with is not
  // part of this deployment.) Everything else requires an account.
  const p = url.pathname;
  const guestAllowed = p === '/escrow' || /^\/escrow\/[A-Za-z0-9]{5,8}$/.test(p);
  const asGuest = () => ({ user: null, categories: [], cart: [] as { id: number; quantity: number }[] });

  // validate jwt
  let data: any;
  try {
    data = jwt.verify(cookies.get('__token'), process.env.JWT_SECRET || '1');
  } catch (e) {
    cookies.delete('__token', { path: '/' });
    if (guestAllowed) return asGuest();
    throw redirect(302, '/auth/login');
  }

  const user = await prisma.user.findUnique({
    where: {
      id: data.id,
    },
    select: {
      id: true,
      username: true,
      balance: true,
      role: true,
      avatar: true,
    },
  });

  const compareArray = (a: any[], b: any[]) => {
    if (a.length !== b.length) return false;
    return a.every((item) => b.includes(item)) && b.every((item) => a.includes(item));
  };

  if (!user || !data || !compareArray(user.role, data.role)) {
    cookies.delete('__token', { path: '/' });
    if (guestAllowed) return asGuest();
    throw redirect(302, '/auth/login');
  }

  // get categories
  const categories = await prisma.category
    .findMany({
      select: {
        id: true,
        name: true,
        order: true,
        image: true,
      },
    })
    .then((categories) => categories.sort((a, b) => a.order - b.order))
    .then((categories) =>
      categories.map((category) => ({
        ...category,
        image: category.image ? `${process.env.UPLOAD_PREFIX}/${category.image}` : null,
      }))
    );

  // Update "last seen" (best-effort) and load notifications for the bell.
  prisma.user.update({ where: { id: user.id }, data: { lastSeen: new Date() } }).catch(() => {});

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, type: true, title: true, body: true, link: true, read: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  const supportRow = await prisma.settings.findUnique({ where: { key: 'telegram_support' }, select: { value: true } });
  const supportHandle = (supportRow?.value || '').trim().replace(/^@/, '');
  const supportUrl = supportHandle ? `https://t.me/${supportHandle}` : '';

  return {
    user,
    categories,
    cart: parseCart(cookies.get('cart')),
    notifications,
    unreadCount,
    supportUrl,
  };
};

function parseCart(raw: string | undefined): { id: number; quantity: number }[] {
  if (!raw) return [];
  try {
    const decoded = raw.startsWith('%') || raw.includes('%7B') ? decodeURIComponent(raw) : raw;
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // corrupted/truncated cart cookie — never 500 the whole app over it
  }
}
