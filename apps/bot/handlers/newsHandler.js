// handlers/newsHandler.js - Comprehensive News & Announcements System
import db from '../database.js';
import adminManager from '../utils/adminManager.js';
import logger from '../utils/logger.js';
import { notifyGroup } from '../utils/notifyGroup.js';
import newsSessionManager from '../utils/newsSessionManager.js';
import newsBroadcaster from '../utils/newsBroadcaster.js';
import translationService from '../utils/translationService.js';

// === Handle /news Command ===
export async function handleNewsCommand(bot, msg) {
  const { from, chat } = msg;

  // Check if user is admin
  const isUserAdmin = await adminManager.isAdmin(from.id);
  if (!isUserAdmin) {
    return bot.sendMessage(chat.id, '⛔ *Unauthorized Access*\n\nThis command is restricted to administrators only.', {
      parse_mode: 'Markdown'
    });
  }

  // Log admin access
  logger.info('NEWS', `News panel accessed by admin ${from.id} (${from.first_name})`);

  // Get quick stats
  const stats = await getNewsStats();
  
  const currentTime = new Date().toLocaleString();
  const adminName = from.first_name || 'Admin';

  return bot.sendMessage(chat.id, `📢 **News & Announcements Panel**\n\n` +
    `👋 Welcome, *${adminName}*\n` +
    `🕒 Access Time: ${currentTime}\n` +
    `🎯 Target: Language-based user segments\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 **Quick Stats:**\n` +
    `• Total Registered Users: **${stats.totalUsers}**\n` +
    `• Active Languages: **${stats.activeLanguages}**\n` +
    `• Pending Announcements: **${stats.pendingDrafts}**\n` +
    `• Messages Sent Today: **${stats.sentToday}**\n\n` +
    `Select an action:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📝 Create Announcement', callback_data: 'news_create' },
          { text: '📋 View Drafts', callback_data: 'news_drafts' }
        ],
        [
          { text: '📤 Scheduled Messages', callback_data: 'news_scheduled' },
          { text: '📊 Sent Messages', callback_data: 'news_history' }
        ],
        [
          { text: '🌍 Language Statistics', callback_data: 'news_lang_stats' },
          { text: '👥 User Segments', callback_data: 'news_segments' }
        ],
        [
          { text: '⚙️ Broadcast Settings', callback_data: 'news_settings' },
          { text: '🔙 Back to Admin', callback_data: 'cocktail_back' }
        ]
      ]
    }
  });
}

// === Handle News Message Input ===
export async function handleNewsMessageInput(bot, msg) {
  const userId = msg.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session) return false;

  logger.info('NEWS', `Processing message input from admin ${userId}: ${session.action}`);

  try {
    switch (session.action) {
      case 'creating_message':
        return await handleMessageCreation(bot, msg, session);
      case 'editing_message':
        return await handleMessageEditing(bot, msg, session);
      case 'editing_title':
        return await handleTitleEditing(bot, msg, session);
      default:
        return false;
    }
  } catch (error) {
    logger.error('NEWS', `Error processing news input from ${userId}`, error);
    newsSessionManager.clearSession(userId);
    return bot.sendMessage(msg.chat.id, '❌ *Error Processing Input*\n\nPlease try again or return to the news panel.', {
      parse_mode: 'Markdown'
    });
  }
}

// === Handle News Callbacks ===
export async function handleNewsCallback(bot, query) {
  const { id: userId } = query.from;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // Check admin status
  const isUserAdmin = await adminManager.isAdmin(userId);
  if (!isUserAdmin) {
    logger.warn('NEWS', `Unauthorized news panel access attempt by user ${userId}`);
    return bot.answerCallbackQuery(query.id, { 
      text: '⛔ Unauthorized access. This incident has been logged.', 
      show_alert: true 
    });
  }

  // Log admin action
  logger.info('NEWS', `Admin ${userId} executed news action: ${data}`);

  // Route callbacks
  try {
    // Add callback data validation
    if (!data || data.trim() === '') {
      logger.error('NEWS', `Empty callback data received from user ${userId}`);
      return bot.answerCallbackQuery(query.id, { 
        text: '❌ Invalid request. Please try again.', 
        show_alert: true 
      });
    }

    // Log the callback for debugging
    logger.debug('NEWS', `Processing callback: ${data} from user ${userId}`);

    if (data === 'news_create') return await showLanguageSelection(bot, chatId, messageId);
    if (data === 'news_drafts') return await showDrafts(bot, chatId, messageId);
    if (data === 'news_scheduled') return await showScheduled(bot, chatId, messageId);
    if (data === 'news_history') return await showHistory(bot, chatId, messageId);
    if (data === 'news_lang_stats') return await showLanguageStats(bot, chatId, messageId);
    if (data === 'news_segments') return await showUserSegments(bot, chatId, messageId);
    if (data === 'news_settings') return await showBroadcastSettings(bot, chatId, messageId);
    if (data === 'news_main') return await handleNewsCommand(bot, { from: query.from, chat: { id: chatId } });

    // Language selection
    if (data.startsWith('news_lang_')) return await handleLanguageSelection(bot, query, data);
    
    // Message type selection
    if (data.startsWith('news_type_')) return await handleTypeSelection(bot, query, data);
    
    // Template selection
    if (data.startsWith('news_template_')) return await handleTemplateSelection(bot, query, data);
    
    // Custom message creation
    if (data.startsWith('news_custom_')) return await handleCustomMessage(bot, query, data);
    
    // Message actions
    if (data.startsWith('news_edit_')) return await handleEditMessage(bot, query, data);
    if (data.startsWith('news_translate_preview_')) return await handleTranslatePreview(bot, query, data);
    if (data.startsWith('news_use_translated_')) return await handleUseTranslated(bot, query, data);
    if (data.startsWith('news_send_translated_')) return await handleSendTranslated(bot, query, data);
    if (data.startsWith('news_revert_original_')) return await handleRevertOriginal(bot, query, data);
    if (data.startsWith('news_send_now_')) return await handleSendNow(bot, query, data);
    if (data.startsWith('news_schedule_')) return await handleScheduleMessage(bot, query, data);
    if (data.startsWith('news_save_draft_')) return await handleSaveDraft(bot, query, data);
    if (data.startsWith('news_preview_')) return await handlePreview(bot, query, data);
    if (data.startsWith('news_confirm_')) return await handleConfirmSend(bot, query, data);
    if (data.startsWith('news_test_')) return await handleTestSend(bot, query, data);
    
    // Draft management
    if (data.startsWith('news_draft_')) return await handleDraftAction(bot, query, data);
    
    // Default fallback
    logger.warn('NEWS', `Unhandled callback: ${data} from user ${userId}`);
    return bot.answerCallbackQuery(query.id, { text: 'Feature coming soon!', show_alert: false });
    
  } catch (error) {
    logger.error('NEWS', `Error handling callback ${data}`, error);
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ An error occurred. Please try again.', 
      show_alert: true 
    });
  }
}

// === Core Handler Functions ===

async function showLanguageSelection(bot, chatId, messageId) {
  const languageStats = await getLanguageUserCounts();
  
  let text = `📝 **Create New Announcement**\n\n`;
  text += `🎯 Choose the target language group for your announcement:\n`;
  text += `💡 Users will only receive messages in their selected language\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📊 **User Distribution by Language:**\n\n`;
  
  for (const [lang, count] of Object.entries(languageStats)) {
    if (count > 0) {
      text += `${getLanguageFlag(lang)} ${getLanguageName(lang)}: **${count}** users\n`;
    }
  }
  
  text += `\n🌍 All Languages: **${Object.values(languageStats).reduce((a, b) => a + b, 0)}** total users`;

  // Generate dynamic keyboard from supported languages
  const supportedLanguages = translationService.getSupportedLanguages();
  const keyboard = [];
  const langEntries = Object.entries(supportedLanguages);
  
  // Create rows of 2 languages each
  for (let i = 0; i < langEntries.length; i += 2) {
    const row = [];
    
    for (let j = i; j < Math.min(i + 2, langEntries.length); j++) {
      const [code, info] = langEntries[j];
      row.push({
        text: `${info.flag} ${info.name}`,
        callback_data: `news_lang_${code}`
      });
    }
    
    keyboard.push(row);
  }
  
  // Add special options
  keyboard.push([
    { text: '🌍 All Languages', callback_data: 'news_lang_all' },
    { text: '🎯 Multiple Select', callback_data: 'news_lang_multi' }
  ]);
  keyboard.push([{ text: '🔙 Back to News Panel', callback_data: 'news_main' }]);

  return bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function handleLanguageSelection(bot, query, data) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const selectedLang = data.replace('news_lang_', '');
  
  const userCount = await getUserCountForLanguage(selectedLang);
  
  return bot.editMessageText(`📝 **Create Announcement - ${getLanguageName(selectedLang)}**\n\n` +
    `🎯 Target: ${getLanguageFlag(selectedLang)} ${getLanguageName(selectedLang)} speakers\n` +
    `👥 Estimated Recipients: **${userCount}** users\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 **Message Types:**\n` +
    `Choose the type of announcement you want to create:`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📢 General Announcement', callback_data: `news_type_general_${selectedLang}` },
          { text: '🎉 Event Notification', callback_data: `news_type_event_${selectedLang}` }
        ],
        [
          { text: '⚠️ Important Update', callback_data: `news_type_important_${selectedLang}` },
          { text: '🎁 Special Offer', callback_data: `news_type_offer_${selectedLang}` }
        ],
        [
          { text: '🔧 Maintenance Notice', callback_data: `news_type_maintenance_${selectedLang}` },
          { text: '📈 Feature Release', callback_data: `news_type_feature_${selectedLang}` }
        ],
        [
          { text: '🆘 Emergency Alert', callback_data: `news_type_emergency_${selectedLang}` },
          { text: '🎊 Celebration', callback_data: `news_type_celebration_${selectedLang}` }
        ],
        [{ text: '🔙 Back to Languages', callback_data: 'news_create' }]
      ]
    }
  });
}

async function handleTypeSelection(bot, query, data) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [, , type, lang] = data.split('_');
  
  const userCount = await getUserCountForLanguage(lang);
  
  return bot.editMessageText(`📝 **Create ${getTypeName(type)} - ${getLanguageName(lang)}**\n\n` +
    `🎯 Target: ${getLanguageFlag(lang)} ${getLanguageName(lang)} speakers\n` +
    `📋 Type: ${getTypeIcon(type)} ${getTypeName(type)}\n` +
    `👥 Recipients: **${userCount}** users\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📄 **Choose Your Approach:**\n` +
    `Select a pre-made template or create a custom message:`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📄 Professional Template', callback_data: `news_template_professional_${type}_${lang}` },
          { text: '🎨 Creative Template', callback_data: `news_template_creative_${type}_${lang}` }
        ],
        [
          { text: '⚡ Quick Template', callback_data: `news_template_quick_${type}_${lang}` },
          { text: '📋 Detailed Template', callback_data: `news_template_detailed_${type}_${lang}` }
        ],
        [
          { text: '✏️ Custom Message', callback_data: `news_custom_${type}_${lang}` },
          { text: '🔙 Back to Types', callback_data: `news_lang_${lang}` }
        ]
      ]
    }
  });
}

async function handleTemplateSelection(bot, query, data) {
  try {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const parts = data.split('_');
    
    logger.debug('NEWS', `Template selection parsing: ${data} -> parts:`, parts);
    
    if (parts.length < 5) {
      logger.error('NEWS', `Invalid template callback format: ${data}`);
      return bot.answerCallbackQuery(query.id, { 
        text: '❌ Invalid template format', 
        show_alert: true 
      });
    }
    
    const templateStyle = parts[2];
    const type = parts[3];
    const lang = parts[4];
    
    logger.debug('NEWS', `Template params: style=${templateStyle}, type=${type}, lang=${lang}`);
    
    const template = getTemplateContent(templateStyle, type, lang);
    if (!template) {
      logger.error('NEWS', `Template not found for: ${templateStyle}/${type}/${lang}`);
      return bot.answerCallbackQuery(query.id, { 
        text: '❌ Template not found', 
        show_alert: true 
      });
    }
    
    const userCount = await getUserCountForLanguage(lang);
    
    // Store the template in session for editing
    const sessionData = {
      templateStyle,
      type,
      lang,
      title: template.title,
      content: template.content,
      userCount,
      action: 'template_selected'
    };
    
    newsSessionManager.createSession(query.from.id, sessionData);
    
    // Log for debugging
    logger.info('NEWS', `Template selected by user ${query.from.id}:`, {
      templateStyle,
      type,
      lang,
      userCount,
      titleLength: template.title.length,
      contentLength: template.content.length
    });
  
    return await bot.editMessageText(`📝 **${template.title}**\n\n` +
    `🎯 Target: ${getLanguageFlag(lang)} ${getLanguageName(lang)} (${userCount} users)\n` +
    `📋 Type: ${getTypeIcon(type)} ${getTypeName(type)}\n` +
    `🎨 Style: ${getTemplateStyleName(templateStyle)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📄 **Message Preview:**\n\n` +
    `${template.content}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚙️ **Actions:**`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        ...(lang !== 'en' ? [[
          { text: `🌐 Translate to ${getLanguageName(lang)} & Preview`, callback_data: `news_translate_preview_${templateStyle}_${type}_${lang}` }
        ]] : []),
        [
          { text: '✏️ Edit Message', callback_data: `news_edit_content_${templateStyle}_${type}_${lang}` },
          { text: '📝 Edit Title', callback_data: `news_edit_title_${templateStyle}_${type}_${lang}` }
        ],
        [
          { text: '📤 Send Now', callback_data: `news_send_now_${templateStyle}_${type}_${lang}` },
          { text: '⏰ Schedule', callback_data: `news_schedule_${templateStyle}_${type}_${lang}` }
        ],
        [
          { text: '💾 Save Draft', callback_data: `news_save_draft_${templateStyle}_${type}_${lang}` },
          { text: '👀 Full Preview', callback_data: `news_preview_${templateStyle}_${type}_${lang}` }
        ],
        [
          { text: '🧪 Test Send', callback_data: `news_test_${templateStyle}_${type}_${lang}` },
          { text: '🔙 Back', callback_data: `news_type_${type}_${lang}` }
        ]
      ]
    }
  });
  
  } catch (error) {
    logger.error('NEWS', 'Error in handleTemplateSelection:', error);
    await bot.answerCallbackQuery(query.id, { 
      text: '❌ Error loading template', 
      show_alert: true 
    });
  }
}

async function handleCustomMessage(bot, query, data) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [, , type, lang] = data.split('_');
  
  const userCount = await getUserCountForLanguage(lang);
  
  // Create editing session
  newsSessionManager.createSession(query.from.id, 'creating_message', {
    type,
    lang,
    userCount,
    isCustom: true
  });
  
  return bot.editMessageText(`✏️ **Create Custom ${getTypeName(type)}**\n\n` +
    `🎯 Target: ${getLanguageFlag(lang)} ${getLanguageName(lang)} (${userCount} users)\n` +
    `📋 Type: ${getTypeIcon(type)} ${getTypeName(type)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📝 **Message Composer:**\n\n` +
    `💡 **Pro Tips:**\n` +
    `• Keep it clear and engaging\n` +
    `• Use emojis to enhance readability\n` +
    `• Include a clear call-to-action\n` +
    `• Consider your audience's cultural context\n\n` +
    `🔤 **Formatting Options:**\n` +
    `• *Bold text* - Surround with asterisks\n` +
    `• _Italic text_ - Surround with underscores\n` +
    `• \`Code text\` - Surround with backticks\n` +
    `• [Link text](URL) - Use brackets and parentheses\n\n` +
    `⌨️ **Ready?** Type your message in the chat now:`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📄 Use Template Instead', callback_data: `news_type_${type}_${lang}` },
          { text: '❌ Cancel', callback_data: `news_lang_${lang}` }
        ]
      ]
    }
  });
}

