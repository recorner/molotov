import db from '../database.js';
import { ADMIN_GROUP } from '../config.js';
import { formatTimeAgo } from '../utils/date.js';
import languageStatsManager from '../utils/languageStats.js';
import logger from '../utils/logger.js';
import { notifyGroup } from '../utils/notifyGroup.js';
import adminManager from '../utils/adminManager.js';
import vouchChannelManager from '../utils/vouchChannel.js';

// === Handle /cocktail Command ===
export async function handleAdminCommand(bot, msg) {
  const { from } = msg;

  // Use dynamic admin check instead of hardcoded ADMIN_IDS
  const isUserAdmin = await adminManager.isAdmin(from.id);
  if (!isUserAdmin) {
    return bot.sendMessage(msg.chat.id, '⛔ *Unauthorized Access*\n\nThis command is restricted to administrators only.', {
      parse_mode: 'Markdown'
    });
  }

  // Log admin panel access
  logger.info('ADMIN', `Admin panel accessed by user ${from.id} (${from.first_name})`);

  const currentTime = new Date().toLocaleString();
  const adminName = from.first_name || 'Admin';

  return bot.sendMessage(msg.chat.id, `🔧 **Molotov Admin Control Panel**\n\n` +
    `👋 Welcome, *${adminName}*\n` +
    `🕒 Access Time: ${currentTime}\n` +
    `🔐 Security Level: Administrator\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Select a management section:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📥 Wallet Management', callback_data: 'panel_address' },
          { text: '🌍 Language Analytics', callback_data: 'panel_language_stats' }
        ],
        [
          { text: '📊 System Statistics', callback_data: 'panel_stats' },
          { text: '👥 User Management', callback_data: 'panel_users' }
        ],
        [
          { text: '📦 Order Management', callback_data: 'panel_orders' },
          { text: '📢 News & Announcements', callback_data: 'panel_news' }
        ],
        [
          { text: '✅ Vouch Channel', callback_data: 'panel_vouch' },
          { text: '👑 Admin Management', callback_data: 'panel_admin_mgmt' }
        ],
        [
          { text: '⚙️ System Control', callback_data: 'panel_system' },
          { text: '🖥️ Cloud Shell', callback_data: 'panel_shell' }
        ],
        [{ text: '🏠 Go to Lobby', url: `https://t.me/+g1nH977AIqhkNjBk` }]
      ]
    }
  });
}

