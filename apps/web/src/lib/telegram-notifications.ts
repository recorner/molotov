// Enhanced Telegram notification service for payment events
import prisma from './prisma';

interface TelegramNotification {
  username: string;
  paymentId: string;
  amount: number;
  currency: string;
}

export class TelegramNotificationService {
  private static instance: TelegramNotificationService;
  private notifications: TelegramNotification[] = [];

  private constructor() {}

  static getInstance(): TelegramNotificationService {
    if (!TelegramNotificationService.instance) {
      TelegramNotificationService.instance = new TelegramNotificationService();
    }
    return TelegramNotificationService.instance;
  }

  private get botToken(): string | undefined {
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  private get adminChatId(): string | undefined {
    return process.env.TELEGRAM_ADMIN_CHAT_ID;
  }

  private get adminGroupId(): string | undefined {
    return process.env.TELEGRAM_ADMIN_GROUP_ID;
  }

  private get isConfigured(): boolean {
    return !!(this.botToken && this.adminChatId);
  }

  /**
   * Send notification when user initiates a payment
   */
  async notifyPaymentCreated(payment: {
    id: string;
    amount: number;
    currency: string;
    userId: number;
    telegramUsername?: string;
    payAddress?: string;
    payAmount?: number;
  }): Promise<void> {
    try {
      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { username: true, telegram: true, telegramId: true }
      });

      if (!user) return;

      const adminMessage = `💰 New Payment Created\n\n` +
        `👤 User: ${user.username}\n` +
        `💵 Amount: $${payment.amount}\n` +
        `🪙 Currency: ${payment.currency.toUpperCase()}\n` +
        `🆔 Payment ID: ${payment.id}\n` +
        `📱 Telegram: ${payment.telegramUsername ? '@' + payment.telegramUsername : 'Not provided'}\n` +
        `${payment.payAddress ? `\n📧 Payment Address (tap to copy):\n\`\`\`\n${payment.payAddress}\n\`\`\`\n` : ''}` +
        `${payment.payAmount ? `💎 Pay Amount: ${payment.payAmount} ${payment.currency.toUpperCase()}\n` : ''}` +
        `\n⏳ Waiting for payment confirmation...`;

      const userMessage = `💰 Payment Created Successfully!\n\n` +
        `💵 Amount: $${payment.amount}\n` +
        `🪙 Currency: ${payment.currency.toUpperCase()}\n` +
        `🆔 Payment ID: ${payment.id}\n` +
        `${payment.payAddress ? `\n📧 Send payment to (tap to copy):\n\`\`\`\n${payment.payAddress}\n\`\`\`\n` : ''}` +
        `${payment.payAmount ? `💎 Send exactly: ${payment.payAmount} ${payment.currency.toUpperCase()}\n` : ''}` +
        `\n⏳ We'll notify you when payment is confirmed!`;

      // Send to admin only (not group)
      await this.sendToAdmin(adminMessage);

      // Send to user if they provided Telegram username
      if (payment.telegramUsername) {
        await this.sendToUser(payment.telegramUsername, userMessage);
        
        // Queue notification for confirmation
        this.queueNotification({
          username: payment.telegramUsername,
          paymentId: payment.id,
          amount: payment.amount,
          currency: payment.currency
        });
      }

