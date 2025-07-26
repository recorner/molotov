// handlers/rootCategoryHandler.js - Enhanced with multi-language support
import db from '../database.js';
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';

export async function showRootCategories(bot, chatId, messageId = null) {
  try {
    const userLang = await translationService.getUserLanguage(chatId);
    
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
        const translatedName = await translationService.translate(cat.name, userLang);
        buttons.push([{
          text: `📂 ${translatedName}`,
          callback_data: `cat_${cat.id}`
        }]);
      }

      // Add translated navigation buttons
      buttons.push([
        { 
          text: await messageTranslator.translateForUser('📞 Contact Admin', chatId), 
          url: 'https://t.me/nova_chok' 
        }
      ]);
      
      buttons.push([
        { 
          text: await messageTranslator.translateForUser('🌍 Change Language', chatId), 
          callback_data: 'change_language' 
        }
      ]);

      const messageText = await messageTranslator.translateForUser(
        '🧱 *Main Categories:*\n\nBrowse the available product types below.',
        chatId
      );

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
  } catch (error) {
    console.error('[Root Categories Error]', error);
    bot.sendMessage(chatId, '❌ Error loading categories.');
  }
}