// === Message Input Handlers ===

async function handleMessageCreation(bot, msg, session) {
  const userId = msg.from.id;
  const content = msg.text;
  
  if (!content || content.length < 10) {
    return bot.sendMessage(msg.chat.id, '⚠️ Message too short. Please write at least 10 characters.', {
      reply_to_message_id: msg.message_id
    });
  }
  
  if (content.length > 4096) {
    return bot.sendMessage(msg.chat.id, '⚠️ Message too long. Please keep it under 4096 characters.', {
      reply_to_message_id: msg.message_id
    });
  }
  
  // Update session with the content
  session.title = content.split('\n')[0].substring(0, 100) + (content.length > 100 ? '...' : '');
  session.content = content;
  session.originalContent = content; // Keep original for re-translation
  session.action = 'message_created';
  
  // Ensure templateStyle is set for custom messages
  if (!session.templateStyle) {
    session.templateStyle = 'custom';
  }
  
  newsSessionManager.updateSession(userId, session);

  // Build action buttons - add translate option if target is not English
  const actionButtons = [
    [
      { text: '📤 Send Now', callback_data: `news_send_now_${session.templateStyle}_${session.type}_${session.lang}` },
      { text: '⏰ Schedule', callback_data: `news_schedule_${session.templateStyle}_${session.type}_${session.lang}` }
    ],
    [
      { text: '✏️ Edit Message', callback_data: `news_edit_content_${session.templateStyle}_${session.type}_${session.lang}` },
      { text: '💾 Save Draft', callback_data: `news_save_draft_${session.templateStyle}_${session.type}_${session.lang}` }
    ],
    [
      { text: '👀 Preview', callback_data: `news_preview_${session.templateStyle}_${session.type}_${session.lang}` },
      { text: '🧪 Test Send', callback_data: `news_test_${session.templateStyle}_${session.type}_${session.lang}` }
    ]
  ];

  // Add translate & preview button if target language is not English
  if (session.lang !== 'en' && session.lang !== 'all') {
    actionButtons.splice(0, 0, [
      { text: `🌐 Translate to ${getLanguageName(session.lang)} & Preview`, callback_data: `news_translate_preview_${session.templateStyle}_${session.type}_${session.lang}` }
    ]);
  }
  
  return bot.sendMessage(msg.chat.id, `✅ **Message Created Successfully!**\n\n` +
    `📋 Title: *${session.title}*\n` +
    `🎯 Target: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n` +
    `👥 Recipients: **${session.userCount}** users\n` +
    `📝 Length: ${content.length} characters\n` +
    (session.lang !== 'en' && session.lang !== 'all' ? `\n💡 *Tip:* Use "Translate & Preview" to auto-translate your English message to ${getLanguageName(session.lang)} before sending.\n` : '') +
    `\nWhat would you like to do next?`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: actionButtons
    }
  });
}

