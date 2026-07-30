import prisma from './prisma';
import { decryptMessage } from './chat-crypto.server';

export interface ConversationSummary {
  id: number;
  type: string;
  title: string;
  avatar: string | null;
  lastMessageAt: Date;
  preview: string;
  unread: number;
  otherUserId: number | null;
}

/** All conversations the user belongs to, newest activity first, with unread counts + previews. */
export async function listConversations(userId: number): Promise<ConversationSummary[]> {
  const memberships = await prisma.chatMember.findMany({
    where: { userId, conversation: { archived: false } },
    select: {
      lastReadAt: true,
      conversation: {
        select: {
          id: true,
          type: true,
          title: true,
          lastMessageAt: true,
          members: { select: { userId: true, user: { select: { username: true, avatar: true } } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, fileName: true, createdAt: true, senderId: true } },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: 'desc' } },
  });

  const summaries = await Promise.all(
    memberships.map(async (m) => {
      const c = m.conversation;
      const other = c.type === 'dm' ? c.members.find((mm) => mm.userId !== userId)?.user : null;
      const last = c.messages[0];
      const unread = await prisma.chatMessage.count({
        where: {
          conversationId: c.id,
          senderId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      return {
        id: c.id,
        type: c.type,
        title: c.type === 'dm' ? other?.username ?? 'Direct message' : c.title ?? 'Channel',
        avatar: c.type === 'dm' ? other?.avatar ?? null : null,
        lastMessageAt: c.lastMessageAt,
        preview: last ? (last.fileName ? `📎 ${last.fileName}` : decryptMessage(last.body).slice(0, 60)) : 'No messages yet',
        unread,
        otherUserId: c.type === 'dm' ? other?.userId ?? null : null,
      } as ConversationSummary;
    })
  );

  return summaries;
}

/** Find an existing DM between two users, or create one. Returns the conversation id. */
export async function findOrCreateDM(meId: number, otherId: number): Promise<number> {
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'dm',
      AND: [{ members: { some: { userId: meId } } }, { members: { some: { userId: otherId } } }],
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.conversation.create({
    data: {
      type: 'dm',
      createdById: meId,
      members: { create: [{ userId: meId, role: 'owner' }, { userId: otherId, role: 'member' }] },
    },
    select: { id: true },
  });
  return created.id;
}
