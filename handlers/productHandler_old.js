// handlers/productHandler.js
import db from '../database.js';

export function showProductsInCategory(bot, chatId, categoryId, page = 1, messageId = null) {
  // Ensure categoryId and page are valid
  if (!categoryId || isNaN(categoryId)) {
    console.error('[ERROR] Invalid category ID');
    return bot.sendMessage(chatId, '❌ Invalid category selected.');
  }

  const PAGE_SIZE = 5;
  const offset = Math.max((page - 1) * PAGE_SIZE, 0);

  // First: check if products exist at all for category
  db.get(`SELECT COUNT(*) as total FROM products WHERE category_id = ?`, [categoryId], (err, result) => {
    if (err) {
      console.error('[DB] Count Query Error:', err.message);
      return bot.sendMessage(chatId, '❌ Failed to count products.');
    }

    const total = result?.total || 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    page = Math.min(Math.max(page, 1), totalPages);
    const offset = (page - 1) * PAGE_SIZE;

    if (total === 0) {
      return sendOrEdit(bot, chatId, messageId, '📭 *No products found in this category.*', []);
    }

    // Now safely fetch paginated products
    db.all(
      `SELECT * FROM products WHERE category_id = ? LIMIT ? OFFSET ?`,
      [categoryId, PAGE_SIZE, offset],
      (err, products) => {
        if (err) {
          console.error('[DB] Product Query Error:', err.message);
          return bot.sendMessage(chatId, '❌ Error loading products.');
        }

        if (!products || products.length === 0) {
          return sendOrEdit(bot, chatId, messageId, '📭 *No products on this page.*', []);
        }

        let text = `🛒 *Products in this Category:*\n\n`;
        const keyboard = [];

        products.forEach(product => {
          text += `• *${product.name}*\n`;
          text += `💬 _${product.description || 'No description.'}_\n`;
          text += `💰 *$${product.price}*\n\n`;

          keyboard.push([{
            text: `🛍️ Buy ${product.name}`,
            callback_data: `buy_${product.id}`
          }]);
        });

        const navRow = [];
        if (page > 1) navRow.push({ text: '⬅️ Prev', callback_data: `page_${categoryId}_${page - 1}` });
        if (page < totalPages) navRow.push({ text: '➡️ Next', callback_data: `page_${categoryId}_${page + 1}` });

        keyboard.push(navRow);
        keyboard.push([{ text: '🔙 Back to Categories', callback_data: 'back_to_categories' }]);

        sendOrEdit(bot, chatId, messageId, text, keyboard);
      }
    );
  });
}

function sendOrEdit(bot, chatId, messageId, text, keyboard) {
  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: keyboard
    }
  };

  if (messageId) {
    bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    }).catch(err => {
      console.error('[Edit Fail Fallback]', err.message);
      bot.sendMessage(chatId, text, options);
    });
  } else {
    bot.sendMessage(chatId, text, options);
  }
}
