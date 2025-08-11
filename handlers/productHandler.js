// handlers/productHandler.js - Enhanced with multi-language support and UI optimization
import db from '../database.js';
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';
import instantTranslationService from '../utils/instantTranslationService.js';
import { safeEditMessage } from '../utils/safeMessageEdit.js';
import smartMessageManager from '../utils/smartMessageManager.js';
import uiOptimizer from '../utils/uiOptimizer.js';

export async function showProductsInCategory(bot, chatId, categoryId, page = 1, messageId = null) {
  // Ensure categoryId and page are valid
  if (!categoryId || isNaN(categoryId)) {
    console.error('[ERROR] Invalid category ID');
    return messageTranslator.sendTranslatedMessage(bot, chatId, 'invalid_selection');
  }

  const PAGE_SIZE = 5;
  const offset = Math.max((page - 1) * PAGE_SIZE, 0);

  // First: check if products exist at all for category
  db.get(`SELECT COUNT(*) as total FROM products WHERE category_id = ?`, [categoryId], async (err, result) => {
    if (err) {
      console.error('[DB] Count Query Error:', err.message);
      return messageTranslator.sendTranslatedMessage(bot, chatId, 'error_products');
    }

    const total = result?.total || 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    page = Math.min(Math.max(page, 1), totalPages);
    const offset = (page - 1) * PAGE_SIZE;

    if (total === 0) {
      const noProductsMsg = await messageTranslator.translateTemplateForUser('no_products', chatId);
      return sendOrEdit(bot, chatId, messageId, `📭 *${noProductsMsg}*`, []);
    }

    // Now safely fetch paginated products
    db.all(
      `SELECT * FROM products WHERE category_id = ? LIMIT ? OFFSET ?`,
      [categoryId, PAGE_SIZE, offset],
      async (err, products) => {
        if (err) {
          console.error('[DB] Product Query Error:', err.message);
          return messageTranslator.sendTranslatedMessage(bot, chatId, 'error_products');
        }

        if (!products || products.length === 0) {
          const noProductsPageMsg = await messageTranslator.translateTemplateForUser('no_products_page', chatId);
          const errorMsg = uiOptimizer.createStatusMessage('info', 'No products available', {
            details: noProductsPageMsg
          });
          return sendOrEdit(bot, chatId, messageId, errorMsg, []);
        }

        // Prepare products for UI optimizer
        const productsData = [];
        for (const product of products) {
          const translatedName = await instantTranslationService.getTranslation(product.name, chatId);
          const translatedDesc = product.description ? 
            await instantTranslationService.getTranslation(product.description, chatId) : 
            await messageTranslator.translateTemplateForUser('no_description', chatId);

          productsData.push({
            id: product.id,
            name: translatedName,
            description: translatedDesc,
            price: uiOptimizer.formatPrice(product.price)
          });
        }

        // Create optimized message content
        const headerText = await messageTranslator.translateTemplateForUser('products_in_category', chatId);
        let content = '';
        
        productsData.forEach((product, index) => {
          content += `**${index + 1}.** ${product.name}\n`;
          content += `💭 _${product.description}_\n`;
          content += `💰 **${product.price}**\n`;
          if (index < productsData.length - 1) content += '\n';
        });

        const text = uiOptimizer.formatMessage(
          `🛒 ${headerText}`,
          content,
          { addSeparator: true }
        );

        // Create additional navigation buttons
        const additionalButtons = [
          {
            text: '🔙 Back to Categories',
            callback_data: 'load_categories'
          }
        ];

        // Create optimized button layout using UI optimizer
        const keyboard = uiOptimizer.createProductButtons(
          productsData, 
          page, 
          totalPages, 
          categoryId, 
          additionalButtons
        );

        await sendOrEdit(bot, chatId, messageId, text, keyboard);
      }
    );
  });
}

async function sendOrEdit(bot, chatId, messageId, text, keyboard) {
  if (messageId) {
    // Use smart editing - preserves photo banner when possible
    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    }, true); // Force banner for product listings
  } else {
    // Send new message with smart management
    const result = await smartMessageManager.sendOrEditSmart(bot, chatId, null, text, {
      reply_markup: { inline_keyboard: keyboard }
    }, true);
    
    // Track that this message has a photo banner
    if (result && result.message_id) {
      smartMessageManager.markAsPhotoMessage(chatId, result.message_id);
    }
  }
}
