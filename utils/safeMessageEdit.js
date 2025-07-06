// utils/safeMessageEdit.js - Utility to safely edit messages
export async function safeEditMessage(bot, chatId, messageId, text, options = {}) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    });
  } catch (error) {
    // Ignore "message not modified" errors
    if (!error.message.includes('message is not modified')) {
      console.error('[Safe Edit Error]', error.message);
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
    // Ignore "message not modified" errors
    if (!error.message.includes('message is not modified')) {
      console.error('[Safe Edit Markup Error]', error.message);
    }
  }
}