async function handleMessageEditing(bot, msg, session) {
  const userId = msg.from.id;
  const content = msg.text;
  
  if (!content || content.length < 10) {
    return bot.sendMessage(msg.chat.id, '⚠️ Message too short. Please write at least 10 characters.', {
      reply_to_message_id: msg.message_id
    });
  }
  
  // Update the content
  session.content = content;
  session.action = 'message_edited';
  
  // Ensure templateStyle is preserved
  if (!session.templateStyle) {
    session.templateStyle = 'custom';
  }
  
  newsSessionManager.updateSession(userId, session);
  
  return bot.sendMessage(msg.chat.id, `✅ **Message Updated Successfully!**\n\n` +
    `📝 New Length: ${content.length} characters\n` +
    `🎯 Target: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n\n` +
    `Your message has been updated. What's next?`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📤 Send Now', callback_data: `news_send_now_${session.templateStyle}_${session.type}_${session.lang}` },
          { text: '⏰ Schedule', callback_data: `news_schedule_${session.templateStyle}_${session.type}_${session.lang}` }
        ],
        [
          { text: '👀 Preview', callback_data: `news_preview_${session.templateStyle}_${session.type}_${session.lang}` },
          { text: '💾 Save Draft', callback_data: `news_save_draft_${session.templateStyle}_${session.type}_${session.lang}` }
        ]
      ]
    }
  });
}

