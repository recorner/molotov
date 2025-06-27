// handlers/rootCategoryHandler.js
import db from '../database.js';

export function showRootCategories(bot, chatId, messageId = null) {
  db.all(`SELECT * FROM categories WHERE parent_id IS NULL`, [], (err, rows) => {
    if (err) {
      console.error('[DB] Root Categories Fetch Error:', err.message);
      return bot.sendMessage(chatId, '❌ Could not load categories.');
    }

    if (!rows || rows.length === 0) {
      return bot.sendMessage(chatId, '🚧 No categories available yet.');
    }

    const buttons = rows.map(cat => [{
      text: cat.name,
      callback_data: `cat_${cat.id}`
    }]);

    const messageText = `🧱 *Main Categories:*\n\nBrowse the available product types below.`;

    if (messageId) {
      bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      }).catch(err => {
        console.error('[Edit Fallback]', err.message);
        bot.sendMessage(chatId, messageText, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });
      });
    } else {
      bot.sendMessage(chatId, messageText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });
    }
  });
}
