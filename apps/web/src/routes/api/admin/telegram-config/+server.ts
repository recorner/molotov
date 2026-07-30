import { json, type RequestHandler } from '@sveltejs/kit';
import { userFromToken } from '$lib/util';
import prisma from '$lib/prisma';
import { telegramNotifications } from '$lib/telegram-notifications';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id || !user.role.includes('ADMIN')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get current Telegram configuration
    const settings = await prisma.settings.findMany({
      where: {
        key: {
          in: ['telegram_bot_token', 'telegram_admin_chat_id', 'telegram_group_id']
        }
      }
    });

    const config = {
      botToken: settings.find(s => s.key === 'telegram_bot_token')?.value || '',
      adminChatId: settings.find(s => s.key === 'telegram_admin_chat_id')?.value || '',
      groupId: settings.find(s => s.key === 'telegram_group_id')?.value || ''
    };

    return json({ config });
  } catch (error) {
    console.error('Failed to get Telegram config:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id || !user.role.includes('ADMIN')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { botToken, adminChatId, groupId } = await request.json();

    // Validate inputs
    if (botToken && typeof botToken !== 'string') {
      return json({ error: 'Invalid bot token' }, { status: 400 });
    }

    if (adminChatId && typeof adminChatId !== 'string') {
      return json({ error: 'Invalid admin chat ID' }, { status: 400 });
    }

    if (groupId && typeof groupId !== 'string') {
      return json({ error: 'Invalid group ID' }, { status: 400 });
    }

    // Update configuration
    await telegramNotifications.updateConfig({
      botToken: botToken || undefined,
      adminChatId: adminChatId || undefined,
      adminGroupId: groupId || undefined
    });

    return json({ success: true, message: 'Telegram configuration updated successfully' });
  } catch (error) {
    console.error('Failed to update Telegram config:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
