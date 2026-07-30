// utils/notifyGroup.js - Enhanced admin group notification system
import { ADMIN_GROUP } from '../config.js';
import logger from './logger.js';
import messageTranslator from './messageTranslator.js';

export function notifyGroup(bot, message, options = {}) {
  console.log('[NOTIFY TRACK 1] Starting notifyGroup function');
  
  if (!ADMIN_GROUP) {
    console.log('[NOTIFY TRACK 2] ADMIN_GROUP not configured:', ADMIN_GROUP);
    logger.warn('NOTIFY', 'Admin group not configured, skipping notification');
    return;
  }
  
  console.log('[NOTIFY TRACK 3] ADMIN_GROUP configured:', ADMIN_GROUP);
  console.log('[NOTIFY TRACK 4] Message length:', message.length);
  
  // Enhanced default options for better formatting
  const defaultOptions = {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...options
  };
  
  console.log('[NOTIFY TRACK 5] About to call bot.sendMessage');
  
  bot.sendMessage(ADMIN_GROUP, message, defaultOptions)
    .then(result => {
      console.log('[NOTIFY TRACK 6] Message sent successfully:', result.message_id);
    })
    .catch(err => {
      console.log('[NOTIFY TRACK 7] Error caught:', err.message);
      console.error('[NotifyGroup Error]', err.message);
      logger.error('NOTIFY', 'Group notification failed', err);
      
      // If it's a markdown parsing error, try without markdown
      if (err.message.includes("Can't parse entities") && defaultOptions.parse_mode) {
        console.log('[NOTIFY TRACK 8] Trying fallback without markdown');
        const fallbackOptions = { ...defaultOptions };
        delete fallbackOptions.parse_mode;
        
        bot.sendMessage(ADMIN_GROUP, message, fallbackOptions)
          .then(result => {
            console.log('[NOTIFY TRACK 9] Fallback message sent successfully:', result.message_id);
          })
          .catch(fallbackErr => {
            console.log('[NOTIFY TRACK 10] Fallback also failed:', fallbackErr.message);
            console.error('[NotifyGroup Fallback Error]', fallbackErr.message);
            logger.error('NOTIFY', 'Group notification fallback failed', fallbackErr);
          });
      }
    });
  
  console.log('[NOTIFY TRACK 11] notifyGroup function completed (async)');
}

// Enhanced new user notification with PM link and admin actions
export async function notifyNewUser(bot, userInfo) {
  if (!ADMIN_GROUP) return;
  
  const { userId, firstName, lastName, username, languageCode, joinTime } = userInfo;
  const fullName = `${firstName} ${lastName || ''}`.trim();
  const langInfo = languageCode ? getLanguageInfo(languageCode) : null;
  
  const message = `🎉 **New User Joined!**\n\n` +
    `👤 **Name:** ${fullName}\n` +
    `🔗 **Username:** ${username ? `[@${username}](https://t.me/${username})` : 'No username'}\n` +
    `💬 **Direct PM:** [Send Message](tg://user?id=${userId})\n` +
    `🆔 **Telegram ID:** \`${userId}\`\n` +
    `🌐 **Language:** ${langInfo?.flag || '🌍'} ${langInfo?.name || languageCode || 'Unknown'}\n` +
    `🕒 **Joined:** ${joinTime || new Date().toLocaleString()}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 **Quick Actions:**\n` +
    `• Click "Send PM" to message directly\n` +
    `• Click "View Profile" to see profile\n` +
    `• User is ready to browse products`;

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💬 Send PM', url: `tg://user?id=${userId}` },
          { text: '👤 View Profile', url: username ? `tg://resolve?domain=${username}` : `tg://user?id=${userId}` }
        ],
        [
          { text: '📊 User Analytics', callback_data: `user_analytics_${userId}` },
          { text: '🛡️ Security Check', callback_data: `security_check_${userId}` }
        ]
      ]
    }
  };

  // Send with banner for professional admin notifications
  try {
    await bot.sendPhoto(ADMIN_GROUP, './assets/image.png', {
      caption: message,
      parse_mode: 'Markdown',
      reply_markup: options.reply_markup
    });
    logger.info('NOTIFY', `New user notification with banner sent for user ${userId} (${fullName})`);
  } catch (error) {
    // Fallback to text message if photo fails
    logger.warn('NOTIFY', `Banner failed for new user notification, falling back to text`, error);
    notifyGroup(bot, message, options);
  }
}

