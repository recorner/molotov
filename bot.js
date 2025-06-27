// bot.js
import TelegramBot from 'node-telegram-bot-api';
import { BOT_TOKEN } from './config.js';
import './database.js'; // Load and initialize DB

// Handlers
import { showRootCategories } from './handlers/rootCategoryHandler.js';
import { handleStart } from './handlers/userHandler.js';
import { handleCategoryNavigation } from './handlers/categoryHandler.js';
import { showProductsInCategory } from './handlers/productHandler.js';
import { handleWalletCallback } from './handlers/walletHandler.js';
import { setupDailyWalletPrompt, handleWalletPromptResponse } from './scheduler.js';
import { handleWalletInput, handleWalletFinalSave } from './handlers/walletHandler.js';







// Future stubs - ready to plug in later
import { handleBuyCallback, handlePaymentSelection, handlePaymentConfirmation } from './handlers/paymentHandler.js';
import { handleAdminCommand } from './handlers/adminHandler.js';
import { handleAdminCallback } from './handlers/adminHandler.js';


const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('[BOT] Telegram Digital Store is live.');

// === COMMANDS ===
bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/^\/(addcategory|addsubcategory|addproduct)(.*)/, (msg) => {
  handleAdminCommand(bot, msg);
});
bot.onText(/\/cocktail/, (msg) => handleAdminCommand(bot, msg));
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  await handleWalletInput(bot, msg);
});
setupDailyWalletPrompt(bot);



// === CALLBACKS ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  try {
    if (!data) return;

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
        return await bot.answerCallbackQuery(query.id, { text: '⚠️ Invalid pagination data.' });
      }

      return await showProductsInCategory(bot, chatId, categoryId, page, messageId);
    }

    // BACK TO ROOT CATEGORIES
    if (data === 'back_to_categories') {
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
    


    // Fallback for unknown
    return await bot.answerCallbackQuery(query.id, { text: '🤷 Unknown action.' });

  } catch (err) {
    console.error('[Callback Error]', err);
    return await bot.answerCallbackQuery(query.id, { text: '⚠️ Error processing your action.' });
  }
});






// === RAW MESSAGES ===
bot.on('message', async (msg) => {
  const { text } = msg;
  if (!text || text.startsWith('/')) return;

  try {
    // Future:
    // await handleAdminInput(bot, msg);
  } catch (err) {
    console.error('[Message Error]', err.message);
  }
});