async function handleTitleEditing(bot, msg, session) {
  const userId = msg.from.id;
  const title = msg.text;
  
  if (!title || title.length < 3) {
    return bot.sendMessage(msg.chat.id, '⚠️ Title too short. Please write at least 3 characters.', {
      reply_to_message_id: msg.message_id
    });
  }
  
  if (title.length > 100) {
    return bot.sendMessage(msg.chat.id, '⚠️ Title too long. Please keep it under 100 characters.', {
      reply_to_message_id: msg.message_id
    });
  }
  
  // Update the title
  session.title = title;
  session.action = 'title_edited';
  
  // Ensure templateStyle is preserved
  if (!session.templateStyle) {
    session.templateStyle = 'custom';
  }
  
  newsSessionManager.updateSession(userId, session);
  
  return bot.sendMessage(msg.chat.id, `✅ **Title Updated Successfully!**\n\n` +
    `📝 New Title: *${title}*\n` +
    `🎯 Target: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n\n` +
    `Title has been updated. What would you like to do next?`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📤 Send Now', callback_data: `news_send_now_${session.templateStyle}_${session.type}_${session.lang}` },
          { text: '✏️ Edit Content', callback_data: `news_edit_content_${session.templateStyle}_${session.type}_${session.lang}` }
        ],
        [
          { text: '👀 Preview', callback_data: `news_preview_${session.templateStyle}_${session.type}_${session.lang}` },
          { text: '💾 Save Draft', callback_data: `news_save_draft_${session.templateStyle}_${session.type}_${session.lang}` }
        ]
      ]
    }
  });
}

// === Action Handlers ===

async function handleEditMessage(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Session expired. Please start over.', 
      show_alert: true 
    });
  }
  
  const parts = data.split('_');
  const editType = parts[2]; // 'content' or 'title'
  
  if (editType === 'content') {
    session.action = 'editing_message';
    newsSessionManager.updateSession(userId, session);
    
    return bot.editMessageText(`✏️ **Edit Message Content**\n\n` +
      `📝 Current message:\n\n` +
      `${session.content}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⌨️ **Type your new message content:**`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel Editing', callback_data: `news_template_${session.templateStyle}_${session.type}_${session.lang}` }]
        ]
      }
    });
  }
  
  if (editType === 'title') {
    session.action = 'editing_title';
    newsSessionManager.updateSession(userId, session);
    
    return bot.editMessageText(`📝 **Edit Message Title**\n\n` +
      `📋 Current title: *${session.title}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⌨️ **Type your new title:**`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel Editing', callback_data: `news_template_${session.templateStyle}_${session.type}_${session.lang}` }]
        ]
      }
    });
  }
}

async function handleSendNow(bot, query, data) {
  const userId = query.from.id;
  let session = newsSessionManager.getSession(userId);
  
  // If session doesn't exist, try to reconstruct from callback data
  if (!session) {
    const parts = data.split('_');
    if (parts.length >= 5) {
      const templateStyle = parts[3];
      const type = parts[4]; 
      const lang = parts[5];
      
      logger.warn('NEWS', `Session expired for user ${userId}, attempting to reconstruct from callback data`);
      
      // Try to get basic info and show error
      return bot.editMessageText(`❌ **Session Expired**\n\n` +
        `Your editing session has expired. Please start over by selecting your template again.\n\n` +
        `This happens for security reasons after a period of inactivity.`, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Start Over', callback_data: 'news_create' },
              { text: '🔙 Back to News Panel', callback_data: 'news_main' }
            ]
          ]
        }
      });
    }
    
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Session expired. Please start over.', 
      show_alert: true 
    });
  }
  
  // Validate session data
  if (!session.title || !session.content || !session.lang || !session.type) {
    logger.error('NEWS', `Invalid session data for user ${userId}:`, session);
    
    return bot.editMessageText(`❌ **Invalid Session Data**\n\n` +
      `Missing required information:\n` +
      `• Title: ${session.title ? '✅' : '❌'}\n` +
      `• Content: ${session.content ? '✅' : '❌'}\n` +
      `• Language: ${session.lang ? '✅' : '❌'}\n` +
      `• Type: ${session.type ? '✅' : '❌'}\n\n` +
      `Please start over and ensure all fields are completed.`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Start Over', callback_data: 'news_create' },
            { text: '🔙 Back to News Panel', callback_data: 'news_main' }
          ]
        ]
      }
    });
  }
  
  const userCount = await getUserCountForLanguage(session.lang);
  
  // Log session data for debugging
  logger.info('NEWS', `Send now confirmation for user ${userId}:`, {
    title: session.title,
    lang: session.lang,
    type: session.type,
    userCount: userCount,
    contentLength: session.content ? session.content.length : 0
  });
  
  return bot.editMessageText(`🚀 **Confirm Immediate Broadcast**\n\n` +
    `📋 Title: *${session.title}*\n` +
    `🎯 Target: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n` +
    `👥 Recipients: **${userCount}** users\n` +
    `📝 Type: ${getTypeIcon(session.type)} ${getTypeName(session.type)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📄 **Message Preview:**\n\n` +
    `${session.content.substring(0, 500)}${session.content.length > 500 ? '...' : ''}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ **Warning:** This will immediately send the message to all ${userCount} users.\n` +
    `This action cannot be undone.`, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ SEND NOW', callback_data: `news_confirm_send_now_${userId}_${Date.now()}` },
          { text: '❌ Cancel', callback_data: `news_template_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }
        ],
        [
          { text: '🧪 Test First', callback_data: `news_test_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` },
          { text: '⏰ Schedule Instead', callback_data: `news_schedule_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }
        ]
      ]
    }
  });
}

