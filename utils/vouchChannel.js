// utils/vouchChannel.js
import { VOUCH_CHANNEL } from '../config.js';
import logger from './logger.js';

/**
 * Auto Vouch Channel Manager
 * Posts clean success messages when orders are completed
 * Uses real customer names for authentic social proof
 */
class VouchChannelManager {
  constructor() {
    this.channelId = VOUCH_CHANNEL;
  }

  /**
   * Post a successful order completion to the vouch channel
   * @param {Object} bot - Telegram bot instance
   * @param {Object} orderData - Order completion data
   */
  async postOrderSuccess(bot, orderData) {
    if (!this.channelId) {
      logger.warn('VOUCH', 'Vouch channel not configured - skipping vouch post');
      return;
    }

    try {
      const {
        orderId,
        productName,
        price,
        currency,
        customerName,
        deliveryType,
        completedAt
      } = orderData;

      // Create clean, professional vouch message
      const vouchMessage = this.formatVouchMessage({
        orderId,
        productName,
        price,
        currency,
        customerName,
        deliveryType,
        completedAt
      });

      // Send to vouch channel
      await bot.sendMessage(this.channelId, vouchMessage, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

      logger.info('VOUCH', `Successfully posted order #${orderId} to vouch channel`);

    } catch (error) {
      logger.error('VOUCH', 'Failed to post to vouch channel', error);
      
      // Don't throw error - vouch posting shouldn't break the main flow
      console.error('[VOUCH ERROR]', error.message);
    }
  }

  /**
   * Format the vouch message with clean, professional styling
   * @param {Object} data - Order data
   * @returns {string} Formatted message
   */
  formatVouchMessage(data) {
    const {
      orderId,
      productName,
      price,
      currency,
      customerName,
      deliveryType,
      completedAt
    } = data;

    // Get appropriate emojis based on content type
    const deliveryEmoji = this.getDeliveryEmoji(deliveryType);
    const currencyEmoji = currency === 'BTC' ? '₿' : currency === 'LTC' ? '🪙' : '💰';

    return `✅ **Order Completed Successfully**\n\n` +
           `🧾 **Order ID:** #${orderId}\n` +
           `🛍️ **Product:** ${productName}\n` +
           `💰 **Amount:** $${price} ${currencyEmoji}${currency}\n` +
           `👤 **Customer:** ${customerName}\n` +
           `${deliveryEmoji} **Delivery:** ${deliveryType}\n` +
           `🕒 **Completed:** ${completedAt}\n\n` +
           `━━━━━━━━━━━━━━━━━━━━━\n` +
           `🎉 **Another satisfied customer!**\n` +
           `⚡ **Fast & Secure Delivery**\n` +
           `🔐 **Trusted Marketplace**`;
  }

  /**
   * Get appropriate emoji for delivery type
   * @param {string} deliveryType 
   * @returns {string} Emoji
   */
  getDeliveryEmoji(deliveryType) {
    switch (deliveryType?.toLowerCase()) {
      case 'file':
      case 'document':
        return '📄';
      case 'image':
      case 'photo':
        return '🖼️';
      case 'video':
        return '🎥';
      case 'text':
        return '📝';
      default:
        return '📦';
    }
  }

  /**
   * Post a test message to verify channel configuration
   * @param {Object} bot - Telegram bot instance
   * @returns {boolean} Success status
   */
  async testChannelAccess(bot) {
    if (!this.channelId) {
      logger.warn('VOUCH', 'Vouch channel not configured');
      return false;
    }

    try {
      const testMessage = `🧪 **Vouch Channel Test**\n\n` +
                         `✅ Bot has access to this channel\n` +
                         `🕒 Test Time: ${new Date().toLocaleString()}\n\n` +
                         `📝 **Sample Vouch Message:**\n` +
                         `✅ Order Completed Successfully\n` +
                         `🧾 Order ID: #TEST\n` +
                         `🛍️ Product: Test Product\n` +
                         `💰 Amount: $0.01 ₿BTC\n` +
                         `👤 Customer: Test User\n` +
                         `📄 Delivery: Test\n` +
                         `🕒 Completed: ${new Date().toLocaleString()}\n\n` +
                         `━━━━━━━━━━━━━━━━━━━━━\n` +
                         `This message confirms the vouch channel is working correctly.`;

      await bot.sendMessage(this.channelId, testMessage, {
        parse_mode: 'Markdown'
      });

      logger.info('VOUCH', 'Vouch channel test successful');
      return true;

    } catch (error) {
      logger.error('VOUCH', 'Vouch channel test failed', error);
      return false;
    }
  }

  /**
   * Get channel configuration status
   * @returns {Object} Channel status
   */
  getChannelStatus() {
    return {
      configured: !!this.channelId,
      channelId: this.channelId,
      enabled: !!this.channelId
    };
  }
}

// Export singleton instance
const vouchChannelManager = new VouchChannelManager();
export default vouchChannelManager;
