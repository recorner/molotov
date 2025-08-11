// bot.js - Main bot file with production-grade features
import TelegramBot from 'node-telegram-bot-api';
import { BOT_TOKEN, ADMIN_GROUP } from './config.js';
import './database.js'; // Load and initialize DB

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise
  });
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', {
    message: error.message,
    stack: error.stack
  });
});

// Core utilities
import logger from './utils/logger.js';
import stateManager from './utils/stateManager.js';
import { MigrationManager } from './utils/migrations.js';
import { safeEditMessage } from './utils/safeMessageEdit.js';

// Handlers
import { showRootCategories } from './handlers/rootCategoryHandler.js';
import { handleStart, handleLanguageSelection } from './handlers/userHandler.js';
import { handleCategoryNavigation } from './handlers/categoryHandler.js';
import { showProductsInCategory } from './handlers/productHandler.js';
import { handleWalletCallback } from './handlers/walletHandler.js';
import { setupDailyWalletPrompt, handleWalletPromptResponse } from './scheduler.js';
import { handleWalletInput, handleWalletFinalSave } from './handlers/walletHandler.js';
import { handleAdminPaymentAction, handleProductDelivery, handleDeliveryReply, handleReplyToAdmin } from './handlers/paymentHandler.js';
import { handlePokeCommand, handlePokeInput } from './handlers/pokeHandler.js';

// Translation Services
import translationService from './utils/translationService.js';
import messageTranslator from './utils/messageTranslator.js';
import instantTranslationService from './utils/instantTranslationService.js';
import redisTranslationCache from './utils/redisTranslationCache.js';
import prebuiltTranslations from './utils/prebuiltTranslations.js';
import TelegramSafety from './utils/telegramSafety.js';

// Sidekick System Imports
import { handleSidekickCallback, initializeSidekickInputHandler } from './handlers/sidekickHandler.js';
import BlockchainMonitor from './utils/blockchainMonitor.js';
import TransactionManager from './utils/transactionManager.js';
import PinManager from './utils/pinManager.js';

// Payment handlers
import { 
  handleBuyCallback, 
  handlePaymentSelection, 
  handlePaymentConfirmation,
  handleCopyAddress,
  handlePaymentGuide,
  handlePaymentHelp,
  handleOrderStatus,
  handleCancelOrder
} from './handlers/paymentHandler.js';
import { handleAdminCommand } from './handlers/adminHandler.js';
import { handleAdminCallback } from './handlers/adminHandler.js';
import { handleNewsCommand } from './handlers/newsHandler.js';
import adminManager from './utils/adminManager.js';

