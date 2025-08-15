// utils/newsBroadcaster.js - News Broadcasting System
import db from '../database.js';
import logger from './logger.js';

class NewsBroadcaster {
  constructor() {
    this.isActive = false;
    this.currentBroadcast = null;
  }

  /**
   * Broadcast an announcement to users
   * @param {Object} announcement - The announcement to broadcast
   * @returns {Promise<Object>} Results of the broadcast
   */
  async broadcast(announcement) {
    const startTime = Date.now();
    logger.info('NEWS_BROADCAST', `Starting broadcast: ${announcement.title}`);
    
    if (this.isActive) {
      throw new Error('Another broadcast is already in progress');
    }

    this.isActive = true;
    this.currentBroadcast = announcement;

    try {
      // Get target users
      const users = await this.getTargetUsers(announcement.targetLanguage);
      
      if (users.length === 0) {
        throw new Error(`No users found for language: ${announcement.targetLanguage}`);
      }

      logger.info('NEWS_BROADCAST', `Found ${users.length} target users for language: ${announcement.targetLanguage}`);

      // Initialize broadcast tracking
      await this.initializeBroadcastRecord(announcement, users.length);

      // Get bot instance from global scope
      const bot = global.botInstance;
      if (!bot) {
        throw new Error('Bot instance not available');
      }

      let successCount = 0;
      let failedCount = 0;
      const failedUsers = [];

      // Broadcast to users in batches with banner support
      const batchSize = 10; // Telegram rate limit friendly
      const delayBetweenBatches = 1000; // 1 second delay

      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        
        logger.info('NEWS_BROADCAST', `Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(users.length/batchSize)}`);

        // Process batch in parallel
        const batchPromises = batch.map(async (user) => {
          try {
            await this.sendMessageToUser(bot, user, announcement);
            
            // Record successful delivery
            await this.recordDelivery(announcement.id, user.telegram_id, 'delivered');
            
            return { success: true, userId: user.telegram_id };
          } catch (error) {
            logger.warn('NEWS_BROADCAST', `Failed to send to user ${user.telegram_id}: ${error.message}`);
            
            // Record failed delivery
            await this.recordDelivery(announcement.id, user.telegram_id, 'failed', error.message);
            
            return { success: false, userId: user.telegram_id, error: error.message };
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Count results
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success) {
            successCount++;
          } else {
            failedCount++;
            if (result.status === 'fulfilled') {
              failedUsers.push(result.value.userId);
            }
          }
        });

        // Rate limiting delay between batches
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      const duration = Date.now() - startTime;
      
      // Update announcement record
      await this.completeBroadcast(announcement.id, successCount, failedCount);

      const result = {
        announcementId: announcement.id,
        title: announcement.title,
        targetLanguage: announcement.targetLanguage,
        totalUsers: users.length,
        successCount,
        failedCount,
        failedUsers,
        duration,
        timestamp: new Date().toISOString()
      };

      logger.info('NEWS_BROADCAST', `Broadcast completed: ${successCount}/${users.length} sent successfully in ${duration}ms`);
      
      return result;

    } catch (error) {
      logger.error('NEWS_BROADCAST', `Broadcast failed: ${error.message}`, error);
      
      // Update announcement with failure
      if (announcement.id) {
        await this.markBroadcastFailed(announcement.id, error.message);
      }
      
      throw error;
    } finally {
      this.isActive = false;
      this.currentBroadcast = null;
    }
  }