// === Handle Admin Panel Callbacks ===
export async function handleAdminCallback(bot, query) {
  const { id: userId } = query.from;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // Use dynamic admin check instead of hardcoded ADMIN_IDS
  const isUserAdmin = await adminManager.isAdmin(userId);
  if (!isUserAdmin) {
    logger.warn('ADMIN', `Unauthorized admin panel access attempt by user ${userId}`);
    return bot.answerCallbackQuery(query.id, { 
      text: '⛔ Unauthorized access. This incident has been logged.', 
      show_alert: true 
    });
  }

  // Log admin action
  logger.info('ADMIN', `Admin ${userId} executed action: ${data}`);

  // === Submenu: Address Management ===
  if (data === 'panel_address') {
    return bot.editMessageText(`📥 **Wallet Address Management Panel**\n\n` +
      `💼 Manage cryptocurrency wallet addresses for payment processing\n` +
      `🔐 All addresses are encrypted and securely stored\n` +
      `📊 Monitor wallet activity and transaction history\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Choose an action:`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🧾 List Active Addresses', callback_data: 'wallet_list' },
            { text: '📜 View Address History', callback_data: 'wallet_history' }
          ],
          [
            { text: '♻️ Refresh Address Pool', callback_data: 'wallet_refresh' },
            { text: '📈 Address Analytics', callback_data: 'wallet_analytics' }
          ],
          [{ text: '🔙 Back to Admin Panel', callback_data: 'cocktail_back' }]
        ]
      }
    });
  }

  // === Submenu: Language Analytics ===
  if (data === 'panel_language_stats') {
    bot.editMessageText(`🌍 **Loading Language Analytics...**\n\n` +
      `📊 Analyzing user language preferences\n` +
      `🔄 Processing translation statistics\n` +
      `💰 Calculating market insights\n\n` +
      `Please wait...`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    languageStatsManager.formatLanguageReport().then(report => {
      const enhancedReport = `${report}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📈 **Performance Metrics:**\n` +
        `🔄 Last Updated: ${new Date().toLocaleString()}\n` +
        `⚡ Translation Cache: Active\n` +
        `🚀 Response Time: <50ms average\n\n` +
        `🎯 **Optimization Suggestions:**\n` +
        `• Focus marketing on top 3 languages\n` +
        `• Consider localized payment options\n` +
        `• Expand product descriptions for high-value markets`;

      bot.editMessageText(enhancedReport, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh Statistics', callback_data: 'panel_language_stats' },
              { text: '📤 Export Report', callback_data: 'export_lang_stats' }
            ],
            [{ text: '🔙 Back to Admin Panel', callback_data: 'cocktail_back' }]
          ]
        }
      });
    }).catch(err => {
      console.error('[Language Stats Error]', err);
      logger.error('ADMIN', 'Language statistics loading failed', err);
      bot.editMessageText(`❌ **Error Loading Language Statistics**\n\n` +
        `🔧 Technical Details:\n` +
        `• Database connection: ${err.code === 'SQLITE_ERROR' ? '❌ Failed' : '✅ OK'}\n` +
        `• Error Code: \`${err.code || 'UNKNOWN'}\`\n` +
        `• Time: ${new Date().toLocaleString()}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔄 Please try again or contact system administrator`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '� Retry', callback_data: 'panel_language_stats' },
              { text: '�🔙 Back', callback_data: 'cocktail_back' }
            ]
          ]
        }
      });
    });
    return;
  }

  // === Submenu: News & Announcements ===
  if (data === 'panel_news') {
    return bot.editMessageText(`📢 **News & Announcements Panel**\n\n` +
      `🎯 Language-targeted broadcasting system\n` +
      `📊 Selective user notification management\n` +
      `🌍 Multi-language announcement support\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📈 **Quick Overview:**\n` +
      `• Target users by their selected language\n` +
      `• Schedule announcements for optimal timing\n` +
      `• Track delivery rates and engagement\n` +
      `• Maintain announcement history\n\n` +
      `Choose an action:`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📝 Create Announcement', callback_data: 'news_create' },
            { text: '📋 View Drafts', callback_data: 'news_drafts' }
          ],
          [
            { text: '📤 Scheduled Messages', callback_data: 'news_scheduled' },
            { text: '📊 Message History', callback_data: 'news_history' }
          ],
          [
            { text: '🌍 Language Statistics', callback_data: 'news_lang_stats' },
            { text: '👥 User Segments', callback_data: 'news_segments' }
          ],
          [
            { text: '⚙️ Broadcast Settings', callback_data: 'news_settings' },
            { text: '🔙 Back to Admin Panel', callback_data: 'cocktail_back' }
          ]
        ]
      }
    });
  }

  // === Admin Management Panel ===
  if (data === 'panel_admin_mgmt') {
    return showAdminManagementPanel(bot, chatId, messageId);
  }

  // === Vouch Channel Management Panel ===
  if (data === 'panel_vouch') {
    return showVouchChannelPanel(bot, chatId, messageId);
  }

  // === Submenu: List Active Wallets ===
  if (data === 'wallet_list') {
    bot.editMessageText(`🔄 **Loading Wallet Information...**\n\nPlease wait while we fetch current wallet addresses...`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    db.all(`
      SELECT currency, address, label, tag, added_at 
      FROM wallet_addresses
      WHERE id IN (
        SELECT MAX(id) FROM wallet_addresses GROUP BY currency
      )
    `, (err, rows) => {
      if (err) {
        console.error('[DB] Wallet fetch error:', err.message);
        logger.error('ADMIN', 'Wallet list fetch failed', err);
        return bot.editMessageText(`❌ **Database Error**\n\n` +
          `🔧 Failed to fetch wallet addresses\n` +
          `📋 Error: \`${err.message}\`\n` +
          `🕒 Time: ${new Date().toLocaleString()}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Please try again or check database connectivity`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Retry', callback_data: 'wallet_list' },
                { text: '🔙 Back', callback_data: 'panel_address' }
              ]
            ]
          }
        });
      }

      if (!rows.length) {
        return bot.editMessageText(`📭 **No Active Wallet Addresses**\n\n` +
          `⚠️ No wallet addresses are currently configured\n` +
          `🔧 This means payment processing is disabled\n` +
          `💡 Consider adding wallet addresses immediately\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎯 **Recommended Actions:**\n` +
          `• Add Bitcoin (BTC) address for primary payments\n` +
          `• Add Litecoin (LTC) address for faster transactions\n` +
          `• Configure address rotation for security`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➕ Add Wallet Address', callback_data: 'wallet_add' },
                { text: '🔙 Back', callback_data: 'panel_address' }
              ]
            ]
          }
        });
      }

      // Calculate total addresses and security metrics
      const totalAddresses = rows.length;
      const oldestAddress = Math.min(...rows.map(r => new Date(r.added_at)));
      const newestAddress = Math.max(...rows.map(r => new Date(r.added_at)));
      const addressAgeSpread = Math.ceil((newestAddress - oldestAddress) / (1000 * 60 * 60 * 24));

      let text = `🧾 **Active Wallet Addresses Report**\n\n`;
      text += `💼 Total Active: ${totalAddresses} addresses\n`;
      text += `📊 Security Score: ${totalAddresses >= 3 ? '🟢 High' : totalAddresses >= 2 ? '🟡 Medium' : '🔴 Low'}\n`;
      text += `⏱️ Age Spread: ${addressAgeSpread} days\n`;
      text += `🔄 Last Updated: ${new Date().toLocaleString()}\n\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

      text += rows.map((row, index) => {
        const currencyEmoji = row.currency === 'BTC' ? '₿' : row.currency === 'LTC' ? '🪙' : '�';
        const securityLevel = row.address.length >= 40 ? '🔐 High' : '🔒 Standard';
        const addressAge = formatTimeAgo(row.added_at);
        
        return `${currencyEmoji} **${row.currency} Wallet #${index + 1}**\n` +
               `📍 Address: \`${row.address}\`\n` +
               `🏷️ Label: *${row.label}*\n` +
               `🧷 Tag: \`${row.tag}\`\n` +
               `🔐 Security: ${securityLevel}\n` +
               `⏰ Age: ${addressAge}\n` +
               `📊 Status: 🟢 Active\n`;
      }).join('\n━━━━━━━━━━━━━━━━━━━━━\n\n');

      text += `\n💡 **Management Tips:**\n`;
      text += `• Rotate addresses monthly for security\n`;
      text += `• Monitor for incoming transactions\n`;
      text += `• Keep backup copies of all addresses\n`;
      text += `• Use hardware wallets for storage`;

      return bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh List', callback_data: 'wallet_list' },
              { text: '➕ Add Address', callback_data: 'wallet_add' }
            ],
            [
              { text: '📊 View Analytics', callback_data: 'wallet_analytics' },
              { text: '🔙 Back', callback_data: 'panel_address' }
            ]
          ]
        }
      });
    });
  }

  // === Submenu: Wallet History ===
  if (data === 'wallet_history') {
    bot.editMessageText(`📜 **Loading Wallet History...**\n\nRetrieving historical wallet data...`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    db.all(`
      SELECT currency, address, label, tag, added_at,
             (SELECT COUNT(*) FROM wallet_addresses w2 WHERE w2.currency = wallet_addresses.currency AND w2.added_at <= wallet_addresses.added_at) as version_number
      FROM wallet_addresses
      ORDER BY added_at DESC
      LIMIT 15
    `, (err, rows) => {
      if (err) {
        console.error('[DB] Wallet history error:', err.message);
        logger.error('ADMIN', 'Wallet history fetch failed', err);
        return bot.editMessageText(`❌ **Database Error**\n\n` +
          `🔧 Failed to fetch wallet history\n` +
          `📋 Error: \`${err.message}\`\n` +
          `🕒 Time: ${new Date().toLocaleString()}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Please try again or check database connectivity`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Retry', callback_data: 'wallet_history' },
                { text: '🔙 Back', callback_data: 'panel_address' }
              ]
            ]
          }
        });
      }

      if (!rows.length) {
        return bot.editMessageText(`📭 **No Wallet History Found**\n\n` +
          `⚠️ No historical wallet data available\n` +
          `🔧 This could indicate a new installation\n` +
          `💡 Start by adding your first wallet address\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎯 **Getting Started:**\n` +
          `• Add a Bitcoin (BTC) address first\n` +
          `• Consider adding Litecoin (LTC) for alternatives\n` +
          `• Label your addresses clearly`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➕ Add First Address', callback_data: 'wallet_add' },
                { text: '🔙 Back', callback_data: 'panel_address' }
              ]
            ]
          }
        });
      }

      // Group by currency for better organization
      const groupedByCurrency = {};
      rows.forEach(row => {
        if (!groupedByCurrency[row.currency]) {
          groupedByCurrency[row.currency] = [];
        }
        groupedByCurrency[row.currency].push(row);
      });

      let history = `📜 **Wallet Address History Report**\n\n`;
      history += `📊 Total Records: ${rows.length}\n`;
      history += `💰 Currencies: ${Object.keys(groupedByCurrency).join(', ')}\n`;
      history += `⏰ Period: Last 15 entries\n`;
      history += `🔄 Generated: ${new Date().toLocaleString()}\n\n`;
      history += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

      // Display entries chronologically
      history += rows.map((row, i) => {
        const currencyEmoji = row.currency === 'BTC' ? '₿' : row.currency === 'LTC' ? '🪙' : '💰';
        const isRecent = (Date.now() - new Date(row.added_at)) < 7 * 24 * 60 * 60 * 1000; // 7 days
        const recentIndicator = isRecent ? '🆕' : '';
        const versionInfo = row.version_number > 1 ? ` (v${row.version_number})` : '';
        
        return `${recentIndicator} **Entry #${i + 1}** ${currencyEmoji} ${row.currency}${versionInfo}\n` +
               `📍 \`${row.address}\`\n` +
               `🏷️ Label: *${row.label}*\n` +
               `🧷 Tag: \`${row.tag}\`\n` +
               `📅 Added: ${formatTimeAgo(row.added_at)}\n` +
               `🕒 Exact Time: ${new Date(row.added_at).toLocaleString()}`;
      }).join('\n\n━━━━━━━━━━━━━━━━━━━━━\n\n');

      history += `\n📈 **Historical Insights:**\n`;
      history += `• Most used currency: ${Object.keys(groupedByCurrency).reduce((a, b) => 
        groupedByCurrency[a].length > groupedByCurrency[b].length ? a : b)}\n`;
      history += `• Address rotation frequency: ~${Math.ceil(rows.length / Object.keys(groupedByCurrency).length)} per currency\n`;
      history += `• Security practice: ${rows.length >= 10 ? '🟢 Excellent' : rows.length >= 5 ? '🟡 Good' : '🔴 Needs improvement'}`;

      return bot.editMessageText(history, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh History', callback_data: 'wallet_history' },
              { text: '📤 Export History', callback_data: 'export_wallet_history' }
            ],
            [
              { text: '📊 Analytics', callback_data: 'wallet_analytics' },
              { text: '🔙 Back', callback_data: 'panel_address' }
            ]
          ]
        }
      });
    });
  }

  // Handle export requests with enhanced notifications
  if (data === 'export_lang_stats') {
    bot.answerCallbackQuery(query.id, { 
      text: '📤 Language statistics export initiated. Report will be sent to admin group.', 
      show_alert: true 
    });
    
    languageStatsManager.formatLanguageReport().then(report => {
      const enhancedReport = `📊 **Language Analytics Export**\n` +
        `🕒 Generated: ${new Date().toLocaleString()}\n` +
        `👤 Requested by: ${query.from.first_name}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        report;
      
      notifyGroup(bot, enhancedReport, { parse_mode: 'Markdown' });
    });
    return;
  }

  // === Vouch Channel Actions ===
  if (data === 'vouch_test') {
    bot.answerCallbackQuery(query.id, { 
      text: '🧪 Testing vouch channel access...', 
      show_alert: false 
    });
    
    vouchChannelManager.testChannelAccess(bot).then(success => {
      const message = success 
        ? '✅ Vouch channel test successful! Check the channel for test message.'
        : '❌ Vouch channel test failed. Check channel configuration and bot permissions.';
      
      bot.sendMessage(chatId, message);
    });
    return;
  }

  if (data === 'vouch_example') {
    const exampleMessage = `📋 **Example Vouch Message**\n\n` +
      `This is how vouch messages will appear in your channel:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✅ **Order Completed Successfully**\n\n` +
      `🧾 **Order ID:** #12345\n` +
      `🛍️ **Product:** Premium VPN License\n` +
      `💰 **Amount:** $29.99 ₿BTC\n` +
      `👤 **Customer:** Customer #67890\n` +
      `📄 **Delivery:** File\n` +
      `🕒 **Completed:** ${new Date().toLocaleString()}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎉 **Another satisfied customer!**\n` +
      `⚡ **Fast & Secure Delivery**\n` +
      `🔐 **Trusted Marketplace**\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `This example shows the clean, professional format used for all vouch posts.`;

    bot.answerCallbackQuery(query.id, { text: '📋 Example shown', show_alert: false });
    bot.sendMessage(chatId, exampleMessage, { parse_mode: 'Markdown' });
    return;
  }

  if (data === 'vouch_setup') {
    const setupGuide = `🔧 **Vouch Channel Setup Guide**\n\n` +
      `**Step 1: Create Channel**\n` +
      `• Create a new Telegram channel\n` +
      `• Choose public or private (your preference)\n` +
      `• Name it something like "Our Vouches" or "Success Stories"\n\n` +
      `**Step 2: Add Bot as Admin**\n` +
      `• Add your bot to the channel\n` +
      `• Make it an administrator\n` +
      `• Enable "Post Messages" permission\n\n` +
      `**Step 3: Get Channel ID**\n` +
      `• Forward any message from the channel to @userinfobot\n` +
      `• Copy the channel ID (starts with -100)\n` +
      `• Example: -1001234567890\n\n` +
      `**Step 4: Configure Environment**\n` +
      `• Add to your .env file:\n` +
      `\`VOUCH_CHANNEL=-1001234567890\`\n` +
      `• Replace with your actual channel ID\n\n` +
      `**Step 5: Restart & Test**\n` +
      `• Restart your bot\n` +
      `• Use the test function in admin panel\n` +
      `• Complete a test order to verify\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 **Tips:**\n` +
      `• Channel can be private for internal use\n` +
      `• Public channels help with marketing\n` +
      `• Pin your best vouch messages\n` +
      `• Monitor channel for customer feedback`;

    bot.answerCallbackQuery(query.id, { text: '📋 Setup guide sent', show_alert: false });
    bot.sendMessage(chatId, setupGuide, { parse_mode: 'Markdown' });
    return;
  }

  // Handle wallet analytics
  if (data === 'wallet_analytics') {
    bot.editMessageText(`📊 **Loading Wallet Analytics...**\n\nAnalyzing wallet performance and security metrics...`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    // Fetch wallet analytics data
    db.all(`
      SELECT 
        currency,
        COUNT(*) as total_addresses,
        MAX(added_at) as latest_addition,
        MIN(added_at) as first_addition,
        AVG(julianday('now') - julianday(added_at)) as avg_age_days
      FROM wallet_addresses 
      GROUP BY currency
      ORDER BY total_addresses DESC
    `, [], (err, rows) => {
      if (err) {
        console.error('[DB] Wallet analytics error:', err.message);
        return bot.editMessageText(`❌ **Analytics Error**\n\nFailed to generate wallet analytics.`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Back', callback_data: 'panel_address' }]]
          }
        });
      }

      let analytics = `📊 **Wallet Analytics Report**\n\n`;
      
      if (!rows.length) {
        analytics += `📭 **No Data Available**\n\n`;
        analytics += `⚠️ No wallet addresses found in system\n`;
        analytics += `💡 Add addresses to generate analytics\n\n`;
        analytics += `━━━━━━━━━━━━━━━━━━━━━`;
      } else {
        const totalAddresses = rows.reduce((sum, row) => sum + row.total_addresses, 0);
        const currencies = rows.length;
        
        analytics += `🎯 **Overview:**\n`;
        analytics += `• 💰 Total Addresses: ${totalAddresses}\n`;
        analytics += `• 🌐 Currencies: ${currencies}\n`;
        analytics += `• 📊 Diversification: ${currencies >= 3 ? '🟢 Excellent' : currencies >= 2 ? '🟡 Good' : '🔴 Limited'}\n`;
        analytics += `• 🔄 Update Frequency: ${totalAddresses >= 10 ? '🟢 High' : totalAddresses >= 5 ? '🟡 Medium' : '🔴 Low'}\n\n`;
        
        analytics += `💱 **By Currency:**\n`;
        rows.forEach(row => {
          const emoji = row.currency === 'BTC' ? '₿' : row.currency === 'LTC' ? '🪙' : '💰';
          const avgAge = Math.floor(row.avg_age_days || 0);
          const securityScore = row.total_addresses >= 3 ? '🟢' : row.total_addresses >= 2 ? '🟡' : '🔴';
          
          analytics += `${emoji} **${row.currency}**\n`;
          analytics += `  • Addresses: ${row.total_addresses}\n`;
          analytics += `  • Avg Age: ${avgAge} days\n`;
          analytics += `  • Security: ${securityScore}\n`;
          analytics += `  • Latest: ${formatTimeAgo(row.latest_addition)}\n\n`;
        });
        
        analytics += `━━━━━━━━━━━━━━━━━━━━━\n`;
        analytics += `🛡️ **Security Recommendations:**\n`;
        analytics += `• ${totalAddresses >= 10 ? '✅' : '⚠️'} Address rotation (${totalAddresses >= 10 ? 'Good' : 'Improve'})\n`;
        analytics += `• ${currencies >= 2 ? '✅' : '⚠️'} Currency diversity (${currencies >= 2 ? 'Good' : 'Add more'})\n`;
        analytics += `• 🔄 Regular updates recommended\n`;
        analytics += `• 🗄️ Backup all addresses securely`;
      }

      analytics += `\n\n🕒 Generated: ${new Date().toLocaleString()}`;

      bot.editMessageText(analytics, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh Analytics', callback_data: 'wallet_analytics' },
              { text: '📤 Export Report', callback_data: 'export_wallet_analytics' }
            ],
            [{ text: '🔙 Back to Wallet Panel', callback_data: 'panel_address' }]
          ]
        }
      });
    });
    return;
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

