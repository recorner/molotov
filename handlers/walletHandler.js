import db from '../database.js';
import { formatTimeAgo } from '../utils/date.js';
import { ADMIN_IDS } from '../config.js';




const activeWalletUpdate = {};
export async function handleWalletCallback(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    // === Show latest wallet entries per currency
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
            if (err) {
                console.error('[DB] Wallet fetch error:', err.message);
                return bot.answerCallbackQuery(query.id, { text: '❌ DB Error' });
            }

            if (!rows || rows.length === 0) {
                return bot.editMessageText('❌ No wallet addresses found.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            }

            const formatted = rows.map(row =>
                `💱 *${row.currency}*\n` +
                `• 📬 \`${row.address}\`\n` +
                `• 🏷️ *Label:* ${row.label}\n` +
                `• 🧷 *Tag:* ${row.tag}\n` +
                `• ⏱️ *Age:* ${formatTimeAgo(row.added_at)}`
            ).join('\n\n');

            return bot.editMessageText(`🧾 *Active Wallet Addresses:*\n\n${formatted}`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
        });
    }

    // === Show recent history (last 10)
    else if (data === 'wallet_history') {
        db.all(`
      SELECT currency, address, label, tag, added_at
      FROM wallet_addresses 
      ORDER BY added_at DESC 
      LIMIT 10
    `, (err, rows) => {
            if (err) {
                console.error('[DB] Wallet history error:', err.message);
                return bot.answerCallbackQuery(query.id, { text: '❌ DB Error' });
            }

            if (!rows || rows.length === 0) {
                return bot.editMessageText('📭 No wallet history found.', {
                    chat_id: chatId,
                    message_id: messageId
                });
            }

            const history = rows.map((r, i) =>
                `#${i + 1} — *${r.currency}*\n` +
                `• \`${r.address}\`\n` +
                `• 🏷️ ${r.label}, 🧷 ${r.tag}\n` +
                `• ⏱️ ${formatTimeAgo(r.added_at)}`
            ).join('\n\n');

            return bot.editMessageText(`📜 *Recent Wallet History:*\n\n${history}`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
        });
    }

    // === Handle currency selection for refresh
    else if (data.startsWith('wallet_refresh_')) {
        const currency = data.split('_')[2];
        activeWalletUpdate[chatId] = { currency };

        return bot.editMessageText(`🔁 *Updating ${currency} Address*\n\nPlease send the new ${currency} address:`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
        });
    }

    // === Cancel flow
    else if (data === 'wallet_cancel') {
        delete activeWalletUpdate[chatId];
        return bot.editMessageText('❌ Wallet update cancelled.', {
            chat_id: chatId,
            message_id: messageId
        });
    }

    // === Unknown fallback
    else {
        return bot.answerCallbackQuery(query.id, { text: '🤷 Unknown wallet action.' });
    }
}

function validateAddress(address, currency) {
    const btcRegex = /^bc1[a-zA-HJ-NP-Z0-9]{25,39}$/i;
    const ltcRegex = /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/i;

    if (currency === 'BTC') return btcRegex.test(address);
    if (currency === 'LTC') return ltcRegex.test(address);
    return false;
}



// === Handle Address Update Input Flow ===
export async function handleWalletInput(bot, msg) {
    const chatId = msg.chat.id;
    const step = activeWalletUpdate[chatId];
    if (!step) return;

    const input = msg.text.trim();

    if (!step.address) {
        // We're expecting the address
        if (!validateAddress(input, step.currency)) {
            return bot.sendMessage(chatId, `❌ Invalid ${step.currency} address. Please re-enter a valid address.`);
        }

        step.address = input;
        return bot.sendMessage(chatId, `🏷️ Now enter a label for this address (e.g., "Primary BTC", "Cold Storage"):`);
    }

    if (!step.label) {
        step.label = input;
        return bot.sendMessage(chatId, `🧷 Now enter a tag (e.g., "OKX", "Binance", "Ledger")`);
    }

    if (!step.tag) {
        step.tag = input;

        const { currency, address, label, tag } = step;

        return bot.sendMessage(chatId, `✅ *Confirm Address Update:*\n\n` +
            `• 💱 *Currency:* ${currency}\n` +
            `• 📬 \`${address}\`\n` +
            `• 🏷️ *Label:* ${label}\n` +
            `• 🧷 *Tag:* ${tag}`, {
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
    const data = query.data;

    if (data !== 'wallet_save_confirm') return;

    const entry = activeWalletUpdate[chatId];
    if (!entry) {
        return bot.answerCallbackQuery(query.id, { text: '⚠️ No update in progress.' });
    }

    const { currency, address, label, tag } = entry;
    const timestamp = new Date().toISOString();

    db.run(`
  INSERT INTO wallet_addresses (currency, address, label, tag, added_at, added_by)
  VALUES (?, ?, ?, ?, ?, ?)
`, [currency, address, label, tag, timestamp, userId], function (err) {

        if (err) {
            console.error('[DB] Wallet save error:', err.message);
            return bot.editMessageText('❌ Failed to save wallet address.', {
                chat_id: chatId,
                message_id: messageId
            });
        }

        bot.editMessageText(`✅ *Wallet Updated Successfully!*\n\n` +
            `• 💱 *Currency:* ${currency}\n` +
            `• 📬 \`${address}\`\n` +
            `• 🏷️ ${label}, 🧷 ${tag}`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
        });

        delete activeWalletUpdate[chatId];

        // Optional broadcast to other admins
        ADMIN_IDS.forEach((id) => {
            if (id !== userId) {
                bot.sendMessage(id, `🆕 *New ${currency} Wallet Address Added:*\n` +
                    `• 📬 \`${address}\`\n` +
                    `• 🏷️ ${label}, 🧷 ${tag}`, { parse_mode: 'Markdown' });
            }
        });
    });
}
export { activeWalletUpdate };