async function handleConfirmSend(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Session expired. Please start over.', 
      show_alert: true 
    });
  }
  
  // Validate session data
  if (!session.title || !session.content || !session.lang) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Invalid session data. Please start over.', 
      show_alert: true 
    });
  }
  
  // Start the broadcast
  bot.answerCallbackQuery(query.id, { text: '🚀 Starting broadcast...', show_alert: false });
  
  try {
    // Get actual user count
    const userCount = await getUserCountForLanguage(session.lang);
    
    if (userCount === 0) {
      throw new Error(`No users found for language: ${session.lang}`);
    }
    
    // Save to database first
    const announcementId = await saveAnnouncement(session, userId, 'sending');
    
    // Update UI to show progress
    await bot.editMessageText(`🚀 **Broadcasting in Progress...**\n\n` +
      `📋 Title: *${session.title}*\n` +
      `🎯 Target: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n` +
      `👥 Recipients: **${userCount}** users\n` +
      `📊 Status: Sending messages...\n\n` +
      `⏳ Please wait while we deliver your announcement to all users.\n` +
      `You'll receive a summary when completed.`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown'
    });
    
    // Start the broadcast process
    const result = await newsBroadcaster.broadcast({
      id: announcementId,
      title: session.title,
      content: session.content,
      targetLanguage: session.lang,
      createdBy: userId
    });
    
    // Clear session
    newsSessionManager.clearSession(userId);
    
    // Send completion notification
    await bot.sendMessage(query.message.chat.id, `✅ **Broadcast Completed!**\n\n` +
      `📋 Announcement: *${session.title}*\n` +
      `📊 **Results:**\n` +
      `• ✅ Successfully sent: **${result.successCount}**\n` +
      `• ❌ Failed to send: **${result.failedCount}**\n` +
      `• 📈 Success rate: **${Math.round((result.successCount / (result.successCount + result.failedCount)) * 100)}%**\n` +
      `• ⏱️ Duration: ${Math.round(result.duration / 1000)} seconds\n\n` +
      `🎉 Your announcement has been delivered to the community!`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📊 View Details', callback_data: `news_broadcast_details_${announcementId}` },
            { text: '📝 Create Another', callback_data: 'news_create' }
          ],
          [{ text: '🔙 Back to News Panel', callback_data: 'news_main' }]
        ]
      }
    });
    
  } catch (error) {
    logger.error('NEWS', `Broadcast failed for user ${userId}`, error);
    
    await bot.editMessageText(`❌ **Broadcast Failed**\n\n` +
      `📋 Title: *${session.title || 'Unknown'}*\n` +
      `🎯 Target: ${getLanguageFlag(session.lang || 'en')} ${getLanguageName(session.lang || 'en')}\n\n` +
      `💥 Error: ${error.message}\n\n` +
      `Please try again or contact support if the issue persists.`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Try Again', callback_data: `news_send_now_${session.templateStyle || 'custom'}_${session.type || 'general'}_${session.lang || 'en'}` },
            { text: '💾 Save as Draft', callback_data: `news_save_draft_${session.templateStyle || 'custom'}_${session.type || 'general'}_${session.lang || 'en'}` }
          ],
          [{ text: '🔙 Back to News Panel', callback_data: 'news_main' }]
        ]
      }
    });
  }
}

async function handleScheduleMessage(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Session expired. Please start over.', 
      show_alert: true 
    });
  }
  
  return bot.editMessageText(`⏰ **Schedule Message**\n\n` +
    `📋 Title: *${session.title}*\n` +
    `🎯 Target: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🕒 **Scheduling Options:**\n\n` +
    `Choose when to send your announcement:`, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🌅 In 1 Hour', callback_data: `news_schedule_1h_${session.templateStyle}_${session.type}_${session.lang}` },
          { text: '🌆 In 6 Hours', callback_data: `news_schedule_6h_${session.templateStyle}_${session.type}_${session.lang}` }
        ],
        [
          { text: '🌙 Tomorrow 9 AM', callback_data: `news_schedule_tomorrow_${session.templateStyle}_${session.type}_${session.lang}` },
          { text: '📅 Custom Time', callback_data: `news_schedule_custom_${session.templateStyle}_${session.type}_${session.lang}` }
        ],
        [{ text: '🔙 Back to Template', callback_data: `news_template_${session.templateStyle}_${session.type}_${session.lang}` }]
      ]
    }
  });
}

async function handleSaveDraft(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Session expired. Please start over.', 
      show_alert: true 
    });
  }
  
  try {
    const draftId = await saveAnnouncement(session, userId, 'draft');
    
    await bot.editMessageText(`💾 **Draft Saved Successfully**\n\n` +
      `📝 Title: *${session.title}*\n` +
      `🆔 Draft ID: ${draftId}\n` +
      `🎯 Target: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n` +
      `📅 Saved: ${new Date().toLocaleString()}\n\n` +
      `✅ Your announcement has been saved as a draft.\n` +
      `You can find it in the "View Drafts" section.`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 View All Drafts', callback_data: 'news_drafts' },
            { text: '📝 Create Another', callback_data: 'news_create' }
          ],
          [{ text: '🔙 Back to News Panel', callback_data: 'news_main' }]
        ]
      }
    });
    
    // Clear session after saving
    newsSessionManager.clearSession(userId);
    
  } catch (error) {
    logger.error('NEWS', `Failed to save draft for user ${userId}`, error);
    
    return bot.editMessageText(`❌ **Error Saving Draft**\n\n` +
      `Failed to save the announcement as draft.\n` +
      `Error: ${error.message}\n\n` +
      `Please try again.`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Try Again', callback_data: `news_save_draft_${session.templateStyle}_${session.type}_${session.lang}` },
            { text: '🔙 Back', callback_data: `news_template_${session.templateStyle}_${session.type}_${session.lang}` }
          ]
        ]
      }
    });
  }
}

async function handlePreview(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Session expired. Please start over.', 
      show_alert: true 
    });
  }
  
  const userCount = await getUserCountForLanguage(session.lang);
  
  return bot.editMessageText(`👀 **Full Message Preview**\n\n` +
    `📋 **Message Information:**\n` +
    `• Title: *${session.title}*\n` +
    `• Type: ${getTypeIcon(session.type)} ${getTypeName(session.type)}\n` +
    `• Language: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n` +
    `• Recipients: **${userCount}** users\n` +
    `• Style: ${getTemplateStyleName(session.templateStyle || 'custom')}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📱 **How users will see this message:**\n\n` +
    `${session.content}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 This is exactly how the message will appear to users.`, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📤 Send Now', callback_data: `news_send_now_${session.templateStyle}_${session.type}_${session.lang}` },
          { text: '⏰ Schedule', callback_data: `news_schedule_${session.templateStyle}_${session.type}_${session.lang}` }
        ],
        [
          { text: '✏️ Edit Content', callback_data: `news_edit_content_${session.templateStyle}_${session.type}_${session.lang}` },
          { text: '📝 Edit Title', callback_data: `news_edit_title_${session.templateStyle}_${session.type}_${session.lang}` }
        ],
        [
          { text: '💾 Save Draft', callback_data: `news_save_draft_${session.templateStyle}_${session.type}_${session.lang}` },
          { text: '🔙 Back', callback_data: `news_template_${session.templateStyle}_${session.type}_${session.lang}` }
        ]
      ]
    }
  });
}

