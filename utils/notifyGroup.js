// utils/notifyGroup.js
import { ADMIN_GROUP } from '../config.js';

export function notifyGroup(bot, message, options = {}) {
  if (!ADMIN_GROUP) return;
  
  bot.sendMessage(ADMIN_GROUP, message, options).catch(err => {
    console.error('[NotifyGroup Error]', err.message);
    
    // If it's a markdown parsing error, try without markdown
    if (err.message.includes("Can't parse entities") && options.parse_mode) {
      const fallbackOptions = { ...options };
      delete fallbackOptions.parse_mode;
      
      bot.sendMessage(ADMIN_GROUP, message, fallbackOptions).catch(fallbackErr => {
        console.error('[NotifyGroup Fallback Error]', fallbackErr.message);
      });
    }
  });
}
