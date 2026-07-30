import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { Role } from '@prisma/client';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const channels = await prisma.conversation.findMany({
    where: { type: 'channel' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, description: true, isPublic: true, archived: true, createdAt: true,
      _count: { select: { members: true, messages: true } },
    },
  });
  return { channels };
};

export const actions: Actions = {
  async createChannel({ cookies, request }) {
    const me = userFromToken(cookies.get('__token'));
    if (!me?.id || !me.role.includes(Role.ADMIN)) return fail(403, { error: 'Admins only.' });

    const body = await request.formData();
    const title = (body.get('title') as string)?.trim();
    const description = ((body.get('description') as string) || '').trim();
    const isPublic = body.get('isPublic') === 'on' || body.get('isPublic') === 'true';
    const memberList = ((body.get('members') as string) || '')
      .split(/[,\s]+/)
      .map((s) => s.trim().replace(/^@/, ''))
      .filter(Boolean);

    if (!title || title.length > 60) return fail(400, { error: 'Enter a channel name (max 60 chars).' });

    const memberUsers =
      memberList.length > 0
        ? await prisma.user.findMany({ where: { username: { in: memberList } }, select: { id: true } })
        : [];

    const memberIds = new Set<number>([me.id, ...memberUsers.map((u) => u.id)]);

    await prisma.conversation.create({
      data: {
        type: 'channel',
        title,
        description,
        isPublic,
        createdById: me.id,
        members: { create: Array.from(memberIds).map((uid) => ({ userId: uid, role: uid === me.id ? 'owner' : 'member' })) },
      },
    });

    return { success: true };
  },

  async addMembers({ cookies, request }) {
    const me = userFromToken(cookies.get('__token'));
    if (!me?.id || !me.role.includes(Role.ADMIN)) return fail(403, { error: 'Admins only.' });
    const body = await request.formData();
    const conversationId = Number(body.get('conversationId'));
    const usernames = ((body.get('members') as string) || '').split(/[,\s]+/).map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
    if (!conversationId || usernames.length === 0) return fail(400, { error: 'Enter usernames.' });
    const users = await prisma.user.findMany({ where: { username: { in: usernames } }, select: { id: true } });
    for (const u of users) {
      await prisma.chatMember.upsert({
        where: { conversationId_userId: { conversationId, userId: u.id } },
        create: { conversationId, userId: u.id },
        update: {},
      });
    }
    return { success: true };
  },

  async archive({ cookies, request }) {
    const me = userFromToken(cookies.get('__token'));
    if (!me?.id || !me.role.includes(Role.ADMIN)) return fail(403, { error: 'Admins only.' });
    const id = Number((await request.formData()).get('id'));
    const conv = await prisma.conversation.findUnique({ where: { id }, select: { archived: true } });
    await prisma.conversation.update({ where: { id }, data: { archived: !conv?.archived } });
    return { success: true };
  },
};
