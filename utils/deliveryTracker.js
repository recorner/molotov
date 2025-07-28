// utils/deliveryTracker.js
import logger from './logger.js';

/**
 * Delivery Tracker - Tracks delivery confirmation messages for reply handling
 */
class DeliveryTracker {
  constructor() {
    // Map: messageId -> { orderId, buyerId, adminChatId, deliveredAt }
    this.deliveryMessages = new Map();
    
    // Cleanup old entries every hour (keep for 24 hours)
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Track a delivery confirmation message
   * @param {number} messageId - Telegram message ID
   * @param {number} orderId - Order ID
   * @param {number} buyerId - Buyer's user ID
   * @param {number} adminChatId - Admin chat ID where message was sent
   */
  trackDeliveryMessage(messageId, orderId, buyerId, adminChatId) {
    const trackingData = {
      orderId,
      buyerId,
      adminChatId,
      deliveredAt: Date.now()
    };
    
    this.deliveryMessages.set(messageId, trackingData);
    
    logger.info('DELIVERY_TRACKER', `Tracking delivery message for order #${orderId}`, {
      messageId,
      buyerId,
      adminChatId
    });
  }

  /**
   * Get tracking data for a message ID
   * @param {number} messageId - Telegram message ID
   * @returns {object|null} Tracking data or null
   */
  getTrackingData(messageId) {
    return this.deliveryMessages.get(messageId) || null;
  }

  /**
   * Check if a message ID is a tracked delivery confirmation
   * @param {number} messageId - Telegram message ID
   * @returns {boolean} True if message is tracked
   */
  isDeliveryMessage(messageId) {
    return this.deliveryMessages.has(messageId);
  }

  /**
   * Clean up old delivery message tracking (older than 24 hours)
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleaned = 0;
    
    for (const [messageId, data] of this.deliveryMessages.entries()) {
      if (now - data.deliveredAt > maxAge) {
        this.deliveryMessages.delete(messageId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info('DELIVERY_TRACKER', `Cleaned up ${cleaned} old delivery tracking entries`);
    }
  }

  /**
   * Get statistics about tracked messages
   * @returns {object} Statistics
   */
  getStats() {
    const entries = Array.from(this.deliveryMessages.values());
    const now = Date.now();
    
    return {
      total: entries.length,
      last24h: entries.filter(data => now - data.deliveredAt < 24 * 60 * 60 * 1000).length,
      last1h: entries.filter(data => now - data.deliveredAt < 60 * 60 * 1000).length,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(d => d.deliveredAt)) : null
    };
  }

  /**
   * Remove tracking for a specific message
   * @param {number} messageId - Message ID to untrack
   * @returns {boolean} True if message was being tracked
   */
  untrack(messageId) {
    return this.deliveryMessages.delete(messageId);
  }
}

// Export singleton instance
const deliveryTracker = new DeliveryTracker();
export default deliveryTracker;
