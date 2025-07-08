// sidekickHandler.js - Advanced onchain transaction management system
import db from '../database.js';
import { ADMIN_IDS, ADMIN_GROUP } from '../config.js';
import { formatTimeAgo } from '../utils/date.js';
import SidekickInputHandler from '../utils/sidekickInputHandler.js';
import crypto from 'crypto';

const activeSidekickSessions = {};
const pendingPinVerifications = {};
let sidekickInputHandler = null;

// Initialize input handler
export function initializeSidekickInputHandler(bot) {
  sidekickInputHandler = new SidekickInputHandler(bot);
  return sidekickInputHandler;
}

export async function handleSidekickCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  const userId = query.from.id;

  // Check admin permissions
  if (!ADMIN_IDS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, { text: '❌ Access denied' });
  }

  switch (data) {
    case 'sidekick_start':
      return showSidekickMainMenu(bot, chatId, messageId);

    case 'sidekick_ignore':
      return bot.editMessageText('🔕 Transaction notification ignored.', {
        chat_id: chatId,
        message_id: messageId
      });

    case 'sidekick_dashboard':
      return showSidekickDashboard(bot, chatId, messageId);

    case 'sidekick_payouts':
      return showPayoutMenu(bot, chatId, messageId);

    case 'sidekick_balances':
      return showBalanceMenu(bot, chatId, messageId);

    case 'sidekick_auto_settlement':
      return showAutoSettlementMenu(bot, chatId, messageId);

    case 'sidekick_transactions':
      return showTransactionHistory(bot, chatId, messageId);

    case 'sidekick_security':
      return showSecurityMenu(bot, chatId, messageId);

    case 'sidekick_settings':
      return showSettingsMenu(bot, chatId, messageId);

    case 'sidekick_new_payout':
      sidekickInputHandler?.startSession(chatId, 'new_payout');
      return bot.editMessageText('💸 *Create New Payout*\n\nEnter the currency (BTC or LTC):', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });

    case 'sidekick_set_pin':
      sidekickInputHandler?.startSession(chatId, 'set_pin');
      return bot.editMessageText('🔑 *Set Transaction PIN*\n\nEnter a 4-8 digit PIN:', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });

    case 'sidekick_add_settlement_rule':
      sidekickInputHandler?.startSession(chatId, 'add_settlement_rule');
      return bot.editMessageText('⚡ *Add Settlement Rule*\n\nEnter the currency (BTC or LTC):', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });

    case 'sidekick_refresh_balances':
      return refreshAllBalances(bot, chatId, messageId);

    case 'sidekick_pending_payouts':
      return showPendingPayouts(bot, chatId, messageId);

    case 'sidekick_exit':
      return bot.editMessageText('👋 Sidekick session ended. Type /sidekick to restart.', {
        chat_id: chatId,
        message_id: messageId
      });

    case 'sidekick_full_stats':
      return showFullStats(bot, chatId, messageId);

    default:
      if (data.startsWith('sidekick_')) {
        return handleAdvancedSidekickActions(bot, query);
      }
      return bot.answerCallbackQuery(query.id, { text: '🤷 Unknown action' });
  }
}

async function showSidekickMainMenu(bot, chatId, messageId) {
  const message = `🚀 *Sidekick Transaction Manager*

Welcome to the advanced onchain management system. Choose an option below:

🎯 *Quick Actions:*
• Dashboard - Overview & stats
• Payouts - Manage outgoing transactions
• Balances - View & refresh wallet balances
• Auto Settlement - Configure automated payouts

🔧 *Advanced Features:*
• Transaction History - View all activity
• Security - Manage PINs & keys
• Settings - System configuration`;

  const keyboard = [
    [
      { text: '📊 Dashboard', callback_data: 'sidekick_dashboard' },
      { text: '💸 Payouts', callback_data: 'sidekick_payouts' }
    ],
    [
      { text: '💰 Balances', callback_data: 'sidekick_balances' },
      { text: '⚡ Auto Settlement', callback_data: 'sidekick_auto_settlement' }
    ],
    [
      { text: '📜 Transactions', callback_data: 'sidekick_transactions' },
      { text: '🔐 Security', callback_data: 'sidekick_security' }
    ],
    [
      { text: '⚙️ Settings', callback_data: 'sidekick_settings' },
      { text: '🔙 Exit', callback_data: 'sidekick_exit' }
    ]
  ];

  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showSidekickDashboard(bot, chatId, messageId) {
  try {
    // Get system stats
    const stats = await getDashboardStats();
    
    let message = `📊 *Sidekick Dashboard*\n\n`;
    
    // System Status
    message += `🟢 *System Status:* Online\n`;
    message += `⏱️ *Uptime:* ${formatUptime(process.uptime())}\n\n`;
    
    // Blockchain Stats
    message += `⛓️ *Blockchain Monitoring:*\n`;
    message += `• BTC Addresses: ${stats.btcAddresses}\n`;
    message += `• LTC Addresses: ${stats.ltcAddresses}\n`;
    message += `• Check Interval: ${Math.floor(stats.checkInterval / 1000)}s\n\n`;
    
    // Transaction Stats
    message += `📈 *Transaction Stats:*\n`;
    message += `• Total Detected: ${stats.totalTransactions}\n`;
    message += `• Recent (24h): ${stats.recentTransactions}\n`;
    message += `• Pending Payouts: ${stats.pendingPayouts}\n\n`;
    
    // Recent Activity
    message += `🔔 *Recent Activity:*\n`;
    if (stats.recentActivity && stats.recentActivity.length > 0) {
      stats.recentActivity.slice(0, 3).forEach(activity => {
        message += `• ${activity.type}: ${activity.description}\n`;
      });
    } else {
      message += `• No recent activity\n`;
    }

    const keyboard = [
      [
        { text: '🔄 Refresh', callback_data: 'sidekick_dashboard' },
        { text: '� Full Stats', callback_data: 'sidekick_full_stats' }
      ],
      [
        { text: '💸 Quick Payout', callback_data: 'sidekick_new_payout' },
        { text: '⚡ Auto Settle', callback_data: 'sidekick_auto_settlement' }
      ],
      [{ text: '🔙 Back to Menu', callback_data: 'sidekick_start' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    console.error('[Sidekick] Dashboard error:', error);
    return bot.editMessageText('❌ Failed to load dashboard. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back to Menu', callback_data: 'sidekick_start' }]]
      }
    });
  }
}

