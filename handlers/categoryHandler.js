import db from '../database.js';
import { showProductsInCategory } from './productHandler.js';
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';

export async function handleCategoryNavigation(bot, query) {
  const { data, message } = query;

  if (!data.startsWith('cat_')) return;

  const categoryId = parseInt(data.split('_')[1]);

  if (isNaN(categoryId)) {
    console.error('[ERROR] Invalid categoryId from callback:', data);
    return messageTranslator.answerTranslatedCallback(bot, query.id, 'invalid_selection', query.from.id);
  }

  const userLang = await translationService.getUserLanguage(query.from.id);

  // Check if it has subcategories
  db.all(`SELECT * FROM categories WHERE parent_id = ?`, [categoryId], async (err, subcategories) => {
    if (err) {
      console.error('[DB] Category Query Error:', err.message);
      return messageTranslator.answerTranslatedCallback(bot, query.id, 'error_loading', query.from.id);
    }

    if (!subcategories || subcategories.length === 0) {
      // No subcategories, show products
      return showProductsInCategory(bot, message.chat.id, categoryId, 1, message.message_id);
    }

    const buttons = [];
    
    // Translate subcategory names
    for (const subcat of subcategories) {
      const translatedName = await translationService.translate(subcat.name, userLang);
      buttons.push([{
        text: `📁 ${translatedName}`,
        callback_data: `cat_${subcat.id}`
      }]);
    }

    // Add back button
    buttons.push([{
      text: await messageTranslator.translateForUser('🔙 Back to Categories', query.from.id),
      callback_data: 'back_to_categories'
    }]);

    // Get parent category name for header
    db.get(`SELECT name FROM categories WHERE id = ?`, [categoryId], async (err, parent) => {
      const parentName = parent ? await translationService.translate(parent.name, userLang) : 'Category';
      const headerText = await messageTranslator.translateForUser(
        `📂 *Choose a subcategory:*`,
        query.from.id
      );

      bot.editMessageText(headerText, {
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      }).catch(err => {
        console.error('[Edit Error]', err.message);
        bot.sendMessage(message.chat.id, headerText, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });
      });
    });
  });
}
