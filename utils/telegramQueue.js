// utils/telegramQueue.js - Redis-based message queue for Telegram rate limiting
import Redis from 'ioredis';
import logger from './logger.js';

class TelegramQueue {
  constructor() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: 'localhost',
      port: 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.redis.on('connect', () => {
      logger.info('TELEGRAM_QUEUE', 'Redis connected for Telegram queue');
    });

    this.redis.on('error', (err) => {
      logger.error('TELEGRAM_QUEUE', 'Redis connection error', err);
    });

    // Queue configuration
    this.queueName = 'telegram:message_queue';
    this.processingKey = 'telegram:processing';
    this.rateLimitKey = 'telegram:rate_limit';
    
    // Telegram rate limits
    this.maxMessagesPerSecond = 30; // Telegram's limit
    this.batchSize = 25; // Safe batch size
    this.processInterval = 1000; // Process every second
    
    // Processing state
    this.isProcessing = false;
    this.processor = null;
    
    this.initialize();
  }

  async initialize() {
    try {
      // Test if Redis is already connected
      if (this.redis.status === 'ready') {
        logger.info('TELEGRAM_QUEUE', 'Redis already connected');
      } else {
        await this.redis.connect();
        logger.info('TELEGRAM_QUEUE', 'Redis connected successfully');
      }
      
      // Test the connection
      await this.redis.ping();
      logger.info('TELEGRAM_QUEUE', 'Telegram queue initialized');
      
      // Start processing queue
      this.startProcessing();
    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Failed to initialize queue', error);
      // Don't throw - allow the bot to continue without queue
      logger.warn('TELEGRAM_QUEUE', 'Queue will operate in fallback mode');
    }
  }

  /**
   * Add message to queue
   * @param {Object} messageData - Message data to queue
   * @returns {Promise<string>} Message ID
   */
  async queueMessage(messageData) {
    try {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const queueItem = {
        id: messageId,
        chatId: messageData.chatId,
        text: messageData.text,
        options: messageData.options || {},
        priority: messageData.priority || 'normal',
        maxRetries: messageData.maxRetries || 3,
        retryCount: 0,
        createdAt: Date.now(),
        announcementId: messageData.announcementId || null,
        userId: messageData.userId || null
      };

      // Add to queue with priority (higher score = higher priority)
      const score = this.calculatePriority(queueItem.priority);
      await this.redis.zadd(this.queueName, score, JSON.stringify(queueItem));
      
      logger.debug('TELEGRAM_QUEUE', `Message queued: ${messageId} for chat ${messageData.chatId}`);
      
      return messageId;
    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Failed to queue message', error);
      throw error;
    }
  }

  /**
   * Queue multiple messages for broadcast
   * @param {Array} messages - Array of message objects
   * @returns {Promise<Array>} Array of message IDs
   */
  async queueBroadcast(messages) {
    try {
      logger.debug('TELEGRAM_QUEUE', `Attempting to queue ${messages.length} messages`);
      
      // If Redis is not available, process immediately
      if (!this.redis || this.redis.status !== 'ready') {
        logger.warn('TELEGRAM_QUEUE', 'Redis not available, processing messages immediately');
        return await this.processBroadcastDirectly(messages);
      }

      const messageIds = [];
      const pipeline = this.redis.pipeline();
      
      for (const messageData of messages) {
        const messageId = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const queueItem = {
          id: messageId,
          chatId: messageData.chatId,
          text: messageData.text,
          options: messageData.options || {},
          priority: messageData.priority || 'broadcast',
          maxRetries: 3,
          retryCount: 0,
          createdAt: Date.now(),
          announcementId: messageData.announcementId || null,
          userId: messageData.userId || null
        };

        const score = this.calculatePriority(queueItem.priority);
        pipeline.zadd(this.queueName, score, JSON.stringify(queueItem));
        messageIds.push(messageId);
      }

      const results = await pipeline.exec();
      logger.debug('TELEGRAM_QUEUE', `Pipeline execution completed with ${results.length} results`);
      
      logger.info('TELEGRAM_QUEUE', `Broadcast queued: ${messages.length} messages`);
      
      return messageIds;
    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Failed to queue broadcast, falling back to direct processing', error);
      // Fallback to direct processing
      return await this.processBroadcastDirectly(messages);
    }
  }

  /**
   * Process broadcast directly without queue (fallback)
   * @param {Array} messages - Array of message objects
   * @returns {Promise<Array>} Array of message IDs
   */
  async processBroadcastDirectly(messages) {
    logger.info('TELEGRAM_QUEUE', `Processing ${messages.length} messages directly (fallback mode)`);
    
    const messageIds = [];
    const bot = global.botInstance;
    
    if (!bot) {
      throw new Error('Bot instance not available');
    }

    // Process in batches to respect rate limits
    const batchSize = 25;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      // Process batch with delay
      const batchPromises = batch.map(async (messageData, index) => {
        const messageId = `direct_${Date.now()}_${index}`;
        messageIds.push(messageId);
        
        try {
          // Add small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, index * 50));
          
          await bot.sendMessage(messageData.chatId, messageData.text, messageData.options);
          
          // Record successful delivery
          if (messageData.announcementId && messageData.userId) {
            await this.recordDelivery(messageData.announcementId, messageData.userId, 'sent');
          }
          
          logger.debug('TELEGRAM_QUEUE', `Direct message sent to ${messageData.chatId}`);
          return { success: true, messageId };
          
        } catch (error) {
          logger.error('TELEGRAM_QUEUE', `Direct message failed for ${messageData.chatId}`, error);
          
          // Determine failure type
          let status = 'failed';
          if (error.code === 'ETELEGRAM' && error.response?.body?.error_code === 403) {
            status = 'skipped'; // User blocked bot
          }
          
          // Record failed delivery
          if (messageData.announcementId && messageData.userId) {
            await this.recordDelivery(messageData.announcementId, messageData.userId, status, error.message);
          }
          
          return { success: false, messageId, error: error.message };
        }
      });

      await Promise.allSettled(batchPromises);
      
      // Delay between batches
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return messageIds;
  }

  /**
   * Start processing the queue
   */
  startProcessing() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    logger.info('TELEGRAM_QUEUE', 'Starting queue processor');
    
    this.processor = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        logger.error('TELEGRAM_QUEUE', 'Queue processing error', error);
      }
    }, this.processInterval);
  }

  /**
   * Stop processing the queue
   */
  stopProcessing() {
    if (this.processor) {
      clearInterval(this.processor);
      this.processor = null;
    }
    this.isProcessing = false;
    logger.info('TELEGRAM_QUEUE', 'Queue processor stopped');
  }

  /**
   * Process messages from the queue
   */
  async processQueue() {
    try {
      // Check if we can send messages (rate limiting)
      const canSend = await this.checkRateLimit();
      if (!canSend) {
        return; // Skip this cycle
      }

      // Get batch of messages to process (highest priority first)
      const messages = await this.redis.zpopmax(this.queueName, this.batchSize);
      
      if (!messages || messages.length === 0) {
        return; // No messages to process
      }

      // Process messages in parallel (up to rate limit)
      const processPromises = [];
      
      for (let i = 0; i < messages.length; i += 2) {
        const messageJson = messages[i];
        const score = messages[i + 1];
        
        try {
          const messageData = JSON.parse(messageJson);
          processPromises.push(this.processMessage(messageData));
        } catch (error) {
          logger.error('TELEGRAM_QUEUE', 'Failed to parse queued message', error);
        }
      }

      // Wait for all to complete
      const results = await Promise.allSettled(processPromises);
      
      // Count successes and failures
      let successful = 0;
      let failed = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successful++;
        } else {
          failed++;
          logger.warn('TELEGRAM_QUEUE', `Message processing failed: ${result.reason}`);
        }
      });

      if (successful > 0 || failed > 0) {
        logger.debug('TELEGRAM_QUEUE', `Processed batch: ${successful} successful, ${failed} failed`);
      }

      // Update rate limit counter
      await this.updateRateLimit(successful + failed);

    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Error in processQueue', error);
    }
  }

  /**
   * Process individual message
   * @param {Object} messageData - Message data
   */
  async processMessage(messageData) {
    try {
      const bot = global.botInstance;
      if (!bot) {
        throw new Error('Bot instance not available');
      }

      // Send the message
      await bot.sendMessage(messageData.chatId, messageData.text, messageData.options);
      
      // Record successful delivery if part of announcement
      if (messageData.announcementId && messageData.userId) {
        await this.recordDelivery(messageData.announcementId, messageData.userId, 'sent');
      }

      logger.debug('TELEGRAM_QUEUE', `Message sent successfully to ${messageData.chatId}`);
      
    } catch (error) {
      // Handle Telegram specific errors
      if (error.code === 'ETELEGRAM') {
        const errorCode = error.response?.body?.error_code;
        
        if (errorCode === 403) {
          // User blocked bot - don't retry
          logger.warn('TELEGRAM_QUEUE', `User ${messageData.chatId} blocked bot`);
          
          if (messageData.announcementId && messageData.userId) {
            await this.recordDelivery(messageData.announcementId, messageData.userId, 'skipped');
          }
          return;
        }
        
        if (errorCode === 429) {
          // Rate limited - requeue with delay
          logger.warn('TELEGRAM_QUEUE', `Rate limited, requeueing message for ${messageData.chatId}`);
          await this.requeueMessage(messageData, 5000); // 5 second delay
          return;
        }
      }

      // Other errors - retry if we haven't exceeded max retries
      if (messageData.retryCount < messageData.maxRetries) {
        messageData.retryCount++;
        logger.warn('TELEGRAM_QUEUE', `Retrying message for ${messageData.chatId}, attempt ${messageData.retryCount}`);
        await this.requeueMessage(messageData, 2000); // 2 second delay
      } else {
        logger.error('TELEGRAM_QUEUE', `Max retries exceeded for message to ${messageData.chatId}`, error);
        
        if (messageData.announcementId && messageData.userId) {
          await this.recordDelivery(messageData.announcementId, messageData.userId, 'failed', error.message);
        }
      }
    }
  }

  /**
   * Requeue a message with delay
   * @param {Object} messageData - Message data
   * @param {number} delay - Delay in milliseconds
   */
  async requeueMessage(messageData, delay = 0) {
    try {
      // Add delay to priority calculation to delay processing
      const delayedScore = this.calculatePriority(messageData.priority) - (delay / 1000);
      
      await this.redis.zadd(this.queueName, delayedScore, JSON.stringify(messageData));
    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Failed to requeue message', error);
    }
  }

  /**
   * Check if we can send messages (rate limiting)
   * @returns {Promise<boolean>}
   */
  async checkRateLimit() {
    try {
      const currentCount = await this.redis.get(this.rateLimitKey) || 0;
      return parseInt(currentCount) < this.maxMessagesPerSecond;
    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Rate limit check failed', error);
      return true; // Allow sending if check fails
    }
  }

  /**
   * Update rate limit counter
   * @param {number} messageCount - Number of messages sent
   */
  async updateRateLimit(messageCount) {
    try {
      await this.redis.incrby(this.rateLimitKey, messageCount);
      await this.redis.expire(this.rateLimitKey, 1); // Reset every second
    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Failed to update rate limit', error);
    }
  }

  /**
   * Calculate priority score for message
   * @param {string} priority - Priority level
   * @returns {number} Priority score
   */
  calculatePriority(priority) {
    const priorities = {
      'emergency': 1000,
      'high': 800,
      'normal': 500,
      'broadcast': 300,
      'low': 100
    };
    
    return priorities[priority] || priorities['normal'];
  }

  /**
   * Record delivery status in database
   * @param {number} announcementId - Announcement ID (maps to news_id in DB)
   * @param {number} userId - User telegram ID
   * @param {string} status - Delivery status
   * @param {string} error - Error message if any
   */
  async recordDelivery(announcementId, userId, status, error = null) {
    try {
      const db = (await import('../database.js')).default;
      
      return new Promise((resolve) => {
        db.run(`
          INSERT INTO news_delivery_log 
          (news_id, telegram_id, user_id, status, error_message, sent_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [announcementId, userId, userId, status, error], (err) => {
          if (err) {
            logger.error('TELEGRAM_QUEUE', `Failed to record delivery for user ${userId}`, err);
          }
          resolve();
        });
      });
    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Failed to record delivery', error);
    }
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Queue stats
   */
  async getStats() {
    try {
      const queueLength = await this.redis.zcard(this.queueName);
      const currentRateLimit = await this.redis.get(this.rateLimitKey) || 0;
      
      return {
        queueLength,
        currentRateLimit: parseInt(currentRateLimit),
        maxMessagesPerSecond: this.maxMessagesPerSecond,
        isProcessing: this.isProcessing,
        batchSize: this.batchSize
      };
    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Failed to get stats', error);
      return {
        queueLength: 0,
        currentRateLimit: 0,
        maxMessagesPerSecond: this.maxMessagesPerSecond,
        isProcessing: this.isProcessing,
        batchSize: this.batchSize
      };
    }
  }

  /**
   * Clear the queue (for maintenance)
   * @returns {Promise<number>} Number of messages cleared
   */
  async clearQueue() {
    try {
      const count = await this.redis.zcard(this.queueName);
      await this.redis.del(this.queueName);
      logger.info('TELEGRAM_QUEUE', `Cleared ${count} messages from queue`);
      return count;
    } catch (error) {
      logger.error('TELEGRAM_QUEUE', 'Failed to clear queue', error);
      return 0;
    }
  }
}

// Create and export singleton instance
const telegramQueue = new TelegramQueue();
export default telegramQueue;