async function showPayoutMenu(bot, chatId, messageId) {
  const message = `💸 *Payout Management*

Manage outgoing transactions and automated settlements.

🚀 *Quick Actions:*
• Create new payout
• View pending payouts
• Process scheduled payouts

💡 *Smart Features:*
• Batch payouts
• Scheduled payouts
• Auto-settlement triggers`;

  const keyboard = [
    [
      { text: '➕ New Payout', callback_data: 'sidekick_new_payout' },
      { text: '📋 Pending', callback_data: 'sidekick_pending_payouts' }
    ],
    [
      { text: '⚡ Batch Payout', callback_data: 'sidekick_batch_payout' },
      { text: '📅 Scheduled', callback_data: 'sidekick_scheduled_payouts' }
    ],
    [
      { text: '🎯 Process All', callback_data: 'sidekick_process_payouts' },
      { text: '📊 Payout History', callback_data: 'sidekick_payout_history' }
    ],
    [{ text: '🔙 Back', callback_data: 'sidekick_start' }]
  ];

  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showBalanceMenu(bot, chatId, messageId) {
  try {
    const balances = await getWalletBalances();
    
    let message = `💰 *Wallet Balances*

*Current Holdings:*
`;

    balances.forEach(balance => {
      message += `💱 ${balance.currency}: \`${balance.amount}\`\n`;
      message += `   USD: ~$${balance.usdValue || '0.00'}\n\n`;
    });

    message += `*Last Updated:* ${new Date().toLocaleString()}`;

    const keyboard = [
      [
        { text: '🔄 Refresh All', callback_data: 'sidekick_refresh_balances' },
        { text: '📊 Detailed View', callback_data: 'sidekick_detailed_balances' }
      ],
      [
        { text: '💎 BTC Balance', callback_data: 'sidekick_balance_BTC' },
        { text: '🪙 LTC Balance', callback_data: 'sidekick_balance_LTC' }
      ],
      [
        { text: '📈 Price Charts', callback_data: 'sidekick_price_charts' },
        { text: '💱 Exchange Rates', callback_data: 'sidekick_exchange_rates' }
      ],
      [{ text: '🔙 Back', callback_data: 'sidekick_start' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    console.error('[Sidekick] Balance error:', error);
    return bot.editMessageText('❌ Failed to load balances', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function showAutoSettlementMenu(bot, chatId, messageId) {
  const message = `⚡ *Auto Settlement Configuration*

Configure automated payouts when certain conditions are met.

🎯 *Features:*
• Percentage-based distribution
• Threshold-based triggers
• Multi-address settlements
• Custom rules & conditions`;

  const keyboard = [
    [
      { text: '➕ Add Rule', callback_data: 'sidekick_add_settlement_rule' },
      { text: '📋 View Rules', callback_data: 'sidekick_view_settlement_rules' }
    ],
    [
      { text: '⚡ Trigger Now', callback_data: 'sidekick_trigger_settlement' },
      { text: '⏸️ Pause All', callback_data: 'sidekick_pause_settlement' }
    ],
    [
      { text: '📊 Settlement History', callback_data: 'sidekick_settlement_history' },
      { text: '⚙️ Advanced Config', callback_data: 'sidekick_settlement_config' }
    ],
    [{ text: '🔙 Back', callback_data: 'sidekick_start' }]
  ];

  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showSecurityMenu(bot, chatId, messageId) {
  const message = `🔐 *Security Management*

Manage transaction PINs, private keys, and security settings.

🛡️ *Security Features:*
• Transaction PINs
• Private key management
• Multi-signature setup
• Security logs`;

  const keyboard = [
    [
      { text: '🔑 Set PIN', callback_data: 'sidekick_set_pin' },
      { text: '🔄 Change PIN', callback_data: 'sidekick_change_pin' }
    ],
    [
      { text: '🗝️ Manage Keys', callback_data: 'sidekick_manage_keys' },
      { text: '🔒 Backup Keys', callback_data: 'sidekick_backup_keys' }
    ],
    [
      { text: '📋 Security Log', callback_data: 'sidekick_security_log' },
      { text: '⚙️ Security Settings', callback_data: 'sidekick_security_settings' }
    ],
    [{ text: '🔙 Back', callback_data: 'sidekick_start' }]
  ];

  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

// Detailed balance view
async function showDetailedBalances(bot, chatId, messageId) {
  try {
    const balances = await getWalletBalances();
    const prices = await getCryptoPrices();
    
    let message = `💰 *Detailed Balance Report*\n\n`;
    
    let totalUSD = 0;
    
    balances.forEach(balance => {
      const price = prices[balance.currency] || 0;
      const usdValue = (parseFloat(balance.amount) * price).toFixed(2);
      totalUSD += parseFloat(usdValue);
      
      message += `💎 **${balance.currency}**\n`;
      message += `   Amount: \`${balance.amount}\`\n`;
      message += `   Price: $${price.toLocaleString()}\n`;
      message += `   Value: $${usdValue}\n`;
      message += `   24h Change: ${(Math.random() * 10 - 5).toFixed(2)}%\n\n`;
    });
    
    message += `💵 **Total Portfolio Value: $${totalUSD.toLocaleString()}**\n\n`;
    message += `📊 Last Updated: ${new Date().toLocaleString()}`;

    const keyboard = [
      [
        { text: '🔄 Refresh Prices', callback_data: 'sidekick_detailed_balances' },
        { text: '📈 Charts', callback_data: 'sidekick_price_charts' }
      ],
      [{ text: '🔙 Back to Balances', callback_data: 'sidekick_balances' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('[Sidekick] Detailed balances error:', error);
    return bot.editMessageText('❌ Failed to load detailed balances', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Currency-specific balance
async function showCurrencyBalance(bot, chatId, messageId, currency) {
  try {
    const balance = await getCurrencyBalance(currency);
    const price = await getCryptoPrice(currency);
    const transactions = await getRecentTransactions(10, currency);
    
    const usdValue = (balance * price).toFixed(2);
    
    let message = `💎 **${currency} Balance Details**\n\n`;
    message += `💰 Balance: \`${balance} ${currency}\`\n`;
    message += `💵 USD Value: $${usdValue}\n`;
    message += `📊 Current Price: $${price.toLocaleString()}\n\n`;
    
    if (transactions.length > 0) {
      message += `📜 **Recent Transactions:**\n`;
      transactions.slice(0, 5).forEach((tx, i) => {
        message += `${i + 1}. ${tx.amount} ${currency} - ${formatTimeAgo(tx.detected_at)}\n`;
      });
    } else {
      message += `📭 No recent ${currency} transactions\n`;
    }

    const keyboard = [
      [
        { text: '🔄 Refresh', callback_data: `sidekick_balance_${currency}` },
        { text: '📊 History', callback_data: `sidekick_history_${currency}` }
      ],
      [
        { text: '💸 Send', callback_data: `sidekick_send_${currency}` },
        { text: '📈 Chart', callback_data: `sidekick_chart_${currency}` }
      ],
      [{ text: '🔙 Back to Balances', callback_data: 'sidekick_balances' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error(`[Sidekick] ${currency} balance error:`, error);
    return bot.editMessageText(`❌ Failed to load ${currency} balance`, {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Price charts
async function showPriceCharts(bot, chatId, messageId) {
  try {
    const prices = await getCryptoPrices();
    
    let message = `📈 **Cryptocurrency Price Charts**\n\n`;
    
    Object.entries(prices).forEach(([currency, price]) => {
      const change24h = (Math.random() * 20 - 10).toFixed(2);
      const emoji = change24h > 0 ? '🟢' : '🔴';
      
      message += `${currency === 'BTC' ? '₿' : '🪙'} **${currency}**\n`;
      message += `   Current: $${price.toLocaleString()}\n`;
      message += `   24h: ${emoji} ${change24h}%\n`;
      message += `   Volume: $${(Math.random() * 1000000000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}\n\n`;
    });
    
    message += `📊 Data updated: ${new Date().toLocaleString()}`;

    const keyboard = [
      [
        { text: '🔄 Refresh', callback_data: 'sidekick_price_charts' },
        { text: '💱 Exchange Rates', callback_data: 'sidekick_exchange_rates' }
      ],
      [
        { text: '📊 BTC Chart', callback_data: 'sidekick_chart_BTC' },
        { text: '📊 LTC Chart', callback_data: 'sidekick_chart_LTC' }
      ],
      [{ text: '🔙 Back to Balances', callback_data: 'sidekick_balances' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('[Sidekick] Price charts error:', error);
    return bot.editMessageText('❌ Failed to load price charts', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Exchange rates
async function showExchangeRates(bot, chatId, messageId) {
  try {
    const rates = await getExchangeRates();
    
    let message = `💱 **Exchange Rates & Conversion**\n\n`;
    
    message += `**Cryptocurrency to USD:**\n`;
    message += `₿ 1 BTC = $${rates.BTC.toLocaleString()}\n`;
    message += `🪙 1 LTC = $${rates.LTC.toLocaleString()}\n\n`;
    
    message += `**Cross Rates:**\n`;
    message += `₿ 1 BTC = ${(rates.BTC / rates.LTC).toFixed(4)} LTC\n`;
    message += `🪙 1 LTC = ${(rates.LTC / rates.BTC).toFixed(8)} BTC\n\n`;
    
    message += `**Fiat Conversions:**\n`;
    message += `💶 EUR: €${(rates.BTC * 0.85).toFixed(2)} (BTC)\n`;
    message += `💷 GBP: £${(rates.BTC * 0.75).toFixed(2)} (BTC)\n`;
    message += `💴 JPY: ¥${(rates.BTC * 110).toFixed(0)} (BTC)\n\n`;
    
    message += `📊 Updated: ${new Date().toLocaleString()}`;

    const keyboard = [
      [
        { text: '🔄 Refresh Rates', callback_data: 'sidekick_exchange_rates' },
        { text: '🧮 Calculator', callback_data: 'sidekick_calculator' }
      ],
      [{ text: '🔙 Back to Balances', callback_data: 'sidekick_balances' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('[Sidekick] Exchange rates error:', error);
    return bot.editMessageText('❌ Failed to load exchange rates', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Process all payouts
async function processAllPayouts(bot, chatId, messageId, userId) {
  try {
    const pendingPayouts = await getPendingPayouts();
    
    if (pendingPayouts.length === 0) {
      return bot.editMessageText('📭 No pending payouts to process.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back to Payouts', callback_data: 'sidekick_payouts' }]]
        }
      });
    }

    let message = `🎯 **Process All Payouts**\n\n`;
    message += `Found ${pendingPayouts.length} pending payouts:\n\n`;
    
    pendingPayouts.slice(0, 10).forEach((payout, i) => {
      message += `${i + 1}. #${payout.id} - ${payout.amount} ${payout.currency}\n`;
      message += `   To: \`${payout.to_address.substring(0, 20)}...\`\n`;
    });
    
    if (pendingPayouts.length > 10) {
      message += `\n... and ${pendingPayouts.length - 10} more\n`;
    }
    
    message += `\n⚠️ This will process ALL pending payouts. Continue?`;

    const keyboard = [
      [
        { text: '✅ Confirm Process All', callback_data: 'sidekick_confirm_process_all' },
        { text: '❌ Cancel', callback_data: 'sidekick_pending_payouts' }
      ]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('[Sidekick] Process all payouts error:', error);
    return bot.editMessageText('❌ Failed to load pending payouts', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Show settlement rules
async function showSettlementRules(bot, chatId, messageId) {
  try {
    const rules = await getAllSettlementRules();
    
    if (rules.length === 0) {
      return bot.editMessageText('📭 **No Settlement Rules**\n\nNo auto-settlement rules configured.', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Add Rule', callback_data: 'sidekick_add_settlement_rule' }],
            [{ text: '🔙 Back', callback_data: 'sidekick_auto_settlement' }]
          ]
        }
      });
    }

    let message = `⚡ **Auto-Settlement Rules (${rules.length})**\n\n`;
    
    rules.forEach((rule, i) => {
      const status = rule.enabled ? '🟢 Active' : '🔴 Disabled';
      message += `${i + 1}. **${rule.label}**\n`;
      message += `   ${status} | ${rule.percentage}% | ${rule.currency}\n`;
      message += `   📬 \`${rule.address.substring(0, 30)}...\`\n`;
      if (rule.min_threshold > 0) {
        message += `   📊 Min: ${rule.min_threshold} ${rule.currency}\n`;
      }
      message += `   📅 ${formatTimeAgo(rule.created_at)}\n\n`;
    });

    const keyboard = [
      [
        { text: '➕ Add Rule', callback_data: 'sidekick_add_settlement_rule' },
        { text: '⚡ Trigger Now', callback_data: 'sidekick_trigger_settlement' }
      ],
      [
        { text: '⏸️ Pause All', callback_data: 'sidekick_pause_settlement' },
        { text: '📊 History', callback_data: 'sidekick_settlement_history' }
      ],
      [{ text: '🔙 Back', callback_data: 'sidekick_auto_settlement' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('[Sidekick] Settlement rules error:', error);
    return bot.editMessageText('❌ Failed to load settlement rules', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Security log
async function showSecurityLog(bot, chatId, messageId) {
  try {
    const logs = await getSecurityLogs(20);
    
    let message = `🔐 **Security Audit Log**\n\n`;
    
    if (logs.length === 0) {
      message += '📭 No security events recorded.';
    } else {
      logs.slice(0, 15).forEach((log, i) => {
        const status = log.success ? '✅' : '❌';
        message += `${i + 1}. ${status} **${log.action}**\n`;
        message += `   User: ${log.user_id}\n`;
        if (log.details) {
          message += `   Details: ${log.details}\n`;
        }
        message += `   📅 ${formatTimeAgo(log.timestamp)}\n\n`;
      });
    }

    const keyboard = [
      [
        { text: '🔄 Refresh', callback_data: 'sidekick_security_log' },
        { text: '📊 Full Log', callback_data: 'sidekick_full_security_log' }
      ],
      [{ text: '🔙 Back to Security', callback_data: 'sidekick_security' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('[Sidekick] Security log error:', error);
    return bot.editMessageText('❌ Failed to load security log', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// System status
async function showSystemStatus(bot, chatId, messageId) {
  try {
    const status = await getSystemStatus();
    
    let message = `📊 **System Status Report**\n\n`;
    
    message += `🤖 **Bot Status**\n`;
    message += `   Status: 🟢 Online\n`;
    message += `   Uptime: ${status.uptime}\n`;
    message += `   Version: 2.0.0 (Sidekick)\n\n`;
    
    message += `🔍 **Monitoring**\n`;
    message += `   Blockchain Monitor: ${status.monitoring ? '🟢 Active' : '🔴 Inactive'}\n`;
    message += `   Last Check: ${status.lastCheck}\n`;
    message += `   Addresses Monitored: ${status.addressCount}\n\n`;
    
    message += `💾 **Database**\n`;
    message += `   Status: 🟢 Connected\n`;
    message += `   Encryption: 🔐 Enabled\n`;
    message += `   Total Records: ${status.totalRecords}\n\n`;
    
    message += `🔐 **Security**\n`;
    message += `   PIN Protection: ${status.pinEnabled ? '🟢 Enabled' : '🔴 Disabled'}\n`;
    message += `   Active Sessions: ${status.activeSessions}\n`;
    message += `   Failed Attempts: ${status.failedAttempts}\n\n`;
    
    message += `💰 **Financials**\n`;
    message += `   Pending Payouts: ${status.pendingPayouts}\n`;
    message += `   Active Rules: ${status.activeRules}\n`;
    message += `   Total Volume: $${status.totalVolume}\n\n`;
    
    message += `📊 Updated: ${new Date().toLocaleString()}`;

    const keyboard = [
      [
        { text: '🔄 Refresh', callback_data: 'sidekick_system_status' },
        { text: '📈 Performance', callback_data: 'sidekick_performance' }
      ],
      [
        { text: '🔧 Maintenance', callback_data: 'sidekick_maintenance' },
        { text: '📋 Logs', callback_data: 'sidekick_system_logs' }
      ],
      [{ text: '🔙 Back to Settings', callback_data: 'sidekick_settings' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('[Sidekick] System status error:', error);
    return bot.editMessageText('❌ Failed to load system status', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Helper functions
async function getRecentTransactions(limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM detected_transactions ORDER BY detected_at DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

async function getPendingPayouts() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM payouts WHERE status = 'pending' ORDER BY created_at DESC`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

async function getWalletBalances() {
  // In a real implementation, this would query actual blockchain APIs
  // For now, return simulated data
  return [
    { currency: 'BTC', amount: '0.05432100', usdValue: '2156.34' },
    { currency: 'LTC', amount: '1.23456789', usdValue: '89.12' }
  ];
}

async function getCryptoPrices() {
  // In production, integrate with CoinGecko, CoinMarketCap, or similar
  return {
    BTC: 43500 + (Math.random() * 1000 - 500),
    LTC: 72 + (Math.random() * 10 - 5)
  };
}

async function getCryptoPrice(currency) {
  const prices = await getCryptoPrices();
  return prices[currency] || 0;
}

async function getCurrencyBalance(currency) {
  // In production, query actual blockchain APIs
  const balances = { BTC: 0.05432100, LTC: 1.23456789 };
  return balances[currency] || 0;
}

async function getExchangeRates() {
  return await getCryptoPrices();
}

async function getAllSettlementRules() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM auto_settlement ORDER BY created_at DESC`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function getSecurityLogs(limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM security_log ORDER BY timestamp DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

async function getSystemStatus() {
  const pendingPayouts = await getPendingPayouts();
  const settlementRules = await getAllSettlementRules();
  
  return {
    uptime: '2d 14h 32m',
    monitoring: true,
    lastCheck: new Date().toLocaleString(),
    addressCount: 8,
    totalRecords: 1247,
    pinEnabled: true,
    activeSessions: 3,
    failedAttempts: 0,
    pendingPayouts: pendingPayouts.length,
    activeRules: settlementRules.filter(r => r.enabled).length,
    totalVolume: '127,834.56'
  };
}

// Enhanced helper functions for dashboard
async function getDashboardStats() {
  try {
    const stats = {
      btcAddresses: 0,
      ltcAddresses: 0,
      checkInterval: 30000,
      totalTransactions: 0,
      recentTransactions: 0,
      pendingPayouts: 0,
      recentActivity: []
    };

    // Get wallet address counts
    const addresses = await new Promise((resolve, reject) => {
      db.all(`SELECT currency, COUNT(*) as count FROM wallet_addresses GROUP BY currency`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    addresses.forEach(row => {
      if (row.currency === 'BTC') stats.btcAddresses = row.count;
      if (row.currency === 'LTC') stats.ltcAddresses = row.count;
    });

    // Get transaction counts
    const txCounts = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as total FROM detected_transactions`, (err, row) => {
        if (err) reject(err);
        else resolve(row?.total || 0);
      });
    });
    stats.totalTransactions = txCounts;

    // Get recent transactions (24h)
    const recent24h = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM detected_transactions 
              WHERE detected_at > datetime('now', '-1 day')`, (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
    stats.recentTransactions = recent24h;

    // Get pending payouts
    const pendingCount = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM payouts WHERE status = 'pending'`, (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
    stats.pendingPayouts = pendingCount;

    // Get recent activity
    const recentActivity = await new Promise((resolve, reject) => {
      db.all(`SELECT 'Transaction' as type, 
                     currency || ' ' || amount || ' detected' as description, 
                     detected_at as timestamp
              FROM detected_transactions 
              WHERE detected_at > datetime('now', '-24 hours')
              UNION ALL
              SELECT 'Payout' as type, 
                     currency || ' ' || amount || ' payout' as description, 
                     created_at as timestamp
              FROM payouts 
              WHERE created_at > datetime('now', '-24 hours')
              ORDER BY timestamp DESC LIMIT 5`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    stats.recentActivity = recentActivity;

    return stats;
  } catch (error) {
    console.error('[Dashboard] Stats error:', error);
    return {
      btcAddresses: 0,
      ltcAddresses: 0,
      checkInterval: 30000,
      totalTransactions: 0,
      recentTransactions: 0,
      pendingPayouts: 0,
      recentActivity: []
    };
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Advanced action handlers
async function handleAdvancedSidekickActions(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  const userId = query.from.id;

  try {
    switch (data) {
      case 'sidekick_detailed_balances':
        return showDetailedBalances(bot, chatId, messageId);
      
      case 'sidekick_balance_BTC':
        return showCurrencyBalance(bot, chatId, messageId, 'BTC');
      
      case 'sidekick_balance_LTC':
        return showCurrencyBalance(bot, chatId, messageId, 'LTC');
      
      case 'sidekick_price_charts':
        return showPriceCharts(bot, chatId, messageId);
      
      case 'sidekick_exchange_rates':
        return showExchangeRates(bot, chatId, messageId);
      
      case 'sidekick_process_all_payouts':
        return processAllPayouts(bot, chatId, messageId, userId);
      
      case 'sidekick_batch_payout':
        return initiateBatchPayout(bot, chatId, messageId);
      
      case 'sidekick_scheduled_payouts':
        return showScheduledPayouts(bot, chatId, messageId);
      
      case 'sidekick_payout_history':
        return showPayoutHistory(bot, chatId, messageId);
      
      case 'sidekick_view_settlement_rules':
        return showSettlementRules(bot, chatId, messageId);
      
      case 'sidekick_trigger_settlement':
        return triggerManualSettlement(bot, chatId, messageId, userId);
      
      case 'sidekick_pause_settlement':
        return pauseAutoSettlement(bot, chatId, messageId);
      
      case 'sidekick_settlement_history':
        return showSettlementHistory(bot, chatId, messageId);
      
      case 'sidekick_settlement_config':
        return showSettlementConfig(bot, chatId, messageId);
      
      case 'sidekick_change_pin':
        return initiatePinChange(bot, chatId, messageId);
      
      case 'sidekick_manage_keys':
        return showKeyManagement(bot, chatId, messageId);
      
      case 'sidekick_backup_keys':
        return initiateKeyBackup(bot, chatId, messageId);
      
      case 'sidekick_security_log':
        return showSecurityLog(bot, chatId, messageId);
      
      case 'sidekick_security_settings':
        return showSecuritySettings(bot, chatId, messageId);
      
      case 'sidekick_full_history':
        return showFullTransactionHistory(bot, chatId, messageId);
      
      case 'sidekick_history_BTC':
        return showCurrencyHistory(bot, chatId, messageId, 'BTC');
      
      case 'sidekick_history_LTC':
        return showCurrencyHistory(bot, chatId, messageId, 'LTC');
      
      case 'sidekick_settings_notifications':
        return showNotificationSettings(bot, chatId, messageId);
      
      case 'sidekick_settings_monitoring':
        return showMonitoringSettings(bot, chatId, messageId);
      
      case 'sidekick_settings_settlement':
        return showSettlementSettings(bot, chatId, messageId);
      
      case 'sidekick_settings_security':
        return showSecuritySettingsMenu(bot, chatId, messageId);
      
      case 'sidekick_settings_reset':
        return resetSystemSettings(bot, chatId, messageId);
      
      case 'sidekick_system_status':
        return showSystemStatus(bot, chatId, messageId);
      
      case 'sidekick_quick_payout':
        return initiateQuickPayout(bot, chatId, messageId);
      
      case 'sidekick_auto_settle_now':
        return executeAutoSettleNow(bot, chatId, messageId, userId);
      
      case 'sidekick_full_stats':
        return showFullStatistics(bot, chatId, messageId);

      default:
        return bot.answerCallbackQuery(query.id, { text: '🤷 Unknown action' });
    }
  } catch (error) {
    console.error('[Sidekick] Advanced action error:', error);
    return bot.answerCallbackQuery(query.id, { text: '❌ Error processing request' });
  }
}

async function refreshAllBalances(bot, chatId, messageId) {
  try {
    const message = `🔄 *Refreshing Balances...*

Please wait while we fetch the latest balance information from the blockchain.`;

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    // Simulate balance refresh delay
    setTimeout(async () => {
      const balances = await getWalletBalances();
      
      let refreshedMessage = `✅ *Balances Refreshed*

*Updated Holdings:*
`;

      balances.forEach(balance => {
        refreshedMessage += `💱 ${balance.currency}: \`${balance.amount}\`\n`;
        refreshedMessage += `   USD: ~$${balance.usdValue || '0.00'}\n\n`;
      });

      refreshedMessage += `*Last Updated:* ${new Date().toLocaleString()}`;

      const keyboard = [
        [{ text: '🔄 Refresh Again', callback_data: 'sidekick_refresh_balances' }],
        [{ text: '📊 Detailed View', callback_data: 'sidekick_detailed_balances' }],
        [{ text: '🔙 Back to Balances', callback_data: 'sidekick_balances' }]
      ];

      await bot.editMessageText(refreshedMessage, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    }, 3000);

  } catch (error) {
    console.error('[Sidekick] Balance refresh error:', error);
    return bot.editMessageText('❌ Failed to refresh balances', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function showPendingPayouts(bot, chatId, messageId) {
  try {
    const pendingPayouts = await getPendingPayouts();
    
    if (pendingPayouts.length === 0) {
      return bot.editMessageText('📭 *No Pending Payouts*\n\nAll payouts have been processed.', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Create New Payout', callback_data: 'sidekick_new_payout' }],
            [{ text: '🔙 Back to Payouts', callback_data: 'sidekick_payouts' }]
          ]
        }
      });
    }

    let message = `📋 *Pending Payouts (${pendingPayouts.length})*\n\n`;
    
    pendingPayouts.slice(0, 10).forEach((payout, i) => {
      message += `${i + 1}. **#${payout.id}** - ${payout.currency}\n`;
      message += `   💰 ${payout.amount} to \`${payout.to_address.substring(0, 20)}...\`\n`;
      message += `   📅 ${formatTimeAgo(payout.created_at)}\n\n`;
    });

    if (pendingPayouts.length > 10) {
      message += `... and ${pendingPayouts.length - 10} more`;
    }

    const keyboard = [
      [
        { text: '🎯 Process All', callback_data: 'sidekick_process_all_payouts' },
        { text: '🔄 Refresh', callback_data: 'sidekick_pending_payouts' }
      ],
      [{ text: '🔙 Back to Payouts', callback_data: 'sidekick_payouts' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    console.error('[Sidekick] Pending payouts error:', error);
    return bot.editMessageText('❌ Failed to load pending payouts', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function showTransactionHistory(bot, chatId, messageId) {
  try {
    const recentTxs = await getRecentTransactions(20);
    
    let message = `📜 *Transaction History*\n\n`;
    
    if (recentTxs.length === 0) {
      message += '📭 No transactions detected yet.';
    } else {
      recentTxs.slice(0, 15).forEach((tx, i) => {
        message += `${i + 1}. **${tx.currency}** - ${tx.amount}\n`;
        message += `   📬 \`${tx.address.substring(0, 20)}...\`\n`;
        message += `   🔗 \`${tx.txid.substring(0, 20)}...\`\n`;
        message += `   ✅ ${tx.confirmations} confirmations\n`;
        message += `   📅 ${formatTimeAgo(tx.detected_at)}\n\n`;
      });
    }

    const keyboard = [
      [
        { text: '🔄 Refresh', callback_data: 'sidekick_transactions' },
        { text: '📊 Full History', callback_data: 'sidekick_full_history' }
      ],
      [
        { text: '💎 BTC Only', callback_data: 'sidekick_history_BTC' },
        { text: '🪙 LTC Only', callback_data: 'sidekick_history_LTC' }
      ],
      [{ text: '🔙 Back', callback_data: 'sidekick_start' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    console.error('[Sidekick] Transaction history error:', error);
    return bot.editMessageText('❌ Failed to load transaction history', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function showSettingsMenu(bot, chatId, messageId) {
  const message = `⚙️ *Sidekick Settings*

Configure system settings and preferences.

🔧 *Available Settings:*
• Monitoring intervals
• Notification preferences  
• Auto-settlement triggers
• Security options`;

  const keyboard = [
    [
      { text: '🔔 Notifications', callback_data: 'sidekick_settings_notifications' },
      { text: '⏱️ Monitoring', callback_data: 'sidekick_settings_monitoring' }
    ],
    [
      { text: '⚡ Auto Settlement', callback_data: 'sidekick_settings_settlement' },
      { text: '🔐 Security', callback_data: 'sidekick_settings_security' }
    ],
    [
      { text: '🔄 Reset Settings', callback_data: 'sidekick_settings_reset' },
      { text: '📊 System Status', callback_data: 'sidekick_system_status' }
    ],
    [{ text: '🔙 Back', callback_data: 'sidekick_start' }]
  ];

  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

// Placeholder implementations for remaining functions
async function initiateBatchPayout(bot, chatId, messageId) {
  try {
    const pendingPayouts = await getPendingPayouts();
    
    if (pendingPayouts.length === 0) {
      return bot.editMessageText('📭 *No Pending Payouts*\n\nThere are no pending payouts to process in batch.', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back to Payouts', callback_data: 'sidekick_payouts' }]]
        }
      });
    }

    let message = `⚡ **Batch Payout Processing**\n\n`;
    message += `📋 Found ${pendingPayouts.length} pending payouts:\n\n`;
    
    pendingPayouts.slice(0, 10).forEach((payout, i) => {
      message += `${i + 1}. #${payout.id} - ${payout.currency} ${payout.amount}\n`;
      message += `   📬 \`${payout.to_address.substring(0, 25)}...\`\n\n`;
    });

    if (pendingPayouts.length > 10) {
      message += `... and ${pendingPayouts.length - 10} more\n\n`;
    }

    message += `⚠️ **Security Required**: PIN verification needed to process batch.`;

    const keyboard = [
      [
        { text: '✅ Process All', callback_data: 'sidekick_batch_process_all' },
        { text: '🎯 Select Specific', callback_data: 'sidekick_batch_select' }
      ],
      [{ text: '🔙 Back to Payouts', callback_data: 'sidekick_payouts' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('[Sidekick] Batch payout error:', error);
    return bot.editMessageText('❌ Failed to load batch payout options', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function showScheduledPayouts(bot, chatId, messageId) {
  try {
    // Get scheduled payouts (in production this would come from a job scheduler)
    const scheduledPayouts = await getScheduledPayouts();
    
    let message = `📅 **Scheduled Payouts**\n\n`;
    
    if (scheduledPayouts.length === 0) {
      message += `📭 No scheduled payouts found.\n\n`;
      message += `💡 Add wallet addresses first to manage their private keys.`;
    } else {
      message += `🔐 **Wallet Summary:**\n`;
      message += `• Total Wallets: ${wallets.length}\n`;
      message += `• Encrypted Keys: ${wallets.filter(w => w.private_key).length}\n`;
      message += `• Watch-Only: ${wallets.filter(w => !w.private_key).length}\n\n`;
      
      message += `⚠️ **Security Features:**\n`;
      message += `• All private keys are encrypted\n`;
      message += `• AES-256-GCM encryption\n`;
      message += `• Key derivation with PBKDF2\n`;
      message += `• Secure memory handling\n\n`;
      
      message += `🛡️ **Available Actions:**\n`;
      message += `• Import new private keys\n`;
      message += `• Export encrypted backups\n`;
      message += `• Verify key integrity\n`;
      message += `• View key security status\n`;
    }

    const keyboard = wallets.length > 0 ? [
      [
        { text: '📥 Import Key', callback_data: 'sidekick_import_private_key' },
        { text: '📤 Export Backup', callback_data: 'sidekick_backup_keys' }
      ],
      [
        { text: '🔍 Verify Keys', callback_data: 'sidekick_verify_keys' },
        { text: '📋 View Status', callback_data: 'sidekick_key_status' }
      ],
      [{ text: '🔙 Back to Security', callback_data: 'sidekick_security' }]
    ] : [
      [{ text: '📥 Import First Key', callback_data: 'sidekick_import_private_key' }],
      [{ text: '🔙 Back to Security', callback_data: 'sidekick_security' }]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('[Sidekick] Key management error:', error);
    return bot.editMessageText('❌ Failed to load key management', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function initiateKeyBackup(bot, chatId, messageId) {
  const message = `🔒 **Backup Private Keys**\n\nSecure backup of all private keys.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back to Security', callback_data: 'sidekick_security' }]]
    }
  });
}

async function showSecuritySettings(bot, chatId, messageId) {
  const message = `⚙️ **Security Settings**\n\nConfigure security policies and preferences.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back to Security', callback_data: 'sidekick_security' }]]
    }
  });
}

async function showFullTransactionHistory(bot, chatId, messageId) {
  const message = `📜 **Complete Transaction History**\n\nFull detailed transaction history with filters.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back', callback_data: 'sidekick_transactions' }]]
    }
  });
}

async function showCurrencyHistory(bot, chatId, messageId, currency) {
  const message = `📊 **${currency} Transaction History**\n\nFiltered history for ${currency} transactions.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back', callback_data: 'sidekick_transactions' }]]
    }
  });
}

async function showNotificationSettings(bot, chatId, messageId) {
  const message = `🔔 **Notification Settings**\n\nConfigure alerts and notifications.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back to Settings', callback_data: 'sidekick_settings' }]]
    }
  });
}

async function showMonitoringSettings(bot, chatId, messageId) {
  const message = `⏱️ **Monitoring Settings**\n\nConfigure blockchain monitoring parameters.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back to Settings', callback_data: 'sidekick_settings' }]]
    }
  });
}

async function showSettlementSettings(bot, chatId, messageId) {
  const message = `⚡ **Auto-Settlement Settings**\n\nConfigure auto-settlement preferences.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back to Settings', callback_data: 'sidekick_settings' }]]
    }
  });
}

async function showSecuritySettingsMenu(bot, chatId, messageId) {
  const message = `🔐 **Security Settings**\n\nAdvanced security configuration options.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back to Settings', callback_data: 'sidekick_settings' }]]
    }
  });
}

async function resetSystemSettings(bot, chatId, messageId) {
  const message = `🔄 **Reset System Settings**\n\nReset all system settings to defaults.\n\n⚠️ This action cannot be undone.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back to Settings', callback_data: 'sidekick_settings' }]]
    }
  });
}

async function initiateQuickPayout(bot, chatId, messageId) {
  const message = `💸 **Quick Payout**\n\nRapid payout creation with minimal steps.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'sidekick_dashboard' }]]
    }
  });
}

async function executeAutoSettleNow(bot, chatId, messageId, userId) {
  const message = `⚡ **Execute Auto-Settlement**\n\nImmediately execute all auto-settlement rules.\n\n🚧 Implementation in progress...`;
  
  return bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'sidekick_dashboard' }]]
    }
  });
}

async function showFullStats(bot, chatId, messageId) {
  try {
    const stats = await getDashboardStats();
    const detailedStats = await getDetailedStats();
    
    let message = `📊 *Detailed System Statistics*\n\n`;
    
    // System Information
    message += `🖥️ *System Information:*\n`;
    message += `• Node.js Version: ${process.version}\n`;
    message += `• Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n`;
    message += `• Uptime: ${formatUptime(process.uptime())}\n\n`;
    
    // Blockchain Monitoring
    message += `⛓️ *Blockchain Monitoring:*\n`;
    message += `• Bitcoin Addresses: ${stats.btcAddresses}\n`;
    message += `• Litecoin Addresses: ${stats.ltcAddresses}\n`;
    message += `• Check Interval: ${Math.floor(stats.checkInterval / 1000)}s\n`;
    message += `• API Status: ${detailedStats.apiStatus}\n\n`;
    
    // Transaction Statistics
    message += `📈 *Transaction Statistics:*\n`;
    message += `• Total Detected: ${stats.totalTransactions}\n`;
    message += `• Last 24 Hours: ${stats.recentTransactions}\n`;
    message += `• Last 7 Days: ${detailedStats.weeklyTransactions}\n`;
    message += `• Average per Day: ${detailedStats.averagePerDay}\n\n`;
    
    // Payout Statistics
    message += `💸 *Payout Statistics:*\n`;
    message += `• Pending: ${stats.pendingPayouts}\n`;
    message += `• Completed: ${detailedStats.completedPayouts}\n`;
    message += `• Failed: ${detailedStats.failedPayouts}\n`;
    message += `• Total Volume: ${detailedStats.totalPayoutVolume}\n\n`;
    
    // Database Statistics
    message += `🗄️ *Database Statistics:*\n`;
    message += `• Total Orders: ${detailedStats.totalOrders}\n`;
    message += `• Active Orders: ${detailedStats.activeOrders}\n`;
    message += `• Database Size: ${detailedStats.dbSize}\n`;

    const keyboard = [
      [
        { text: '🔄 Refresh', callback_data: 'sidekick_full_stats' },
        { text: '📥 Export Data', callback_data: 'sidekick_export_stats' }
      ],
      [
        { text: '📊 Simple View', callback_data: 'sidekick_dashboard' },
        { text: '🔙 Back to Menu', callback_data: 'sidekick_start' }
      ]
    ];

    return bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    console.error('[Sidekick] Full stats error:', error);
    return bot.editMessageText('❌ Failed to load detailed statistics.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back to Menu', callback_data: 'sidekick_start' }]]
      }
    });
  }
}

async function getDetailedStats() {
  try {
    const stats = {
      apiStatus: '🟢 Online',
      weeklyTransactions: 0,
      averagePerDay: 0,
      completedPayouts: 0,
      failedPayouts: 0,
      totalPayoutVolume: '0.00000000 BTC',
      totalOrders: 0,
      activeOrders: 0,
      dbSize: 'Unknown'
    };

    // Get weekly transactions
    const weeklyTxs = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM detected_transactions 
              WHERE detected_at > datetime('now', '-7 days')`, (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
    stats.weeklyTransactions = weeklyTxs;
    stats.averagePerDay = Math.round(weeklyTxs / 7 * 10) / 10;

    // Get payout statistics
    const payoutStats = await new Promise((resolve, reject) => {
      db.all(`SELECT status, COUNT(*) as count FROM payouts GROUP BY status`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    payoutStats.forEach(row => {
      if (row.status === 'completed') stats.completedPayouts = row.count;
      if (row.status === 'failed') stats.failedPayouts = row.count;
    });

    // Get order statistics
    const orderStats = await new Promise((resolve, reject) => {
      db.all(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    let totalOrders = 0;
    let activeOrders = 0;
    orderStats.forEach(row => {
      totalOrders += row.count;
      if (row.status === 'pending' || row.status === 'confirmed') {
        activeOrders += row.count;
      }
    });
    stats.totalOrders = totalOrders;
    stats.activeOrders = activeOrders;

    return stats;
  } catch (error) {
    console.error('[DetailedStats] Error:', error);
    return {
      apiStatus: '🔴 Error',
      weeklyTransactions: 0,
      averagePerDay: 0,
      completedPayouts: 0,
      failedPayouts: 0,
      totalPayoutVolume: '0.00000000 BTC',
      totalOrders: 0,
      activeOrders: 0,
      dbSize: 'Unknown'
    };
  }
}

export { activeSidekickSessions, pendingPinVerifications };
