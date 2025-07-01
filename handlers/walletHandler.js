import db from '../database.js';
import { formatTimeAgo } from '../utils/date.js';
import { ADMIN_IDS } from '../config.js';

const activeWalletUpdate = {};

export async function handleWalletCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (data === 'wallet_list') {
    db.all(`
      SELECT currency, address, label, tag, added_at 
      FROM wallet_addresses 
      WHERE id IN (
        SELECT MAX(id) 
        FROM wallet_addresses 
        GROUP BY currency
      )
    `, (err, rows) => {
      if (err) return bot.answerCallbackQuery(query.id, { text: '❌ DB Error' });
      if (!rows?.length) return bot.editMessageText('❌ No wallet addresses found.', { chat_id: chatId, message_id: messageId });

      const output = rows.map(row => (
        `💱 *${row.currency}*\n` +
        `• 📬 \`${row.address}\`\n` +
        `• 🏷️ ${row.label}, 🧷 ${row.tag}\n` +
        `• ⏱️ ${formatTimeAgo(row.added_at)}`
      )).join('\n\n');

      bot.editMessageText(`🧾 *Active Wallet Addresses:*\n\n${output}`, {
        chat_id: chatId, message_id: messageId, parse_mode: 'Markdown'
      });
    });
  }

  else if (data === 'wallet_history') {
    db.all(`
      SELECT currency, address, label, tag, added_at
      FROM wallet_addresses 
      ORDER BY added_at DESC 
      LIMIT 10
    `, (err, rows) => {
      if (err) return bot.answerCallbackQuery(query.id, { text: '❌ DB Error' });
      if (!rows?.length) return bot.editMessageText('📭 No wallet history found.', { chat_id: chatId, message_id: messageId });

      const history = rows.map((r, i) =>
        `#${i + 1} — *${r.currency}*\n• \`${r.address}\`\n• 🏷️ ${r.label}, 🧷 ${r.tag}\n• ⏱️ ${formatTimeAgo(r.added_at)}`
      ).join('\n\n');

      bot.editMessageText(`📜 *Recent Wallet History:*\n\n${history}`, {
        chat_id: chatId, message_id: messageId, parse_mode: 'Markdown'
      });
    });
  }

  else if (data.startsWith('wallet_refresh_')) {
    const currency = data.split('_')[2];
    activeWalletUpdate[chatId] = { currency };
    return bot.editMessageText(`🔁 *Updating ${currency} Wallet*\n\nPlease send the public address:`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown'
    });
  }

  else if (data === 'wallet_cancel') {
    delete activeWalletUpdate[chatId];
    return bot.editMessageText('❌ Wallet update cancelled.', { chat_id: chatId, message_id: messageId });
  }

  else if (data === 'wallet_save_confirm') {
    return handleWalletFinalSave(bot, query);
  }

  else {
    return bot.answerCallbackQuery(query.id, { text: '🤷 Unknown wallet action.' });
  }
}

function validateAddress(address, currency) {
  const btcRegex = /^bc1[a-zA-HJ-NP-Z0-9]{25,39}$/i;
  const ltcRegex = /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/i;
  if (currency === 'BTC') return btcRegex.test(address);
  if (currency === 'LTC') return ltcRegex.test(address);
  return true;
}

export async function handleWalletInput(bot, msg) {
  const chatId = msg.chat.id;
  const input = msg.text.trim();
  const step = activeWalletUpdate[chatId];
  if (!step) return;

  if (!step.address) {
    if (!validateAddress(input, step.currency)) {
      return bot.sendMessage(chatId, `❌ Invalid ${step.currency} address. Try again.`);
    }
    step.address = input;
    return bot.sendMessage(chatId, `🏷️ Now enter a label (e.g., "Primary BTC", "Cold Storage")`);
  }

  if (!step.label) {
    step.label = input;
    return bot.sendMessage(chatId, `🧷 Enter a tag (e.g., "Binance", "Ledger", "Trezor")`);
  }

  if (!step.tag) {
    step.tag = input;
    step.privateKeyAsked = true;
    return bot.sendMessage(chatId, `🔐 Optional: Send the *Private Key* for this address now or type "skip".`);
  }

  if (step.privateKeyAsked && !step.confirming) {
    if (input.toLowerCase() !== 'skip') {
      step.private_key = input;
    }
    step.confirming = true;

    const { currency, address, label, tag, private_key } = step;

    return bot.sendMessage(chatId,
      `✅ *Confirm Wallet Save:*\n\n` +
      `• 💱 *Currency:* ${currency}\n` +
      `• 📬 \`${address}\`\n` +
      `• 🏷️ ${label}\n` +
      `• 🧷 ${tag}\n` +
      (private_key ? `• 🔐 Private Key: \`${private_key}\`\n` : ''),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Confirm', callback_data: 'wallet_save_confirm' }],
            [{ text: '❌ Cancel', callback_data: 'wallet_cancel' }]
          ]
        }
      });
  }
}

export async function handleWalletFinalSave(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id;

  const entry = activeWalletUpdate[chatId];
  if (!entry) return bot.answerCallbackQuery(query.id, { text: '⚠️ No update in progress.' });

  const { currency, address, label, tag, private_key = null } = entry;
  const timestamp = new Date().toISOString();

  db.run(`
    INSERT INTO wallet_addresses (currency, address, private_key, label, tag, added_at, added_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [currency, address, private_key, label, tag, timestamp, userId],
    (err) => {
      if (err) {
        console.error('[DB] Wallet Save Error:', err.message);
        return bot.editMessageText('❌ Failed to save wallet.', { chat_id: chatId, message_id: messageId });
      }

      bot.editMessageText(
        `✅ *Wallet Saved Successfully!*\n\n` +
        `• 💱 *${currency}*\n• 📬 \`${address}\`\n• 🏷️ ${label}, 🧷 ${tag}`,
        { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
      );

      ADMIN_IDS.forEach(id => {
        if (id !== userId) {
          bot.sendMessage(id,
            `🆕 *${currency} Wallet Added by Admin:*\n` +
            `• 📬 \`${address}\`\n• 🏷️ ${label}, 🧷 ${tag}`,
            { parse_mode: 'Markdown' }
          );
        }
      });

      delete activeWalletUpdate[chatId];
    }
  );
}

export { activeWalletUpdate };
