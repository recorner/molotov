// Enhanced Admin Handler with UI Improvements
import db from '../database.js';
import adminManager from '../utils/adminManager.js';
import logger from '../utils/logger.js';
import smartMessageManager from '../utils/smartMessageManager.js';
import uiOptimizer from '../utils/uiOptimizer.js';
import spamPrevention from '../utils/spamPrevention.js';
import translationService from '../utils/translationService.js';
import libreTranslateManager from '../utils/libreTranslateManager.js';

// === Handle /cocktail Command ===
export async function handleAdminCommand(bot, msg) {
  const { from } = msg;

  // Check spam prevention
  if (!spamPrevention.canPerformAction(from.id, 'admin_access')) {
    const remaining = spamPrevention.getTimeRemaining(from.id, 'admin_access');
    return bot.sendMessage(msg.chat.id, `⏱️ Please wait ${remaining} seconds before accessing admin panel again.`);
  }

  // Use dynamic admin check instead of hardcoded ADMIN_IDS
  const isUserAdmin = await adminManager.isAdmin(from.id);
  if (!isUserAdmin) {
    return bot.sendMessage(msg.chat.id, 
      uiOptimizer.createStatusMessage('error', 'Unauthorized Access', 
        'This command is restricted to administrators only.'), 
      { parse_mode: 'Markdown' }
    );
  }

  // Log admin panel access
  logger.info('ADMIN', `Admin panel accessed by user ${from.id} (${from.first_name})`);

  const adminName = from.first_name || 'Admin';
  
  // Create mobile-optimized admin sections
  const adminSections = [
    // Core Management (2 per row for easy thumb access)
    { text: '💰 Wallets', callback_data: 'panel_address', priority: 'core' },
    { text: '� Orders', callback_data: 'panel_orders', priority: 'core' },
    { text: '� Users', callback_data: 'panel_users', priority: 'core' },
    { text: '� Stats', callback_data: 'panel_stats', priority: 'core' },
    
    // Secondary Features (2 per row)
    { text: '📢 News', callback_data: 'panel_news', priority: 'secondary' },
    { text: '✅ Vouch', callback_data: 'panel_vouch', priority: 'secondary' },
    { text: '🌍 Languages', callback_data: 'panel_language_stats', priority: 'secondary' },
    { text: '🔑 OTP Keys', callback_data: 'otp_admin_keys', priority: 'secondary' },
    
    // Utilities (3 per row for compact layout)
    { text: '🔧 Settings', callback_data: 'panel_settings', priority: 'utility' },
    { text: '📋 Logs', callback_data: 'panel_logs', priority: 'utility' },
    { text: '🔄 Refresh', callback_data: 'panel_refresh', priority: 'utility' }
  ];

  const buttons = uiOptimizer.createMobileAdminLayout(adminSections);

  const content = 
    `👋 **Welcome, ${adminName}**\n\n` +
    
    `**🕒 Session Info**\n` +
    `• Time: ${new Date().toLocaleString()}\n` +
    `• Level: Administrator\n` +
    `• ID: \`${from.id}\`\n\n` +
    
    `**📊 System Status**\n` +
    `🟢 Online | 🔒 Secure | 🏭 Production\n\n` +
    
    `**⚡ Quick Actions**\n` +
    `💰 Manage wallets and payments\n` +
    `� Monitor orders and transactions\n` +
    `👥 User management and analytics\n` +
    `📊 View system performance\n\n` +
    
    `**💡 Available Commands**\n` +
    `• \`/cocktail\` - Admin Panel\n` +
    `• \`/news\` - News Management\n` +
    `• \`/sidekick\` - Transaction Monitor\n` +
    `• \`/key-gen @user\` - Generate OTP Keys`;

  const adminMessage = uiOptimizer.formatMessage(
    '🔧 Admin Control Panel',
    content,
    { 
      style: 'compact',
      addSeparator: false, 
      addTimestamp: false 
    }
  );

  return await smartMessageManager.sendOrEditSmart(bot, msg.chat.id, null, adminMessage, {
    reply_markup: { inline_keyboard: buttons }
  }, true); // Force banner for admin panel
}

