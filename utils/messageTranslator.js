// utils/messageTranslator.js - Message translation middleware with instant response
import translationService from './translationService.js';
import prebuiltTranslations from './prebuiltTranslations.js';
import instantTranslationService from './instantTranslationService.js';
import markdownSafeTranslator from './markdownSafeTranslator.js';
import logger from './logger.js';

class MessageTranslator {
  constructor() {
    this.isInitialized = false;
    
    // Common message templates that should be translated
    this.messageTemplates = {
      // Welcome and navigation
      'welcome_message': '🚀 *Welcome to Molotov Bot*\n\n💎 Your premium digital marketplace for cryptocurrency products.',
      'welcome_back_message': '👋 Welcome back {firstName} to the Digital Syndicate.\n\n🌐 The Darkest Vault for Premium Digital Access.\n\n🛒 Browse a curated stash of:\n• ⚡ Instant Enrollments\n• 📲 Verified App & Bank Open-Ups\n• 🛰️ Elite Proxy Networks\n• ☎️ Clean, Trusted Phone Numbers\n\n💳 Payments via Bitcoin or Litecoin only.\n🕶️ Operated by trusted hands — we\'re the best in the game.\n\n👇 Tap below to dive in or reach out to Admin if you need priority access:',
      'browse_categories_button': '🛍️ Browse Categories',
      'select_language': '🌍 *Choose Your Language*\n\nPlease select your preferred language to continue:',
      'language_updated': '✅ *Language Updated Successfully*\n\n🌍 Your interface is now in {language}',
      'language_updated_loading': 'Language updated! Loading categories...',
      'welcome_complete': '✅ *Setup Complete!*\n\nWelcome to Molotov Bot! Your language has been set to {language}.',
      'language_error': '❌ *Error Updating Language*\n\nPlease try again.',
      
      // Categories and products
      'main_categories': '📂 *Main Categories*',
      'browse_categories': 'Browse our available product categories below.',
      'select_category': '*Choose a Category*\n\nSelect a category below to browse products:',
      'products_in_category': '*Products in this Category*',
      'no_categories': '🚧 *No Categories Available*\n\nCategories will be added soon.',
      'no_products': '📭 *No Products Found*\n\nNo products available in this category.',
      'no_products_page': '📭 *Empty Page*\n\nNo products on this page.',
      
      // Buttons and actions
      'contact_admin': '📞 Contact Admin',
      'back_to_categories': '🔙 Back to Categories',
      'buy_product': '🛍️ Buy',
      'previous_page': '⬅️ Previous',
      'next_page': '➡️ Next',
      'change_language': '🌍 Change Language',
      
      // Errors and status
      'error_loading': '❌ *Loading Error*\n\nPlease try again.',
      'error_categories': '❌ *Categories Error*\n\nCould not load categories.',
      'error_products': '❌ *Products Error*\n\nError loading products.',
      'invalid_category': '⚠️ *Invalid Category*\n\nPlease select a valid category.',
      'invalid_selection': '⚠️ *Invalid Selection*\n\nPlease make a valid selection.',
      'invalid_pagination': '⚠️ *Invalid Page*\n\nPage not found.',
      'unknown_action': '🤷 *Unknown Action*\n\nPlease try again.',
      'error_processing': '⚠️ *Processing Error*\n\nError processing your request.',
      'please_wait': '⏱️ *Please Wait*\n\nToo many requests. Please wait.',
      
      // Payment and orders
      'price_label': '💰 Price',
      'order_id': '📋 Order ID',
      'payment_pending': '⏳ *Payment Pending*',
      'payment_confirmed': '✅ *Payment Confirmed*',
      'order_completed': '🎉 *Order Completed*',
      
      // Admin messages
      'admin_panel': '🔧 *Admin Panel*',
      'sidekick_system': '🚀 *Sidekick System*',
      'wallet_management': '💳 *Wallet Management*',
      
      // System messages
      'system_online': '🟢 *System Online*',
      'bot_restarted': '🔄 *Bot Restarted*',
      'maintenance_mode': '🔧 *Maintenance Mode*',
      'service_unavailable': '⚠️ *Service Unavailable*\n\nTemporarily unavailable.',
      
      // Bot description and about (for setMyDescription and setMyShortDescription)
      'bot_description': '🚀 Molotov Bot - Your premium digital marketplace for cryptocurrency products. Secure payments via Bitcoin and Litecoin. Browse verified accounts, proxy networks, phone numbers, and more. Trusted by professionals worldwide.',
      'bot_short_description': '💎 Premium digital marketplace for crypto products. Secure, verified, trusted.',
      'bot_about_text': '🛒 Premium Digital Marketplace\n\n💎 Molotov Bot offers exclusive digital products and services for cryptocurrency payments. We specialize in verified accounts, proxy networks, phone numbers, and premium digital tools.\n\n🔐 Secure payments via Bitcoin & Litecoin\n🌍 Worldwide trusted platform\n⚡ Instant delivery\n🛡️ Professional support',
      
      // Command descriptions for bot menu
      'command_start_desc': 'Start shopping and browse categories',
      'command_help_desc': 'Get help and contact support',
      
      // Payment specific messages
      'order_summary': 'Order Summary',
      'product_label': 'Product',
      'description_label': 'Description',
      'date_label': 'Date',
      'amount_label': 'Amount',
      'currency_label': 'Currency',
      'payment_options': 'Secure Payment Options',
      'choose_payment_method': 'Choose your preferred cryptocurrency:',
      'bitcoin_payment': 'Bitcoin (BTC)',
      'litecoin_payment': 'Litecoin (LTC)',
      'payment_guide': 'Payment Guide',
      'back_to_products': 'Back to Products',
      'no_description': 'No description available',
      'payment_instructions': 'Payment Instructions',
      'send_payment_to': 'Send Payment To',
      'important_label': 'Important',
      'send_exactly': 'Send exactly {amount} worth of {currency}',
      'double_check_address': 'Double-check the address above',
      'confirmation_time': 'Payment may take 10-60 minutes to confirm',
      'keep_transaction_id': 'Keep your transaction ID for reference',
      'after_sending_payment': 'After sending payment, click the button below',
      'sent_payment': 'I\'ve Sent Payment',
      'copy_address': 'Copy Address',
      'payment_help': 'Payment Help',
      'refresh_status': 'Refresh Status',
      'back_to_store': 'Back to Store',
      'cancel_order': 'Cancel Order',
    };
  }