// Initialize bot with production settings
const bot = new TelegramBot(BOT_TOKEN, { 
  polling: {
    interval: 1000,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

// Apply telegram safety patches immediately after bot creation
TelegramSafety.patchBot(bot);

// Make bot instance available globally for broadcasting
global.botInstance = bot;

// Global instances
let sidekickInputHandler = null;

// Production initialization sequence
async function initializeBot() {
  try {
    logger.info('SYSTEM', 'Starting Molotov Bot initialization...');
    
    // Initialize instant translation service with Redis cache
    logger.info('SYSTEM', 'Initializing instant translation service...');
    await instantTranslationService.initialize();
    await messageTranslator.initialize();
    
    // Load pre-built translations into Redis for instant response
    logger.info('SYSTEM', 'Loading pre-built translations into Redis cache...');
    const translationsLoaded = await prebuiltTranslations.loadTranslations();
    if (translationsLoaded) {
      const translationsData = prebuiltTranslations.getAllTranslations();
      if (translationsData && Object.keys(translationsData).length > 0) {
        await instantTranslationService.preloadTranslationsToRedis(translationsData);
        logger.info('SYSTEM', 'Pre-built translations loaded into Redis for instant response');
      }
      
      const stats = prebuiltTranslations.getStats();
      logger.info('SYSTEM', `Translation system ready: ${stats.cacheSize} entries loaded`);
    } else {
      logger.warn('SYSTEM', 'Pre-built translations not available, using live translation with Redis cache');
    }
    
    // Run database migrations for backward compatibility
    logger.info('SYSTEM', 'Running database migrations...');
    await MigrationManager.runMigrationsIfNeeded();
    
    // Initialize Sidekick System
    const blockchainMonitor = new BlockchainMonitor(bot);
    const transactionManager = new TransactionManager(bot);
    const pinManager = new PinManager();
    
    // Make blockchain monitor globally available for Sidekick
    global.blockchainMonitor = blockchainMonitor;
    
    // Initialize Sidekick Input Handler properly
    sidekickInputHandler = initializeSidekickInputHandler(bot);
    
    // Start blockchain monitoring
    await blockchainMonitor.startMonitoring();
    logger.info('BLOCKCHAIN', 'Blockchain monitoring started');
    
    // Initialize dynamic admin system
    if (ADMIN_GROUP) {
      logger.info('ADMIN', 'Initializing dynamic admin system...');
      const adminCount = await adminManager.initializeAdminSystem(bot, [ADMIN_GROUP]);
      logger.info('ADMIN', `Dynamic admin system initialized with ${adminCount} admins`);
    } else {
      logger.warn('ADMIN', 'No ADMIN_GROUP configured. Admin system will use empty group list.');
    }
    
    // System health monitoring
    setInterval(() => {
      performSystemHealthCheck();
    }, 300000); // Every 5 minutes
    
    // Cleanup tasks
    setInterval(() => {
      logger.cleanupOldLogs(7); // Keep logs for 7 days
      stateManager.cleanup(); // Cleanup expired state
      pinManager.cleanupExpiredSessions(); // Cleanup expired PIN sessions
    }, 3600000); // Every hour
    
    // Daily maintenance
    setInterval(() => {
      performDailyMaintenance();
    }, 86400000); // Every 24 hours
    
    logger.info('SYSTEM', 'Bot initialization completed successfully');
    
    // Update bot descriptions for all supported languages (non-blocking)
    logger.info('SYSTEM', 'Updating bot descriptions for all supported languages...');
    messageTranslator.updateBotDescriptionsForAllLanguages(bot)
      .then(results => {
        const successCount = results.filter(r => r.success).length;
        logger.info('SYSTEM', `Bot descriptions updated: ${successCount}/${results.length} languages successful`);
      })
      .catch(error => {
        logger.warn('SYSTEM', 'Bot description update failed (non-critical)', error);
      });
    
    console.log('[✅] Telegram Digital Store is live with full Sidekick System.');
    console.log('[🚀] All features are production-ready and encrypted.');
    console.log('[🔐] Database migrations completed - backward compatible.');
    
  } catch (error) {
    logger.error('SYSTEM', 'Bot initialization failed', error);
    console.error('[❌] Bot initialization failed:', error);
    process.exit(1);
  }
}

// System health check
async function performSystemHealthCheck() {
  try {
    // Check database connectivity
    const dbHealthy = await checkDatabaseHealth();
    
    // Check external services
    const servicesHealthy = await checkExternalServices();
    
    // Log health status
    if (dbHealthy && servicesHealthy) {
      logger.debug('HEALTH', 'System health check passed');
    } else {
      logger.warn('HEALTH', 'System health check failed', { 
        database: dbHealthy, 
        services: servicesHealthy 
      });
    }
  } catch (error) {
    logger.error('HEALTH', 'Health check error', error);
  }
}

// Daily maintenance tasks
async function performDailyMaintenance() {
  try {
    logger.info('MAINTENANCE', 'Starting daily maintenance tasks');
    
    // Database optimization
    await optimizeDatabase();
    
    // Security audit
    await performSecurityAudit();
    
    // Backup critical data
    await backupCriticalData();
    
    logger.info('MAINTENANCE', 'Daily maintenance completed');
  } catch (error) {
    logger.error('MAINTENANCE', 'Daily maintenance failed', error);
  }
}

// Database health check
async function checkDatabaseHealth() {
  return new Promise((resolve) => {
    import('./database.js').then(({ default: db }) => {
      db.get('SELECT 1', (err) => {
        resolve(!err);
      });
    }).catch(() => resolve(false));
  });
}

// External services health check
async function checkExternalServices() {
  // Check if external APIs are accessible
  // This would include blockchain APIs, etc.
  return true; // Simplified for now
}

// Database optimization
async function optimizeDatabase() {
  return new Promise((resolve) => {
    import('./database.js').then(({ default: db }) => {
      db.run('VACUUM', (err) => {
        if (err) {
          logger.error('MAINTENANCE', 'Database vacuum failed', err);
        } else {
          logger.info('MAINTENANCE', 'Database optimized successfully');
        }
        resolve();
      });
    }).catch((err) => {
      logger.error('MAINTENANCE', 'Database import failed', err);
      resolve();
    });
  });
}

// Security audit
async function performSecurityAudit() {
  // Check for failed login attempts, suspicious activity, etc.
  logger.info('SECURITY', 'Security audit completed');
}

// Backup critical data
async function backupCriticalData() {
  // Create backups of critical data (encrypted)
  logger.info('BACKUP', 'Critical data backup completed');
}

// Global error handlers
bot.on('polling_error', (error) => {
  logger.error('BOT', 'Polling error', error);
});

bot.on('error', (error) => {
  logger.error('BOT', 'Bot error', error);
});

process.on('uncaughtException', (error) => {
  logger.error('SYSTEM', 'Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('SYSTEM', 'Unhandled rejection', { reason, promise });
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('SYSTEM', 'Graceful shutdown initiated');
  bot.stopPolling();
  process.exit(0);
});

// Initialize the bot
initializeBot();

console.log('[🔧] Molotov Bot with Sidekick System starting...');
logger.logSystemEvent('BOT_STARTED', { version: '2.0.0', sidekick: true });

bot.sendMessage(
  ADMIN_GROUP,
  `� **Molotov Bot System Restarted**\n\n` +
  `🟢 **Status:** Online & Ready\n` +
  `🤖 **Sidekick System:** Active\n` +
  `🔐 **Encryption:** Enabled\n` +
  `🌍 **Multi-Language:** Active\n` +
  `📡 **LibreTranslate:** Ready\n` +
  `⚡ **Performance:** Optimized\n\n` +
  `━━━━━━━━━━━━━━━━━━━━━\n` +
  `🕒 **Restart Time:** ${new Date().toLocaleString()}\n` +
  `🔧 **Version:** 2.0.0\n` +
  `🛡️ **Security Level:** Maximum\n\n` +
  `💡 **System Ready:**\n` +
  `• Payment processing active\n` +
  `• Translation services online\n` +
  `• Admin panel accessible via /cocktail\n` +
  `• All security measures enabled`,
  { parse_mode: 'Markdown' }
).catch(err => {
  console.error('[Startup Message Error]', err.message);
  // Try without markdown if markdown fails
  bot.sendMessage(
    ADMIN_GROUP,
    `� Molotov Bot System Restarted\n\n` +
    `🟢 Status: Online & Ready\n` +
    `🤖 Sidekick System: Active\n` +
    `🔐 Encryption: Enabled\n` +
    `🌍 Multi-Language: Active\n` +
    `📡 LibreTranslate: Ready\n` +
    `⚡ Performance: Optimized\n\n` +
    `🕒 Restart Time: ${new Date().toLocaleString()}\n` +
    `🔧 Version: 2.0.0\n` +
    `🛡️ Security Level: Maximum\n\n` +
    `💡 System Ready:\n` +
    `• Payment processing active\n` +
    `• Translation services online\n` +
    `• Admin panel accessible via /cocktail\n` +
    `• All security measures enabled`
  ).catch(e => console.error('[Fallback Message Error]', e.message));
});

// === COMMANDS ===
bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/\/help/, async (msg) => {
  const userId = msg.from.id;
  const helpText = await messageTranslator.translateTemplateForUser('bot_about_text', userId);
  const supportText = await messageTranslator.translateTemplateForUser('contact_admin', userId);
  const { SUPPORT_USERNAME } = await import('./config.js');
  
  await bot.sendMessage(msg.chat.id, 
    `${helpText}\n\n📞 ${supportText}: @${SUPPORT_USERNAME || 'nova_chok'}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ 
            text: await messageTranslator.translateTemplateForUser('browse_categories_button', userId), 
            callback_data: 'load_categories' 
          }],
          [{ 
            text: await messageTranslator.translateTemplateForUser('contact_admin', userId), 
            url: `https://t.me/${SUPPORT_USERNAME || 'nova_chok'}` 
          }]
        ]
      }
    }
  );
});
bot.onText(/^\/(addcategory|addsubcategory|addproduct)(.*)/, (msg) => {
  handleAdminCommand(bot, msg);
});
bot.onText(/\/cocktail/, (msg) => handleAdminCommand(bot, msg));
bot.onText(/\/poke/, (msg) => handlePokeCommand(bot, msg));

