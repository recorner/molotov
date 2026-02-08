// handlers/lingoHandler.js - /lingo command for admin language management
import db from '../database.js';
import adminManager from '../utils/adminManager.js';
import logger from '../utils/logger.js';
import smartMessageManager from '../utils/smartMessageManager.js';
import uiOptimizer from '../utils/uiOptimizer.js';
import spamPrevention from '../utils/spamPrevention.js';
import translationService from '../utils/translationService.js';
import libreTranslateManager from '../utils/libreTranslateManager.js';

// ═══════════════════════════════════════
//  /lingo COMMAND ENTRY POINT
// ═══════════════════════════════════════

export async function handleLingoCommand(bot, msg) {
  const { from } = msg;

  if (!spamPrevention.canPerformAction(from.id, 'admin_access')) {
    const remaining = spamPrevention.getTimeRemaining(from.id, 'admin_access');
    return bot.sendMessage(msg.chat.id, `⏱️ Please wait ${remaining} seconds.`);
  }

  const isUserAdmin = await adminManager.isAdmin(from.id);
  if (!isUserAdmin) {
    return bot.sendMessage(msg.chat.id, '⛔ This command is restricted to administrators.');
  }

  logger.info('LINGO', `Language panel accessed by admin ${from.id} (${from.first_name})`);
  return showLingoDashboard(bot, msg.chat.id, null, from.id);
}

// ═══════════════════════════════════════
//  CALLBACK ROUTER
// ═══════════════════════════════════════

export async function handleLingoCallback(bot, query) {
  const { id: userId } = query.from;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (!spamPrevention.canPerformAction(userId, 'admin_action')) {
    const remaining = spamPrevention.getTimeRemaining(userId, 'admin_action');
    return bot.answerCallbackQuery(query.id, {
      text: `⏱️ Wait ${remaining}s`, show_alert: true
    });
  }

  const isUserAdmin = await adminManager.isAdmin(userId);
  if (!isUserAdmin) {
    return bot.answerCallbackQuery(query.id, {
      text: '⛔ Unauthorized.', show_alert: true
    });
  }

  logger.info('LINGO', `Admin ${userId} action: ${data}`);

  // ── Dashboard ──
  if (data === 'lingo_home') {
    return showLingoDashboard(bot, chatId, messageId, userId);
  }

  // ── Add language: show picker ──
  if (data === 'lingo_add') {
    return showAddLanguageMenu(bot, chatId, messageId);
  }

  // ── Enable specific language ──
  if (data.startsWith('lingo_enable_')) {
    const langCode = data.replace('lingo_enable_', '');
    return enableLanguage(bot, chatId, messageId, langCode, userId);
  }

  // ── Remove language: show picker ──
  if (data === 'lingo_remove') {
    return showRemoveLanguageMenu(bot, chatId, messageId);
  }

  // ── Disable specific language ──
  if (data.startsWith('lingo_disable_')) {
    const langCode = data.replace('lingo_disable_', '');
    return disableLanguage(bot, chatId, messageId, langCode, userId);
  }

  // ── Restart LibreTranslate ──
  if (data === 'lingo_restart') {
    return restartLibreTranslate(bot, chatId, messageId);
  }

  // ── Rebuild translations ──
  if (data === 'lingo_rebuild') {
    return rebuildTranslations(bot, chatId, messageId);
  }

  // ── User language stats ──
  if (data === 'lingo_stats') {
    return showUserLanguageStats(bot, chatId, messageId);
  }

  // ── LibreTranslate status ──
  if (data === 'lingo_status') {
    return showLibreStatus(bot, chatId, messageId);
  }

  // Fallback
  return bot.answerCallbackQuery(query.id, { text: 'Unknown action' });
}

// ═══════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════

