import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userFromToken } from '$lib/util';
import prisma from '$lib/prisma';
import { telegramNotifications } from '$lib/telegram-notifications';
import { NOWPAYMENTS_API_URL, POPULAR_CURRENCIES } from '$lib/nowpayments';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(`${NOWPAYMENTS_API_URL}/v1/currencies`, {
      headers: {
        'x-api-key': process.env.NOWPAYMENTS_API_KEY!,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch currencies');
    }

    const data = await response.json();
    const all: string[] = (data.currencies || []).map((c: string) => c.toLowerCase());

    // Pin known-popular coins to the top (only those actually enabled on the account),
    // followed by the rest alphabetically — the client picker is searchable over all.
    const available = new Set(all);
    const popular = POPULAR_CURRENCIES.filter((c) => available.has(c));
    const rest = all.filter((c) => !popular.includes(c)).sort();

    return json({ currencies: [...popular, ...rest], popular });
  } catch (error) {
    console.error('Error fetching currencies:', error);
    // Graceful fallback so the user can still pay with the major coins.
    return json({ currencies: POPULAR_CURRENCIES, popular: POPULAR_CURRENCIES, fallback: true });
  }
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { amount, currency, telegramUsername } = await request.json();

    // Validate input
    if (!amount || amount < 10 || amount > 100000) {
      return json({ error: 'Invalid amount. Must be between $10 and $100,000' }, { status: 400 });
    }

    if (!currency || typeof currency !== 'string') {
      return json({ error: 'Invalid currency' }, { status: 400 });
    }

    // Validate Telegram username format if provided
    if (telegramUsername && typeof telegramUsername === 'string') {
      const cleanUsername = telegramUsername.trim().replace(/^@/, '');
      if (cleanUsername && !/^[a-zA-Z0-9_]{5,32}$/.test(cleanUsername)) {
        return json({ error: 'Invalid Telegram username format' }, { status: 400 });
      }
    }

    // Create payment with NowPayments
    const paymentResponse = await fetch(`${NOWPAYMENTS_API_URL}/v1/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.NOWPAYMENTS_API_KEY!,
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: 'USD',
        pay_currency: currency.toLowerCase(),
        ipn_callback_url: process.env.PAYMENT_CALLBACK_URL,
        order_id: `topup_${user.id}_${Date.now()}`,
        order_description: `Balance top-up for user ${user.username}`,
      }),
    });

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json().catch(() => ({}));
      console.error('NowPayments API Error:', errorData);
      // Surface the real reason (e.g. "Amount is too small" / min-amount) to the user.
      const message =
        errorData?.message ||
        errorData?.error ||
        'Could not create the payment. Try a larger amount or a different coin.';
      return json({ error: message }, { status: 400 });
    }

    const paymentData = await paymentResponse.json();

    // Create topUp record in database
    const topUp = await prisma.topUp.create({
      data: {
        amount: parseFloat(amount),
        reference: paymentData.payment_id.toString(),
        userId: user.id,
        status: 'pending', // Explicitly set initial status
      },
    });

    // Log Telegram notification if username provided
    const cleanTelegramUsername = telegramUsername ? telegramUsername.trim().replace(/^@/, '') : null;
    
    // Send systematic notifications
    await telegramNotifications.notifyPaymentCreated({
      id: paymentData.payment_id.toString(),
      amount: parseFloat(amount),
      currency: currency.toLowerCase(),
      userId: user.id,
      telegramUsername: cleanTelegramUsername || undefined,
      payAddress: paymentData.pay_address,
      payAmount: paymentData.pay_amount
    });

    if (cleanTelegramUsername) {
      console.log(`Payment ${paymentData.payment_id} created with Telegram notification for @${cleanTelegramUsername}`);
    }

    return json({
      success: true,
      payment: {
        id: paymentData.payment_id,
        amount: paymentData.price_amount,
        currency: paymentData.price_currency,
        pay_amount: paymentData.pay_amount,
        pay_currency: paymentData.pay_currency,
        pay_address: paymentData.pay_address,
        payment_status: paymentData.payment_status,
        created_at: paymentData.created_at,
        order_id: paymentData.order_id,
      },
      topUpId: topUp.id,
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
