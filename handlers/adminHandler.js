import db from '../database.js';
import { ADMIN_IDS, ADMIN_GROUP } from '../config.js';
import { formatTimeAgo } from '../utils/date.js';
import languageStatsManager from '../utils/languageStats.js';

// === Handle /cocktail Command ===
export function handleAdminCommand(bot, msg) {
  const { from } = msg;

  if (!ADMIN_IDS.includes(from.id)) {
    return bot.sendMessage(msg.chat.id, '⛔ Unauthorized.');
  }

  return bot.sendMessage(msg.chat.id, '*🔧 Admin Control Panel*', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 Address Management', callback_data: 'panel_address' }],
        [{ text: '🌍 Language Analytics', callback_data: 'panel_language_stats' }],
        [{ text: '🖥️ Cloud Shell', callback_data: 'panel_shell' }],
        [{ text: '🏠 Go to Lobby', url: `https://t.me/+g1nH977AIqhkNjBk` }]
      ]
    }
  });
}

// === Handle Admin Panel Callbacks ===
export function handleAdminCallback(bot, query) {
  const { id: userId } = query.from;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (!ADMIN_IDS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, { text: '⛔ Unauthorized access.' });
  }

  // === Submenu: Address Management ===
  if (data === 'panel_address') {
    return bot.editMessageText('📥 *Address Management Panel*', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🧾 List Active Addresses', callback_data: 'wallet_list' }],
          [{ text: '📜 View Address History', callback_data: 'wallet_history' }],
          [{ text: '♻️ Refresh Address', callback_data: 'wallet_refresh' }],
          [{ text: '🔙 Back', callback_data: 'cocktail_back' }]
        ]
      }
    });
  }

  // === Submenu: Language Analytics ===
  if (data === 'panel_language_stats') {
    languageStatsManager.formatLanguageReport().then(report => {
      bot.editMessageText(report, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh Stats', callback_data: 'panel_language_stats' }],
            [{ text: '🔙 Back', callback_data: 'cocktail_back' }]
          ]
        }
      });
    }).catch(err => {
      console.error('[Language Stats Error]', err);
      bot.editMessageText('❌ Error loading language statistics', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back', callback_data: 'cocktail_back' }]]
        }
      });
    });
    return;
  }

  // === Submenu: List Active Wallets ===
  if (data === 'wallet_list') {
    db.all(`
      SELECT currency, address, label, tag, added_at 
      FROM wallet_addresses
      WHERE id IN (
        SELECT MAX(id) FROM wallet_addresses GROUP BY currency
      )
    `, (err, rows) => {
      if (err) {
        console.error('[DB] Wallet fetch error:', err.message);
        return bot.editMessageText('❌ Failed to fetch addresses.', {
          chat_id: chatId,
          message_id: messageId
        });
      }

      if (!rows.length) {
        return bot.editMessageText('📭 No active addresses found.', {
          chat_id: chatId,
          message_id: messageId
        });
      }

      const text = rows.map(row =>
        `💱 *${row.currency}*\n` +
        `• 📬 \`${row.address}\`\n` +
        `• 🏷️ *Label:* ${row.label}\n` +
        `• 🧷 *Tag:* ${row.tag}\n` +
        `• ⏱️ *Age:* ${formatTimeAgo(row.added_at)}`
      ).join('\n\n');

      return bot.editMessageText(`🧾 *Active Wallet Addresses:*\n\n${text}`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
    });
  }

  // === Submenu: Wallet History ===
  if (data === 'wallet_history') {
    db.all(`
      SELECT currency, address, label, tag, added_at
      FROM wallet_addresses
      ORDER BY added_at DESC
      LIMIT 10
    `, (err, rows) => {
      if (err) {
        console.error('[DB] Wallet history error:', err.message);
        return bot.editMessageText('❌ Failed to fetch history.', {
          chat_id: chatId,
          message_id: messageId
        });
      }

      if (!rows.length) {
        return bot.editMessageText('📭 No wallet history found.', {
          chat_id: chatId,
          message_id: messageId
        });
      }

      const history = rows.map((row, i) =>
        `#${i + 1} — *${row.currency}*\n` +
        `• \`${row.address}\`\n` +
        `• 🏷️ ${row.label}, 🧷 ${row.tag}\n` +
        `• ⏱️ ${formatTimeAgo(row.added_at)}`
      ).join('\n\n');

      return bot.editMessageText(`📜 *Recent Wallet History:*\n\n${history}`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
    });
  }

  // === Return to Main Panel ===
  if (data === 'cocktail_back') {
    return handleAdminCommand(bot, { from: { id: userId }, chat: { id: chatId } });
  }

  // === Placeholder for other panels ===
  if (data.startsWith('panel_')) {
    const panelType = data.split('_')[1];
    
    switch (panelType) {
      case 'stats':
        return showStatsPanel(bot, chatId, messageId);
      case 'users':
        return showUsersPanel(bot, chatId, messageId);
      case 'orders':
        return showOrdersPanel(bot, chatId, messageId);
      case 'system':
        return showSystemPanel(bot, chatId, messageId);
      default:
        return bot.editMessageText(`⚙️ **${panelType.toUpperCase()} Panel**\n\nPanel configuration and management options.`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]]
          }
        });
    }
  }
}

// Additional panel functions
async function showStatsPanel(bot, chatId, messageId) {
  const message = `📊 **Statistics Panel**\n\nView comprehensive bot statistics and analytics.\n\n🚧 Advanced statistics implementation in progress...`;
  
  const keyboard = [
    [
      { text: '📈 Revenue Stats', callback_data: 'stats_revenue' },
      { text: '👥 User Stats', callback_data: 'stats_users' }
    ],
    [
      { text: '📦 Product Stats', callback_data: 'stats_products' },
      { text: '💸 Payment Stats', callback_data: 'stats_payments' }
    ],
    [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
  ];

  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showUsersPanel(bot, chatId, messageId) {
  const message = `👥 **User Management Panel**\n\nManage users, permissions, and user analytics.\n\n🚧 User management implementation in progress...`;
  
  const keyboard = [
    [
      { text: '👤 View Users', callback_data: 'users_list' },
      { text: '🚫 Ban User', callback_data: 'users_ban' }
    ],
    [
      { text: '📊 User Analytics', callback_data: 'users_analytics' },
      { text: '💬 Send Message', callback_data: 'users_message' }
    ],
    [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
  ];

  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showOrdersPanel(bot, chatId, messageId) {
  const message = `📦 **Order Management Panel**\n\nManage orders, deliveries, and order analytics.\n\n🚧 Order management implementation in progress...`;
  
  const keyboard = [
    [
      { text: '� View Orders', callback_data: 'orders_list' },
      { text: '✅ Complete Order', callback_data: 'orders_complete' }
    ],
    [
      { text: '❌ Cancel Order', callback_data: 'orders_cancel' },
      { text: '📊 Order Analytics', callback_data: 'orders_analytics' }
    ],
    [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
  ];

  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showSystemPanel(bot, chatId, messageId) {
  const message = `⚙️ **System Management Panel**\n\nSystem configuration, maintenance, and monitoring.\n\n🚧 System management implementation in progress...`;
  
  const keyboard = [
    [
      { text: '📊 System Status', callback_data: 'system_status' },
      { text: '🔧 Maintenance', callback_data: 'system_maintenance' }
    ],
    [
      { text: '📝 Logs', callback_data: 'system_logs' },
      { text: '🔄 Restart Bot', callback_data: 'system_restart' }
    ],
    [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
  ];

  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}
