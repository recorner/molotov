// utils/newsBroadcaster.js - News Broadcasting System with Redis Queue
import db from '../database.js';
import logger from './logger.js';
import telegramQueue from './telegramQueue.js';

class NewsBroadcaster {
  constructor() {
    this.isActive = false;
    this.currentBroadcast = null;
  }

  /**
   * Broadcast an announcement to users using Redis queue
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

      // Prepare messages for queue - with banner support
      const messages = users.map(user => ({
        chatId: user.telegram_id,
        messageType: 'photo', // Send as photo with banner
        photo: './assets/image.png',
        caption: this.formatMessageForUser(announcement, user),
        options: {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        },
        priority: 'broadcast',
        announcementId: announcement.id,
        userId: user.telegram_id
      }));

      // Queue all messages
      const messageIds = await telegramQueue.queueBroadcast(messages);
      
      logger.info('NEWS_BROADCAST', `Queued ${messageIds.length} messages for broadcast`);

      // Check if this was processed directly (fallback mode)
      const isDirectProcessing = messageIds.some(id => id.startsWith('direct_'));
      
      if (isDirectProcessing) {
        // Direct processing completed, get final stats immediately
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay for DB writes
        const finalStats = await this.getBroadcastStats(announcement.id);
        await this.completeBroadcast(announcement.id, finalStats.sent, finalStats.failed + finalStats.skipped);
        
        const duration = Date.now() - startTime;
        
        return {
          announcementId: announcement.id,
          totalUsers: users.length,
          successCount: finalStats.sent,
          failedCount: finalStats.failed + finalStats.skipped,
          duration,
          mode: 'direct',
          timestamp: new Date().toISOString()
        };
      }

      // Queue mode - simplified completion (monitoring handled by queue)
      logger.info('NEWS_BROADCAST', 'Queue processing mode - messages queued successfully');
      await this.completeBroadcast(announcement.id, users.length, 0); // Queue will handle actual delivery tracking
      
      const duration = Date.now() - startTime;
      
      return {
        announcementId: announcement.id,
        totalUsers: users.length,
        successCount: users.length,
        failedCount: 0,
        duration,
        mode: 'queued',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('NEWS_BROADCAST', `Broadcast failed: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        announcementId: announcement?.id,
        announcementTitle: announcement?.title
      });
      
      // Update announcement with failure
      if (announcement?.id) {
        await this.markBroadcastFailed(announcement.id, error.message || 'Unknown error');
      }
      
      throw new Error(`Broadcast failed: ${error.message || 'Unknown error'}`);
    } finally {
      this.isActive = false;
      this.currentBroadcast = null;
    }
  }

  /**
   * Get broadcast statistics from database
   * @param {number} announcementId - Announcement ID
   * @returns {Promise<Object>} Broadcast stats
   */
  async getBroadcastStats(announcementId) {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT status, COUNT(*) as count
        FROM news_delivery_log 
        WHERE news_id = ?
        GROUP BY status
      `, [announcementId], (err, rows) => {
        if (err) {
          logger.error('NEWS_BROADCAST', 'Failed to get broadcast stats', err);
          resolve({ sent: 0, failed: 0, skipped: 0 });
          return;
        }

        const stats = { sent: 0, failed: 0, skipped: 0 };
        
        rows.forEach(row => {
          // Use status as recorded in database
          if (stats.hasOwnProperty(row.status)) {
            stats[row.status] = row.count;
          } else {
            logger.warn('NEWS_BROADCAST', `Unknown status in delivery log: ${row.status}`);
          }
        });

        logger.debug('NEWS_BROADCAST', `Broadcast stats for announcement ${announcementId}:`, stats);
        resolve(stats);
      });
    });
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
   * Test broadcast function - sends to a single user for testing with banner
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

      // Create test announcement with banner styling
      const testAnnouncement = {
        ...announcement,
        content: `🧪 **TEST MESSAGE**\n\n${announcement.content}\n\n⚠️ This is a test broadcast. Only you received this message.`
      };

      // Send test message with banner
      await this.sendMessageToUser(bot, testUser, testAnnouncement);

      logger.info('NEWS_BROADCAST', `Test broadcast with banner sent successfully to user ${testUserId}`);
      
      return {
        success: true,
        testUser: testUser.first_name,
        message: 'Test message with banner sent successfully'
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
