// Smart message management to prevent image spam and handle editing properly
import { safeEditMessage } from './safeMessageEdit.js';
import messageTranslator from './messageTranslator.js';
import logger from './logger.js';

class SmartMessageManager {
  constructor() {
    // Track last message type for each chat to optimize image usage
    this.lastMessageTypes = new Map(); // chatId -> { type: 'photo'|'text', messageId: number, timestamp: number }
    
    // Track banner usage to prevent spam
    this.bannerUsage = new Map(); // chatId -> timestamp[]
    
    // Banner cooldown (minimum time between banners for same user)
    this.BANNER_COOLDOWN = 30000; // 30 seconds
    this.MAX_BANNERS_PER_HOUR = 10; // Max banners per hour per user
  }

  /**
   * Smart message sending that decides whether to use banner or text
   * @param {Object} bot - Telegram bot instance
   * @param {number} chatId - Chat ID
   * @param {number|null} messageId - Message ID to edit (null for new message)
   * @param {string} text - Message text
   * @param {Object} options - Message options
   * @param {boolean} forceBanner - Force banner usage (for important messages)
   */
  async sendOrEditSmart(bot, chatId, messageId, text, options = {}, forceBanner = false) {
    try {
      const lastMessage = this.lastMessageTypes.get(chatId);
      const shouldUseBanner = this.shouldUseBanner(chatId, forceBanner);
      
      // If editing existing message
      if (messageId) {
        // Try safe editing first (handles photo->text conflicts automatically)
        await safeEditMessage(bot, chatId, messageId, text, options);
        
        // Update tracking
        this.lastMessageTypes.set(chatId, {
          type: 'text',
          messageId: messageId,
          timestamp: Date.now()
        });
        
        return;
      }
      
      // For new messages, decide smart usage
      if (shouldUseBanner && (forceBanner || this.isImportantMessage(text))) {
        // Send with banner
        const result = await messageTranslator.sendBannerWithMessage(bot, chatId, text, options);
        
        // Track banner usage
        this.trackBannerUsage(chatId);
        this.lastMessageTypes.set(chatId, {
          type: 'photo',
          messageId: result.message_id,
          timestamp: Date.now()
        });
        
        return result;
      } else {
        // Send regular text message
        const result = await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          ...options
        });
        
        this.lastMessageTypes.set(chatId, {
          type: 'text',
          messageId: result.message_id,
          timestamp: Date.now()
        });
        
        return result;
      }
    } catch (error) {
      logger.error('SMART_MESSAGE', `Failed to send/edit message for chat ${chatId}`, error);
      throw error;
    }
  }

  /**
   * Determine if banner should be used
   */
  shouldUseBanner(chatId, forceBanner = false) {
    if (forceBanner) return true;
    
    const usage = this.bannerUsage.get(chatId) || [];
    const now = Date.now();
    
    // Remove old usage records (older than 1 hour)
    const recentUsage = usage.filter(timestamp => now - timestamp < 3600000);
    this.bannerUsage.set(chatId, recentUsage);
    
    // Check cooldown
    if (recentUsage.length > 0) {
      const lastBanner = Math.max(...recentUsage);
      if (now - lastBanner < this.BANNER_COOLDOWN) {
        return false; // Still in cooldown
      }
    }
    
    // Check hourly limit
    if (recentUsage.length >= this.MAX_BANNERS_PER_HOUR) {
      return false; // Hit hourly limit
    }
    
    return true;
  }

  /**
   * Track banner usage
   */
  trackBannerUsage(chatId) {
    const usage = this.bannerUsage.get(chatId) || [];
    usage.push(Date.now());
    this.bannerUsage.set(chatId, usage);
  }

  /**
   * Determine if message is important enough for banner
   */
  isImportantMessage(text) {
    const importantKeywords = [
      'welcome', 'order', 'payment', 'admin', 'categories', 'products',
      'buy', 'purchase', 'confirm', 'error', 'success', 'completed'
    ];
    
    const lowerText = text.toLowerCase();
    return importantKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Force banner for next message (for important flows)
   */
  forceBannerNext(chatId) {
    // Reset cooldown for this user to allow immediate banner
    const usage = this.bannerUsage.get(chatId) || [];
    // Remove recent usage to bypass cooldown
    const filteredUsage = usage.filter(timestamp => Date.now() - timestamp > this.BANNER_COOLDOWN);
    this.bannerUsage.set(chatId, filteredUsage);
  }

  /**
   * Get last message info for a chat
   */
  getLastMessageInfo(chatId) {
    return this.lastMessageTypes.get(chatId);
  }

  /**
   * Clean up old tracking data
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    // Clean up message type tracking
    for (const [chatId, data] of this.lastMessageTypes.entries()) {
      if (now - data.timestamp > maxAge) {
        this.lastMessageTypes.delete(chatId);
      }
    }
    
    // Clean up banner usage tracking
    for (const [chatId, usage] of this.bannerUsage.entries()) {
      const recentUsage = usage.filter(timestamp => now - timestamp < 3600000);
      if (recentUsage.length === 0) {
        this.bannerUsage.delete(chatId);
      } else {
        this.bannerUsage.set(chatId, recentUsage);
      }
    }
  }
}

// Create singleton instance
const smartMessageManager = new SmartMessageManager();

// Cleanup old data every hour
setInterval(() => {
  smartMessageManager.cleanup();
}, 3600000);

export default smartMessageManager;