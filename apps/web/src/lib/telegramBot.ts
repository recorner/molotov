// Telegram Bot Integration Example
// This demonstrates how the payment system can integrate with Telegram bots

import { paymentEvents } from '$lib/paymentEvents';

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface TelegramUser {
  telegramId: string;
  userId: number;
  username: string;
}

// Mock user mapping - in real implementation, this would come from database
const telegramUsers = new Map<number, TelegramUser>();

class TelegramPaymentBot {
  constructor() {
    this.setupPaymentListeners();
  }

  private setupPaymentListeners() {
    // Listen for payment confirmations
    paymentEvents.subscribe('payment_confirmed', async (event) => {
      const telegramUser = telegramUsers.get(event.userId);
      if (telegramUser) {
        await this.sendMessage(
          telegramUser.telegramId,
          `💰 Payment Confirmed!\n\nAmount: $${event.amount.toFixed(2)}\nYour balance has been updated.\n\nThank you for using our service!`
        );
      }
    });

    // Listen for payment failures
    paymentEvents.subscribe('payment_failed', async (event) => {
      const telegramUser = telegramUsers.get(event.userId);
      if (telegramUser) {
        await this.sendMessage(
          telegramUser.telegramId,
          `❌ Payment Failed\n\nAmount: $${event.amount.toFixed(2)}\nReason: ${event.metadata?.reason || 'Unknown'}\n\nPlease try again or contact support.`
        );
      }
    });
  }

  private async sendMessage(chatId: string, text: string) {
    if (!TELEGRAM_BOT_TOKEN) {
      console.log('Telegram bot not configured, would send:', { chatId, text });
      return;
    }

    try {
      await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
    }
  }

  // Register a user for Telegram notifications
  registerUser(userId: number, telegramId: string, username: string) {
    telegramUsers.set(userId, {
      telegramId,
      userId,
      username,
    });
  }

  // Handle Telegram webhook
  async handleWebhook(update: any) {
    const message = update.message;
    if (!message) return;

    const chatId = message.chat.id.toString();
    const text = message.text;

    if (text === '/start') {
      await this.sendMessage(
        chatId,
        'Welcome to NeoShop! 🛍️\n\nTo receive payment notifications, please link your account using the web interface.'
      );
    } else if (text === '/balance') {
      // This would query the user's balance from the database
      await this.sendMessage(
        chatId,
        'To check your balance, please visit https://untouch.live/balance'
      );
    }
  }
}

// Export singleton instance
export const telegramBot = new TelegramPaymentBot();

// Webhook endpoint handler (example)
export async function handleTelegramWebhook(request: Request) {
  try {
    const update = await request.json();
    await telegramBot.handleWebhook(update);
    return new Response('OK');
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return new Response('Error', { status: 500 });
  }
}
