// utils/spamPrevention.js - Prevent button spam and manage user interaction limits
import logger from './logger.js';

class SpamPrevention {
  constructor() {
    // Track user actions with timestamps
    this.userActions = new Map(); // userId -> { action: timestamp }
    this.confirmationsSent = new Map(); // userId_orderId -> timestamp
    
    // Rate limiting settings
    this.BUTTON_COOLDOWN = 2000; // 2 seconds between button clicks
    this.CONFIRMATION_COOLDOWN = 30000; // 30 seconds between confirmation attempts
    this.MAX_CONFIRMATIONS_PER_ORDER = 3; // Max confirmations per order
    
    // Cleanup old entries every 5 minutes
    setInterval(() => {
      this.cleanup();
    }, 300000);
  }

  /**
   * Check if user can perform an action (rate limiting)
   */
  canPerformAction(userId, action) {
    const userKey = `${userId}_${action}`;
    const lastAction = this.userActions.get(userKey);
    const now = Date.now();
    
    if (lastAction && now - lastAction < this.BUTTON_COOLDOWN) {
      return false;
    }
    
    this.userActions.set(userKey, now);
    return true;
  }

  /**
   * Check if user can send payment confirmation
   */
  canSendConfirmation(userId, orderId) {
    const confirmKey = `${userId}_${orderId}`;
    const lastConfirmation = this.confirmationsSent.get(confirmKey);
    const now = Date.now();
    
    // Check cooldown
    if (lastConfirmation && now - lastConfirmation < this.CONFIRMATION_COOLDOWN) {
      const remainingTime = Math.ceil((this.CONFIRMATION_COOLDOWN - (now - lastConfirmation)) / 1000);
      return { allowed: false, reason: 'cooldown', remainingTime };
    }
    
    // Check max confirmations (count confirmations in last hour)
    const oneHourAgo = now - 3600000;
    let confirmationCount = 0;
    
    for (const [key, timestamp] of this.confirmationsSent.entries()) {
      if (key.startsWith(confirmKey) && timestamp > oneHourAgo) {
        confirmationCount++;
      }
    }
    
    if (confirmationCount >= this.MAX_CONFIRMATIONS_PER_ORDER) {
      return { allowed: false, reason: 'max_reached', count: confirmationCount };
    }
    
    // Record the confirmation
    this.confirmationsSent.set(confirmKey, now);
    return { allowed: true };
  }

  /**
   * Get time remaining for next action
   */
  getTimeRemaining(userId, action) {
    const userKey = `${userId}_${action}`;
    const lastAction = this.userActions.get(userKey);
    
    if (!lastAction) return 0;
    
    const elapsed = Date.now() - lastAction;
    const remaining = Math.max(0, this.BUTTON_COOLDOWN - elapsed);
    
    return Math.ceil(remaining / 1000);
  }

  /**
   * Check if this is a duplicate confirmation
   */
  isDuplicateConfirmation(userId, orderId) {
    const confirmKey = `${userId}_${orderId}`;
    const lastConfirmation = this.confirmationsSent.get(confirmKey);
    
    if (!lastConfirmation) return false;
    
    const timeSince = Date.now() - lastConfirmation;
    return timeSince < this.CONFIRMATION_COOLDOWN;
  }

  /**
   * Get user-friendly cooldown message
   */
  getCooldownMessage(userId, action, language = 'en') {
    const remaining = this.getTimeRemaining(userId, action);
    
    const messages = {
      en: `⏱️ Please wait ${remaining} seconds before trying again`,
      es: `⏱️ Espera ${remaining} segundos antes de intentar de nuevo`,
      fr: `⏱️ Veuillez attendre ${remaining} secondes avant de réessayer`,
      de: `⏱️ Bitte warten Sie ${remaining} Sekunden, bevor Sie es erneut versuchen`
    };
    
    return messages[language] || messages.en;
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    // Clean user actions
    for (const [key, timestamp] of this.userActions.entries()) {
      if (now - timestamp > maxAge) {
        this.userActions.delete(key);
      }
    }
    
    // Clean confirmations
    for (const [key, timestamp] of this.confirmationsSent.entries()) {
      if (now - timestamp > maxAge) {
        this.confirmationsSent.delete(key);
      }
    }
    
    logger.debug('SPAM_PREVENTION', `Cleaned up old entries. Active actions: ${this.userActions.size}, confirmations: ${this.confirmationsSent.size}`);
  }

  /**
   * Get statistics for monitoring
   */
  getStats() {
    return {
      activeActions: this.userActions.size,
      activeConfirmations: this.confirmationsSent.size,
      settings: {
        buttonCooldown: this.BUTTON_COOLDOWN,
        confirmationCooldown: this.CONFIRMATION_COOLDOWN,
        maxConfirmationsPerOrder: this.MAX_CONFIRMATIONS_PER_ORDER
      }
    };
  }
}

// Create singleton instance
const spamPrevention = new SpamPrevention();

export default spamPrevention;