  /**
   * Get users for target language
   * @param {string} targetLanguage - Language code or 'all'
   * @returns {Promise<Array>} Array of user objects
   */
  async getTargetUsers(targetLanguage) {
    return new Promise((resolve, reject) => {
      let query;
      let params;

      if (targetLanguage === 'all') {
        query = `
          SELECT telegram_id, first_name, username, language_code 
          FROM users 
          WHERE language_code IS NOT NULL
        `;
        params = [];
      } else {
        query = `
          SELECT telegram_id, first_name, username, language_code 
          FROM users 
          WHERE language_code = ?
        `;
        params = [targetLanguage];
      }

      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('NEWS_BROADCAST', 'Failed to get target users', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Send message to individual user with banner support
   * @param {Object} bot - Telegram bot instance
   * @param {Object} user - User object
   * @param {Object} announcement - Announcement object
   */
  async sendMessageToUser(bot, user, announcement) {
    try {
      const message = this.formatMessageForUser(announcement, user);
      
      // Try to send with banner first
      try {
        await bot.sendPhoto(user.telegram_id, './assets/image.png', {
          caption: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });

        logger.debug('NEWS_BROADCAST', `Message with banner sent to user ${user.telegram_id} (${user.first_name})`);
        return;
      } catch (photoError) {
        // If banner fails, fallback to text message
        logger.warn('NEWS_BROADCAST', `Banner failed for user ${user.telegram_id}, falling back to text`, photoError);
        
        await bot.sendMessage(user.telegram_id, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });

        logger.debug('NEWS_BROADCAST', `Fallback text message sent to user ${user.telegram_id} (${user.first_name})`);
      }
      
    } catch (error) {
      // Handle specific Telegram errors
      if (error.code === 'ETELEGRAM') {
        switch (error.response.body.error_code) {
          case 403:
            throw new Error('User blocked bot');
          case 400:
            if (error.response.body.description.includes('chat not found')) {
              throw new Error('Chat not found');
            }
            throw new Error('Bad request');
          default:
            throw new Error(`Telegram error: ${error.response.body.description}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Format message for specific user with enhanced banner styling
   * @param {Object} announcement - Announcement object
   * @param {Object} user - User object
   * @returns {string} Formatted message
   */
  formatMessageForUser(announcement, user) {
    let message = '';

    // Add personalized greeting
    if (user.first_name) {
      message += `👋 Hello ${user.first_name}!\n\n`;
    }

    // Add the main announcement content
    message += announcement.content;

    // Add professional footer with branding
    message += `\n\n━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📢 *Official Announcement*\n`;
    message += `🕒 ${new Date().toLocaleString()}\n`;
    message += `🌟 Thank you for being part of our community!`;

    return message;
  }

  /**
   * Initialize broadcast record in database
   * @param {Object} announcement - Announcement object
   * @param {number} totalUsers - Total number of target users
   */
  async initializeBroadcastRecord(announcement, totalUsers) {
    return new Promise((resolve, reject) => {
      db.run(`
        UPDATE news_announcements 
        SET recipients_count = ?, status = 'sending', sent_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [totalUsers, announcement.id], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Record delivery status for individual user
   * @param {number} announcementId - Announcement ID
   * @param {number} userId - User telegram ID
   * @param {string} status - Delivery status
   * @param {string} error - Error message if failed
   */
  async recordDelivery(announcementId, userId, status, error = null) {
    return new Promise((resolve) => {
      db.run(`
        INSERT INTO news_delivery_log 
        (announcement_id, user_id, status, error_message, delivered_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [announcementId, userId, status, error], (err) => {
        if (err) {
          logger.error('NEWS_BROADCAST', `Failed to record delivery for user ${userId}`, err);
        }
        resolve(); // Don't fail broadcast if logging fails
      });
    });
  }

  /**
   * Complete broadcast and update statistics
   * @param {number} announcementId - Announcement ID
   * @param {number} successCount - Number of successful deliveries
   * @param {number} failedCount - Number of failed deliveries
   */
  async completeBroadcast(announcementId, successCount, failedCount) {
    return new Promise((resolve, reject) => {
      db.run(`
        UPDATE news_announcements 
        SET status = 'sent', success_count = ?, failed_count = ?
        WHERE id = ?
      `, [successCount, failedCount, announcementId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Mark broadcast as failed
   * @param {number} announcementId - Announcement ID
   * @param {string} errorMessage - Error message
   */
  async markBroadcastFailed(announcementId, errorMessage) {
    return new Promise((resolve) => {
      db.run(`
        UPDATE news_announcements 
        SET status = 'failed', failed_count = recipients_count
        WHERE id = ?
      `, [announcementId], (err) => {
        if (err) {
          logger.error('NEWS_BROADCAST', `Failed to mark broadcast as failed`, err);
        }
        resolve();
      });
    });
  }

  /**
   * Get broadcast status
   * @returns {Object} Current broadcast status
   */
  getStatus() {
    return {
      isActive: this.isActive,
      currentBroadcast: this.currentBroadcast ? {
        id: this.currentBroadcast.id,
        title: this.currentBroadcast.title,
        targetLanguage: this.currentBroadcast.targetLanguage
      } : null
    };
  }

  /**
   * Test broadcast function - sends to a single user for testing
   * @param {Object} announcement - Announcement to test
   * @param {number} testUserId - User ID to send test to
   * @returns {Promise<Object>} Test result
   */
  async testBroadcast(announcement, testUserId) {
    logger.info('NEWS_BROADCAST', `Starting test broadcast to user ${testUserId}`);
    
    try {
      const bot = global.botInstance;
      if (!bot) {
        throw new Error('Bot instance not available');
      }

      // Get test user info
      const testUser = await new Promise((resolve, reject) => {
        db.get(`
          SELECT telegram_id, first_name, username, language_code 
          FROM users WHERE telegram_id = ?
        `, [testUserId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!testUser) {
        throw new Error('Test user not found in database');
      }

      // Send test message
      await this.sendMessageToUser(bot, testUser, {
        ...announcement,
        content: `🧪 **TEST MESSAGE**\n\n${announcement.content}\n\n⚠️ This is a test broadcast. Only you received this message.`
      });

      logger.info('NEWS_BROADCAST', `Test broadcast sent successfully to user ${testUserId}`);
      
      return {
        success: true,
        testUser: testUser.first_name,
        message: 'Test message sent successfully'
      };

    } catch (error) {
      logger.error('NEWS_BROADCAST', `Test broadcast failed: ${error.message}`);
      throw error;
    }
  }
}

// Create and export singleton instance
const newsBroadcaster = new NewsBroadcaster();
export default newsBroadcaster;
