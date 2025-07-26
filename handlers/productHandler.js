// handlers/productHandler.js - Enhanced with multi-language support
import db from '../database.js';
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';
import instantTranslationService from '../utils/instantTranslationService.js';

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
          return sendOrEdit(bot, chatId, messageId, `📭 *${noProductsPageMsg}*`, []);
        }

        const headerText = await messageTranslator.translateTemplateForUser('products_in_category', chatId);
        let text = `🛒 *${headerText}:*\n\n`;
        const keyboard = [];

        for (const product of products) {
          // Translate product name and description using instant service
          const translatedName = await instantTranslationService.getTranslation(product.name, chatId);
          const translatedDesc = product.description ? 
            await instantTranslationService.getTranslation(product.description, chatId) : 
            await messageTranslator.translateTemplateForUser('no_description', chatId);

          text += `• *${translatedName}*\n`;
          text += `💬 _${translatedDesc}_\n`;
          text += `💰 *${messageTranslator.formatPrice(product.price)}*\n\n`;

          const buyText = await messageTranslator.translateTemplateForUser('buy_product', chatId);
          keyboard.push([{
            text: `${buyText} ${translatedName}`,
            callback_data: `buy_${product.id}`
          }]);
        }

        const navRow = [];
        if (page > 1) {
          const prevText = await messageTranslator.translateTemplateForUser('previous_page', chatId);
          navRow.push({ text: `${prevText}`, callback_data: `page_${categoryId}_${page - 1}` });
        }
        if (page < totalPages) {
          const nextText = await messageTranslator.translateTemplateForUser('next_page', chatId);
          navRow.push({ text: `${nextText}`, callback_data: `page_${categoryId}_${page + 1}` });
        }

        keyboard.push(navRow);
        
        const backText = await messageTranslator.translateTemplateForUser('back_to_categories', chatId);
        keyboard.push([{ text: `${backText}`, callback_data: 'back_to_categories' }]);

        sendOrEdit(bot, chatId, messageId, text, keyboard);
      }
    );
  });
}

async function sendOrEdit(bot, chatId, messageId, text, keyboard) {
  if (messageId) {
    bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    }).catch(err => {
      console.error('[Edit Fallback]', err.message);
      bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    });
  } else {
    bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }
}
