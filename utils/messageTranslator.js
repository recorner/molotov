// utils/messageTranslator.js - Message translation middleware
import translationService from './translationService.js';
import markdownSafeTranslator from './markdownSafeTranslator.js';
import logger from './logger.js';

class MessageTranslator {
  constructor() {
    // Common message templates that should be translated
    this.messageTemplates = {
      // Welcome and navigation
      'welcome_message': 'Welcome to Molotov Bot! 🚀\n\nYour premium digital marketplace for cryptocurrency products.',
      'select_language': 'Please select your preferred language:',
      'language_updated': 'Language updated successfully! 🌍',
      'language_error': 'Error updating language. Please try again.',
      
      // Categories and products
      'main_categories': 'Main Categories',
      'browse_categories': 'Browse the available product types below.',
      'select_category': 'Please select a category below to browse:',
      'products_in_category': 'Products in this Category:',
      'no_categories': 'No categories available at the moment.',
      'no_products': 'No products found in this category.',
      'no_products_page': 'No products on this page.',
      
      // Buttons and actions
      'contact_admin': 'Contact Admin',
      'back_to_categories': 'Back to Categories',
      'buy_product': 'Buy',
      'previous_page': 'Prev',
      'next_page': 'Next',
      'change_language': 'Change Language',
      
      // Errors and status
      'error_loading': 'Error loading',
      'error_categories': 'Could not load categories.',
      'error_products': 'Error loading products.',
      'invalid_category': 'Invalid category selected.',
      'invalid_selection': 'Invalid selection.',
      'invalid_pagination': 'Invalid pagination data.',
      'unknown_action': 'Unknown action. Please try again.',
      'error_processing': 'Error processing your action.',
      'please_wait': 'Please wait before trying again.',
      
      // Payment and orders
      'price_label': 'Price',
      'order_id': 'Order ID',
      'payment_pending': 'Payment pending',
      'payment_confirmed': 'Payment confirmed',
      'order_completed': 'Order completed',
      
      // Admin messages
      'admin_panel': 'Admin Panel',
      'sidekick_system': 'Sidekick System',
      'wallet_management': 'Wallet Management',
      
      // System messages
      'system_online': 'System Online',
      'bot_restarted': 'Bot Restarted',
      'maintenance_mode': 'Maintenance Mode',
      'service_unavailable': 'Service temporarily unavailable',
    };
  }

  // Translate a predefined message template
  async translateTemplate(templateKey, targetLang, replacements = {}) {
    let message = this.messageTemplates[templateKey];
    
    if (!message) {
      logger.warn('TRANSLATOR', `Template not found: ${templateKey}`);
      return templateKey; // Return key if template not found
    }

    // Apply replacements before translation
    for (const [key, value] of Object.entries(replacements)) {
      message = message.replace(new RegExp(`{${key}}`, 'g'), value);
    }

    // Translate the message
    return await translationService.translate(message, targetLang);
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
    
    return await translationService.translate(processedText, userLang);
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
}

// Create singleton instance
const messageTranslator = new MessageTranslator();

export default messageTranslator;