  // Initialize the message translator with instant service
  async initialize() {
    if (this.isInitialized) return true;

    try {
      await instantTranslationService.initialize();
      this.isInitialized = true;
      logger.info('TRANSLATOR', 'Message translator initialized with instant service');
      return true;
    } catch (error) {
      logger.warn('TRANSLATOR', `Initialization failed: ${error.message}`);
      return false;
    }
  }

  // Translate a predefined message template with instant response
  async translateTemplate(templateKey, targetLang, replacements = {}) {
    // Get the base template
    let message = this.messageTemplates[templateKey];
    
    if (!message) {
      logger.warn('TRANSLATOR', `Template not found: ${templateKey}`);
      return templateKey; // Return key if template not found
    }

    // For English, apply replacements and return immediately
    if (targetLang === 'en' || !targetLang) {
      for (const [key, value] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`{${key}}`, 'g'), value);
      }
      return message;
    }

    try {
      // Use instant translation service (Redis cache first, then fallback)
      const translatedMessage = await instantTranslationService.getTranslation(
        templateKey, 
        targetLang, 
        message
      );

      // Apply replacements to translated message
      let finalMessage = translatedMessage;
      for (const [key, value] of Object.entries(replacements)) {
        finalMessage = finalMessage.replace(new RegExp(`{${key}}`, 'g'), value);
      }

      return finalMessage;

    } catch (error) {
      logger.warn('TRANSLATOR', `Translation failed for ${templateKey}:${targetLang}, using English fallback`);
      
      // Apply replacements to English fallback
      for (const [key, value] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`{${key}}`, 'g'), value);
      }
      return message;
    }
  }

  // Fast template translation for user (uses cache efficiently)
  async translateTemplateForUser(templateKey, telegramId, replacements = {}) {
    const userLang = await translationService.getUserLanguage(telegramId);
    return await this.translateTemplate(templateKey, userLang, replacements);
  }

  // Translate a message for a specific user
  async translateForUser(text, telegramId, replacements = {}) {
    const userLang = await translationService.getUserLanguage(telegramId);
    
    // Check if it's a template key
    if (this.messageTemplates[text]) {
      return await this.translateTemplate(text, userLang, replacements);
    }
    
    // Apply replacements to raw text
    let processedText = text;
    for (const [key, value] of Object.entries(replacements)) {
      processedText = processedText.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    
    // Use instant translation service instead of slow translationService
    return await instantTranslationService.getTranslation('custom_text', userLang, processedText);
  }

  // Create a translated message object for bot.sendMessage
  async createMessage(templateKeyOrText, telegramId, options = {}) {
    const { replacements = {}, ...botOptions } = options;
    
    const translatedText = await this.translateForUser(templateKeyOrText, telegramId, replacements);
    
    return {
      text: translatedText,
      options: botOptions
    };
  }

  // Send a translated message
  async sendTranslatedMessage(bot, chatId, templateKeyOrText, options = {}) {
    try {
      const { replacements = {}, ...botOptions } = options;
      const translatedText = await this.translateForUser(templateKeyOrText, chatId, replacements);
      
      return await bot.sendMessage(chatId, translatedText, botOptions);
    } catch (error) {
      logger.error('TRANSLATOR', 'Failed to send translated message', error);
      // Fallback to original text
      return await bot.sendMessage(chatId, templateKeyOrText, options);
    }
  }

  // Edit a translated message
  async editTranslatedMessage(bot, chatId, messageId, templateKeyOrText, options = {}) {
    try {
      const { replacements = {}, ...botOptions } = options;
      const translatedText = await this.translateForUser(templateKeyOrText, chatId, replacements);
      
      return await bot.editMessageText(translatedText, {
        chat_id: chatId,
        message_id: messageId,
        ...botOptions
      });
    } catch (error) {
      logger.error('TRANSLATOR', 'Failed to edit translated message', error);
      // Fallback to sending new message
      return await this.sendTranslatedMessage(bot, chatId, templateKeyOrText, options);
    }
  }

  // Answer callback query with translation
  async answerTranslatedCallback(bot, queryId, templateKeyOrText, telegramId, showAlert = false) {
    try {
      const translatedText = await this.translateForUser(templateKeyOrText, telegramId);
      return await bot.answerCallbackQuery(queryId, {
        text: translatedText,
        show_alert: showAlert
      });
    } catch (error) {
      logger.error('TRANSLATOR', 'Failed to answer translated callback', error);
      return await bot.answerCallbackQuery(queryId, {
        text: templateKeyOrText,
        show_alert: showAlert
      });
    }
  }

  // Translate button text
  async translateButton(buttonText, targetLang) {
    // Remove emojis for translation, then add them back
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojis = buttonText.match(emojiRegex) || [];
    const textOnly = buttonText.replace(emojiRegex, '').trim();
    
    if (!textOnly) return buttonText; // Only emojis
    
    const translated = await translationService.translate(textOnly, targetLang);
    
    // Reconstruct with emojis
    let result = translated;
    emojis.forEach(emoji => {
      result = emoji + ' ' + result;
    });
    
    return result.trim();
  }

  // Translate entire keyboard
  async translateKeyboard(keyboard, targetLang) {
    const translatedKeyboard = [];
    
    for (const row of keyboard) {
      const translatedRow = [];
      
      for (const button of row) {
        const translatedButton = { ...button };
        
        if (button.text) {
          translatedButton.text = await this.translateButton(button.text, targetLang);
        }
        
        translatedRow.push(translatedButton);
      }
      
      translatedKeyboard.push(translatedRow);
    }
    
    return translatedKeyboard;
  }

  // Get user's language and translate keyboard
  async translateKeyboardForUser(keyboard, telegramId) {
    const userLang = await translationService.getUserLanguage(telegramId);
    return await this.translateKeyboard(keyboard, userLang);
  }

  // Create language selection message
  async createLanguageSelectionMessage(telegramId) {
    const userLang = await translationService.getUserLanguage(telegramId);
    const message = await this.translateTemplate('select_language', userLang);
    const keyboard = translationService.getLanguageKeyboard();
    
    return {
      text: message,
      reply_markup: {
        inline_keyboard: keyboard
      }
    };
  }

  // Batch translate multiple messages
  async batchTranslate(messages, targetLang) {
    const promises = messages.map(msg => 
      translationService.translate(msg, targetLang)
    );
    return await Promise.all(promises);
  }

  // Add new message template
  addTemplate(key, message) {
    this.messageTemplates[key] = message;
  }

  // Get all templates
  getTemplates() {
    return { ...this.messageTemplates };
  }

  // Format price with currency
  formatPrice(price, currency = 'USD') {
    const symbols = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'RUB': '₽',
      'CNY': '¥',
      'BTC': '₿',
      'ETH': 'Ξ'
    };
    
    const symbol = symbols[currency] || currency;
    return `${symbol}${price}`;
  }

  // Format order status with emoji
  formatOrderStatus(status) {
    const statusEmojis = {
      'pending': '⏳',
      'confirmed': '✅',
      'cancelled': '❌',
      'completed': '🎉',
      'processing': '🔄'
    };
    
    const emoji = statusEmojis[status] || '❓';
    return `${emoji} ${status}`;
  }

    // Update bot description and short description based on language
  async updateBotDescription(bot, languageCode = 'en') {
    try {
      // Get translated descriptions
      const description = await this.translateTemplate('bot_description', languageCode);
      const shortDescription = await this.translateTemplate('bot_short_description', languageCode);
      const aboutText = await this.translateTemplate('bot_about_text', languageCode);
      
      // Update bot description (appears in bot profile)
      await bot.setMyDescription({
        description: description,
        language_code: languageCode
      });
      
      // Update bot short description (appears in search results)
      await bot.setMyShortDescription({
        short_description: shortDescription,
        language_code: languageCode
      });

      // Set commands with descriptions for this language
      const commands = [
        {
          command: 'start',
          description: await this.translateTemplate('command_start_desc', languageCode)
        },
        {
          command: 'help',
          description: await this.translateTemplate('command_help_desc', languageCode)
        }
      ];

      await bot.setMyCommands(commands, {
        language_code: languageCode
      });
      
      logger.debug('BOT_INFO', `Updated bot info for language: ${languageCode}`);
      return true;
    } catch (error) {
      logger.error('BOT_INFO', `Failed to update bot info for ${languageCode}`, error);
      return false;
    }
  }

  // Update bot descriptions for all supported languages
  async updateBotDescriptionsForAllLanguages(bot) {
    const supportedLanguages = translationService.getSupportedLanguages();
    const results = [];
    
    for (const [langCode] of Object.entries(supportedLanguages)) {
      const success = await this.updateBotDescription(bot, langCode);
      results.push({ language: langCode, success });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    logger.info('BOT_INFO', `Updated bot descriptions for ${results.length} languages`);
    return results;
  }
}

// Create singleton instance
const messageTranslator = new MessageTranslator();

export default messageTranslator;