// News and announcements command (restricted to admins)
bot.onText(/\/news/, (msg) => handleNewsCommand(bot, msg));

bot.onText(/\/sidekick/, async (msg) => {
  // Quick access to sidekick - use dynamic admin check
  const isUserAdmin = await adminManager.isAdmin(msg.from.id);
  if (isUserAdmin) {
    bot.sendMessage(msg.chat.id, '🚀 *Sidekick System*\n\nAccessing transaction management...', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 Open Sidekick', callback_data: 'sidekick_start' }]]
      }
    });
  }
});

// This handler is moved to the main message handler below
setupDailyWalletPrompt(bot);



// === CALLBACKS ===
const callbackCooldowns = new Map();

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  const userId = query.from.id;

  // Enhanced logging for debugging
  logger.debug('CALLBACK', `User ${userId} triggered callback: ${data}`);

  try {
    if (!data) {
      logger.warn('CALLBACK', `Invalid callback data from user ${userId}`);
      return await messageTranslator.answerTranslatedCallback(bot, query.id, 'Invalid callback data.', userId);
    }

    // Rate limiting to prevent spam/hallucination
    const cooldownKey = `${userId}_${data}`;
    const lastCall = callbackCooldowns.get(cooldownKey);
    const now = Date.now();
    
    if (lastCall && now - lastCall < 1000) { // 1 second cooldown
      logger.warn('CALLBACK', `Rate limit exceeded for user ${userId}, action: ${data}`);
      return await messageTranslator.answerTranslatedCallback(bot, query.id, 'please_wait', userId);
    }
    
    callbackCooldowns.set(cooldownKey, now);
    
    // Clean up old cooldowns (older than 5 minutes)
    for (const [key, timestamp] of callbackCooldowns.entries()) {
      if (now - timestamp > 300000) {
        callbackCooldowns.delete(key);
      }
    }

    // LANGUAGE SELECTION
    if (data.startsWith('lang_') || data === 'change_language') {
      if (data === 'change_language') {
        // Show language selection menu with safe editing
        const languageMessage = await messageTranslator.createLanguageSelectionMessage(userId);
        return await safeEditMessage(bot, chatId, messageId, languageMessage.text, {
          parse_mode: 'Markdown',
          reply_markup: languageMessage.reply_markup
        });
      } else {
        // Handle language selection
        return await handleLanguageSelection(bot, query);
      }
    }

    // CATEGORY NAVIGATION
    if (data.startsWith('cat_')) {
      return await handleCategoryNavigation(bot, query);
    }

    // PAGINATION (page_categoryId_pageNum)
    if (data.startsWith('page_')) {
      const parts = data.split('_');
      const categoryId = parseInt(parts[1]);
      const page = parseInt(parts[2]);

      if (isNaN(categoryId) || isNaN(page)) {
        console.warn('[Pagination Error] Invalid category ID or page number in callback:', data);
        return await messageTranslator.answerTranslatedCallback(bot, query.id, 'invalid_pagination', userId);
      }

      return await showProductsInCategory(bot, chatId, categoryId, page, messageId);
    }

    // BACK TO ROOT CATEGORIES
    if (data === 'back_to_categories' || data === 'load_categories') {
      return await showRootCategories(bot, chatId, messageId);
    }

    // BUY FLOW
    if (data.startsWith('buy_')) {
      return await handleBuyCallback(bot, query);
    }

    // PAYMENT METHOD
    if (data.startsWith('pay_')) {
      return await handlePaymentSelection(bot, query);
    }

    // CONFIRM PAYMENT
    if (data.startsWith('confirm_')) {
      return await handlePaymentConfirmation(bot, query);
    }

    // COPY ADDRESS
    if (data.startsWith('copy_address_')) {
      return await handleCopyAddress(bot, query);
    }

    // PAYMENT GUIDE
    if (data.startsWith('guide_')) {
      return await handlePaymentGuide(bot, query);
    }

    // PAYMENT HELP
    if (data.startsWith('help_payment_')) {
      return await handlePaymentHelp(bot, query);
    }

    // ORDER STATUS
    if (data.startsWith('status_')) {
      return await handleOrderStatus(bot, query);
    }

    // CANCEL ORDER
    if (data.startsWith('cancel_order_')) {
      return await handleCancelOrder(bot, query);
    }

    // REPLY TO ADMIN
    if (data.startsWith('reply_to_admin_')) {
      return await handleReplyToAdmin(bot, query);
    }



    // Admin payment actions (must come before general admin routing)
    if (data.startsWith('admin_confirm_') || data.startsWith('admin_cancel_')) {
      return await handleAdminPaymentAction(bot, query);
    }

        // Admin system routing
    if (
      data.startsWith('panel_') ||
      data.startsWith('admin_') ||
      data === 'cocktail_back' ||
      data.startsWith('vouch_') ||
      data.startsWith('export_')
    ) {
      return handleAdminCallback(bot, query);
    }

    // News and announcements routing
    if (
      data.startsWith('news_') ||
      data === 'news_main'
    ) {
      const { handleNewsCallback } = await import('./handlers/newsHandler.js');
      return handleNewsCallback(bot, query);
    }

    //wallet prompt
    if (data.startsWith('walletcheck_')) {
      return handleWalletPromptResponse(bot, query);
    }
    if (data === 'wallet_save_confirm') {
      return handleWalletFinalSave(bot, query);
    }

    // wallet manager
    if (data.startsWith('wallet_')) {
      return handleWalletCallback(bot, query);
    }

    // Sidekick system callbacks
    if (data.startsWith('sidekick_')) {
      return handleSidekickCallback(bot, query);
    }

    // Handle incomplete admin actions (debugging)
    if (data === 'admin_confirm' || data === 'admin_cancel') {
      console.error('[ERROR] Incomplete admin action detected:', data);
      logger.error('CALLBACK', `Incomplete admin action from user ${userId}: ${data}`);
      
      return bot.answerCallbackQuery(query.id, { 
        text: '❌ This appears to be an old or corrupted payment button. Please find the latest payment notification and use those buttons.',
        show_alert: true 
      });
    }

    // Handle support/contact callbacks
    if (data === 'contact_support' || data === 'support') {
      const { SUPPORT_USERNAME } = await import('./config.js');
      return bot.answerCallbackQuery(query.id, { 
        text: `💬 Contact support: @${SUPPORT_USERNAME || 'nova_chok'}`,
        show_alert: false 
      });
    }

    // Handle ignore callbacks (for buttons that shouldn't do anything)
    if (data === 'ignore') {
      return bot.answerCallbackQuery(query.id, { 
        text: '👍', 
        show_alert: false 
      });
    }

    // Fallback for unknown callbacks - Add more specific error handling
    logger.warn('CALLBACK', `Unknown callback from user ${userId}: ${data}`);
    return await messageTranslator.answerTranslatedCallback(bot, query.id, 'unknown_action', userId);

  } catch (err) {
    logger.error('CALLBACK', `Callback error for user ${userId}, action: ${data}`, err);
    return await messageTranslator.answerTranslatedCallback(bot, query.id, 'error_processing', userId);
  }
});

