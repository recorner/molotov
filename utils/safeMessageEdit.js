// utils/safeMessageEdit.js - Utility to safely edit messages with improved photo handling
export async function safeEditMessage(bot, chatId, messageId, text, options = {}) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    });
  } catch (error) {
    // Handle specific Telegram errors
    if (error.message && error.message.includes('message is not modified')) {
      // Ignore "message not modified" errors - this is not a real error
      return;
    } else if (error.message && error.message.includes('there is no text in the message to edit')) {
      // This is a photo message - try to edit caption instead of deleting
      console.log('[Safe Edit] Attempting to edit photo caption instead of replacing message');
      try {
        await bot.editMessageCaption(text, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: options.parse_mode || 'Markdown',
          reply_markup: options.reply_markup
        });
        console.log('[Safe Edit] Successfully edited photo caption');
        return;
      } catch (captionError) {
        if (captionError.message && captionError.message.includes('message is not modified')) {
          console.log('[Safe Edit] Photo caption unchanged');
          return;
        }
        // If caption editing fails, fall back to replace
        console.log('[Safe Edit] Caption edit failed, replacing message');
        await replaceMessage(bot, chatId, messageId, 'text', text, options);
      }
    } else {
      console.error('[Safe Edit Error]', error.message);
    }
  }
}

/**
 * Safely edit a photo message caption without replacing the entire message
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID
 * @param {string} caption - New caption text
 * @param {Object} options - Message options
 */
export async function safeEditPhotoCaption(bot, chatId, messageId, caption, options = {}) {
  try {
    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: options.parse_mode || 'Markdown',
      reply_markup: options.reply_markup
    });
    console.log('[Safe Photo Edit] Successfully edited photo caption');
  } catch (error) {
    if (error.message && error.message.includes('message is not modified')) {
      // Caption is the same, try to update only reply markup if provided
      if (options.reply_markup) {
        try {
          await bot.editMessageReplyMarkup(options.reply_markup, {
            chat_id: chatId,
            message_id: messageId
          });
          console.log('[Safe Photo Edit] Updated reply markup only');
        } catch (markupError) {
          console.log('[Safe Photo Edit] Reply markup unchanged');
        }
      }
    } else if (error.message && error.message.includes('there is no text in the message to edit')) {
      // This is not a photo message, fall back to text edit
      console.log('[Safe Photo Edit] Not a photo message, using text edit');
      await safeEditMessage(bot, chatId, messageId, caption, options);
    } else {
      console.error('[Safe Photo Edit Error]', error.message);
      throw error;
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
  try {
    // First, delete the old message
    await bot.deleteMessage(chatId, messageId);
    console.log('[Safe Edit] Old message deleted successfully');
    
    // Then send new message based on type
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
  } catch (fallbackError) {
    console.error('[Safe Edit Replace Error]', fallbackError.message);
    
    // If deletion fails, still try to send the new message
    try {
      console.log('[Safe Edit] Deletion failed, sending new message anyway');
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
    } catch (sendError) {
      console.error('[Safe Edit Send Error]', sendError.message);
      throw sendError;
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