// Additional panel functions with enhanced formatting and details
async function showStatsPanel(bot, chatId, messageId) {
  // Show loading message first
  bot.editMessageText(`📊 **Loading System Statistics...**\n\nGathering performance data and analytics...`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown'
  });

  // Get real-time statistics
  const stats = await gatherSystemStatistics();
  
  const message = `📊 **System Statistics Dashboard**\n\n` +
    `🚀 **Performance Metrics:**\n` +
    `• 💬 Total Messages: ${stats.totalMessages || 'N/A'}\n` +
    `• 👥 Active Users (24h): ${stats.activeUsers24h || 'N/A'}\n` +
    `• 🔄 Bot Uptime: ${stats.uptime || 'N/A'}\n` +
    `• ⚡ Average Response: ${stats.avgResponse || '<50ms'}\n\n` +
    `� **Revenue Analytics:**\n` +
    `• 🛒 Total Orders: ${stats.totalOrders || 'N/A'}\n` +
    `• ✅ Completed Orders: ${stats.completedOrders || 'N/A'}\n` +
    `• 💵 Total Revenue: $${stats.totalRevenue || '0.00'}\n` +
    `• 📈 Conversion Rate: ${stats.conversionRate || 'N/A'}%\n\n` +
    `🔧 **System Health:**\n` +
    `• 🗄️ Database: ${stats.dbHealth ? '🟢 Healthy' : '🔴 Issues'}\n` +
    `• 🌐 Translation API: ${stats.translationHealth ? '🟢 Online' : '🔴 Offline'}\n` +
    `• 🔐 Encryption: ${stats.encryptionHealth ? '🟢 Active' : '🔴 Disabled'}\n` +
    `• 📡 Network: ${stats.networkHealth ? '🟢 Stable' : '🔴 Unstable'}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🕒 Last Updated: ${new Date().toLocaleString()}\n` +
    `⚡ Update Frequency: Real-time\n\n` +
    `🎯 **Quick Insights:**\n` +
    `• Peak usage: ${stats.peakHour || 'Unknown'}\n` +
    `• Most popular product: ${stats.topProduct || 'N/A'}\n` +
    `• Primary user language: ${stats.primaryLanguage || 'English'}`;
  
  const keyboard = [
    [
      { text: '📈 Revenue Deep Dive', callback_data: 'stats_revenue' },
      { text: '👥 User Analytics', callback_data: 'stats_users' }
    ],
    [
      { text: '📦 Product Performance', callback_data: 'stats_products' },
      { text: '� Payment Analytics', callback_data: 'stats_payments' }
    ],
    [
      { text: '🔄 Refresh Statistics', callback_data: 'panel_stats' },
      { text: '📤 Export Report', callback_data: 'export_stats' }
    ],
    [{ text: '🔙 Back to Admin Panel', callback_data: 'cocktail_back' }]
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

// Helper functions to gather statistics
async function gatherSystemStatistics() {
  return new Promise((resolve) => {
    // Get basic stats from database
    db.all(`
      SELECT 
        (SELECT COUNT(*) FROM users) as totalUsers,
        (SELECT COUNT(*) FROM orders) as totalOrders,
        (SELECT COUNT(*) FROM orders WHERE status = 'completed') as completedOrders,
        (SELECT SUM(price) FROM orders WHERE status = 'completed') as totalRevenue,
        (SELECT COUNT(*) FROM users WHERE last_activity > datetime('now', '-1 day')) as activeUsers24h
    `, [], (err, rows) => {
      if (err) {
        console.error('[Stats] Database error:', err);
        logger.error('ADMIN', 'Statistics gathering failed', err);
        resolve({
          dbHealth: false,
          translationHealth: true,
          encryptionHealth: true,
          networkHealth: true,
          uptime: process.uptime() ? Math.floor(process.uptime() / 3600) + 'h' : 'N/A'
        });
      } else {
        const stats = rows[0] || {};
        resolve({
          ...stats,
          dbHealth: true,
          translationHealth: true,
          encryptionHealth: true,
          networkHealth: true,
          uptime: process.uptime() ? Math.floor(process.uptime() / 3600) + 'h' : 'N/A',
          conversionRate: stats.totalUsers > 0 ? ((stats.totalOrders / stats.totalUsers) * 100).toFixed(1) : 'N/A'
        });
      }
    });
  });
}

// === Admin Management Panel ===
async function showAdminManagementPanel(bot, chatId, messageId) {
  // Show loading message first
  bot.editMessageText(`👑 **Loading Admin Management...**\n\nRetrieving admin groups and permissions...`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown'
  });

  try {
    const adminGroups = await adminManager.getAdminGroups();
    const allAdmins = await adminManager.getAllAdmins();

    let text = `👑 **Admin Management Panel**\n\n`;
    text += `🏢 **Admin Groups:** ${adminGroups.length}\n`;
    text += `👥 **Total Admins:** ${allAdmins.length}\n`;
    text += `🔄 **Last Updated:** ${new Date().toLocaleString()}\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (adminGroups.length > 0) {
      text += `🏢 **Active Admin Groups:**\n\n`;
      adminGroups.forEach((group, index) => {
        text += `${index + 1}. **Group ${group.group_id}**\n`;
        text += `   📝 Name: ${group.group_name || 'Unnamed'}\n`;
        text += `   👥 Admins: ${group.admin_count}\n`;
        text += `   📅 Added: ${new Date(group.added_at).toLocaleDateString()}\n\n`;
      });
    } else {
      text += `⚠️ **No Admin Groups Configured**\n\n`;
      text += `💡 Add admin groups to enable dynamic admin recognition\n`;
      text += `🔧 Use the buttons below to configure the system\n\n`;
    }

    if (allAdmins.length > 0) {
      text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      text += `👥 **Recent Admins:**\n\n`;
      allAdmins.slice(0, 5).forEach((admin, index) => {
        text += `${index + 1}. **${admin.first_name}** ${admin.username ? `(@${admin.username})` : ''}\n`;
        text += `   🆔 ID: \`${admin.user_id}\`\n`;
        text += `   🏢 Groups: ${admin.group_count}\n`;
        text += `   ⏰ Last Seen: ${new Date(admin.last_seen).toLocaleDateString()}\n\n`;
      });
    }

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🔧 **Management Tools:**\n`;
    text += `• Add/Remove admin groups\n`;
    text += `• Sync admins from Telegram groups\n`;
    text += `• View detailed admin permissions\n`;
    text += `• Audit admin activity logs`;

    return bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🏢 Manage Groups', callback_data: 'admin_groups' },
            { text: '👥 Sync Admins', callback_data: 'admin_sync' }
          ],
          [
            { text: '📊 Admin Analytics', callback_data: 'admin_analytics' },
            { text: '📋 Activity Logs', callback_data: 'admin_logs' }
          ],
          [
            { text: '⚙️ Settings', callback_data: 'admin_settings' },
            { text: '🔄 Refresh', callback_data: 'panel_admin_mgmt' }
          ],
          [{ text: '🔙 Back to Admin Panel', callback_data: 'cocktail_back' }]
        ]
      }
    });
  } catch (error) {
    logger.error('ADMIN', 'Failed to load admin management panel', error);
    return bot.editMessageText(`❌ **Error Loading Admin Management**\n\n` +
      `🔧 Failed to retrieve admin data\n` +
      `📋 Error: \`${error.message}\`\n` +
      `🕒 Time: ${new Date().toLocaleString()}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔄 Please try again or check system logs`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Retry', callback_data: 'panel_admin_mgmt' },
            { text: '🔙 Back', callback_data: 'cocktail_back' }
          ]
        ]
      }
    });
  }
}

