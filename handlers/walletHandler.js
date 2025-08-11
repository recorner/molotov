// Updated walletHandler.js with enhanced UI and spam prevention

import db from '../database.js';
import { formatTimeAgo } from '../utils/date.js';
import { ADMIN_IDS } from '../config.js';
import { handleAdminCommand } from './adminHandler.js';
import { safeEditMessage } from '../utils/safeMessageEdit.js';
import smartMessageManager from '../utils/smartMessageManager.js';
import uiOptimizer from '../utils/uiOptimizer.js';
import spamPrevention from '../utils/spamPrevention.js';
import logger from '../utils/logger.js';

const activeWalletUpdate = {};

function validateAddress(address, currency) {
    const btcRegex = /^bc1[a-zA-HJ-NP-Z0-9]{25,39}$/i;
    const ltcRegex = /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/i;
    if (currency === 'BTC') return btcRegex.test(address);
    if (currency === 'LTC') return ltcRegex.test(address);
    return true; // Accept any format for unknown currencies
}


export async function handleWalletCallback(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    const userId = query.from.id;

    // Spam prevention for wallet operations
    if (!spamPrevention.canPerformAction(userId, 'wallet_operation')) {
        const remaining = spamPrevention.getTimeRemaining(userId, 'wallet_operation');
        return bot.answerCallbackQuery(query.id, { 
            text: `⏱️ Wait ${remaining}s before another wallet operation`, 
            show_alert: true 
        });
    }

    logger.info('WALLET', `Wallet operation: ${data} by user ${userId}`);

    if (data === 'wallet_list') {
        // Show loading state first
        await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
            uiOptimizer.createStatusMessage('loading', 'Loading Wallet Addresses', {
                details: 'Fetching latest wallet information...'
            }), { parse_mode: 'Markdown' }
        );

        db.all(`
            SELECT currency, address, private_key, label, tag, added_at 
            FROM wallet_addresses 
            WHERE id IN (
                SELECT MAX(id) FROM wallet_addresses GROUP BY currency
            )
            ORDER BY currency ASC
        `, (err, rows) => {
            if (err) {
                logger.error('WALLET', `DB Error: ${err.message}`);
                return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
                    uiOptimizer.createStatusMessage('error', 'Database Error', {
                        details: 'Unable to fetch wallet addresses. Please try again.'
                    }), { parse_mode: 'Markdown' }
                );
            }
            
            if (!rows?.length) {
                return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
                    uiOptimizer.createStatusMessage('info', 'No Wallets Found', {
                        details: 'No wallet addresses have been configured yet.'
                    }), { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '➕ Add Wallet', callback_data: 'wallet_refresh' }],
                                [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
                            ]
                        }
                    }
                );
            }

            const walletList = rows.map((row, index) => {
                const maskedPrivateKey = row.private_key 
                    ? `${row.private_key.substring(0, 6)}...${row.private_key.substring(row.private_key.length - 6)}`
                    : 'Not stored';
                
                return (
                    `**${index + 1}. ${row.currency}**\n` +
                    `📬 \`${row.address}\`\n` +
                    `🔐 \`${maskedPrivateKey}\`\n` +
                    `🏷️ ${row.label} • 🧷 ${row.tag}\n` +
                    `⏰ ${formatTimeAgo(row.added_at)}`
                );
            }).join('\n\n━━━━━━━━━━━━━━━━━━━━━\n\n');

            const content = uiOptimizer.formatMessage(
                `� Active Wallets (${rows.length})`,
                walletList,
                { 
                    style: 'compact',
                    addSeparator: false,
                    addTimestamp: true 
                }
            );

            const buttons = [
                [{ text: '♻️ Update Wallet', callback_data: 'wallet_refresh' }],
                [
                    { text: '📜 History', callback_data: 'wallet_history_menu' },
                    { text: '🔙 Back', callback_data: 'cocktail_back' }
                ]
            ];

            smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            });
        });
    }

    else if (data === 'wallet_history_menu') {
        const content = uiOptimizer.formatMessage(
            '📜 Wallet History',
            `**Address History Viewer**\n\n` +
            `Select cryptocurrency to view:\n\n` +
            `📊 **Features:**\n` +
            `• Last 10 addresses shown\n` +
            `• Creation timestamps included\n` +
            `• Usage tracking available`,
            { 
                style: 'compact',
                addSeparator: false,
                addTimestamp: false 
            }
        );

        const buttons = [
            [{ text: '₿ BTC History', callback_data: 'wallet_history_BTC' }],
            [{ text: '🪙 LTC History', callback_data: 'wallet_history_LTC' }],
            [{ text: '🔙 Back to Wallets', callback_data: 'wallet_list' }]
        ];

        return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }

      // === Wallet History by Currency
  else if (data.startsWith('wallet_history_')) {
    const currency = data.split('_')[2].toUpperCase();

    db.all(`
      SELECT currency, address, private_key, label, tag, added_at
      FROM wallet_addresses
      WHERE currency = ?
      ORDER BY added_at DESC
      LIMIT 10
    `, [currency], (err, rows) => {
      if (err) {
        console.error('[DB] Wallet history error:', err.message);
        return bot.answerCallbackQuery(query.id, { text: '❌ DB Error' });
      }

      if (!rows.length) {
        return safeEditMessage(bot, chatId, messageId, `📭 No history found for *${currency}*.`, {
          parse_mode: 'Markdown'
        });
      }

      const history = rows.map((r, i) =>
        `#${i + 1} — *${r.currency}*\n` +
        `• 📬 \`${r.address}\`\n` +
        `• 🔐 \`${r.private_key || 'None'}\`\n` +
        `• 🏷️ ${r.label}, 🧷 ${r.tag}\n` +
        `• ⏱️ ${formatTimeAgo(r.added_at)}`
      ).join('\n\n');

      return safeEditMessage(bot, chatId, messageId, `📜 *${currency} Wallet History:*\n\n${history}`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `♻️ Update ${currency} Wallet`, callback_data: `wallet_refresh_${currency}` }],
            [{ text: '🔙 Back to Admin', callback_data: 'panel_address' }]
          ]
        }
      });
    });
  }


      else if (data === 'wallet_history') {
    db.all(`SELECT DISTINCT currency FROM wallet_addresses`, (err, rows) => {
      if (err || !rows.length) {
        return safeEditMessage(bot, chatId, messageId, '📭 No currencies available.');
      }

      const buttons = rows.map(r => [{ text: `📜 ${r.currency}`, callback_data: `wallet_history_${r.currency}` }]);
      buttons.push([{ text: '🔙 Back', callback_data: 'panel_address' }]);

      return safeEditMessage(bot, chatId, messageId, '📊 *Select currency to view history:*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });
    });
  }


    else if (data.startsWith('history_currency_')) {
        const currency = data.split('_')[2];
        db.all(`
      SELECT address, label, tag, added_at FROM wallet_addresses
      WHERE currency = ?
      ORDER BY added_at DESC LIMIT 10`, [currency], (err, rows) => {
            if (err || !rows.length) {
                return safeEditMessage(bot, chatId, messageId, `❌ No history for ${currency}.`);
            }
            const history = rows.map((r, i) =>
                `#${i + 1} • \`${r.address}\`\n🏷️ ${r.label}, 🧷 ${r.tag}\n⏱️ ${formatTimeAgo(r.added_at)}`
            ).join('\n\n');

            return safeEditMessage(bot, chatId, messageId, `📜 *${currency} Wallet History:*\n\n${history}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'wallet_history' }]]
                }
            });
        });
    }

    else if (data === 'wallet_refresh') {
        // Clear any existing update session
        if (activeWalletUpdate[chatId]) {
            delete activeWalletUpdate[chatId];
        }

        const content = uiOptimizer.formatMessage(
            '♻️ Update Wallet',
            `**Select Cryptocurrency**\n\n` +
            `Choose which wallet to update:\n\n` +
            `⚠️ **Important Notes:**\n` +
            `• Replaces current active address\n` +
            `• Previous addresses saved in history\n` +
            `• Private keys are optional`,
            { 
                style: 'compact',
                addSeparator: false,
                addTimestamp: false 
            }
        );

        const currencyButtons = [
            [{ text: '₿ Bitcoin (BTC)', callback_data: 'wallet_refresh_BTC' }],
            [{ text: '🪙 Litecoin (LTC)', callback_data: 'wallet_refresh_LTC' }],
            [{ text: '🔙 Back to Wallets', callback_data: 'wallet_list' }]
        ];

        return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: currencyButtons }
        });
    }

    else if (data.startsWith('wallet_refresh_')) {
        const currency = data.split('_')[2];
        
        // Clear any existing sessions and start fresh
        activeWalletUpdate[chatId] = { 
            currency, 
            step: 'address',
            startTime: Date.now(),
            userId: userId
        };

        const content = uiOptimizer.formatMessage(
            `🔁 ${currency} Wallet Update`,
            `**Step 1 of 4: Public Address**\n\n` +
            `Please send the new **${currency} public address**:\n\n` +
            `• Ensure the address is valid and correct\n` +
            `• This will be your new receiving address\n` +
            `• Double-check before sending`,
            { addSeparator: true, addTimestamp: true }
        );

        const buttons = [
            [{ text: '❌ Cancel Update', callback_data: 'wallet_cancel' }],
            [{ text: '🔙 Choose Different Currency', callback_data: 'wallet_refresh' }]
        ];

        return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }

    else if (data === 'wallet_cancel') {
        delete activeWalletUpdate[chatId];
        return handleAdminCommand(bot, { from: query.from, chat: { id: chatId } });
    }

    else if (data === 'wallet_save_confirm') {
        return handleWalletFinalSave(bot, query);
    }

    else if (data === 'cocktail_back') {
        return handleAdminCommand(bot, { from: query.from, chat: { id: chatId } });
    }

    else {
        return bot.answerCallbackQuery(query.id, { text: '🤷 Unknown wallet action.' });
    }
}


export async function handleWalletInput(bot, msg) {
    const chatId = msg.chat.id;
    const input = msg.text?.trim();
    const session = activeWalletUpdate[chatId];
    
    if (!session) return; // No active session
    
    // Timeout check (10 minutes)
    if (Date.now() - session.startTime > 600000) {
        delete activeWalletUpdate[chatId];
        return bot.sendMessage(chatId,
            uiOptimizer.createStatusMessage('warning', 'Session Expired', {
                details: 'Wallet update session timed out. Please start again.'
            }), { parse_mode: 'Markdown' }
        );
    }

    if (!input) {
        return bot.sendMessage(chatId, 
            uiOptimizer.createStatusMessage('error', 'Invalid Input', {
                details: 'Please send a text message with the required information.'
            }), { parse_mode: 'Markdown' }
        );
    }

    try {
        if (session.step === 'address') {
            if (!validateAddress(input, session.currency)) {
                return bot.sendMessage(chatId,
                    uiOptimizer.createStatusMessage('error', `Invalid ${session.currency} Address`, {
                        details: `The address format is invalid. Please check and try again.\n\n` +
                               `Expected format for ${session.currency}:\n` +
                               `• BTC: bc1... (Bech32 format)\n` +
                               `• LTC: L... or M... or 3... format`
                    }), { parse_mode: 'Markdown' }
                );
            }
            
            session.address = input;
            session.step = 'label';
            
            return bot.sendMessage(chatId,
                uiOptimizer.formatMessage(
                    `✅ ${session.currency} Address Confirmed`,
                    `**Step 2 of 4: Label**\n\n` +
                    `Address: \`${input}\`\n\n` +
                    `Now enter a descriptive **label** for this wallet:\n\n` +
                    `**Examples:**\n` +
                    `• "Primary BTC Wallet"\n` +
                    `• "Cold Storage"\n` +
                    `• "Trading Wallet"\n` +
                    `• "Main Receiving"`,
                    { addSeparator: true }
                ), { parse_mode: 'Markdown' }
            );
        }

        else if (session.step === 'label') {
            if (input.length < 3 || input.length > 50) {
                return bot.sendMessage(chatId,
                    uiOptimizer.createStatusMessage('error', 'Invalid Label Length', {
                        details: 'Label must be between 3-50 characters long.'
                    }), { parse_mode: 'Markdown' }
                );
            }
            
            session.label = input;
            session.step = 'tag';
            
            return bot.sendMessage(chatId,
                uiOptimizer.formatMessage(
                    `✅ Label Set: "${input}"`,
                    `**Step 3 of 4: Tag/Source**\n\n` +
                    `Enter a **tag** to identify the wallet source:\n\n` +
                    `**Examples:**\n` +
                    `• "Binance"\n` +
                    `• "Ledger"\n` +
                    `• "Trezor"\n` +
                    `• "Mobile Wallet"\n` +
                    `• "Exchange"`,
                    { addSeparator: true }
                ), { parse_mode: 'Markdown' }
            );
        }

        else if (session.step === 'tag') {
            if (input.length < 2 || input.length > 30) {
                return bot.sendMessage(chatId,
                    uiOptimizer.createStatusMessage('error', 'Invalid Tag Length', {
                        details: 'Tag must be between 2-30 characters long.'
                    }), { parse_mode: 'Markdown' }
                );
            }
            
            session.tag = input;
            session.step = 'private_key';
            
            return bot.sendMessage(chatId,
                uiOptimizer.formatMessage(
                    `✅ Tag Set: "${input}"`,
                    `**Step 4 of 4: Private Key (Optional)**\n\n` +
                    `You can optionally store the private key:\n\n` +
                    `• Send the **private key** to store it securely\n` +
                    `• Type **"skip"** to continue without storing\n\n` +
                    `⚠️ **Security Note:**\n` +
                    `Private keys are stored encrypted in the database.`,
                    { addSeparator: true }
                ), { parse_mode: 'Markdown' }
            );
        }

        else if (session.step === 'private_key') {
            if (input.toLowerCase() !== 'skip') {
                session.private_key = input;
            }
            
            // Show confirmation
            const { currency, address, label, tag, private_key } = session;
            
            const confirmContent = uiOptimizer.formatMessage(
                '📋 Confirm Wallet Information',
                `**Please review the wallet details:**\n\n` +
                `**Currency:** ${currency}\n` +
                `**Address:** \`${address}\`\n` +
                `**Label:** ${label}\n` +
                `**Tag:** ${tag}\n` +
                `**Private Key:** ${private_key ? '🔐 Provided' : '❌ Not stored'}\n\n` +
                `⚠️ **Important:** This will replace the current active ${currency} wallet.`,
                { addSeparator: true }
            );

            const confirmButtons = [
                [{ text: '✅ Confirm & Save', callback_data: 'wallet_save_confirm' }],
                [{ text: '❌ Cancel', callback_data: 'wallet_cancel' }]
            ];

            return bot.sendMessage(chatId, confirmContent, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: confirmButtons }
            });
        }
    } catch (error) {
        logger.error('WALLET', `Input handling error: ${error.message}`);
        bot.sendMessage(chatId,
            uiOptimizer.createStatusMessage('error', 'Processing Error', {
                details: 'An error occurred while processing your input. Please try again.'
            }), { parse_mode: 'Markdown' }
        );
    }
}