async function handleTestSend(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Session expired. Please start over.', 
      show_alert: true 
    });
  }
  
  try {
    // Send test message with banner to the admin
    await bot.sendPhoto(userId, './assets/image.png', {
      caption: `🧪 **TEST MESSAGE PREVIEW**\n\n` +
        `This is how your announcement will look to users:\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👋 Hello [User Name]!\n\n` +
        `${session.content}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 *Official Announcement*\n` +
        `� ${new Date().toLocaleString()}\n` +
        `🌟 Thank you for being part of our community!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `�📋 Title: ${session.title}\n` +
        `🎯 Target: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n` +
        `📝 Type: ${getTypeIcon(session.type)} ${getTypeName(session.type)}`,
      parse_mode: 'Markdown'
    });
    
    return bot.answerCallbackQuery(query.id, { 
      text: '🧪 Test message with banner sent to your private chat!', 
      show_alert: true 
    });
    
  } catch (error) {
    logger.error('NEWS', `Failed to send test message to ${userId}`, error);
    
    // Fallback to text message if photo fails
    try {
      await bot.sendMessage(userId, `🧪 **TEST MESSAGE (Text Only)**\n\n` +
        `Banner image failed to load, but here's how your text will look:\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👋 Hello [User Name]!\n\n` +
        `${session.content}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 *Official Announcement*\n` +
        `🕒 ${new Date().toLocaleString()}\n` +
        `🌟 Thank you for being part of our community!`, {
        parse_mode: 'Markdown'
      });
      
      return bot.answerCallbackQuery(query.id, { 
        text: '🧪 Test message sent (banner failed, text only)', 
        show_alert: true 
      });
    } catch (fallbackError) {
      logger.error('NEWS', `Failed to send fallback test message to ${userId}`, fallbackError);
      
      return bot.answerCallbackQuery(query.id, { 
        text: '❌ Failed to send test message. Please check your DMs with the bot.', 
        show_alert: true 
      });
    }
  }
}

// === Helper Functions ===

async function getNewsStats() {
  return new Promise((resolve) => {
    db.all(`
      SELECT 
        (SELECT COUNT(*) FROM users) as totalUsers,
        (SELECT COUNT(DISTINCT language_code) FROM users WHERE language_code IS NOT NULL) as activeLanguages,
        (SELECT COUNT(*) FROM news_announcements WHERE status = 'draft') as pendingDrafts,
        (SELECT COUNT(*) FROM news_announcements WHERE status = 'sent' AND DATE(sent_at) = DATE('now')) as sentToday
    `, [], (err, rows) => {
      if (err) {
        logger.error('NEWS', 'Failed to get news stats', err);
        resolve({ totalUsers: 0, activeLanguages: 0, pendingDrafts: 0, sentToday: 0 });
      } else {
        resolve(rows[0] || { totalUsers: 0, activeLanguages: 0, pendingDrafts: 0, sentToday: 0 });
      }
    });
  });
}

async function getLanguageUserCounts() {
  return new Promise((resolve) => {
    db.all(`
      SELECT language_code, COUNT(*) as count
      FROM users 
      WHERE language_code IS NOT NULL
      GROUP BY language_code
    `, [], (err, rows) => {
      if (err) {
        logger.error('NEWS', 'Failed to get language user counts', err);
        resolve({});
      } else {
        const counts = {};
        rows.forEach(row => {
          counts[row.language_code] = row.count;
        });
        resolve(counts);
      }
    });
  });
}

async function getUserCountForLanguage(lang) {
  return new Promise((resolve) => {
    if (lang === 'all') {
      db.get('SELECT COUNT(*) as count FROM users WHERE language_code IS NOT NULL', [], (err, row) => {
        resolve(err ? 0 : (row ? row.count : 0));
      });
    } else {
      db.get('SELECT COUNT(*) as count FROM users WHERE language_code = ?', [lang], (err, row) => {
        resolve(err ? 0 : (row ? row.count : 0));
      });
    }
  });
}

