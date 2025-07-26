// handlers/userHandler.js - Enhanced with multi-language support
import db from '../database.js';
import { notifyGroup } from '../utils/notifyGroup.js';
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';
import instantTranslationService from '../utils/instantTranslationService.js';

export function handleStart(bot, msg) {
  const userId = msg.from.id;
  const { first_name, last_name, username, language_code } = msg.from;

  // ❌ Reject users without a Telegram @username
  if (!username) {
    return messageTranslator.sendTranslatedMessage(bot, userId,
      '⚠️ You must set a Telegram username in your settings to use this bot.\n\n' +
      'Please go to Telegram Settings → Edit Profile → Set Username.\nThen restart the bot.'
    );
  }

  // Check if user exists
  db.get(
    'SELECT * FROM users WHERE telegram_id = ?',
    [userId],
    async (err, row) => {
      if (err) {
        console.error('[DB] User query error:', err.message);
        return;
      }

      const isNewUser = !row;

      if (isNewUser) {
        // For new users, show language selection first
        const languageMessage = await messageTranslator.createLanguageSelectionMessage(userId);
        
        await bot.sendMessage(userId,
          `👋 *Welcome to Molotov Bot!* 🚀\n\n` +
          `🌍 *Premium Digital Marketplace*\n\n` +
          `Please select your preferred language to continue:`,
          {
            parse_mode: 'Markdown',
            reply_markup: languageMessage.reply_markup
          }
        );

        // Insert user with default language, will be updated when they select
        db.run(
          'INSERT INTO users (telegram_id, first_name, last_name, username, language_code, last_activity) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, first_name, last_name, username, language_code || 'en', new Date().toISOString()],
          (err) => {
            if (err) {
              console.error('[DB] User insert error:', err.message);
              return;
            }
            // Note: User notification will be sent after language selection
          }
        );

        return; // Don't show categories yet, wait for language selection
      }

      // For existing users, update last activity and show categories
      db.run(
        'UPDATE users SET last_activity = ? WHERE telegram_id = ?',
        [new Date().toISOString(), userId],
        (err) => {
          if (err) console.error('[DB] Activity update error:', err.message);
        }
      );

      // Show welcome back message and categories
      await showCategoriesMenu(bot, userId, true);
    }
  );
}

// Function to show categories menu with translation
export async function showCategoriesMenu(bot, userId, isWelcome = true) {
  try {
    // Get user info for personalized greeting
    db.get('SELECT first_name FROM users WHERE telegram_id = ?', [userId], async (err, user) => {
      const firstName = user?.first_name || 'there';
      
      if (isWelcome) {
        // Send welcome message using template
        const welcomeText = await messageTranslator.translateTemplateForUser(
          'welcome_back_message',
          userId,
          { firstName: firstName }
        );

        await bot.sendMessage(userId, welcomeText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ 
                text: await messageTranslator.translateTemplateForUser('browse_categories_button', userId), 
                callback_data: 'load_categories' 
              }],
              [{ 
                text: await messageTranslator.translateTemplateForUser('contact_admin', userId), 
                url: 'https://t.me/nova_chok' 
              }],
              [{ 
                text: await messageTranslator.translateTemplateForUser('change_language', userId), 
                callback_data: 'change_language' 
              }]
            ]
          }
        });
      }

      // Show categories
      db.all(
        'SELECT * FROM categories WHERE parent_id IS NULL',
        [],
        async (err, rows) => {
          if (err) {
            console.error('[DB] Category Fetch Error:', err.message);
            return messageTranslator.sendTranslatedMessage(bot, userId, 'error_loading');
          }

          if (rows.length === 0) {
            return messageTranslator.sendTranslatedMessage(bot, userId, 'no_categories');
          }

          const buttons = [];
          
          // Translate category names and create buttons
          for (const row of rows) {
            const translatedName = await instantTranslationService.getTranslation(row.name, userId);
            buttons.push([{
              text: `📂 ${translatedName}`,
              callback_data: `cat_${row.id}`
            }]);
          }

          // Add admin contact and language change buttons
          buttons.push([
            { 
              text: await messageTranslator.translateTemplateForUser('contact_admin', userId), 
              url: 'https://t.me/nova_chok' 
            }
          ]);
          
          buttons.push([
            { 
              text: await messageTranslator.translateTemplateForUser('change_language', userId), 
              callback_data: 'change_language' 
            }
          ]);

          const categoryMessage = await messageTranslator.translateTemplateForUser('select_category', userId);
          
          bot.sendMessage(userId, `🛍️ ${categoryMessage}`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
          });
        }
      );
    });
  } catch (error) {
    console.error('[Categories Menu Error]', error);
    bot.sendMessage(userId, '❌ Error loading categories.');
  }
}

// Handle language selection callback
export async function handleLanguageSelection(bot, query) {
  const { data, message, from } = query;
  const userId = from.id;
  
  if (!data.startsWith('lang_')) return false;
  
  const languageCode = data.split('_')[1];
  
  try {
    await translationService.setUserLanguage(userId, languageCode);
    
    // Send user joined notification after language selection
    db.get('SELECT first_name, last_name, username FROM users WHERE telegram_id = ?', [userId], (err, user) => {
      if (!err && user) {
        const joinedAt = new Date().toLocaleString();
        const langInfo = translationService.getSupportedLanguages()[languageCode];
        const intro = 
          `🎉 *New User Joined!*\n\n` +
          `👤 Name: ${user.first_name} ${user.last_name || ''}\n` +
          `🔗 Username: [@${user.username}](https://t.me/${user.username})\n` +
          `🆔 Telegram ID: \`${userId}\`\n` +
          `🌐 Language: ${langInfo?.flag || '🌍'} ${langInfo?.name || languageCode}\n` +
          `🕒 Time: ${joinedAt}`;

        notifyGroup(bot, intro, { parse_mode: 'Markdown' });
      }
    });
    
    const langInfo = translationService.getSupportedLanguages()[languageCode];
    const successMessage = await messageTranslator.translateTemplateForUser(
      'language_updated', 
      userId, 
      { language: langInfo?.name || languageCode }
    );
    
    await bot.answerCallbackQuery(query.id, {
      text: successMessage,
      show_alert: true
    });

    // Update the message to show categories
    await bot.editMessageText(
      await messageTranslator.translateTemplateForUser('language_updated_loading', userId),
      {
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: 'Markdown'
      }
    );

    // Show categories menu after a short delay
    setTimeout(async () => {
      await showCategoriesMenu(bot, userId, true);
    }, 1000);

    return true;
    
  } catch (error) {
    console.error('[Language Selection Error]', error);
    await bot.answerCallbackQuery(query.id, {
      text: await messageTranslator.translateTemplateForUser('language_error', userId),
      show_alert: true
    });
    return true;
  }
}
