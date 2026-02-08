// utils/telegramSafety.js - Monkey patch bot methods for safe markdown handling
import logger from './logger.js';

class TelegramSafety {
  /**
   * Strip all Markdown special chars so text is sent as plain.
   */
  static stripMarkdown(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/[*_`\[\]()~]/g, '');
  }

  /**
   * Sanitize text: fix unclosed Markdown pairs so Telegram can parse it.
   */
  static sanitizeText(text) {
    if (!text || typeof text !== 'string') return text;

    // Remove zero-width characters
    let cleaned = text.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Fix consecutive special chars that break parsing
    cleaned = cleaned.replace(/\*{3,}/g, '**');
    cleaned = cleaned.replace(/_{3,}/g, '__');
    cleaned = cleaned.replace(/`{3,}/g, '``');

    // Close unclosed Markdown pairs
    const asterisks = (cleaned.match(/\*/g) || []).length;
    const underscores = (cleaned.match(/_/g) || []).length;
    const backticks = (cleaned.match(/`/g) || []).length;

    if (asterisks % 2 !== 0) cleaned += '*';
    if (underscores % 2 !== 0) cleaned += '_';
    if (backticks % 2 !== 0) cleaned += '`';

    // Check for unmatched square/round brackets that break link parsing
    const openBrackets = (cleaned.match(/\[/g) || []).length;
    const closeBrackets = (cleaned.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      // Escape all brackets when they don't match
      cleaned = cleaned.replace(/\[/g, '(').replace(/\]/g, ')');
    }

    return cleaned;
  }

  /**
   * Check if an error is a Telegram Markdown parse error.
   */
  static isParseError(error) {
    const msg = error?.message || error?.response?.body?.description || '';
    return msg.includes("can't parse entities") || msg.includes('Bad Request: can');
  }

  static patchBot(bot) {
    const originalSendMessage = bot.sendMessage.bind(bot);
    const originalEditMessageText = bot.editMessageText.bind(bot);
    const originalSendPhoto = bot.sendPhoto.bind(bot);
    const originalEditMessageCaption = bot.editMessageCaption.bind(bot);
    const originalAnswerCallbackQuery = bot.answerCallbackQuery.bind(bot);

    // ── sendMessage (async-safe) ─────────────────────
    bot.sendMessage = async function(chatId, text, options = {}) {
      try {
        return await originalSendMessage(chatId, TelegramSafety.sanitizeText(text), options);
      } catch (error) {
        if (TelegramSafety.isParseError(error)) {
          logger.warn('TELEGRAM_SAFETY', 'sendMessage parse error, retrying without Markdown');
          const safeOpts = { ...options };
          delete safeOpts.parse_mode;
          try {
            return await originalSendMessage(chatId, TelegramSafety.stripMarkdown(text), safeOpts);
          } catch (e2) {
            logger.error('TELEGRAM_SAFETY', 'sendMessage plain fallback also failed', e2);
            throw e2;
          }
        }
        throw error;
      }
    };

    // ── editMessageText (async-safe) ─────────────────
    bot.editMessageText = async function(text, options = {}) {
      try {
        return await originalEditMessageText(TelegramSafety.sanitizeText(text), options);
      } catch (error) {
        if (TelegramSafety.isParseError(error)) {
          logger.warn('TELEGRAM_SAFETY', 'editMessageText parse error, retrying without Markdown');
          const safeOpts = { ...options };
          delete safeOpts.parse_mode;
          try {
            return await originalEditMessageText(TelegramSafety.stripMarkdown(text), safeOpts);
          } catch (e2) {
            // If edit still fails (e.g., message not modified), try send new
            if (options.chat_id) {
              return await originalSendMessage(options.chat_id, TelegramSafety.stripMarkdown(text), { reply_markup: options.reply_markup });
            }
            throw e2;
          }
        }
        throw error;
      }
    };

    // ── sendPhoto (async-safe) ────────────────────────
    bot.sendPhoto = async function(chatId, photo, options = {}) {
      try {
        if (options.caption) {
          options = { ...options, caption: TelegramSafety.sanitizeText(options.caption) };
        }
        return await originalSendPhoto(chatId, photo, options);
      } catch (error) {
        if (TelegramSafety.isParseError(error)) {
          logger.warn('TELEGRAM_SAFETY', 'sendPhoto parse error, retrying without Markdown');
          const safeOpts = { ...options };
          delete safeOpts.parse_mode;
          if (safeOpts.caption) safeOpts.caption = TelegramSafety.stripMarkdown(safeOpts.caption);
          try {
            return await originalSendPhoto(chatId, photo, safeOpts);
          } catch (e2) {
            logger.error('TELEGRAM_SAFETY', 'sendPhoto plain fallback failed, sending as text', e2);
            // Last resort: send as text message instead
            return await originalSendMessage(chatId, TelegramSafety.stripMarkdown(options.caption || ''), { reply_markup: options.reply_markup });
          }
        }
        throw error;
      }
    };

    // ── editMessageCaption (async-safe) ───────────────
    bot.editMessageCaption = async function(caption, options = {}) {
      try {
        return await originalEditMessageCaption(TelegramSafety.sanitizeText(caption), options);
      } catch (error) {
        if (TelegramSafety.isParseError(error)) {
          logger.warn('TELEGRAM_SAFETY', 'editMessageCaption parse error, retrying without Markdown');
          const safeOpts = { ...options };
          delete safeOpts.parse_mode;
          try {
            return await originalEditMessageCaption(TelegramSafety.stripMarkdown(caption), safeOpts);
          } catch (e2) {
            // Not critical, just log
            if (!e2.message?.includes('message is not modified')) {
              logger.error('TELEGRAM_SAFETY', 'editMessageCaption plain fallback also failed', e2);
            }
            throw e2;
          }
        }
        throw error;
      }
    };

    // ── answerCallbackQuery (async-safe) ──────────────
    bot.answerCallbackQuery = async function(queryId, options = {}) {
      try {
        if (options.text) {
          options = { ...options, text: TelegramSafety.stripMarkdown(options.text) };
        }
        return await originalAnswerCallbackQuery(queryId, options);
      } catch (error) {
        logger.error('TELEGRAM_SAFETY', 'answerCallbackQuery failed', error);
        try {
          return await originalAnswerCallbackQuery(queryId, { text: 'Action processed' });
        } catch { /* ignore */ }
      }
    };

    logger.info('TELEGRAM_SAFETY', 'Bot methods patched for safe markdown handling (async)');
  }
}

export default TelegramSafety;
