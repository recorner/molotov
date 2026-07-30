import prisma from './prisma';

const BOT = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Create an in-app notification for a user (and push to Telegram if they've linked it).
 * Best-effort — never throws into the caller.
 */
export async function notify(
  userId: number | null | undefined,
  type: string,
  title: string,
  body = '',
  link?: string
): Promise<void> {
  if (!userId) return;
  try {
    await prisma.notification.create({ data: { userId, type, title, body, link } });
    if (BOT) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
      if (u?.telegramId) {
        fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: u.telegramId, text: `🔔 ${title}\n${body}` }),
        }).catch(() => {});
      }
    }
  } catch {
    /* ignore */
  }
}

/** Fan-out a notification to every user (used for admin announcements). */
export async function notifyAll(type: string, title: string, body = '', link?: string): Promise<void> {
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    if (!users.length) return;
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type, title, body, link })),
    });
  } catch {
    /* ignore */
  }
}
