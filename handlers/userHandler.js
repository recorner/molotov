// handlers/userHandler.js - Enhanced with multi-language support
import db from '../database.js';
import { notifyGroup, notifyNewUser } from '../utils/notifyGroup.js';
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';
import instantTranslationService from '../utils/instantTranslationService.js';
import { SUPPORT_USERNAME } from '../config.js';
import logger from '../utils/logger.js';
import smartMessageManager from '../utils/smartMessageManager.js';

export function handleStart(bot, msg) {
  const userId = msg.from.id;
  const { first_name, last_name, username, language_code } = msg.from;

  logger.info('USER', `Start command received from user ${userId} (@${username || 'no_username'})`);

  // ❌ Reject users without a Telegram @username
  if (!username) {
    logger.warn('USER', `Access denied for user ${userId}: No username set`);
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
        logger.error('USER', `Database error during user lookup for ${userId}`, err);
        return;
      }

      const isNewUser = !row;

      if (isNewUser) {
        logger.info('USER', `New user registration: ${userId} (@${username})`);
        
        // For new users, show language selection first with banner
        const languageMessage = await messageTranslator.createLanguageSelectionMessage(userId);
        
        await messageTranslator.sendBannerWithMessage(bot, userId,
          `👋 *Welcome to Molotov Bot!* 🚀\n\n` +
          `🌍 *Premium Digital Marketplace*\n\n` +
          `Please select your preferred language to continue:`,
          {
            reply_markup: languageMessage.reply_markup
          }
        );

        // Insert user with default language, will be updated when they select
        db.run(
          'INSERT INTO users (telegram_id, first_name, last_name, username, language_code, last_activity) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, first_name, last_name, username, language_code || 'en', new Date().toISOString()],
          (err) => {
            if (err) {
              logger.error('USER', `Failed to insert new user ${userId}`, err);
              return;
            }
            logger.info('USER', `User ${userId} (@${username}) registered successfully`);
            // Note: User notification will be sent after language selection
          }
        );

        return; // Don't show categories yet, wait for language selection
      }

      // For existing users, update last activity and show categories
      logger.debug('USER', `Existing user ${userId} (@${username}) accessed bot`);
      db.run(
        'UPDATE users SET last_activity = ? WHERE telegram_id = ?',
        [new Date().toISOString(), userId],
        (err) => {
          if (err) {
            logger.error('USER', `Failed to update last activity for user ${userId}`, err);
          }
        }
      );

      // Show welcome back message and categories
      await showCategoriesMenu(bot, userId, true);
    }
  );
}