      console.log(`🔔 Payment creation notifications sent for payment ${payment.id}`);
    } catch (error) {
      console.error('Failed to send payment creation notifications:', error);
    }
  }

  /**
   * Send message to specific user by username
   */
  private async sendToUserByUsername(username: string, message: string): Promise<void> {
    try {
      // Try to send via bot service first
      await this.sendViaBotService('user', message, username);
    } catch (error) {
      console.error('Failed to send via bot service, falling back to database lookup:', error);
      try {
        // Try to find user's chat ID in database
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { telegram: username },
              { telegram: `@${username}` }
            ]
          },
          select: { telegramId: true }
        });

        if (user?.telegramId) {
          await this.sendTelegramMessage(user.telegramId, message);
        } else {
          console.log(`📱 [USER @${username} - No Chat ID] ${message}`);
        }
      } catch (directError) {
        console.error(`Failed to send message to user @${username}:`, directError);
        console.log(`📱 [USER @${username} FALLBACK] ${message}`);
      }
    }
  }

  /**
   * Send notification when payment is confirmed
   */
  async notifyPaymentConfirmed(payment: {
    id: string;
    amount: number;
    currency: string;
    userId: number;
  }): Promise<void> {
    try {
      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { username: true, telegram: true, telegramId: true, balance: true }
      });

      if (!user) return;

      const adminMessage = `✅ Payment Confirmed!\n\n` +
        `👤 User: ${user.username}\n` +
        `💰 Amount: $${payment.amount}\n` +
        `🪙 Currency: ${payment.currency.toUpperCase()}\n` +
        `🆔 Payment ID: ${payment.id}\n` +
        `💳 New Balance: $${user.balance}\n\n` +
        `🎉 Balance updated successfully!`;

      // Send to admin only (removed group notification)
      await this.sendToAdmin(adminMessage);

      // Send personal notification to user if they have Telegram set up
      await this.sendPaymentConfirmation(payment.id);

      console.log(`🎉 Payment confirmation notifications sent for payment ${payment.id}`);
    } catch (error) {
      console.error('Failed to send payment confirmation notifications:', error);
    }
  }

  /**
   * Send notification when payment fails
   */
  async notifyPaymentFailed(payment: {
    id: string;
    amount: number;
    currency: string;
    userId: number;
    status: string;
    reason?: string;
  }): Promise<void> {
    try {
      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { username: true, telegram: true, telegramId: true }
      });

      if (!user) return;

      const statusEmoji = payment.status === 'failed' ? '❌' : 
                         payment.status === 'expired' ? '⏰' : 
                         payment.status === 'refunded' ? '🔄' : '⚠️';

      const adminMessage = `${statusEmoji} Payment ${payment.status.toUpperCase()}\n\n` +
        `👤 User: ${user.username}\n` +
        `💰 Amount: $${payment.amount}\n` +
        `🪙 Currency: ${payment.currency.toUpperCase()}\n` +
        `🆔 Payment ID: ${payment.id}\n` +
        `📊 Status: ${payment.status.toUpperCase()}\n` +
        `${payment.reason ? `🔍 Reason: ${payment.reason}\n` : ''}` +
        `\n💡 User may need assistance or retry the payment.`;

      // Send to admin only (removed group notification)
      await this.sendToAdmin(adminMessage);

      // Send personal notification to user if they have Telegram set up
      await this.sendPaymentFailure(payment.id, payment.status);

      console.log(`${statusEmoji} Payment failure notifications sent for payment ${payment.id}`);
    } catch (error) {
      console.error('Failed to send payment failure notifications:', error);
    }
  }

  /**
   * Queue a notification for when payment is confirmed
   */
  queueNotification(notification: TelegramNotification): void {
    this.notifications.push(notification);
    console.log(`🔔 Queued Telegram notification for @${notification.username} - Payment ${notification.paymentId}`);
  }

  /**
   * Send notification when payment is confirmed
   */
  async sendPaymentConfirmation(paymentId: string): Promise<void> {
    const notification = this.notifications.find(n => n.paymentId === paymentId);
    
    if (!notification) {
      return;
    }

    try {
      const message = `🎉 Payment Confirmed!\n\n` +
        `💰 Amount: $${notification.amount}\n` +
        `🪙 Currency: ${notification.currency.toUpperCase()}\n` +
        `🆔 Payment ID: ${paymentId}\n\n` +
        `Your balance has been updated! 🚀`;

      // Try to send to user via their Telegram username
      await this.sendToUser(notification.username, message);

      // Remove from queue after successful send
      this.notifications = this.notifications.filter(n => n.paymentId !== paymentId);
      
    } catch (error) {
      console.error(`Failed to send Telegram notification to @${notification.username}:`, error);
    }
  }

  /**
   * Send failure notification to user
   */
  async sendPaymentFailure(paymentId: string, status: string): Promise<void> {
    const notification = this.notifications.find(n => n.paymentId === paymentId);
    
    if (!notification) {
      return;
    }

    try {
      const statusEmoji = status === 'failed' ? '❌' : 
                         status === 'expired' ? '⏰' : 
                         status === 'refunded' ? '🔄' : '⚠️';

      const statusText = status === 'failed' ? 'Failed' :
                        status === 'expired' ? 'Expired' :
                        status === 'refunded' ? 'Refunded' : 'Cancelled';

      const message = `${statusEmoji} Payment ${statusText}\n\n` +
        `💰 Amount: $${notification.amount}\n` +
        `🪙 Currency: ${notification.currency.toUpperCase()}\n` +
        `🆔 Payment ID: ${paymentId}\n\n` +
        `💡 Your payment could not be completed. Please try again or contact support if you need assistance.`;

      // Try to send to user via their Telegram username
      await this.sendToUser(notification.username, message);

      // Remove from queue after sending failure notification
      this.notifications = this.notifications.filter(n => n.paymentId !== paymentId);
      
    } catch (error) {
      console.error(`Failed to send failure notification to @${notification.username}:`, error);
    }
  }

  /**
   * Send message to admin
   */
  private async sendToAdmin(message: string): Promise<void> {
    if (!this.isConfigured) {
      console.log(`📱 [ADMIN] ${message}`);
      return;
    }

    try {
      // Try to send via bot service first
      await this.sendViaBotService('admin', message);
    } catch (error) {
      console.error('Failed to send via bot service, falling back to direct API:', error);
      try {
        await this.sendTelegramMessage(this.adminChatId!, message);
      } catch (directError) {
        console.error('Failed to send message to admin:', directError);
        console.log(`📱 [ADMIN FALLBACK] ${message}`);
      }
    }
  }

  /**
   * Send message to admin group
   */
  private async sendToGroup(message: string): Promise<void> {
    if (!this.botToken || !this.adminGroupId) {
      console.log(`📱 [GROUP] ${message}`);
      return;
    }

    try {
      // Try to send via bot service first
      await this.sendViaBotService('group', message);
    } catch (error) {
      console.error('Failed to send via bot service, falling back to direct API:', error);
      try {
        await this.sendTelegramMessage(this.adminGroupId, message);
      } catch (directError) {
        console.error('Failed to send message to group:', directError);
        console.log(`📱 [GROUP FALLBACK] ${message}`);
      }
    }
  }

  /**
   * Send message to specific user
   */
  private async sendToUser(username: string, message: string): Promise<void> {
    if (!this.botToken) {
      console.log(`📱 [USER @${username}] ${message}`);
      return;
    }

    try {
      // Try to send via bot service first
      await this.sendViaBotService('user', message, username);
    } catch (error) {
      console.error('Failed to send via bot service, falling back to database lookup:', error);
      try {
        // Try to find user's chat ID in database
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { telegram: username },
              { telegram: `@${username}` }
            ]
          },
          select: { telegramId: true }
        });

        if (user?.telegramId) {
          await this.sendTelegramMessage(user.telegramId, message);
        } else {
          console.log(`📱 [USER @${username} - No Chat ID] ${message}`);
        }
      } catch (directError) {
        console.error(`Failed to send message to user @${username}:`, directError);
        console.log(`📱 [USER @${username} FALLBACK] ${message}`);
      }
    }
  }

  /**
   * Send message via Bot Service (if available)
   */
  private async sendViaBotService(type: 'admin' | 'group' | 'user', message: string, username?: string): Promise<void> {
    const botServiceUrl = process.env.BOT_SERVICE_URL || 'http://telegram-bot:3001';
    
    const payload: any = {
      type,
      message
    };

    if (type === 'user' && username) {
      payload.username = username;
    }

    const response = await fetch(`${botServiceUrl}/send-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Bot service error: ${response.statusText}`);
    }
  }

  /**
   * Send message via Telegram Bot API
   */
  private async sendTelegramMessage(chatId: string, message: string): Promise<void> {
    if (!this.botToken) {
      throw new Error('Bot token not configured');
    }

    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`);
    }
  }

  /**
   * Get all pending notifications (for debugging)
   */
  getPendingNotifications(): TelegramNotification[] {
    return [...this.notifications];
  }

  /**
   * Clear all notifications (for testing)
   */
  clearNotifications(): void {
    this.notifications = [];
  }

  /**
   * Get current configuration status
   */
  getConfigStatus(): { configured: boolean; botToken: boolean; adminChat: boolean; adminGroup: boolean } {
    return {
      configured: this.isConfigured,
      botToken: !!this.botToken,
      adminChat: !!this.adminChatId,
      adminGroup: !!this.adminGroupId
    };
  }
}

export const telegramNotifications = TelegramNotificationService.getInstance();