async function showLingoDashboard(bot, chatId, messageId, userId) {
  const enabledLangs = translationService.getSupportedLanguages();
  const enabledCodes = translationService.getEnabledCodes();
  const stats = translationService.getStats();

  let langList = '';
  for (const [code, info] of Object.entries(enabledLangs)) {
    langList += `  ${info.flag} ${info.name} (\`${code}\`)\n`;
  }

  const libreIcon = stats.libreAvailable ? '🟢' : '🔴';

  const content =
    `🌍 **Language Control Panel**\n\n` +
    `**Active Languages (${enabledCodes.length}):**\n` +
    langList + `\n` +
    `**Engine:** ${libreIcon} LibreTranslate ${stats.libreAvailable ? 'Online' : 'Offline'}\n` +
    `**Preloaded:** ${stats.preloadedCount} translations\n` +
    `**Cache:** ${stats.runtimeCacheCount} runtime entries`;

  const buttons = [
    [
      { text: '➕ Add Language', callback_data: 'lingo_add' },
      { text: '➖ Remove Language', callback_data: 'lingo_remove' }
    ],
    [
      { text: '🔄 Rebuild Translations', callback_data: 'lingo_rebuild' },
      { text: '🐳 Restart Engine', callback_data: 'lingo_restart' }
    ],
    [
      { text: '📊 User Stats', callback_data: 'lingo_stats' },
      { text: '📡 Engine Status', callback_data: 'lingo_status' }
    ]
  ];

  if (messageId) {
    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  } else {
    return bot.sendMessage(chatId, content, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  }
}

// ═══════════════════════════════════════
//  ADD LANGUAGE
// ═══════════════════════════════════════

async function showAddLanguageMenu(bot, chatId, messageId) {
  const disabled = translationService.getDisabledLanguages();
  const entries = Object.entries(disabled);

  if (entries.length === 0) {
    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      '✅ All available languages are already enabled!',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'lingo_home' }]] }
      }
    );
  }

  const langButtons = [];
  for (let i = 0; i < entries.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, entries.length); j++) {
      const [code, info] = entries[j];
      row.push({ text: `${info.flag} ${info.name}`, callback_data: `lingo_enable_${code}` });
    }
    langButtons.push(row);
  }
  langButtons.push([{ text: '🔙 Back', callback_data: 'lingo_home' }]);

  return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
    `➕ **Add Language**\n\n` +
    `Select a language to enable.\n` +
    `The translation engine will recompile in the background.\n\n` +
    `**Available (${entries.length}):**`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: langButtons }
    }
  );
}