// Helper function to get language information
function getLanguageInfo(languageCode) {
  const languages = {
    'en': { name: 'English', flag: '🇺🇸' },
    'ru': { name: 'Russian', flag: '🇷🇺' },
    'zh': { name: 'Chinese', flag: '🇨🇳' },
    'es': { name: 'Spanish', flag: '🇪🇸' },
    'fr': { name: 'French', flag: '🇫🇷' },
    'de': { name: 'German', flag: '🇩🇪' },
    'it': { name: 'Italian', flag: '🇮🇹' },
    'pt': { name: 'Portuguese', flag: '🇵🇹' },
    'pl': { name: 'Polish', flag: '🇵🇱' },
    'tr': { name: 'Turkish', flag: '🇹🇷' },
    'ar': { name: 'Arabic', flag: '🇸🇦' },
    'ja': { name: 'Japanese', flag: '🇯🇵' },
    'ko': { name: 'Korean', flag: '🇰🇷' },
    'hi': { name: 'Hindi', flag: '🇮🇳' },
    'nl': { name: 'Dutch', flag: '🇳🇱' },
    'sv': { name: 'Swedish', flag: '🇸🇪' },
    'no': { name: 'Norwegian', flag: '🇳🇴' },
    'da': { name: 'Danish', flag: '🇩🇰' },
    'fi': { name: 'Finnish', flag: '🇫🇮' },
    'uk': { name: 'Ukrainian', flag: '🇺🇦' }
  };
  
  return languages[languageCode] || { name: languageCode, flag: '🌐' };
}

// Enhanced notification functions for specific events
export function notifyAdminAlert(bot, title, details, severity = 'info') {
  const severityEmoji = {
    'info': 'ℹ️',
    'warning': '⚠️',
    'error': '🚨',
    'success': '✅',
    'critical': '🔴'
  };
  
  const emoji = severityEmoji[severity] || 'ℹ️';
  const timestamp = new Date().toLocaleString();
  
  const message = `${emoji} **System Alert**\n\n` +
    `📋 **${title}**\n` +
    `🔍 Details: ${details}\n` +
    `🕒 Time: ${timestamp}\n` +
    `⚡ Severity: ${severity.toUpperCase()}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;
  
  notifyGroup(bot, message, { parse_mode: 'Markdown' });
}

export function notifyNewOrder(bot, orderData) {
  const { orderId, customer, product, amount, currency, address, time } = orderData;
  
  const message = `🛒 **New Order Received**\n\n` +
    `🧾 **Order ID:** #${orderId}\n` +
    `👤 **Customer:** [${customer.name}](tg://user?id=${customer.id})\n` +
    `📱 **Username:** ${customer.username ? '@' + customer.username : 'No username'}\n` +
    `🛍️ **Product:** ${product.name}\n` +
    `💰 **Amount:** $${amount} (${currency})\n` +
    `📬 **Payment Address:** \`${address}\`\n` +
    `🕒 **Time:** ${time}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 **Next Actions:**\n` +
    `• Monitor for payment confirmation\n` +
    `• Prepare product for delivery\n` +
    `• Update order status when payment received`;
  
  // Send notification without blocking
  notifyGroup(bot, message, { parse_mode: 'Markdown' });
}

