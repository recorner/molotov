// handlers/userHandler.js
import db from '../database.js';
import { notifyGroup } from '../utils/notifyGroup.js';

export function handleStart(bot, msg) {
  const userId = msg.from.id;
  const { first_name, last_name, username, language_code } = msg.from;

  // ❌ Reject users without a Telegram @username
  if (!username) {
    return bot.sendMessage(userId,
      '⚠️ You must set a Telegram username in your settings to use this bot.\n\n' +
      'Please go to Telegram Settings → Edit Profile → Set Username.\nThen restart the bot.'
    );
  }

  // Check if user exists
  db.get(
    'SELECT * FROM users WHERE telegram_id = ?',
    [userId],
    (err, row) => {
      if (err) {
        console.error('[DB] User query error:', err.message);
        return;
      }

      const isNewUser = !row;

      if (isNewUser) {
        db.run(
          'INSERT INTO users (telegram_id, first_name, last_name, username, language_code) VALUES (?, ?, ?, ?, ?)',
          [userId, first_name, last_name, username, language_code],
          (err) => {
            if (err) return console.error('[DB] User insert error:', err.message);

            const joinedAt = new Date().toLocaleString();
            const intro = 
              `🎉 *New User Joined!*\n\n` +
              `👤 Name: ${first_name} ${last_name || ''}\n` +
              `🔗 Username: @${username}\n` +
              `🆔 Telegram ID: ${userId}\n` +
              `🌐 Language: ${language_code || 'N/A'}\n` +
              `🕒 Time: ${joinedAt}`;

            notifyGroup(bot, intro, { parse_mode: 'Markdown' });

            // Welcome message
            bot.sendMessage(userId,
              `👋 *Welcome ${first_name || 'there'} to the Digital Syndicate.*\n\n` +
              `🌐 *The Darkest Vault for Premium Digital Access.*\n\n` +
              `🛒 Browse a curated stash of:\n` +
              `• ⚡ Instant Enrollments\n` +
              `• 📲 Verified App & Bank Open-Ups\n` +
              `• 🛰️ Elite Proxy Networks\n` +
              `• ☎️ Clean, Trusted Phone Numbers\n\n` +
              `💳 Payments via *Bitcoin* or *Litecoin* only.\n` +
              `🕶️ Operated by trusted hands — *we’re the best in the game.*\n\n` +
              `👇 Tap below to dive in or reach out to Admin if you need priority access:`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🛍️ Browse Categories', callback_data: 'load_categories' }],
                    [{ text: '📞 Contact Admin', url: 'https://t.me/nova_chok' }]
                  ]
                }
              }
            );
          }
        );
      }

      // Show category menu after greeting
      db.all(
        'SELECT * FROM categories WHERE parent_id IS NULL',
        [],
        (err, rows) => {
          if (err) {
            console.error('[DB] Category Fetch Error:', err.message);
            return bot.sendMessage(userId, '❌ Something went wrong while loading categories.');
          }

          if (rows.length === 0) {
            return bot.sendMessage(userId, '🚧 No categories available at the moment.');
          }

          const buttons = rows.map(row => [{
            text: `📂 ${row.name}`,
            callback_data: `cat_${row.id}`
          }]);

          // Add admin contact again
          buttons.push([{ text: '📞 Contact Admin', url: 'https://t.me/nova_chok' }]);

          bot.sendMessage(userId, '🛍️ *Please select a category below to browse:*', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
          });
        }
      );
    }
  );
}
