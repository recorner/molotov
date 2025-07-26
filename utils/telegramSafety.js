// utils/telegramSafety.js - Monkey patch bot methods for safe markdown handling
import logger from './logger.js';

class TelegramSafety {
  static escapeMarkdown(text) {
    if (!text || typeof text !== 'string') return text;
    
    // Only escape dynamic content that could break markdown
    // Don't escape template markdown that we control
    return text
      .replace(/([^\\])([*_`\[\]()~>#+\-=|{}.!\\])/g, '$1\\$2') // Escape special chars except at start
      .replace(/^([*_`\[\]()~>#+\-=|{}.!\\])/g, '\\$1'); // Escape special chars at start
  }

  static sanitizeText(text) {
    if (!text) return text;
    
    // Remove problematic zero-width characters
    let cleaned = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // Fix broken markdown by ensuring proper pairing
    const asterisks = (cleaned.match(/\*/g) || []).length;
    const underscores = (cleaned.match(/_/g) || []).length;
    const backticks = (cleaned.match(/`/g) || []).length;
    
    // Close unclosed markdown
    if (asterisks % 2 !== 0) cleaned += '*';
    if (underscores % 2 !== 0) cleaned += '_';
    if (backticks % 2 !== 0) cleaned += '`';
    
    return cleaned;
  }

  static patchBot(bot) {
    // Store original methods
    const originalSendMessage = bot.sendMessage.bind(bot);
    const originalEditMessageText = bot.editMessageText.bind(bot);

    // Monkey patch sendMessage
    bot.sendMessage = function(chatId, text, options = {}) {
      try {
        // Sanitize text for telegram
        const sanitizedText = TelegramSafety.sanitizeText(text);
        
        return originalSendMessage(chatId, sanitizedText, options);
      } catch (error) {
        logger.error('TELEGRAM_SAFETY', 'sendMessage failed, trying without markdown', error);
        
        // Fallback: try without markdown
        try {
          const escapedText = TelegramSafety.escapeMarkdown(text);
          const safeOptions = { ...options };
          delete safeOptions.parse_mode; // Remove markdown parsing
          
          return originalSendMessage(chatId, escapedText, safeOptions);
        } catch (fallbackError) {
          logger.error('TELEGRAM_SAFETY', 'Fallback sendMessage also failed', fallbackError);
          
          // Final fallback: plain text only
          const plainText = text.replace(/[*_`\[\]()~]/g, '');
          return originalSendMessage(chatId, plainText, { reply_markup: options.reply_markup });
        }
      }
    };

    // Monkey patch editMessageText
    bot.editMessageText = function(text, options = {}) {
      try {
        // Sanitize text for telegram
        const sanitizedText = TelegramSafety.sanitizeText(text);
        
        return originalEditMessageText(sanitizedText, options);
      } catch (error) {
        logger.error('TELEGRAM_SAFETY', 'editMessageText failed, trying without markdown', error);
        
        // Fallback: try without markdown
        try {
          const escapedText = TelegramSafety.escapeMarkdown(text);
          const safeOptions = { ...options };
          delete safeOptions.parse_mode; // Remove markdown parsing
          
          return originalEditMessageText(escapedText, safeOptions);
        } catch (fallbackError) {
          logger.error('TELEGRAM_SAFETY', 'Fallback editMessageText also failed', fallbackError);
          
          // Final fallback: try sending new message instead
          if (options.chat_id) {
            const plainText = text.replace(/[*_`\[\]()~]/g, '');
            return originalSendMessage(options.chat_id, plainText, { reply_markup: options.reply_markup });
          }
          throw fallbackError;
        }
      }
    };

    // Monkey patch answerCallbackQuery for safety
    const originalAnswerCallbackQuery = bot.answerCallbackQuery.bind(bot);
    bot.answerCallbackQuery = function(queryId, options = {}) {
      try {
        if (options.text) {
          // Remove markdown from callback query text
          options.text = options.text.replace(/[*_`\[\]()~]/g, '');
        }
        return originalAnswerCallbackQuery(queryId, options);
      } catch (error) {
        logger.error('TELEGRAM_SAFETY', 'answerCallbackQuery failed', error);
        // Try with just the query ID
        return originalAnswerCallbackQuery(queryId, { text: 'Action processed' });
      }
    };

    logger.info('TELEGRAM_SAFETY', 'Bot methods patched for safe markdown handling');
  }
}

export default TelegramSafety;