export function notifyPaymentReceived(bot, paymentData) {
  console.log('[PAYMENT NOTIFY TRACK 1] notifyPaymentReceived called');
  console.log('[PAYMENT NOTIFY TRACK 2] Payment data:', JSON.stringify(paymentData, null, 2));
  
  const { orderId, customer, product, amount, currency, txId, time } = paymentData;
  
  console.log('[PAYMENT NOTIFY TRACK 3] Extracted data:', {
    orderId, customerName: customer?.name, product, amount, currency
  });
  
  const message = `💰 **Payment Received**\n\n` +
    `🧾 **Order ID:** #${orderId}\n` +
    `👤 **Customer:** [${customer.name}](tg://user?id=${customer.id})\n` +
    `📱 **Username:** ${customer.username ? '@' + customer.username : 'No username'}\n` +
    `🛍️ **Product:** ${product}\n` +
    `💵 **Amount:** $${amount} (${currency})\n` +
    `🔗 **Transaction ID:** \`${txId || 'Manual confirmation'}\`\n` +
    `🕒 **Time:** ${time}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 **Action Required:**\n` +
    `✅ Confirm payment and deliver product\n` +
    `📦 Upload product files or details`;
  
  console.log('[PAYMENT NOTIFY TRACK 4] Message created, length:', message.length);
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Confirm & Deliver', callback_data: `admin_confirm_${orderId}_${customer.id}` },
        { text: '❌ Reject Payment', callback_data: `admin_cancel_${orderId}_${customer.id}` }
      ]
    ]
  };
  
  console.log('[PAYMENT NOTIFY TRACK 5] About to call notifyGroup');
  
  // Send notification without blocking
  notifyGroup(bot, message, { 
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
  
  console.log('[PAYMENT NOTIFY TRACK 6] notifyGroup called, function complete');
}

export function notifySystemStatus(bot, statusData) {
  const { uptime, users, orders, revenue, health } = statusData;
  
  const healthEmoji = health >= 95 ? '🟢' : health >= 80 ? '🟡' : '🔴';
  const healthStatus = health >= 95 ? 'Excellent' : health >= 80 ? 'Good' : 'Critical';
  
  const message = `📊 **System Status Report**\n\n` +
    `${healthEmoji} **Overall Health:** ${healthStatus} (${health}%)\n` +
    `⏱️ **Uptime:** ${uptime}\n` +
    `👥 **Active Users:** ${users.active}/${users.total}\n` +
    `🛒 **Orders Today:** ${orders.today} (${orders.pending} pending)\n` +
    `💰 **Revenue (24h):** $${revenue}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔄 **Auto-generated:** ${new Date().toLocaleString()}\n` +
    `📡 **Monitoring:** Active`;
  
  notifyGroup(bot, message, { parse_mode: 'Markdown' });
}

export function notifyError(bot, errorData) {
  const { component, error, severity, time, context } = errorData;
  
  const message = `🚨 **System Error**\n\n` +
    `🔧 **Component:** ${component}\n` +
    `❌ **Error:** \`${error}\`\n` +
    `⚡ **Severity:** ${severity}\n` +
    `📍 **Context:** ${context || 'N/A'}\n` +
    `🕒 **Time:** ${time}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ **Administrator attention required**`;
  
  notifyGroup(bot, message, { parse_mode: 'Markdown' });
}

export function notifyUserActivity(bot, activityData) {
  const { type, user, details, time } = activityData;
  
  const typeEmoji = {
    'registration': '🆕',
    'purchase': '🛒',
    'language_change': '🌍',
    'suspicious': '⚠️',
    'banned': '🚫'
  };
  
  const emoji = typeEmoji[type] || '📊';
  
  const message = `${emoji} **User Activity**\n\n` +
    `👤 **User:** [${user.name}](tg://user?id=${user.id})\n` +
    `📱 **Username:** ${user.username ? '@' + user.username : 'No username'}\n` +
    `🎯 **Activity:** ${type.replace('_', ' ').toUpperCase()}\n` +
    `📋 **Details:** ${details}\n` +
    `🕒 **Time:** ${time}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;
  
  notifyGroup(bot, message, { parse_mode: 'Markdown' });
}
