import { json, type RequestHandler } from '@sveltejs/kit';
import { userFromToken } from '$lib/util';
import { telegramNotifications } from '$lib/telegram-notifications';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id || !user.role.includes('ADMIN')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const status = telegramNotifications.getConfigStatus();
    return json({ status });
  } catch (error) {
    console.error('Failed to get Telegram status:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