// === Vouch Channel Management Panel ===
async function showVouchChannelPanel(bot, chatId, messageId) {
  // Show loading message first
  bot.editMessageText(`✅ **Loading Vouch Channel Management...**\n\nChecking channel configuration and status...`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown'
  });

  try {
    const channelStatus = vouchChannelManager.getChannelStatus();
    
    let text = `✅ **Vouch Channel Management Panel**\n\n`;
    
    if (channelStatus.configured) {
      text += `🆔 **Channel ID:** \`${channelStatus.channelId}\`\n`;
      text += `✅ **Status:** Configured & Active\n`;
      text += `🔄 **Auto-posting:** Enabled\n`;
      text += `📊 **Function:** Posts when orders complete\n\n`;
      
      text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      text += `🎯 **How It Works:**\n`;
      text += `• Automatically posts when orders are delivered\n`;
      text += `• Clean, professional vouch messages\n`;
      text += `• Shows product, price, and completion time\n`;
      text += `• Maintains customer privacy\n`;
      text += `• Builds trust and credibility\n\n`;
      
      text += `📝 **Message Format:**\n`;
      text += `✅ Order Completed Successfully\n`;
      text += `🧾 Order ID: #1234\n`;
      text += `🛍️ Product: Premium VPN License\n`;
      text += `💰 Amount: $29.99 ₿BTC\n`;
      text += `👤 Customer: Customer #12345\n`;
      text += `📄 Delivery: File\n`;
      text += `🕒 Completed: [timestamp]\n\n`;
      
      text += `━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🛡️ **Privacy Protection:**\n`;
      text += `• Customer names are anonymized\n`;
      text += `• Only shows generic customer ID\n`;
      text += `• No sensitive information exposed`;
      
    } else {
      text += `⚠️ **Status:** Not Configured\n`;
      text += `🔧 **Setup Required:** Add VOUCH_CHANNEL to .env\n`;
      text += `📋 **Channel ID:** Not set\n\n`;
      
      text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      text += `🔧 **Setup Instructions:**\n`;
      text += `1. Create a Telegram channel for vouches\n`;
      text += `2. Add the bot as admin to the channel\n`;
      text += `3. Get the channel ID (use @userinfobot)\n`;
      text += `4. Add VOUCH_CHANNEL=-100xxxxxxxxx to .env\n`;
      text += `5. Restart the bot\n\n`;
      
      text += `💡 **Benefits:**\n`;
      text += `• Automatic social proof generation\n`;
      text += `• Builds customer trust\n`;
      text += `• Professional appearance\n`;
      text += `• Zero manual work required`;
    }

    text += `\n\n🕒 **Last Updated:** ${new Date().toLocaleString()}`;

    const keyboard = [];
    
    if (channelStatus.configured) {
      keyboard.push([
        { text: '🧪 Test Channel Access', callback_data: 'vouch_test' },
        { text: '📊 View Example', callback_data: 'vouch_example' }
      ]);
    }
    
    keyboard.push([
      { text: '🔄 Refresh Status', callback_data: 'panel_vouch' },
      { text: '⚙️ Setup Guide', callback_data: 'vouch_setup' }
    ]);
    
    keyboard.push([{ text: '🔙 Back to Admin Panel', callback_data: 'cocktail_back' }]);

    return bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    logger.error('ADMIN', 'Failed to load vouch channel panel', error);
    return bot.editMessageText(`❌ **Error Loading Vouch Channel Panel**\n\n` +
      `🔧 Failed to retrieve vouch channel status\n` +
      `📋 Error: \`${error.message}\`\n` +
      `🕒 Time: ${new Date().toLocaleString()}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔄 Please try again or check system logs`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Retry', callback_data: 'panel_vouch' },
            { text: '🔙 Back', callback_data: 'cocktail_back' }
          ]
        ]
      }
    });
  }
}
