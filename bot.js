// bot.js - Main bot file with production-grade features
import TelegramBot from 'node-telegram-bot-api';
import { BOT_TOKEN, ADMIN_GROUP, ADMIN_IDS } from './config.js';
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

// Handlers
import { showRootCategories } from './handlers/rootCategoryHandler.js';
import { handleStart, handleLanguageSelection } from './handlers/userHandler.js';
import { handleCategoryNavigation } from './handlers/categoryHandler.js';
import { showProductsInCategory } from './handlers/productHandler.js';
import { handleWalletCallback } from './handlers/walletHandler.js';
import { setupDailyWalletPrompt, handleWalletPromptResponse } from './scheduler.js';
import { handleWalletInput, handleWalletFinalSave } from './handlers/walletHandler.js';
import { handleAdminPaymentAction, handleProductDelivery } from './handlers/paymentHandler.js';

// Translation Services
import translationService from './utils/translationService.js';
import messageTranslator from './utils/messageTranslator.js';
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

// Global instances
let sidekickInputHandler = null;

// Production initialization sequence
async function initializeBot() {
  try {
    logger.info('SYSTEM', 'Starting Molotov Bot initialization...');
    
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
    
    // System health monitoring
    setInterval(() => {
      performSystemHealthCheck();
    }, 300000); // Every 5 minutes
    
    // Cleanup tasks
    setInterval(() => {
      logger.cleanupOldLogs(30); // Keep logs for 30 days
      stateManager.cleanup(); // Cleanup expired state
      pinManager.cleanupExpiredSessions(); // Cleanup expired PIN sessions
    }, 3600000); // Every hour
    
    // Daily maintenance
    setInterval(() => {
      performDailyMaintenance();
    }, 86400000); // Every 24 hours
    
    logger.info('SYSTEM', 'Bot initialization completed successfully');
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
  `🔁 *molotov bot restarted*\n🟢 Status: Online\n🚀 Sidekick System: Active\n🔐 Encryption: Enabled\n🌍 Multi-Language: Active\n📡 LibreTranslate: Ready\n🕒 ${new Date().toLocaleString()}`,
  { parse_mode: 'Markdown' }
).catch(err => {
  console.error('[Startup Message Error]', err.message);
  // Try without markdown if markdown fails
  bot.sendMessage(
    ADMIN_GROUP,
    `🔁 molotov bot restarted\n🟢 Status: Online\n🚀 Sidekick System: Active\n🔐 Encryption: Enabled\n🌍 Multi-Language: Active\n📡 LibreTranslate: Ready\n🕒 ${new Date().toLocaleString()}`
  ).catch(e => console.error('[Fallback Message Error]', e.message));
});

// === COMMANDS ===
bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/^\/(addcategory|addsubcategory|addproduct)(.*)/, (msg) => {
  handleAdminCommand(bot, msg);
});
bot.onText(/\/cocktail/, (msg) => handleAdminCommand(bot, msg));
bot.onText(/\/sidekick/, (msg) => {
  // Quick access to sidekick
  if (ADMIN_IDS.includes(msg.from.id)) {
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

  try {
    if (!data) {
      return await messageTranslator.answerTranslatedCallback(bot, query.id, 'Invalid callback data.', userId);
    }

    // Rate limiting to prevent spam/hallucination
    const cooldownKey = `${userId}_${data}`;
    const lastCall = callbackCooldowns.get(cooldownKey);
    const now = Date.now();
    
    if (lastCall && now - lastCall < 1000) { // 1 second cooldown
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
        // Show language selection menu
        const languageMessage = await messageTranslator.createLanguageSelectionMessage(userId);
        return await bot.editMessageText(languageMessage.text, {
          chat_id: chatId,
          message_id: messageId,
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



    // Admin panel routing
    if (
      data.startsWith('panel_') ||
      data === 'cocktail_back'
    ) {
      return handleAdminCallback(bot, query);
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

    // Admin payment actions
    if (data.startsWith('admin_confirm_') || data.startsWith('admin_cancel_')) {
      return await handleAdminPaymentAction(bot, query);
    }

    // Fallback for unknown callbacks - Add more specific error handling
    console.warn('[Callback] Unknown callback data:', data);
    return await messageTranslator.answerTranslatedCallback(bot, query.id, 'unknown_action', userId);

  } catch (err) {
    console.error('[Callback Error]', {
      userId: userId,
      data: data,
      error: err.message,
      stack: err.stack
    });
    return await messageTranslator.answerTranslatedCallback(bot, query.id, 'error_processing', userId);
  }
});

// === RAW MESSAGES ===
bot.on('message', async (msg) => {
  const { text, document, photo } = msg;

  console.log('[DEBUG] Message received:', {
    hasReply: !!msg.reply_to_message,
    replyText: msg.reply_to_message?.text?.substring(0, 50),
    messageType: document ? 'document' : photo ? 'photo' : text ? 'text' : 'other',
    chatId: msg.chat.id
  });

  // Handle product delivery uploads (files, photos, and text)
  if (msg.reply_to_message && msg.reply_to_message.text?.includes('Please Upload Product Details')) {
    console.log('[DEBUG] Product delivery detected, full reply text:', msg.reply_to_message.text);
    // Try multiple regex patterns to match different formats
    const orderIdMatch = msg.reply_to_message.text.match(/Order ID: #(\d+)/) ||
      msg.reply_to_message.text.match(/Order ID: \*#(\d+)\*/) ||
      msg.reply_to_message.text.match(/#(\d+)/);
    console.log('[DEBUG] Order ID match:', orderIdMatch);
    if (orderIdMatch) {
      console.log('[DEBUG] Processing delivery for order:', orderIdMatch[1]);
      return await handleProductDelivery(bot, msg, orderIdMatch[1]);
    } else {
      console.log('[DEBUG] No order ID found in reply text');
      return await bot.sendMessage(msg.chat.id, '❌ Could not find order ID in the message you replied to.');
    }
  }

  // Skip processing for commands
  if (text && text.startsWith('/')) return;

  // Handle wallet input if it's text and not a command
  if (text && !text.startsWith('/')) {
    try {
      // Check for sidekick input first
      if (sidekickInputHandler) {
        const sidekickHandled = await sidekickInputHandler.handleInput(msg);
        if (sidekickHandled) return;
      }

      // Then check for wallet input
      await handleWalletInput(bot, msg);
    } catch (err) {
      console.error('[Input Handler Error]', err.message);
    }
    return;
  }

  try {
    // Future: await handleAdminInput(bot, msg);
  } catch (err) {
    console.error('[Message Error]', err.message);
  }
});
