import { json, type RequestHandler } from '@sveltejs/kit';
import { userFromToken } from '$lib/util';
import prisma from '$lib/prisma';

/** Poll endpoint: latest notifications + unread count. */
export const GET: RequestHandler = async ({ cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id) return json({ error: 'unauthorized' }, { status: 401 });
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, type: true, title: true, body: true, link: true, read: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);
  return json({ items, unread }, { headers: { 'cache-control': 'no-store' } });
};

/** Mark notifications read. Body { id } marks one; empty body marks all. */
export const POST: RequestHandler = async ({ cookies, request }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id) return json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await request.json().catch(() => ({ id: undefined }));

  if (id) {
    await prisma.notification.updateMany({ where: { id: Number(id), userId: user.id }, data: { read: true } });
  } else {
    await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  }
  return json({ ok: true });
};

/** Clear (delete) notifications. Body { id } deletes one; empty deletes all for the user. */
export const DELETE: RequestHandler = async ({ cookies, request }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id) return json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await request.json().catch(() => ({ id: undefined }));
  if (id) {
    await prisma.notification.deleteMany({ where: { id: Number(id), userId: user.id } });
  } else {
    await prisma.notification.deleteMany({ where: { userId: user.id } });
  }
  return json({ ok: true });
};