// Function to show categories menu with translation
export async function showCategoriesMenu(bot, userId, isWelcome = true) {
  logger.debug('USER', `Showing categories menu for user ${userId}, welcome: ${isWelcome}`);
  
  try {
    // Get user info for personalized greeting
    db.get('SELECT first_name FROM users WHERE telegram_id = ?', [userId], async (err, user) => {
      if (err) {
        logger.error('USER', `Failed to fetch user info for ${userId}`, err);
        return;
      }
      
      const firstName = user?.first_name || 'there';
      
      if (isWelcome) {
        // Send welcome message with banner using template
        // Send welcome back message - force banner for welcome experience
        smartMessageManager.forceBannerNext(userId); // Allow banner for welcome
        await smartMessageManager.sendOrEditSmart(bot, userId, null, 
          await messageTranslator.translateTemplateForUser('welcome_back_message', userId, { firstName: firstName }), {
          reply_markup: {
            inline_keyboard: [
              [{ 
                text: await messageTranslator.translateTemplateForUser('browse_categories_button', userId), 
                callback_data: 'load_categories' 
              }],
              [{ 
                text: await messageTranslator.translateTemplateForUser('contact_admin', userId), 
                url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` 
              }],
              [{ 
                text: await messageTranslator.translateTemplateForUser('change_language', userId), 
                callback_data: 'change_language' 
              }]
            ]
          }
        }, true); // Force banner
      }

      // Only show categories list when NOT showing welcome (i.e., when user clicks Browse Categories)
      if (!isWelcome) {
        db.all(
          'SELECT * FROM categories WHERE parent_id IS NULL',
          [],
          async (err, rows) => {
            if (err) {
              logger.error('USER', `Failed to fetch categories for user ${userId}`, err);
              return messageTranslator.sendTranslatedMessage(bot, userId, 'error_loading');
            }

            if (rows.length === 0) {
              logger.warn('USER', `No categories found for user ${userId}`);
              return messageTranslator.sendTranslatedMessage(bot, userId, 'no_categories');
            }

            logger.debug('USER', `Displaying ${rows.length} categories to user ${userId}`);

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
                url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` 
              }
            ]);
            
            buttons.push([
              { 
                text: await messageTranslator.translateTemplateForUser('change_language', userId), 
                callback_data: 'change_language' 
              }
            ]);

            const categoryMessage = await messageTranslator.translateTemplateForUser('select_category', userId);
            
            // Use smart messaging - categories are important so allow banner but with cooldown
            await smartMessageManager.sendOrEditSmart(bot, userId, null, `🛍️ ${categoryMessage}`, {
              reply_markup: { inline_keyboard: buttons }
            }, true); // Force banner for categories
          }
        );
      }
    });
  } catch (error) {
    logger.error('USER', `Error in showCategoriesMenu for user ${userId}`, error);
    bot.sendMessage(userId, '❌ Error loading categories.');
  }
}

// Handle language selection callback
export async function handleLanguageSelection(bot, query) {
  const { data, message, from } = query;
  const userId = from.id;
  
  if (!data.startsWith('lang_')) return false;
  
  const languageCode = data.split('_')[1];
  logger.info('USER', `Language selection: ${userId} chose ${languageCode}`);
  
  try {
    await translationService.setUserLanguage(userId, languageCode);
    
    // Update bot description for this language if it's the first time
    messageTranslator.updateBotDescription(bot, languageCode).catch(err => {
      logger.warn('USER', `Failed to update bot description for ${languageCode}`, err);
    });
    
    // Send enhanced user joined notification with PM links
    db.get('SELECT first_name, last_name, username FROM users WHERE telegram_id = ?', [userId], async (err, user) => {
      if (!err && user) {
        logger.info('USER', `Sending new user notification for ${userId} (@${user.username})`);
        await notifyNewUser(bot, {
          userId: userId,
          firstName: user.first_name,
          lastName: user.last_name,
          username: user.username,
          languageCode: languageCode,
          joinTime: new Date().toLocaleString()
        });
      } else if (err) {
        logger.error('USER', `Failed to fetch user data for notification ${userId}`, err);
      }
    });
    
    const langInfo = translationService.getSupportedLanguages()[languageCode];
    const successMessage = await messageTranslator.translateTemplateForUser(
      'language_updated', 
      userId, 
      { language: langInfo?.name || languageCode }
    );
    
    // Use a simple callback answer instead of alert popup
    await bot.answerCallbackQuery(query.id, {
      text: `✅ ${langInfo?.flag || ''} ${successMessage}`,
      show_alert: false // This makes it a top notification instead of popup
    });

    // Smoothly transition to categories menu with banner
    const welcomeText = await messageTranslator.translateTemplateForUser(
      'welcome_complete', 
      userId, 
      { language: langInfo?.name || languageCode }
    );

    // Send loading message with banner
    await messageTranslator.sendBannerWithMessage(bot, message.chat.id, 
      `🎉 ${welcomeText}\n\n⚡ *Loading your marketplace...*`
    );

    // Show categories menu after a brief moment for smooth transition
    setTimeout(async () => {
      try {
        // Show the categories menu with banner
        await showCategoriesMenu(bot, userId, true);
        logger.info('USER', `Successfully completed onboarding for user ${userId}`);
      } catch (error) {
        logger.error('USER', `Error in language selection transition for user ${userId}`, error);
        // Fallback: just show categories without deleting
        await showCategoriesMenu(bot, userId, true);
      }
    }, 1500);

    return true;
    
  } catch (error) {
    logger.error('USER', `Language selection error for user ${userId}`, error);
    await bot.answerCallbackQuery(query.id, {
      text: await messageTranslator.translateTemplateForUser('language_error', userId),
      show_alert: false
    });
    return true;
  }
}
