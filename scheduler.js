// scheduler.js
import cron from 'node-cron';
import { ADMIN_IDS } from './config.js';
import { getTodayISODate } from './utils/date.js'; // renamed for clarity

let addressUpdateConfirmed = false;
let promptMessageMap = {};

export function setupDailyWalletPrompt(bot) {
    console.log('[CRON] Daily wallet prompt scheduler initialized.');

    cron.schedule('0 8 * * * *', () => {
        const today = getTodayISODate();
        addressUpdateConfirmed = false;
        promptMessageMap = {};

        ADMIN_IDS.forEach(async (adminId) => {
            try {
                const msg = await bot.sendMessage(adminId, `🔁 *Daily Wallet Update Check*\n\nWould you like to update the address today?`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Yes', callback_data: `walletcheck_yes_${today}` },
                                { text: '❌ No', callback_data: `wallet_prompt_no_${today}` }
                            ]
                        ]
                    }
                });

                promptMessageMap[adminId] = msg.message_id;

                setTimeout(() => {
                    if (!addressUpdateConfirmed) {
                        bot.sendMessage(adminId, `⏰ *Reminder:* Please respond to the wallet update prompt.`, {
                            parse_mode: 'Markdown'
                        });
                    }
                }, 5 * 60 * 1000);

            } catch (err) {
                console.error(`[CRON] Error sending prompt to admin ${adminId}:`, err.message);
            }
        });
    }, {
        timezone: 'Africa/Nairobi'
    });
}

export function handleWalletPromptResponse(bot, query) {
    const { id: userId } = query.from;
    const messageId = query.message.message_id;
    const chatId = query.message.chat.id;
    const data = query.data;

    const parts = data.split('_');
    const response = parts[1]; // 'yes' or 'no'
    const date = parts.slice(2).join('_'); // Rejoins date part safely


    if (addressUpdateConfirmed && response === 'yes') {
        return bot.editMessageText('⚠️ Another admin has already updated the address today.', {
            chat_id: chatId,
            message_id: messageId
        });
    }

    if (response === 'yes') {
        addressUpdateConfirmed = true;

        for (const otherAdminId of ADMIN_IDS) {
            if (otherAdminId !== userId && promptMessageMap[otherAdminId]) {
                bot.editMessageText('⚠️ Another admin has already updated the address today.', {
                    chat_id: otherAdminId,
                    message_id: promptMessageMap[otherAdminId]
                }).catch(() => { });
            }
        }

        return bot.editMessageText('✅ *Thank you! Let’s refresh the wallet.*\n\nPlease select a currency to update:', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '₿ Bitcoin (BTC)', callback_data: 'wallet_refresh_BTC' }],
                    [{ text: 'Ł Litecoin (LTC)', callback_data: 'wallet_refresh_LTC' }],
                    [{ text: '🔙 Cancel', callback_data: 'wallet_cancel' }]
                ]
            }
        });
    }

    if (response === 'no') {
        return bot.editMessageText('❌ No worries. You chose not to update the wallet today.', {
            chat_id: chatId,
            message_id: messageId
        });
    }

    return bot.answerCallbackQuery(query.id, { text: '🤷 Unknown wallet response.' });
}