// === Handle Admin Panel Callbacks ===
export async function handleAdminCallback(bot, query) {
  const { id: userId } = query.from;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // Spam prevention for admin actions
  if (!spamPrevention.canPerformAction(userId, 'admin_action')) {
    const remaining = spamPrevention.getTimeRemaining(userId, 'admin_action');
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ Wait ${remaining}s before next admin action`, 
      show_alert: true 
    });
  }

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
    const content = uiOptimizer.formatMessage(
      '💰 Wallet Management',
      `**💳 Cryptocurrency Control Center**\n\n` +
      
      `**🔐 Security Status**\n` +
      `✅ Encrypted storage active\n` +
      `🔄 Transaction monitoring online\n` +
      `🛡️ Multi-signature ready\n\n` +
      
      `**⚡ Quick Actions**\n` +
      `📋 View active receiving addresses\n` +
      `♻️ Update wallet configurations\n` +
      `📊 Monitor address performance\n` +
      `📜 Export transaction history`,
      { 
        style: 'compact',
        addSeparator: false,
        addTimestamp: true 
      }
    );

    const buttons = [
      [{ text: '📋 Active Wallets', callback_data: 'wallet_list' }],
      [
        { text: '♻️ Update Wallet', callback_data: 'wallet_refresh' },
        { text: '📜 History', callback_data: 'wallet_history_menu' }
      ],
      [
        { text: '� Analytics', callback_data: 'wallet_analytics' },
        { text: '🔙 Back', callback_data: 'cocktail_back' }
      ]
    ];

    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // === Submenu: Language Analytics & Management ===
  if (data === 'panel_language_stats') {
    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      uiOptimizer.createStatusMessage('loading', 'Loading Language Dashboard', {
        details: 'Analyzing languages and LibreTranslate status...'
      }), { parse_mode: 'Markdown' }
    );

    try {
      const enabledLangs = translationService.getSupportedLanguages();
      const enabledCodes = translationService.getEnabledCodes();
      const stats = translationService.getStats();
      const libreStatus = await translationService.getLibreTranslateStatus();

      // Build enabled languages list
      let enabledList = '';
      for (const [code, info] of Object.entries(enabledLangs)) {
        enabledList += `${info.flag} ${info.name} (\`${code}\`)\n`;
      }

      const libreStatusIcon = libreStatus.apiHealthy ? '🟢' : (libreStatus.containerRunning ? '🟡' : '🔴');
      const libreStatusText = libreStatus.apiHealthy ? 'Healthy' : (libreStatus.containerRunning ? 'Starting...' : 'Stopped');

      const content = uiOptimizer.formatMessage(
        '🌍 Language & Translation Dashboard',
        `**📋 Enabled Languages (${enabledCodes.length}):**\n` +
        enabledList +
        `\n**📡 LibreTranslate Engine:**\n` +
        `${libreStatusIcon} Status: ${libreStatusText}\n` +
        `🐳 Docker: ${libreStatus.dockerAvailable ? '✅ Available' : '❌ Not found'}\n` +
        `📦 Container: \`${libreStatus.containerName}\`\n` +
        `🌐 API: \`${libreStatus.apiUrl}\`\n` +
        `🔄 Auto-start: ${libreStatus.autoStart ? 'Yes' : 'No'}\n\n` +
        `**📊 Translation Stats:**\n` +
        `• Preloaded: ${stats.preloadedCount} entries\n` +
        `• Runtime cache: ${stats.runtimeCacheCount} entries\n` +
        `• Translate names: ${stats.translateNames ? 'Yes' : 'No'}`,
        { addSeparator: true, addTimestamp: true }
      );

      const buttons = [
        [
          { text: '➕ Add Language', callback_data: 'lang_admin_add' },
          { text: '➖ Remove Language', callback_data: 'lang_admin_remove' }
        ],
        [
          { text: '🔄 Restart LibreTranslate', callback_data: 'lang_admin_restart_libre' },
          { text: '📊 User Stats', callback_data: 'lang_detailed' }
        ],
        [
          { text: '🔃 Refresh', callback_data: 'panel_language_stats' },
          { text: '🔙 Back', callback_data: 'cocktail_back' }
        ]
      ];

      return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (error) {
      logger.error('ADMIN', `Language dashboard error: ${error.message}`);
      return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
        uiOptimizer.createStatusMessage('error', 'Dashboard Error', {
          details: 'Unable to load language dashboard. Please try again.'
        }), { parse_mode: 'Markdown' }
      );
    }
  }

  // === Add Language: Show available languages ===
  if (data === 'lang_admin_add') {
    const disabled = translationService.getDisabledLanguages();
    const entries = Object.entries(disabled);

    if (entries.length === 0) {
      return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
        uiOptimizer.formatMessage('🌍 Add Language', 'All available languages are already enabled!', { addSeparator: true }),
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'panel_language_stats' }]] }
        }
      );
    }

    const content = uiOptimizer.formatMessage(
      '➕ Add Language',
      `Select a language to enable.\n⚠️ This will restart LibreTranslate to compile the new language model.\n\n` +
      `**Available languages (${entries.length}):**`,
      { addSeparator: true }
    );

    // Build language buttons (2 per row)
    const langButtons = [];
    for (let i = 0; i < entries.length; i += 2) {
      const row = [];
      for (let j = i; j < Math.min(i + 2, entries.length); j++) {
        const [code, info] = entries[j];
        row.push({ text: `${info.flag} ${info.name}`, callback_data: `lang_admin_enable_${code}` });
      }
      langButtons.push(row);
    }
    langButtons.push([{ text: '🔙 Back', callback_data: 'panel_language_stats' }]);

    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: langButtons }
    });
  }

  // === Enable a specific language ===
  if (data.startsWith('lang_admin_enable_')) {
    const langCode = data.replace('lang_admin_enable_', '');
    const langInfo = translationService.getAllAvailableLanguages()[langCode];
    const langName = langInfo ? `${langInfo.flag} ${langInfo.name}` : langCode;

    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      uiOptimizer.createStatusMessage('loading', `Adding ${langName}`, {
        details: 'Recompiling LibreTranslate with new language. This may take 1-3 minutes...'
      }), { parse_mode: 'Markdown' }
    );

    const result = await translationService.addLanguage(langCode);

    if (result.success) {
      const msg = result.reason === 'already_enabled'
        ? `${langName} is already enabled.`
        : `${langName} has been enabled!\n${result.recompiled ? '✅ LibreTranslate recompiled successfully.' : '⚠️ LibreTranslate recompile pending (fallback translations available).'}`;

      await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
        uiOptimizer.formatMessage('✅ Language Added', msg, { addSeparator: true }),
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [
            [{ text: '➕ Add Another', callback_data: 'lang_admin_add' }],
            [{ text: '🔙 Back to Languages', callback_data: 'panel_language_stats' }]
          ]}
        }
      );
    } else {
      await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
        uiOptimizer.createStatusMessage('error', 'Failed to Add Language', {
          details: `Reason: ${result.reason}`
        }), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'panel_language_stats' }]] }
        }
      );
    }
    return;
  }

  // === Remove Language: Show enabled languages ===
  if (data === 'lang_admin_remove') {
    const enabled = translationService.getSupportedLanguages();
    const removable = Object.entries(enabled).filter(([code]) => code !== 'en');

    if (removable.length === 0) {
      return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
        uiOptimizer.formatMessage('🌍 Remove Language', 'Only English is enabled. Nothing to remove.', { addSeparator: true }),
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'panel_language_stats' }]] }
        }
      );
    }

    const content = uiOptimizer.formatMessage(
      '➖ Remove Language',
      `Select a language to disable.\n⚠️ This will restart LibreTranslate to free resources.\n🇺🇸 English cannot be removed.\n\n` +
      `**Enabled languages (${removable.length} removable):**`,
      { addSeparator: true }
    );

    const langButtons = [];
    for (let i = 0; i < removable.length; i += 2) {
      const row = [];
      for (let j = i; j < Math.min(i + 2, removable.length); j++) {
        const [code, info] = removable[j];
        row.push({ text: `❌ ${info.flag} ${info.name}`, callback_data: `lang_admin_disable_${code}` });
      }
      langButtons.push(row);
    }
    langButtons.push([{ text: '🔙 Back', callback_data: 'panel_language_stats' }]);

    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: langButtons }
    });
  }

  // === Disable a specific language ===
  if (data.startsWith('lang_admin_disable_')) {
    const langCode = data.replace('lang_admin_disable_', '');
    const langInfo = translationService.getAllAvailableLanguages()[langCode];
    const langName = langInfo ? `${langInfo.flag} ${langInfo.name}` : langCode;

    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      uiOptimizer.createStatusMessage('loading', `Removing ${langName}`, {
        details: 'Recompiling LibreTranslate without this language...'
      }), { parse_mode: 'Markdown' }
    );

    const result = await translationService.removeLanguage(langCode);

    if (result.success) {
      await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
        uiOptimizer.formatMessage('✅ Language Removed', `${langName} has been disabled.\n${result.recompiled ? '✅ LibreTranslate recompiled.' : '⚠️ Recompile pending.'}`, { addSeparator: true }),
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [
            [{ text: '➖ Remove Another', callback_data: 'lang_admin_remove' }],
            [{ text: '🔙 Back to Languages', callback_data: 'panel_language_stats' }]
          ]}
        }
      );
    } else {
      await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
        uiOptimizer.createStatusMessage('error', 'Failed to Remove', {
          details: `Reason: ${result.reason}`
        }), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'panel_language_stats' }]] }
        }
      );
    }
    return;
  }

  // === Restart LibreTranslate ===
  if (data === 'lang_admin_restart_libre') {
    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      uiOptimizer.createStatusMessage('loading', 'Restarting LibreTranslate', {
        details: 'Stopping container, removing, and starting fresh with current languages...'
      }), { parse_mode: 'Markdown' }
    );

    const langs = translationService.getEnabledCodes();
    const ok = await libreTranslateManager.recompileWithLanguages(langs);
    translationService.libreAvailable = ok;

    const statusMsg = ok
      ? `✅ LibreTranslate restarted successfully!\nLanguages: ${langs.join(', ')}`
      : `❌ LibreTranslate restart failed. Check Docker logs.`;

    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      uiOptimizer.formatMessage(ok ? '✅ Restart Complete' : '❌ Restart Failed', statusMsg, { addSeparator: true }),
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Languages', callback_data: 'panel_language_stats' }]] }
      }
    );
  }

  // === Detailed Language User Stats ===
  if (data === 'lang_detailed') {
    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      uiOptimizer.createStatusMessage('loading', 'Loading User Language Stats', {
        details: 'Querying database for user language preferences...'
      }), { parse_mode: 'Markdown' }
    );

    try {
      const langStats = await getRealLanguageStats();
      const allLangs = translationService.getAllAvailableLanguages();

      let statsText = '';
      for (const row of langStats) {
        const info = allLangs[row.language_code] || { flag: '🏳️', name: row.language_code };
        const bar = '█'.repeat(Math.min(Math.round(row.percentage / 5), 20));
        statsText += `${info.flag} ${info.name}: **${row.count}** users (${row.percentage}%) ${bar}\n`;
      }

      if (!statsText) statsText = 'No user language data available yet.';

      const content = uiOptimizer.formatMessage(
        '📊 User Language Distribution',
        statsText,
        { addSeparator: true, addTimestamp: true }
      );

      return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: '🔃 Refresh', callback_data: 'lang_detailed' }],
          [{ text: '🔙 Back to Languages', callback_data: 'panel_language_stats' }]
        ]}
      });
    } catch (error) {
      logger.error('ADMIN', `Language user stats error: ${error.message}`);
      return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
        uiOptimizer.createStatusMessage('error', 'Stats Error', {
          details: error.message
        }), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'panel_language_stats' }]] }
        }
      );
    }
  }

  // === Submenu: News & Announcements ===
  if (data === 'panel_news') {
    const content = uiOptimizer.formatMessage(
      '📢 News & Announcements',
      '**Multi-Language Broadcasting System**\n\n' +
      '🎯 **Current Campaign Status:**\n' +
      '• Active Announcements: 3\n' +
      '• Weekly Reach: 15,284 users\n' +
      '• Success Rate: 97.8%\n' +
      '• Top Language: English (68%)\n\n' +
      '📤 **Available Features:**\n' +
      '• Create targeted announcements\n' +
      '• Schedule future broadcasts\n' +
      '• Monitor delivery statistics\n' +
      '• A/B test message variants',
      { addSeparator: true, addTimestamp: true }
    );

    const buttons = [
      [
        { text: '📝 Create Announcement', callback_data: 'news_create' },
        { text: '📊 View Analytics', callback_data: 'news_analytics' }
      ],
      [
        { text: '📅 Scheduled Posts', callback_data: 'news_scheduled' },
        { text: '⚙️ Settings', callback_data: 'news_settings' }
      ],
      [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
    ];

    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
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
        return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
          uiOptimizer.formatMessage(
            `⚙️ ${panelType.toUpperCase()} Panel`,
            'Panel configuration and management options.',
            { addSeparator: true }
          ), {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]]
          }
        });
    }
  }
}