async function saveAnnouncement(session, userId, status = 'draft') {
  return new Promise((resolve, reject) => {
    // First check if the user exists in group_admins table
    db.get(`
      SELECT user_id FROM group_admins WHERE user_id = ? LIMIT 1
    `, [userId], (err, adminRow) => {
      if (err) {
        reject(new Error(`Admin check failed: ${err.message}`));
        return;
      }
      
      if (!adminRow) {
        reject(new Error('User not found in admin records. Please ensure you are added as an admin.'));
        return;
      }
      
      // Now save the announcement
      db.run(`
        INSERT INTO news_announcements 
        (title, content, target_languages, created_by, status, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        session.title || 'Untitled Announcement',
        session.content || '',
        JSON.stringify([session.lang]),
        userId,
        status
      ], function(err) {
        if (err) {
          logger.error('NEWS', `Failed to save announcement: ${err.message}`, err);
          reject(new Error(`Database error: ${err.message}`));
        } else {
          logger.info('NEWS', `Announcement saved with ID: ${this.lastID}`);
          resolve(this.lastID);
        }
      });
    });
  });
}

// === Template and Language Helper Functions ===

function getLanguageName(code) {
  if (code === 'all') return 'All Languages';
  
  const supportedLanguages = translationService.getSupportedLanguages();
  return supportedLanguages[code]?.name || 'Unknown';
}

function getLanguageFlag(code) {
  if (code === 'all') return '�';
  
  const supportedLanguages = translationService.getSupportedLanguages();
  return supportedLanguages[code]?.flag || '🏳️';
}

function getTypeName(type) {
  const types = {
    'general': 'General Announcement',
    'event': 'Event Notification',
    'important': 'Important Update',
    'offer': 'Special Offer',
    'maintenance': 'Maintenance Notice',
    'feature': 'Feature Release',
    'emergency': 'Emergency Alert',
    'celebration': 'Celebration'
  };
  return types[type] || 'Announcement';
}

function getTypeIcon(type) {
  const icons = {
    'general': '📢',
    'event': '🎉',
    'important': '⚠️',
    'offer': '🎁',
    'maintenance': '🔧',
    'feature': '📈',
    'emergency': '🆘',
    'celebration': '🎊'
  };
  return icons[type] || '📢';
}

function getTemplateStyleName(style) {
  const styles = {
    'professional': 'Professional',
    'creative': 'Creative',
    'quick': 'Quick & Simple',
    'detailed': 'Detailed',
    'custom': 'Custom'
  };
  return styles[style] || 'Standard';
}

function getTemplateContent(style, type, lang) {
  // This is a comprehensive template system
  const templates = {
    professional: {
      general: {
        en: {
          title: "Important Platform Update",
          content: `🔔 **Official Announcement**\n\nDear Valued Community Members,\n\nWe are pleased to inform you of important updates to our platform that will enhance your experience and provide additional value.\n\n**Key Highlights:**\n• Enhanced security protocols\n• Improved user interface\n• New feature rollouts\n• Performance optimizations\n\n**Effective Date:** Immediate\n**Impact:** Positive improvements across all services\n\nWe appreciate your continued trust and support. For any questions, please don't hesitate to reach out to our support team.\n\nBest regards,\n*The Management Team*`
        },
        ru: {
          title: "Важное обновление платформы",
          content: `🔔 **Официальное объявление**\n\nДорогие участники сообщества,\n\nМы рады сообщить вам о важных обновлениях нашей платформы, которые улучшат ваш опыт и предоставят дополнительную ценность.\n\n**Ключевые моменты:**\n• Усиленные протоколы безопасности\n• Улучшенный пользовательский интерфейс\n• Внедрение новых функций\n• Оптимизация производительности\n\n**Дата вступления в силу:** Немедленно\n**Влияние:** Положительные улучшения всех сервисов\n\nМы ценим ваше постоянное доверие и поддержку. По любым вопросам обращайтесь к нашей команде поддержки.\n\nС наилучшими пожеланиями,\n*Команда управления*`
        }
      },
      event: {
        en: {
          title: "Exclusive Community Event",
          content: `🎉 **Special Event Announcement**\n\nWe are excited to announce an exclusive event for our community members!\n\n**Event Details:**\n📅 **Duration:** Limited time opportunity\n🎯 **Eligibility:** All active community members\n🎁 **Benefits:** Exclusive rewards and bonuses\n⭐ **Special Features:** Enhanced participation rewards\n\n**How to Participate:**\n1. Stay active in the community\n2. Watch for event notifications\n3. Complete event-specific activities\n4. Claim your rewards\n\n**Important:** This is a limited-time event with exclusive benefits for early participants.\n\nDon't miss this opportunity to maximize your community involvement!\n\n*Event terms and conditions apply*`
        }
      }
    },
    creative: {
      general: {
        en: {
          title: "🚀 Exciting News Alert!",
          content: `🌟 **Something Amazing is Happening!** 🌟\n\nHey there, awesome community! 👋\n\nGuess what? We've got some INCREDIBLE news to share with you! 🎊\n\n✨ **The Magic Includes:**\n🔥 Mind-blowing new features\n⚡ Lightning-fast improvements\n🛡️ Fort-Knox level security\n🎨 Beautiful new design elements\n\n🎯 **Why This Matters to YOU:**\n• Smoother experience than ever\n• More ways to engage and earn\n• Better protection for your activities\n• Cooler interface to explore\n\n🚀 **Ready for Takeoff?**\nThese updates are LIVE right now! Jump in and experience the future of our platform!\n\nStay awesome! 💫\n*Your Friendly Team* 🤝`
        }
      }
    },
    quick: {
      general: {
        en: {
          title: "Quick Update",
          content: `📱 **Quick Update**\n\nHey everyone!\n\nJust a quick heads up about some improvements we've made:\n\n✅ Enhanced security\n✅ Better performance\n✅ New features added\n✅ Bug fixes applied\n\nThat's it! Everything should be working even better now.\n\nThanks! 👍`
        }
      }
    },
    detailed: {
      general: {
        en: {
          title: "Comprehensive Platform Update - Detailed Overview",
          content: `📋 **Comprehensive System Update Report**\n\n**Executive Summary:**\nWe have completed a major platform upgrade designed to enhance user experience, security, and operational efficiency.\n\n**Technical Improvements:**\n\n🔒 **Security Enhancements:**\n• Multi-factor authentication implementation\n• Advanced encryption protocols\n• Real-time threat monitoring\n• Enhanced data protection measures\n\n⚡ **Performance Optimizations:**\n• 40% faster load times\n• Improved server response rates\n• Enhanced database performance\n• Optimized resource allocation\n\n🎨 **User Interface Updates:**\n• Modernized design elements\n• Improved navigation structure\n• Mobile responsiveness enhancements\n• Accessibility improvements\n\n📈 **New Features:**\n• Advanced analytics dashboard\n• Enhanced notification system\n• Improved search functionality\n• Extended customization options\n\n**Implementation Timeline:**\n• Phase 1: Security updates (Completed)\n• Phase 2: Performance improvements (Completed)\n• Phase 3: UI/UX enhancements (In Progress)\n• Phase 4: Feature rollouts (Upcoming)\n\n**User Action Required:**\nNo immediate action needed. All updates are backward compatible.\n\n**Support:**\nFor technical assistance, contact our 24/7 support team.\n\n*Last updated: ${new Date().toLocaleDateString()}*`
        }
      }
    }
  };

  const template = templates[style]?.[type]?.[lang];
  if (template) return template;

  // Fallback template
  return {
    title: `${getTypeName(type)} - ${getLanguageName(lang)}`,
    content: `${getTypeIcon(type)} **${getTypeName(type)}**\n\nThis is a ${style} ${type} announcement for ${getLanguageName(lang)} speakers.\n\nContent will be customized based on your specific needs and requirements.\n\nThank you for your attention!`
  };
}

// Placeholder functions for features to be implemented
async function showDrafts(bot, chatId, messageId) {
  return bot.editMessageText(`📋 **Drafts Management**\n\nComing soon...`, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'news_main' }]] }
  });
}

async function showScheduled(bot, chatId, messageId) {
  return bot.editMessageText(`📤 **Scheduled Messages**\n\nComing soon...`, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'news_main' }]] }
  });
}

async function showHistory(bot, chatId, messageId) {
  return bot.editMessageText(`📊 **Message History**\n\nComing soon...`, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'news_main' }]] }
  });
}

async function showLanguageStats(bot, chatId, messageId) {
  return bot.editMessageText(`🌍 **Language Statistics**\n\nComing soon...`, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'news_main' }]] }
  });
}

async function showUserSegments(bot, chatId, messageId) {
  return bot.editMessageText(`👥 **User Segments**\n\nComing soon...`, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'news_main' }]] }
  });
}

async function showBroadcastSettings(bot, chatId, messageId) {
  return bot.editMessageText(`⚙️ **Broadcast Settings**\n\nComing soon...`, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'news_main' }]] }
  });
}

// === Missing Handler Functions ===

// === Translate & Preview (write in English, auto-translate before send) ===