async function enableLanguage(bot, chatId, messageId, langCode, userId) {
  const langInfo = translationService.getAllAvailableLanguages()[langCode];
  const langName = langInfo ? `${langInfo.flag} ${langInfo.name}` : langCode;

  // Show progress immediately
  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
    `⏳ **Adding ${langName}...**\n\n` +
    `🐳 Recompiling translation engine\n` +
    `This may take 1-3 minutes...`,
    { parse_mode: 'Markdown' }
  );

  const result = await translationService.addLanguage(langCode);

  if (!result.success) {
    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      `❌ **Failed to add ${langName}**\nReason: ${result.reason}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'lingo_home' }]] }
      }
    );
  }

  // Now run the background translation pipeline
  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
    `✅ **${langName} enabled!**\n\n` +
    `${result.recompiled ? '🐳 Engine recompiled' : '⚠️ Engine recompile pending'}\n` +
    `⏳ Building translations in background...`,
    { parse_mode: 'Markdown' }
  );

  // Run background build + Redis load (non-blocking for the admin)
  runTranslationPipeline(bot, chatId, messageId, langName).catch(err => {
    logger.error('LINGO', `Translation pipeline failed: ${err.message}`);
  });
}

// ═══════════════════════════════════════
//  REMOVE LANGUAGE
// ═══════════════════════════════════════

async function showRemoveLanguageMenu(bot, chatId, messageId) {
  const enabled = translationService.getSupportedLanguages();
  const removable = Object.entries(enabled).filter(([code]) => code !== 'en');

  if (removable.length === 0) {
    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      '🇺🇸 Only English is enabled. Nothing to remove.',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'lingo_home' }]] }
      }
    );
  }

  const langButtons = [];
  for (let i = 0; i < removable.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, removable.length); j++) {
      const [code, info] = removable[j];
      row.push({ text: `❌ ${info.flag} ${info.name}`, callback_data: `lingo_disable_${code}` });
    }
    langButtons.push(row);
  }
  langButtons.push([{ text: '🔙 Back', callback_data: 'lingo_home' }]);

  return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
    `➖ **Remove Language**\n\n` +
    `Select a language to disable.\n` +
    `🇺🇸 English cannot be removed.\n\n` +
    `**Enabled (${removable.length} removable):**`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: langButtons }
    }
  );
}

async function disableLanguage(bot, chatId, messageId, langCode, userId) {
  const langInfo = translationService.getAllAvailableLanguages()[langCode];
  const langName = langInfo ? `${langInfo.flag} ${langInfo.name}` : langCode;

  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
    `⏳ **Removing ${langName}...**\n\n🐳 Recompiling translation engine...`,
    { parse_mode: 'Markdown' }
  );

  const result = await translationService.removeLanguage(langCode);

  if (!result.success) {
    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      `❌ **Failed to remove ${langName}**\nReason: ${result.reason}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'lingo_home' }]] }
      }
    );
  }

  // Run background rebuild
  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
    `✅ **${langName} removed!**\n\n` +
    `${result.recompiled ? '🐳 Engine recompiled' : '⚠️ Recompile pending'}\n` +
    `⏳ Rebuilding translations...`,
    { parse_mode: 'Markdown' }
  );

  runTranslationPipeline(bot, chatId, messageId, `Removed ${langName}`).catch(err => {
    logger.error('LINGO', `Translation pipeline failed: ${err.message}`);
  });
}

// ═══════════════════════════════════════
//  RESTART ENGINE
// ═══════════════════════════════════════

async function restartLibreTranslate(bot, chatId, messageId) {
  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
    `⏳ **Restarting LibreTranslate Engine...**\n\n` +
    `🐳 Stopping container\n` +
    `🔄 Starting fresh with current languages\n` +
    `This may take 1-3 minutes...`,
    { parse_mode: 'Markdown' }
  );

  const langs = translationService.getEnabledCodes();
  const ok = await libreTranslateManager.recompileWithLanguages(langs);
  translationService.libreAvailable = ok;

  const statusMsg = ok
    ? `✅ **Engine Restarted!**\n\nLanguages: ${langs.join(', ')}\n🟢 Healthy and ready`
    : `❌ **Restart Failed**\n\nCheck Docker logs for details.`;

  return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, statusMsg, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'lingo_home' }]] }
  });
}

// ═══════════════════════════════════════
//  REBUILD TRANSLATIONS
// ═══════════════════════════════════════