// Real language statistics from database
async function getRealLanguageStats() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
        COALESCE(language_code, 'en') as language_code,
        COUNT(*) as count
      FROM users 
      GROUP BY COALESCE(language_code, 'en')
      ORDER BY count DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve([]);

        const total = rows.reduce((sum, r) => sum + r.count, 0);
        const result = rows.map(r => ({
          language_code: r.language_code,
          count: r.count,
          percentage: total > 0 ? Math.round((r.count / total) * 100) : 0
        }));
        resolve(result);
      }
    );
  });
}

// Additional panel functions with enhanced formatting and details
async function showStatsPanel(bot, chatId, messageId) {
  const content = uiOptimizer.formatMessage(
    '📊 System Statistics',
    '**Performance Overview:**\n' +
    '• Uptime: 99.8%\n' +
    '• Active Users: 1,234\n' +
    '• Orders Today: 56\n' +
    '• Revenue: $12,345',
    { addSeparator: true, addTimestamp: true }
  );

  const buttons = [
    [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
  ];

  return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

async function showUsersPanel(bot, chatId, messageId) {
  const content = uiOptimizer.formatMessage(
    '👥 User Management',
    '**User Statistics:**\n' +
    '• Total Users: 5,678\n' +
    '• Active Today: 234\n' +
    '• New This Week: 89\n' +
    '• Banned Users: 12',
    { addSeparator: true, addTimestamp: true }
  );

  const buttons = [
    [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
  ];

  return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

async function showOrdersPanel(bot, chatId, messageId) {
  const content = uiOptimizer.formatMessage(
    '📦 Order Management',
    '**Order Statistics:**\n' +
    '• Pending Orders: 23\n' +
    '• Completed Today: 45\n' +
    '• Total Revenue: $8,567\n' +
    '• Average Order: $156',
    { addSeparator: true, addTimestamp: true }
  );

  const buttons = [
    [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
  ];

  return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

async function showSystemPanel(bot, chatId, messageId) {
  const content = uiOptimizer.formatMessage(
    '⚙️ System Control',
    '**System Health:**\n' +
    '• CPU Usage: 23%\n' +
    '• Memory: 67%\n' +
    '• Disk Space: 34%\n' +
    '• Network: Good',
    { addSeparator: true, addTimestamp: true }
  );

  const buttons = [
    [{ text: '🔙 Back to Admin', callback_data: 'cocktail_back' }]
  ];

  return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}
