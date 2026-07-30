import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { encryptMessage, decryptMessage } from '$lib/chat-crypto.server';
import { uploadFile } from '$lib/storage';
import { notify } from '$lib/notify.server';

async function membership(convId: number, userId: number) {
  return prisma.chatMember.findUnique({
    where: { conversationId_userId: { conversationId: convId, userId } },
    select: { id: true, lastReadAt: true, role: true },
  });
}

export const load: PageServerLoad = async ({ params, cookies }) => {
  const me = userFromToken(cookies.get('__token'));
  if (!me?.id) throw error(401, 'Sign in required');

  const id = Number(params.id);
  const conv = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true, type: true, title: true, description: true, isPublic: true,
      members: { select: { userId: true, lastReadAt: true, user: { select: { username: true, avatar: true, lastSeen: true } } } },
    },
  });
  if (!conv) throw error(404, 'Conversation not found');

  let mem = await membership(id, me.id);
  // Auto-join public channels on first open.
  if (!mem) {
    if (conv.type === 'channel' && conv.isPublic) {
      await prisma.chatMember.create({ data: { conversationId: id, userId: me.id } });
      mem = await membership(id, me.id);
    } else {
      throw error(403, 'You’re not a member of this conversation');
    }
  }

  // mark read
  await prisma.chatMember.update({ where: { conversationId_userId: { conversationId: id, userId: me.id } }, data: { lastReadAt: new Date() } });

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { id: true, senderId: true, body: true, fileUrl: true, fileName: true, fileType: true, createdAt: true, sender: { select: { username: true, avatar: true } } },
  });
  const messages = rows.map((m) => ({ ...m, body: decryptMessage(m.body) }));

  const other = conv.type === 'dm' ? conv.members.find((m) => m.userId !== me.id) : null;

  return {
    conversation: {
      id: conv.id,
      type: conv.type,
      title: conv.type === 'dm' ? other?.user.username ?? 'Direct message' : conv.title ?? 'Channel',
      description: conv.description,
      memberCount: conv.members.length,
    },
    messages,
    meId: me.id,
    other: other
      ? { userId: other.userId, username: other.user.username, avatar: other.user.avatar, lastSeen: other.user.lastSeen, lastReadAt: other.lastReadAt }
      : null,
  };
};

export const actions: Actions = {
  async send({ params, cookies, request }) {
    const me = userFromToken(cookies.get('__token'));
    if (!me?.id) return fail(401, { error: 'unauthorized' });
    const id = Number(params.id);
    const mem = await membership(id, me.id);
    if (!mem) return fail(403, { error: 'Not a member.' });

    const body = await request.formData();
    const text = ((body.get('body') as string) || '').trim();
    const file = body.get('file');

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let fileType: string | null = null;

    if (file && typeof file !== 'string' && file.size > 0) {
      const res = await uploadFile(file);
      if (!res) return fail(503, { error: 'File storage not configured.' });
      if ('error' in res) return fail(400, { error: res.error === 'too_large' ? 'File exceeds 25 MB.' : 'Upload failed.' });
      fileUrl = res.url;
      fileName = res.name;
      fileType = res.type;
    }

    if (!text && !fileUrl) return fail(400, { error: 'empty' });

    await prisma.$transaction([
      prisma.chatMessage.create({
        data: { conversationId: id, senderId: me.id, body: text ? encryptMessage(text) : '', fileUrl, fileName, fileType },
      }),
      prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } }),
      prisma.chatMember.update({ where: { conversationId_userId: { conversationId: id, userId: me.id } }, data: { lastReadAt: new Date() } }),
    ]);

    // Notify the other DM member (channels would be too noisy to notify per-message).
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { type: true, members: { where: { userId: { not: me.id } }, select: { userId: true } } },
    });
    if (conv?.type === 'dm' && conv.members[0]) {
      const preview = fileName ? `📎 ${fileName}` : text.slice(0, 80);
      await notify(conv.members[0].userId, 'message', `New message from ${me.username}`, preview, `/chat/${id}`);
    }

    return { success: true, sent: true };
  },

  async leave({ params, cookies }) {
    const me = userFromToken(cookies.get('__token'));
    if (!me?.id) return fail(401, { error: 'unauthorized' });
    const id = Number(params.id);
    await prisma.chatMember.deleteMany({ where: { conversationId: id, userId: me.id } });
    return { success: true, left: true };
  },
};
