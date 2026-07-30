// utils/safeMessageEdit.js - Utility to safely edit messages with improved error handling
import logger from './logger.js';

export async function safeEditMessage(bot, chatId, messageId, text, options = {}) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    });
    return { success: true, method: 'text_edit' };
  } catch (error) {
    // Handle specific Telegram errors gracefully
    if (error.message && error.message.includes('message is not modified')) {
      // Content is identical - this is normal, not an error
      logger.debug('SAFE_EDIT', `Message ${messageId} content unchanged - skipping edit`);
      return { success: true, method: 'no_change' };
    } else if (error.message && error.message.includes('there is no text in the message to edit')) {
      // This is a photo message - try to edit caption instead
      logger.debug('SAFE_EDIT', `Attempting photo caption edit for message ${messageId}`);
      return await safeEditPhotoCaption(bot, chatId, messageId, text, options);
    } else {
      logger.error('SAFE_EDIT', `Failed to edit message ${messageId}`, error);
      throw error;
    }
  }
}

/**
 * Safely edit photo message caption with improved error handling
 */
export async function safeEditPhotoCaption(bot, chatId, messageId, text, options = {}) {
  try {
    await bot.editMessageCaption(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: options.parse_mode || 'Markdown',
      reply_markup: options.reply_markup
    });
    logger.debug('SAFE_EDIT', `Successfully edited photo caption for message ${messageId}`);
    return { success: true, method: 'caption_edit' };
  } catch (error) {
    if (error.message && error.message.includes('message is not modified')) {
      logger.debug('SAFE_EDIT', `Photo caption ${messageId} unchanged - skipping edit`);
      // Caption is the same, try to update only reply markup if provided
      if (options.reply_markup) {
        try {
          await bot.editMessageReplyMarkup(options.reply_markup, {
            chat_id: chatId,
            message_id: messageId
          });
          logger.debug('SAFE_EDIT', `Updated reply markup only for message ${messageId}`);
          return { success: true, method: 'markup_only' };
        } catch (markupError) {
          logger.debug('SAFE_EDIT', `Reply markup unchanged for message ${messageId}`);
          return { success: true, method: 'no_change' };
        }
      }
      return { success: true, method: 'no_change' };
    } else {
      logger.warn('SAFE_EDIT', `Failed to edit photo caption for message ${messageId}, attempting fallback`, error);
      // Fallback to message replacement if really needed
      return await replaceMessage(bot, chatId, messageId, 'photo', './assets/image.png', {
        caption: text,
        ...options
      });
    }
  }
}

export async function safeEditMessageReplyMarkup(bot, chatId, messageId, replyMarkup) {
  try {
    await bot.editMessageReplyMarkup(replyMarkup, {
      chat_id: chatId,
      message_id: messageId
    });
  } catch (error) {
    // Handle specific errors
    if (error.message && error.message.includes('message is not modified')) {
      // Ignore "message not modified" errors
      return;
    } else if (error.message && error.message.includes('there is no text in the message to edit')) {
      // Cannot edit photo message markup - this is a limitation
      console.log('[Safe Edit Info] Cannot edit photo message reply markup');
    } else {
      console.error('[Safe Edit Reply Markup Error]', error.message);
    }
  }
}

/**
 * Replace a message by deleting the old one and sending a new one
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID to replace
 * @param {string} type - Type of new message ('text', 'photo')
 * @param {string} content - Content for new message (text or photo path)
 * @param {Object} options - Message options
 */
export async function replaceMessage(bot, chatId, messageId, type, content, options = {}) {
  // Try to delete the old message first (non-critical)
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch {
    // Deletion failure is ok, we still send the new message
  }

  // Send replacement message
  try {
    if (type === 'photo') {
      return await bot.sendPhoto(chatId, content, {
        caption: options.caption || '',
        parse_mode: options.parse_mode || 'Markdown',
        reply_markup: options.reply_markup
      });
    } else {
      return await bot.sendMessage(chatId, content, {
        parse_mode: options.parse_mode || 'Markdown',
        reply_markup: options.reply_markup
      });
    }
  } catch (error) {
    // If send fails (likely markdown parse error), retry without parse_mode
    logger.warn('SAFE_EDIT', `replaceMessage failed, retrying without Markdown: ${error.message}`);
    try {
      const plainCaption = (options.caption || '').replace(/[*_`\[\]()~]/g, '');
      const plainContent = typeof content === 'string' ? content.replace(/[*_`\[\]()~]/g, '') : content;
      if (type === 'photo') {
        return await bot.sendPhoto(chatId, content, {
          caption: plainCaption,
          reply_markup: options.reply_markup
        });
      } else {
        return await bot.sendMessage(chatId, plainContent, {
          reply_markup: options.reply_markup
        });
      }
    } catch (e2) {
      logger.error('SAFE_EDIT', `replaceMessage final fallback failed: ${e2.message}`);
      throw e2;
    }
  }
}

/**
 * Safely replace a photo message with a new photo
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID to replace
 * @param {string} photoPath - Path to new photo
 * @param {string} caption - Caption for new photo
 * @param {Object} options - Message options
 */
export async function safeReplacePhoto(bot, chatId, messageId, photoPath, caption, options = {}) {
  try {
    // Try to edit the photo media first
    await bot.editMessageMedia({
      type: 'photo',
      media: photoPath,
      caption: caption,
      parse_mode: options.parse_mode || 'Markdown'
    }, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: options.reply_markup
    });
  } catch (error) {
    console.log('[Safe Photo Edit] Cannot edit photo media, replacing message');
    // If editing fails, replace the entire message
    await replaceMessage(bot, chatId, messageId, 'photo', photoPath, {
      caption: caption,
      ...options
    });
  }
}
