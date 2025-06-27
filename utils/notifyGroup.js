// utils/notifyGroup.js
import { ADMIN_GROUP } from '../config.js';

export function notifyGroup(bot, message, options = {}) {
  if (!ADMIN_GROUP) return;
  bot.sendMessage(ADMIN_GROUP, message, options).catch(err => {
    console.error('[NotifyGroup Error]', err.message);
  });
}
