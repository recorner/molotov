// handlers/rootCategoryHandler.js - Enhanced with multi-language support and smart message editing
import db from '../database.js';
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';
import instantTranslationService from '../utils/instantTranslationService.js';
import { safeEditMessage } from '../utils/safeMessageEdit.js';
import smartMessageManager from '../utils/smartMessageManager.js';

export async function showRootCategories(bot, chatId, messageId = null) {
  try {
    db.all(`SELECT * FROM categories WHERE parent_id IS NULL`, [], async (err, rows) => {
      if (err) {
        console.error('[DB] Root Categories Fetch Error:', err.message);
        return messageTranslator.sendTranslatedMessage(bot, chatId, 'error_categories');
      }

      if (!rows || rows.length === 0) {
        return messageTranslator.sendTranslatedMessage(bot, chatId, 'no_categories');
      }

      const buttons = [];
      
      // Translate category names
      for (const cat of rows) {
        const translatedName = await instantTranslationService.getTranslation(cat.name, chatId);
        buttons.push([{
          text: `📂 ${translatedName}`,
          callback_data: `cat_${cat.id}`
        }]);
      }

      // Add translated navigation buttons
      buttons.push([
        { 
          text: await messageTranslator.translateTemplateForUser('contact_admin', chatId), 
          url: 'https://t.me/nova_chok' 
        }
      ]);
      
      buttons.push([
        { 
          text: await messageTranslator.translateTemplateForUser('change_language', chatId), 
          callback_data: 'change_language' 
        }
      ]);

      const messageText = await messageTranslator.translateTemplateForUser('main_categories', chatId);

      // Use smart message manager for better UX
      if (messageId) {
        // Edit existing message intelligently - preserve photo if it exists
        await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, messageText, {
          reply_markup: { inline_keyboard: buttons }
        }, true); // Force banner for main categories
      } else {
        // Send new message with banner
        const result = await smartMessageManager.sendOrEditSmart(bot, chatId, null, messageText, {
          reply_markup: { inline_keyboard: buttons }
        }, true);
        
        // Track that this message has a photo banner
        if (result && result.message_id) {
          smartMessageManager.markAsPhotoMessage(chatId, result.message_id);
        }
      }
    });
  } catch (error) {
    console.error('[Root Categories Error]', error);
    bot.sendMessage(chatId, '❌ Error loading categories.');
  }
}