async function handleTranslatePreview(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session || !session.content) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Session expired. Please start over.', 
      show_alert: true 
    });
  }

  const targetLang = session.lang;
  if (!targetLang || targetLang === 'en') {
    return bot.answerCallbackQuery(query.id, { 
      text: 'ℹ️ No translation needed for English.', 
      show_alert: false 
    });
  }

  await bot.answerCallbackQuery(query.id, { text: '🔄 Translating...', show_alert: false });

  try {
    // Translate the message content
    const translatedContent = await translationService.translate(session.content, targetLang);
    const translatedTitle = session.title 
      ? await translationService.translate(session.title, targetLang)
      : session.title;
    
    // Store both original and translated versions in session
    session.originalContent = session.originalContent || session.content;
    session.originalTitle = session.originalTitle || session.title;
    session.translatedContent = translatedContent;
    session.translatedTitle = translatedTitle;
    newsSessionManager.updateSession(userId, session);
    
    const userCount = await getUserCountForLanguage(targetLang);

    return bot.editMessageText(
      `🌐 **Translation Preview**\n\n` +
      `🎯 Target: ${getLanguageFlag(targetLang)} ${getLanguageName(targetLang)} (${userCount} users)\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 **Original (English):**\n\n` +
      `${(session.originalContent || session.content).substring(0, 400)}${(session.originalContent || session.content).length > 400 ? '...' : ''}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌍 **Translated (${getLanguageName(targetLang)}):**\n\n` +
      `${translatedContent.substring(0, 800)}${translatedContent.length > 800 ? '...' : ''}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ Review the translation above. Click "Use Translation" to replace the message content with the translated version before sending.`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `✅ Use ${getLanguageName(targetLang)} Translation`, callback_data: `news_use_translated_${session.templateStyle || 'custom'}_${session.type}_${targetLang}` }
          ],
          [
            { text: '📤 Send Translated Now', callback_data: `news_send_translated_${session.templateStyle || 'custom'}_${session.type}_${targetLang}` },
          ],
          [
            { text: '✏️ Edit Original', callback_data: `news_edit_content_${session.templateStyle || 'custom'}_${session.type}_${targetLang}` },
            { text: '🔄 Re-translate', callback_data: `news_translate_preview_${session.templateStyle || 'custom'}_${session.type}_${targetLang}` }
          ],
          [
            { text: '🔙 Back (Keep Original)', callback_data: `news_template_${session.templateStyle || 'custom'}_${session.type}_${targetLang}` }
          ]
        ]
      }
    });
  } catch (error) {
    logger.error('NEWS', `Translation preview failed for user ${userId}`, error);
    return bot.editMessageText(
      `❌ **Translation Failed**\n\n` +
      `Could not translate the message to ${getLanguageName(targetLang)}.\n` +
      `Error: ${error.message}\n\n` +
      `💡 You can still send the original English message, or try again.`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Try Again', callback_data: `news_translate_preview_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` },
            { text: '📤 Send Original', callback_data: `news_send_now_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }
          ],
          [{ text: '🔙 Back', callback_data: `news_template_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }]
        ]
      }
    });
  }
}

async function handleUseTranslated(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session || !session.translatedContent) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ No translation available. Please translate first.', 
      show_alert: true 
    });
  }

  // Replace content with translated version
  session.content = session.translatedContent;
  if (session.translatedTitle) {
    session.title = session.translatedTitle;
  }
  session.isTranslated = true;
  session.action = 'translation_applied';
  newsSessionManager.updateSession(userId, session);
  
  await bot.answerCallbackQuery(query.id, { text: '✅ Translation applied!', show_alert: false });
  
  const userCount = await getUserCountForLanguage(session.lang);
  
  return bot.editMessageText(
    `✅ **Translation Applied**\n\n` +
    `📋 Title: *${session.title}*\n` +
    `🎯 Target: ${getLanguageFlag(session.lang)} ${getLanguageName(session.lang)}\n` +
    `👥 Recipients: **${userCount}** users\n` +
    `🌐 Language: Translated to ${getLanguageName(session.lang)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📄 **Message Content:**\n\n` +
    `${session.content.substring(0, 600)}${session.content.length > 600 ? '...' : ''}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Ready to send the translated message:`, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📤 Send Now', callback_data: `news_send_now_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` },
          { text: '⏰ Schedule', callback_data: `news_schedule_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }
        ],
        [
          { text: '🧪 Test Send', callback_data: `news_test_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` },
          { text: '💾 Save Draft', callback_data: `news_save_draft_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }
        ],
        [
          { text: '🔙 Revert to Original', callback_data: `news_revert_original_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }
        ]
      ]
    }
  });
}

async function handleSendTranslated(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session || !session.translatedContent) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ No translation available. Please translate first.', 
      show_alert: true 
    });
  }
  
  // Apply translation and redirect to send flow
  session.content = session.translatedContent;
  if (session.translatedTitle) session.title = session.translatedTitle;
  session.isTranslated = true;
  newsSessionManager.updateSession(userId, session);
  
  // Redirect to the standard send-now flow
  return await handleSendNow(bot, query, `news_send_now_${session.templateStyle || 'custom'}_${session.type}_${session.lang}`);
}

async function handleRevertOriginal(bot, query, data) {
  const userId = query.from.id;
  const session = newsSessionManager.getSession(userId);
  
  if (!session || !session.originalContent) {
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ No original content found.', 
      show_alert: true 
    });
  }
  
  // Revert to original content
  session.content = session.originalContent;
  if (session.originalTitle) session.title = session.originalTitle;
  session.isTranslated = false;
  session.translatedContent = null;
  session.translatedTitle = null;
  newsSessionManager.updateSession(userId, session);
  
  await bot.answerCallbackQuery(query.id, { text: '🔄 Reverted to original!', show_alert: false });
  
  return bot.editMessageText(
    `🔄 **Reverted to Original**\n\n` +
    `📋 Title: *${session.title}*\n` +
    `📄 Content restored to the original English version.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `${session.content.substring(0, 600)}${session.content.length > 600 ? '...' : ''}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🌐 Translate to ${getLanguageName(session.lang)}`, callback_data: `news_translate_preview_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }
        ],
        [
          { text: '📤 Send Original', callback_data: `news_send_now_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` },
          { text: '✏️ Edit', callback_data: `news_edit_content_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }
        ],
        [{ text: '🔙 Back', callback_data: `news_template_${session.templateStyle || 'custom'}_${session.type}_${session.lang}` }]
      ]
    }
  });
}

async function handleDraftAction(bot, query, data) {
  return bot.answerCallbackQuery(query.id, { 
    text: '📋 Draft management coming soon!', 
    show_alert: false 
  });
}

// === Test Functions to Verify Everything Works ===

export async function testNewsBroadcast(bot, testUserId, testLang = 'en') {
  try {
    const testAnnouncement = {
      id: 999999,
      title: "🧪 Test Broadcast",
      content: "This is a test announcement to verify the broadcasting system is working correctly.\n\n✅ If you receive this message, the system is operational!",
      targetLanguage: testLang,
      createdBy: testUserId
    };
    
    logger.info('NEWS_TEST', 'Starting test broadcast...');
    
    const result = await newsBroadcaster.broadcast(testAnnouncement);
    
    logger.info('NEWS_TEST', `Test broadcast completed: ${result.successCount} sent, ${result.failedCount} failed`);
    
    return result;
  } catch (error) {
    logger.error('NEWS_TEST', 'Test broadcast failed', error);
    throw error;
  }
}
