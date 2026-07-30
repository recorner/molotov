import { json, type RequestHandler } from '@sveltejs/kit';
import { userFromToken } from '$lib/util';
import { telegramNotifications } from '$lib/telegram-notifications';

export const POST: RequestHandler = async ({ cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id || !user.role.includes('ADMIN')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Send test notifications
    await telegramNotifications.notifyPaymentCreated({
      id: 'TEST_PAYMENT_123',
      amount: 50,
      currency: 'btc',
      userId: user.id,
      telegramUsername: 'testuser'
    });

    return json({ success: true, message: 'Test notification sent successfully' });
  } catch (error) {
    console.error('Failed to send test notification:', error);
    return json({ error: 'Failed to send test notification' }, { status: 500 });
  }
};