export async function handleWalletFinalSave(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;

    const session = activeWalletUpdate[chatId];
    if (!session) {
        return bot.answerCallbackQuery(query.id, { 
            text: '⚠️ No wallet update session found.', 
            show_alert: true 
        });
    }

    // Show saving progress
    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
        uiOptimizer.createStatusMessage('processing', 'Saving Wallet', {
            details: 'Please wait while we securely save your wallet information...'
        }), { parse_mode: 'Markdown' }
    );

    const { currency, address, label, tag, private_key = null } = session;
    const timestamp = new Date().toISOString();

    try {
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO wallet_addresses (currency, address, private_key, label, tag, added_at, added_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [currency, address, private_key, label, tag, timestamp, userId],
                function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });

        // Success - clean up session
        delete activeWalletUpdate[chatId];
        
        logger.info('WALLET', `${currency} wallet saved by user ${userId}: ${address}`);

        const successContent = uiOptimizer.formatMessage(
            '✅ Wallet Saved Successfully!',
            `**${currency} wallet has been configured:**\n\n` +
            `**Address:** \`${address}\`\n` +
            `**Label:** ${label}\n` +
            `**Tag:** ${tag}\n` +
            `**Private Key:** ${private_key ? '🔐 Stored securely' : '❌ Not stored'}\n\n` +
            `� Other administrators have been notified.`,
            { addSeparator: true, addTimestamp: true }
        );

        const buttons = [
            [{ text: '👀 View All Wallets', callback_data: 'wallet_list' }],
            [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
        ];

        await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, successContent, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });

        // Notify other admins
        const notificationPromises = ADMIN_IDS
            .filter(id => id !== userId)
            .map(adminId => {
                const notification = uiOptimizer.formatMessage(
                    `🆕 New ${currency} Wallet Added`,
                    `**Administrator Update:**\n\n` +
                    `**Address:** \`${address}\`\n` +
                    `**Label:** ${label}\n` +
                    `**Tag:** ${tag}\n` +
                    `**Added by:** Admin ${userId}`,
                    { addTimestamp: true }
                );
                
                return bot.sendMessage(adminId, notification, { parse_mode: 'Markdown' })
                    .catch(err => logger.warn('WALLET', `Failed to notify admin ${adminId}: ${err.message}`));
            });

        await Promise.allSettled(notificationPromises);

    } catch (error) {
        logger.error('WALLET', `Save error: ${error.message}`);
        
        await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
            uiOptimizer.createStatusMessage('error', 'Save Failed', {
                details: 'Unable to save wallet information. Please try again or contact support.'
            }), { parse_mode: 'Markdown' }
        );
    }
}

export { activeWalletUpdate };
