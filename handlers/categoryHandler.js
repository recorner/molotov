import db from '../database.js';
import { showProductsInCategory } from './productHandler.js';
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';
import instantTranslationService from '../utils/instantTranslationService.js';
import { safeEditMessage } from '../utils/safeMessageEdit.js';
import smartMessageManager from '../utils/smartMessageManager.js';

export async function handleCategoryNavigation(bot, query) {
  const { data, message } = query;

  if (!data.startsWith('cat_')) return;

  const categoryId = parseInt(data.split('_')[1]);

  if (isNaN(categoryId)) {
    console.error('[ERROR] Invalid categoryId from callback:', data);
    return messageTranslator.answerTranslatedCallback(bot, query.id, 'invalid_selection', query.from.id);
  }

  // Check if it has subcategories
  db.all(`SELECT * FROM categories WHERE parent_id = ? AND (status IS NULL OR status = 'active')`, [categoryId], async (err, subcategories) => {
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
      const translatedName = await instantTranslationService.getTranslation(subcat.name, query.from.id);
      buttons.push([{
        text: `📁 ${translatedName}`,
        callback_data: `cat_${subcat.id}`
      }]);
    }

    // Add back button
    buttons.push([{
      text: await messageTranslator.translateTemplateForUser('back_to_categories', query.from.id),
      callback_data: 'back_to_categories'
    }]);

    // Get parent category name for header
    db.get(`SELECT name FROM categories WHERE id = ?`, [categoryId], async (err, parent) => {
      const parentName = parent ? await instantTranslationService.getTranslation(parent.name, query.from.id) : 'Category';
      const headerText = await messageTranslator.translateTemplateForUser('select_category', query.from.id);

      // Use smart editing that preserves photo banners when possible
      await smartMessageManager.sendOrEditSmart(bot, message.chat.id, message.message_id, headerText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      }, true); // Force banner for category navigation
    });
  });
}
