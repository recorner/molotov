import db from '../database.js';
import { showProductsInCategory } from './productHandler.js';


export async function handleCategoryNavigation(bot, query) {
  const { data, message } = query;

  if (!data.startsWith('cat_')) return;

  const categoryId = parseInt(data.split('_')[1]);

  if (isNaN(categoryId)) {
    console.error('[ERROR] Invalid categoryId from callback:', data);
    return bot.answerCallbackQuery(query.id, { text: 'Invalid category selected.' });
  }

  // Check if it has subcategories
  db.all(`SELECT * FROM categories WHERE parent_id = ?`, [categoryId], (err, subcategories) => {
    if (err) {
      console.error('[DB] Category Query Error:', err.message);
      return bot.answerCallbackQuery(query.id, { text: 'Error loading subcategories.' });
    }

    if (!subcategories || subcategories.length === 0) {
      // No subcategories, show products
      return showProductsInCategory(bot, message.chat.id, categoryId, 1, message.message_id);
    }

    const buttons = subcategories.map((subcat) => [{
      text: subcat.name,
      callback_data: `cat_${subcat.id}`,
    }]);

    // Add a back button to return to previous level
    buttons.push([{ text: '🔙 Back to Categories', callback_data: 'back_to_categories' }]);

    bot.editMessageText(`📂 *Choose a subcategory:*`, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  });
}