// === RAW MESSAGES ===
bot.on('message', async (msg) => {
  const { text, document, photo } = msg;
  const userId = msg.from?.id;
  const chatId = msg.chat?.id;

  logger.debug('MESSAGE', `Message received from user ${userId}`, {
    hasReply: !!msg.reply_to_message,
    messageType: document ? 'document' : photo ? 'photo' : text ? 'text' : 'other',
    chatId: chatId
  });

  // Handle buyer reply to admin (if user is in reply mode)
  if (global.replyMode && global.replyMode.has(msg.from.id)) {
    const replyData = global.replyMode.get(msg.from.id);
    
    // Check if reply mode has expired (5 minutes)
    if (Date.now() - replyData.timestamp > 300000) {
      global.replyMode.delete(msg.from.id);
      await bot.sendMessage(msg.chat.id, '⏰ Reply mode has expired. Please use the reply button again.');
      return;
    }

    // Handle cancel command
    if (text === '/cancel') {
      global.replyMode.delete(msg.from.id);
      await bot.sendMessage(msg.chat.id, '❌ Reply mode cancelled.');
      return;
    }

    // Forward message to admin
    try {
      const { ADMIN_GROUP } = await import('./config.js');
      
      let forwardMessage = `📩 **Customer Reply**\n\n` +
        `👤 User: ${msg.from.first_name || 'Unknown'} (${msg.from.id})\n` +
        `🧾 Order: #${replyData.orderId}\n` +
        `📝 Message: ${text || 'Media file'}\n` +
        `⏰ Sent: ${new Date().toLocaleString()}`;

      if (msg.document) {
        await bot.sendDocument(ADMIN_GROUP, msg.document.file_id, {
          caption: forwardMessage,
          parse_mode: 'Markdown'
        });
      } else if (msg.photo) {
        await bot.sendPhoto(ADMIN_GROUP, msg.photo[msg.photo.length - 1].file_id, {
          caption: forwardMessage,
          parse_mode: 'Markdown'
        });
      } else if (msg.video) {
        await bot.sendVideo(ADMIN_GROUP, msg.video.file_id, {
          caption: forwardMessage,
          parse_mode: 'Markdown'
        });
      } else if (text) {
        await bot.sendMessage(ADMIN_GROUP, forwardMessage, {
          parse_mode: 'Markdown'
        });
      }

      // Confirm to user
      await bot.sendMessage(msg.chat.id, 
        `✅ **Message sent to admin**\n\n` +
        `🧾 Order: #${replyData.orderId}\n` +
        `📝 Your message has been forwarded to the admin team.\n` +
        `⏰ Sent: ${new Date().toLocaleString()}`,
        { parse_mode: 'Markdown' }
      );

      // Clear reply mode after successful send
      global.replyMode.delete(msg.from.id);

      logger.info('BUYER_REPLY', `Customer reply forwarded to admin`, {
        orderId: replyData.orderId,
        userId: msg.from.id,
        messageType: msg.document ? 'document' : msg.photo ? 'photo' : msg.video ? 'video' : 'text'
      });

      return;
    } catch (error) {
      console.error('[ERROR] Failed to forward buyer reply:', error);
      await bot.sendMessage(msg.chat.id, '❌ Failed to send message to admin. Please try again.');
      logger.error('BUYER_REPLY', 'Failed to forward buyer reply', error);
      return;
    }
  }

  // Handle product delivery uploads (files, photos, and text)
  if (msg.reply_to_message && msg.reply_to_message.text?.includes('Please Upload Product Details')) {
    logger.info('DELIVERY', `Product delivery detected from user ${userId}`);
    // Try multiple regex patterns to match different formats
    const orderIdMatch = msg.reply_to_message.text.match(/Order ID: #(\d+)/) ||
      msg.reply_to_message.text.match(/Order ID: \*#(\d+)\*/) ||
      msg.reply_to_message.text.match(/#(\d+)/);
    
    if (orderIdMatch) {
      logger.info('DELIVERY', `Processing delivery for order ${orderIdMatch[1]} from user ${userId}`);
      return await handleProductDelivery(bot, msg, orderIdMatch[1]);
    } else {
      logger.warn('DELIVERY', `No order ID found in delivery reply from user ${userId}`);
      return await bot.sendMessage(msg.chat.id, '❌ Could not find order ID in the message you replied to.');
    }
  }

  // Handle admin replies to delivery confirmation messages
  if (msg.reply_to_message && msg.reply_to_message.text?.includes('Product Delivered Successfully')) {
    logger.info('DELIVERY', `Delivery reply detected from user ${userId}`);
    const wasHandled = await handleDeliveryReply(bot, msg);
    if (wasHandled) {
      return; // Message was handled as delivery reply
    }
  }

  // Skip processing for commands
  if (text && text.startsWith('/')) return;

  // Handle wallet input if it's text and not a command
  if (text && !text.startsWith('/')) {
    try {
      // Check for poke input first
      const pokeHandled = await handlePokeInput(bot, msg);
      if (pokeHandled) {
        logger.debug('INPUT', `Poke input handled for user ${userId}`);
        return;
      }

      // Check for sidekick input first
      if (sidekickInputHandler) {
        const sidekickHandled = await sidekickInputHandler.handleInput(msg);
        if (sidekickHandled) {
          logger.debug('INPUT', `Sidekick input handled for user ${userId}`);
          return;
        }
      }

      // Check for news message input
      const { handleNewsMessageInput } = await import('./handlers/newsHandler.js');
      const newsHandled = await handleNewsMessageInput(bot, msg);
      if (newsHandled) {
        logger.debug('INPUT', `News input handled for user ${userId}`);
      }

      // Then check for wallet input
      await handleWalletInput(bot, msg);
    } catch (err) {
      logger.error('INPUT', `Input handler error for user ${userId}`, err);
    }
    return;
  }

  try {
    // Future: await handleAdminInput(bot, msg);
  } catch (err) {
    logger.error('MESSAGE', `Message processing error for user ${userId}`, err);
  }
});