async function rebuildTranslations(bot, chatId, messageId) {
  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
    `⏳ **Rebuilding All Translations...**\n\n` +
    `📝 Translating all UI templates\n` +
    `💾 Loading into Redis cache\n` +
    `This may take 30-60 seconds...`,
    { parse_mode: 'Markdown' }
  );

  try {
    const result = await translationService.buildAndLoadTranslations();

    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      `✅ **Translations Rebuilt!**\n\n` +
      `📝 Preloaded: ${result.preloaded} UI entries\n` +
      `💾 Built: ${result.built} template entries\n` +
      `📡 Redis: ${result.redis ? 'Loaded' : 'Skipped'}\n` +
      `⏱️ Duration: ${result.duration}ms`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'lingo_home' }]] }
      }
    );
  } catch (error) {
    logger.error('LINGO', `Rebuild failed: ${error.message}`);
    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      `❌ **Rebuild Failed**\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'lingo_home' }]] }
      }
    );
  }
}

// ═══════════════════════════════════════
//  USER LANGUAGE STATS
// ═══════════════════════════════════════

async function showUserLanguageStats(bot, chatId, messageId) {
  try {
    const langStats = await getRealLanguageStats();
    const allLangs = translationService.getAllAvailableLanguages();

    let statsText = '';
    for (const row of langStats) {
      const info = allLangs[row.language_code] || { flag: '🏳️', name: row.language_code };
      const bar = '█'.repeat(Math.min(Math.round(row.percentage / 5), 20));
      statsText += `${info.flag} ${info.name}: ${row.count} users (${row.percentage}%) ${bar}\n`;
    }

    if (!statsText) statsText = 'No user language data yet.';

    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      `📊 **User Language Distribution**\n\n${statsText}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: '🔃 Refresh', callback_data: 'lingo_stats' }],
          [{ text: '🔙 Back', callback_data: 'lingo_home' }]
        ]}
      }
    );
  } catch (error) {
    return smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      `❌ **Stats Error**\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'lingo_home' }]] }
      }
    );
  }
}

// ═══════════════════════════════════════
//  LIBRETRANSLATE STATUS
// ═══════════════════════════════════════

async function showLibreStatus(bot, chatId, messageId) {
  const status = await libreTranslateManager.getStatus();
  const loadedLangs = await libreTranslateManager.getLoadedLanguages();

  const statusIcon = status.apiHealthy ? '🟢' : (status.containerRunning ? '🟡' : '🔴');
  const statusText = status.apiHealthy ? 'Healthy' : (status.containerRunning ? 'Starting...' : 'Stopped');

  let langList = loadedLangs.length > 0
    ? loadedLangs.join(', ')
    : 'None detected';

  const content =
    `📡 **LibreTranslate Engine Status**\n\n` +
    `${statusIcon} **Status:** ${statusText}\n` +
    `🐳 **Docker:** ${status.dockerAvailable ? 'Available' : 'Not found'}\n` +
    `📦 **Container:** \`${status.containerName}\`\n` +
    `🌐 **API:** \`${status.apiUrl}\`\n` +
    `🔌 **Port:** ${status.port}\n` +
    `🔄 **Auto-start:** ${status.autoStart ? 'Yes' : 'No'}\n\n` +
    `**Loaded Languages:** ${langList}`;

  return smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [{ text: '🔃 Refresh', callback_data: 'lingo_status' }],
      [{ text: '🔙 Back', callback_data: 'lingo_home' }]
    ]}
  });
}

// ═══════════════════════════════════════
//  BACKGROUND TRANSLATION PIPELINE
// ═══════════════════════════════════════

/**
 * Runs build-translations + load-to-redis in the background.
 * Updates the admin message when done.
 */
async function runTranslationPipeline(bot, chatId, messageId, contextLabel) {
  try {
    const result = await translationService.buildAndLoadTranslations();

    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      `✅ **${contextLabel} - Complete!**\n\n` +
      `📝 UI preloaded: ${result.preloaded} entries\n` +
      `💾 Templates built: ${result.built} entries\n` +
      `📡 Redis: ${result.redis ? 'Loaded' : 'Skipped'}\n` +
      `⏱️ ${result.duration}ms`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: '➕ Add Another', callback_data: 'lingo_add' }],
          [{ text: '🔙 Back', callback_data: 'lingo_home' }]
        ]}
      }
    );
  } catch (error) {
    logger.error('LINGO', `Pipeline error: ${error.message}`);
    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId,
      `⚠️ **${contextLabel}**\n\nLanguage updated but translation rebuild had errors.\n${error.message}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'lingo_home' }]] }
      }
    );
  }
}

// ═══════════════════════════════════════
//  HELPER
// ═══════════════════════════════════════

function getRealLanguageStats() {
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
        resolve(rows.map(r => ({
          language_code: r.language_code,
          count: r.count,
          percentage: total > 0 ? Math.round((r.count / total) * 100) : 0
        })));
      }
    );
  });
}
