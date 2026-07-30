import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
  const me = userFromToken(cookies.get('__token'));
  if (!me?.id) throw redirect(302, '/auth/login');

  const channels = await prisma.conversation.findMany({
    where: { type: 'channel', archived: false, isPublic: true },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      _count: { select: { members: true } },
      members: { where: { userId: me.id }, select: { id: true } },
    },
  });

  return {
    channels: channels.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      memberCount: c._count.members,
      joined: c.members.length > 0,
    })),
  };
};
