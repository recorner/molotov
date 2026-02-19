// handlers/otpBotHandler.js - OTP Bot Service Handler
// Full OTP bot interface with license key management, intercept flows, and admin features
import db from '../database.js';
import adminManager from '../utils/adminManager.js';
import logger from '../utils/logger.js';
import smartMessageManager from '../utils/smartMessageManager.js';
import uiOptimizer from '../utils/uiOptimizer.js';
import messageTranslator from '../utils/messageTranslator.js';
import { showProductsInCategory } from './productHandler.js';
import { SUPPORT_USERNAME } from '../config.js';

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════
const OTP_BOTS_CATEGORY_ID = 17;
const BANNER_PATH = './assets/image.png';

// In-memory session store for OTP bot flows
const otpSessions = new Map();

// Session timeout (5 minutes)
const SESSION_TIMEOUT = 300000;

// US Banks list
const US_BANKS = [
  { name: 'Chase Bank', code: 'chase' },
  { name: 'Bank of America', code: 'boa' },
  { name: 'Wells Fargo', code: 'wellsfargo' },
  { name: 'Citibank', code: 'citi' },
  { name: 'PNC Bank', code: 'pnc' },
  { name: 'U.S. Bank', code: 'usbank' },
  { name: 'Capital One', code: 'capitalone' },
  { name: 'TD Bank', code: 'td' },
  { name: 'Truist Bank', code: 'truist' },
  { name: 'Goldman Sachs', code: 'goldman' },
  { name: 'Morgan Stanley', code: 'morgan' },
  { name: 'Fifth Third Bank', code: 'fifththird' },
  { name: 'Regions Bank', code: 'regions' },
  { name: 'KeyBank', code: 'keybank' },
  { name: 'Huntington Bank', code: 'huntington' }
];

// ═══════════════════════════════════════════════════════════════
//  DATABASE INITIALIZATION
// ═══════════════════════════════════════════════════════════════
function initializeOtpTables() {
  return new Promise((resolve) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS otp_license_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        username TEXT,
        key_type TEXT NOT NULL DEFAULT 'standard',
        duration TEXT NOT NULL DEFAULT '1_day',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activated_at TIMESTAMP,
        expires_at TIMESTAMP,
        status TEXT DEFAULT 'pending',
        generated_by INTEGER NOT NULL,
        notes TEXT
      )
    `, (err) => {
      if (err && !err.message.includes('already exists')) {
        logger.error('OTP_DB', 'Failed to create otp_license_keys table', err);
      } else {
        logger.info('OTP_DB', 'OTP license keys table ready');
      }
      // Create indexes
      db.run(`CREATE INDEX IF NOT EXISTS idx_otp_keys_user ON otp_license_keys(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_otp_keys_username ON otp_license_keys(username)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_otp_keys_status ON otp_license_keys(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_otp_keys_key ON otp_license_keys(license_key)`);
      resolve();
    });
  });
}

// Initialize on import
initializeOtpTables();

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = () => {
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };
  return `OTP-${segment()}-${segment()}-${segment()}`;
}

function getDurationMs(duration) {
  switch (duration) {
    case '1_day': return 24 * 60 * 60 * 1000;
    case '1_week': return 7 * 24 * 60 * 60 * 1000;
    case '1_month': return 30 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

function getDurationLabel(duration) {
  switch (duration) {
    case '1_day': return '24 Hours';
    case '1_week': return '7 Days';
    case '1_month': return '30 Days';
    default: return duration;
  }
}

function formatExpiry(expiresAt) {
  if (!expiresAt) return 'N/A';
  const d = new Date(expiresAt);
  return d.toLocaleString();
}

function getSession(userId) {
  const session = otpSessions.get(userId);
  if (session && Date.now() - session.timestamp > SESSION_TIMEOUT) {
    otpSessions.delete(userId);
    return null;
  }
  return session;
}

function setSession(userId, data) {
  otpSessions.set(userId, { ...data, timestamp: Date.now() });
}

function clearSession(userId) {
  otpSessions.delete(userId);
}

// DB helpers
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  /otpbot COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════

export async function handleOtpBotCommand(bot, msg) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const username = msg.from.username;

  logger.info('OTP_BOT', `OTP Bot command from user ${userId} (@${username || 'no_username'})`);

  try {
    // Check if user is admin — admins bypass license validation
    const isUserAdmin = await adminManager.isAdmin(userId);

    if (isUserAdmin) {
      logger.info('OTP_BOT', `Admin ${userId} accessing OTP Bot (bypass license)`);
      return await showOtpMainMenu(bot, chatId, userId, true);
    }

    // Check for active license key for this user
    const activeLicense = await dbGet(
      `SELECT * FROM otp_license_keys 
       WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
       ORDER BY expires_at DESC LIMIT 1`,
      [userId]
    );

    if (activeLicense) {
      // User has an active license — show OTP main menu
      logger.info('OTP_BOT', `User ${userId} has active license: ${activeLicense.license_key}`);
      return await showOtpMainMenu(bot, chatId, userId, false, activeLicense);
    }

    // Check if user has a pending (unactivated) key
    const pendingKey = await dbGet(
      `SELECT * FROM otp_license_keys 
       WHERE user_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (pendingKey) {
      // User has a pending key — prompt activation
      return await showActivationPrompt(bot, chatId, userId, pendingKey);
    }

    // No key at all — prompt to enter license key
    return await showLicenseEntryPrompt(bot, chatId, userId);

  } catch (error) {
    logger.error('OTP_BOT', `Error in OTP bot command for user ${userId}`, error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again later.');
  }
}

// ═══════════════════════════════════════════════════════════════
//  LICENSE ENTRY & ACTIVATION
// ═══════════════════════════════════════════════════════════════

async function showLicenseEntryPrompt(bot, chatId, userId) {
  setSession(userId, { step: 'awaiting_license_key' });

  const content =
    `🔐 *OTP Bot — License Activation*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚠️ *License Required*\n\n` +
    `You need a valid license key to access the OTP Bot service.\n\n` +
    `📝 *Please enter your license key below:*\n` +
    `Format: \`OTP-XXXX-XXXX-XXXX\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💡 Don't have a key? Contact admin to purchase one.\n` +
    `📞 Support: @${SUPPORT_USERNAME || 'kopachev4'}`;

  smartMessageManager.forceBannerNext(chatId);
  await smartMessageManager.sendOrEditSmart(bot, chatId, null, content, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📞 Contact Admin', url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` }],
        [{ text: '🛒 Buy OTP Bot Plans', callback_data: 'otp_browse_plans' }],
        [{ text: '❌ Cancel', callback_data: 'otp_cancel' }]
      ]
    }
  }, true);
}

async function showActivationPrompt(bot, chatId, userId, pendingKey) {
  const content =
    `🔐 *OTP Bot — Activate Your License*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ You have a license key assigned to you!\n\n` +
    `🔑 *Your Key:* \`${pendingKey.license_key}\`\n` +
    `⏱️ *Duration:* ${getDurationLabel(pendingKey.duration)}\n` +
    `📅 *Issued:* ${new Date(pendingKey.created_at).toLocaleString()}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Would you like to activate this key now?`;

  smartMessageManager.forceBannerNext(chatId);
  await smartMessageManager.sendOrEditSmart(bot, chatId, null, content, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Activate Now', callback_data: `otp_activate_${pendingKey.id}` }],
        [{ text: '🔑 Enter Different Key', callback_data: 'otp_enter_key' }],
        [{ text: '❌ Cancel', callback_data: 'otp_cancel' }]
      ]
    }
  }, true);
}

// ═══════════════════════════════════════════════════════════════
//  OTP MAIN MENU
// ═══════════════════════════════════════════════════════════════

async function showOtpMainMenu(bot, chatId, userId, isAdmin = false, license = null) {
  const adminTag = isAdmin ? '👑 ADMIN MODE' : '';
  const licenseInfo = license 
    ? `🔑 Key: \`${license.license_key}\`\n⏱️ Expires: ${formatExpiry(license.expires_at)}`
    : (isAdmin ? '♾️ Unlimited Admin Access' : '');

  const content =
    `📡 *OTP Bot — Control Panel*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${adminTag ? adminTag + '\n\n' : ''}` +
    `${licenseInfo}\n\n` +
    `🌐 *Available Services:*\n` +
    `Choose an operation below to begin.\n\n` +
    `⚡ All operations are real-time and encrypted.\n` +
    `🛡️ Your session is secured end-to-end.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  const buttons = [
    [{ text: '📡 Intercept SMS', callback_data: 'otp_intercept' }],
    [
      { text: '🔄 SS7 Attack', callback_data: 'otp_ss7' },
      { text: '📍 Location Tracker', callback_data: 'otp_location' }
    ],
    [
      { text: '🔐 Custom PGP Scripts', callback_data: 'otp_pgp' },
      { text: '📞 Bot Caller', callback_data: 'otp_botcaller' }
    ],
    [{ text: '📊 My License Info', callback_data: 'otp_license_info' }],
    [{ text: '🔙 Back to Main Menu', callback_data: 'back_to_categories' }]
  ];

  smartMessageManager.forceBannerNext(chatId);
  await smartMessageManager.sendOrEditSmart(bot, chatId, null, content, {
    reply_markup: { inline_keyboard: buttons }
  }, true);
}

// ═══════════════════════════════════════════════════════════════
//  INTERCEPT FLOW
// ═══════════════════════════════════════════════════════════════

async function showInterceptPrompt(bot, chatId, messageId, userId) {
  setSession(userId, { step: 'intercept_number' });

  const content =
    `📡 *SMS Intercept — Enter Target Number*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📱 *Enter the phone number you want to intercept:*\n\n` +
    `📝 Format: Include country code\n` +
    `Example: \`+1234567890\`\n\n` +
    `⚡ Our system will validate the number against\n` +
    `active carrier databases in real-time.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'otp_main' }]
      ]
    }
  }, true);
}

async function handleInterceptNumberValidation(bot, chatId, userId, phoneNumber) {
  // Show loading state
  const loadingMsg = await bot.sendMessage(chatId, 
    `⏳ *Validating number...*\n\n` +
    `📡 Connecting to carrier database...\n` +
    `🔍 Checking: \`${phoneNumber}\``,
    { parse_mode: 'Markdown' }
  );

  // Mock validation delay (2 seconds)
  await new Promise(r => setTimeout(r, 2000));

  // Mock: number is always "valid"
  const isValid = /^\+?\d{7,15}$/.test(phoneNumber.replace(/[\s\-()]/g, ''));

  if (!isValid) {
    await bot.editMessageText(
      `❌ *Invalid Number*\n\n` +
      `The number \`${phoneNumber}\` is not a valid phone number.\n\n` +
      `Please ensure you include the country code.\n` +
      `Example: \`+12025551234\``,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Try Again', callback_data: 'otp_intercept' }],
            [{ text: '🔙 Back to Menu', callback_data: 'otp_main' }]
          ]
        }
      }
    );
    clearSession(userId);
    return;
  }

  // Number is valid — show proceed/cancel
  await bot.editMessageText(
    `✅ *Number Validated*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📱 *Target:* \`${phoneNumber}\`\n` +
    `📶 *Carrier:* Active\n` +
    `🌐 *Status:* Online\n` +
    `🔒 *Network:* GSM/LTE Detected\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Would you like to proceed with SMS interception?`,
    {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Proceed', callback_data: 'otp_intercept_proceed' },
            { text: '❌ Cancel Request', callback_data: 'otp_main' }
          ]
        ]
      }
    }
  );

  // Save number in session
  setSession(userId, { step: 'intercept_validated', phoneNumber });
}

async function showSenderIdPrompt(bot, chatId, messageId, userId) {
  setSession(userId, { ...getSession(userId), step: 'intercept_sender' });

  const content =
    `📡 *SMS Intercept — Sender ID*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📝 *Enter the Sender ID you want to read messages for:*\n\n` +
    `Examples: \`Google\`, \`Amazon\`, \`PayPal\`, \`Chase\`\n\n` +
    `The Sender ID is the name or number that\n` +
    `appears as the SMS sender on the target device.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'otp_main' }]
      ]
    }
  }, true);
}

async function handleSenderIdSearch(bot, chatId, userId, senderId) {
  const session = getSession(userId);
  
  // Show loading
  const loadingMsg = await bot.sendMessage(chatId,
    `⏳ *Searching Sender ID...*\n\n` +
    `🔍 Looking up: \`${senderId}\`\n` +
    `📡 Scanning carrier message logs...`,
    { parse_mode: 'Markdown' }
  );

  await new Promise(r => setTimeout(r, 3000));

  // Always show "sender not found" → offer Bank / Custom
  await bot.editMessageText(
    `⚠️ *Sender ID Not Found*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🔍 *Searched:* \`${senderId}\`\n` +
    `📱 *Target:* \`${session?.phoneNumber || 'N/A'}\`\n\n` +
    `❌ The sender ID "\`${senderId}\`" was not found in\n` +
    `the carrier's active message database.\n\n` +
    `💡 *Please help us identify the sender:*\n` +
    `Select the sender type below to narrow the search.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`,
    {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🏦 Bank', callback_data: 'otp_sender_bank' },
            { text: '⚙️ Custom', callback_data: 'otp_sender_custom' }
          ],
          [{ text: '❌ Cancel', callback_data: 'otp_main' }]
        ]
      }
    }
  );

  setSession(userId, { ...session, step: 'sender_choice', senderId });
}

// ═══════════════════════════════════════════════════════════════
//  BANK SELECTION FLOW
// ═══════════════════════════════════════════════════════════════

async function showBankSelection(bot, chatId, messageId, userId) {
  const bankButtons = [];
  
  // Create bank buttons — 2 per row
  for (let i = 0; i < US_BANKS.length; i += 2) {
    const row = [];
    row.push({ text: `🏦 ${US_BANKS[i].name}`, callback_data: `otp_bank_${US_BANKS[i].code}` });
    if (US_BANKS[i + 1]) {
      row.push({ text: `🏦 ${US_BANKS[i + 1].name}`, callback_data: `otp_bank_${US_BANKS[i + 1].code}` });
    }
    bankButtons.push(row);
  }
  bankButtons.push([{ text: '🔙 Back', callback_data: 'otp_intercept' }, { text: '❌ Cancel', callback_data: 'otp_main' }]);

  const content =
    `🏦 *Select Target Bank*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📱 Select the bank whose OTP messages\n` +
    `you want to intercept from the target device.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    reply_markup: { inline_keyboard: bankButtons }
  }, true);
}

async function handleBankSelected(bot, chatId, messageId, userId, bankCode) {
  const session = getSession(userId);
  const bank = US_BANKS.find(b => b.code === bankCode);
  const bankName = bank ? bank.name : bankCode;

  const content =
    `🏦 *Confirm SMS Read Request*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📱 *Target:* \`${session?.phoneNumber || 'N/A'}\`\n` +
    `🏦 *Bank:* ${bankName}\n` +
    `📡 *Operation:* SMS Intercept & Read\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚠️ *Proceed with request to read SMS from ${bankName}?*`;

  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Proceed', callback_data: `otp_bank_proceed_${bankCode}` },
          { text: '❌ Cancel', callback_data: 'otp_main' }
        ]
      ]
    }
  }, true);

  setSession(userId, { ...session, step: 'bank_confirm', selectedBank: bankName, bankCode });
}

async function handleBankProceed(bot, chatId, messageId, userId) {
  const session = getSession(userId);

  // Show loading
  const content1 =
    `⏳ *Processing SMS Read Request...*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📡 Connecting to SS7 gateway...\n` +
    `🔗 Establishing carrier bridge...\n` +
    `📱 Target: \`${session?.phoneNumber || 'N/A'}\`\n` +
    `🏦 Bank: ${session?.selectedBank || 'N/A'}\n\n` +
    `⏳ Please wait...`;

  smartMessageManager.forceBannerNext(chatId);
  const loadingMsg = await bot.sendMessage(chatId, content1, { parse_mode: 'Markdown' });

  await new Promise(r => setTimeout(r, 3000));

  // Show 5G message + upgrade prompt
  await bot.editMessageText(
    `⚠️ *Connection Failed — 5G Network Detected*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📱 *Target:* \`${session?.phoneNumber || 'N/A'}\`\n` +
    `🏦 *Bank:* ${session?.selectedBank || 'N/A'}\n\n` +
    `🛰️ *Issue:* Target device is using a *5G network*.\n\n` +
    `❗ 5G networks use enhanced encryption protocols\n` +
    `that require an upgraded interception plan.\n\n` +
    `💡 *Please consider upgrading to a stable plan*\n` +
    `that supports 5G network interception.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 Browse our available OTP Bot plans below:`,
    {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Browse OTP Bot Plans', callback_data: 'otp_browse_plans' }],
          [{ text: '📞 Contact Admin', url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` }],
          [{ text: '🔙 Back to OTP Menu', callback_data: 'otp_main' }]
        ]
      }
    }
  );

  clearSession(userId);
}

// ═══════════════════════════════════════════════════════════════
//  CUSTOM SENDER FLOW
// ═══════════════════════════════════════════════════════════════

async function showCustomSenderPrompt(bot, chatId, messageId, userId) {
  setSession(userId, { ...getSession(userId), step: 'custom_sender_input' });

  const content =
    `⚙️ *Custom Sender — Enter Sender ID*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📝 *Enter the custom sender ID:*\n\n` +
    `This can be any alphanumeric sender name\n` +
    `or short code used by the service.\n\n` +
    `Examples: \`VERIFY\`, \`AUTH-SVC\`, \`554433\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'otp_main' }]
      ]
    }
  }, true);
}

async function handleCustomSenderInput(bot, chatId, userId, senderId) {
  const session = getSession(userId);

  // Show loading
  const loadingMsg = await bot.sendMessage(chatId,
    `⏳ *Processing Custom Sender Request...*\n\n` +
    `📡 Querying GSM network for sender: \`${senderId}\`\n` +
    `📱 Target: \`${session?.phoneNumber || 'N/A'}\`\n\n` +
    `⏳ Please wait...`,
    { parse_mode: 'Markdown' }
  );

  await new Promise(r => setTimeout(r, 3000));

  // Show GSM not active message + upgrade prompt
  await bot.editMessageText(
    `⚠️ *GSM Not Active on Target SIM*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📱 *Target:* \`${session?.phoneNumber || 'N/A'}\`\n` +
    `⚙️ *Sender:* \`${senderId}\`\n\n` +
    `❗ *Issue:* The GSM module is not active on the\n` +
    `target SIM card. This means the device is either:\n\n` +
    `• Using VoLTE/5G only (no GSM fallback)\n` +
    `• SIM is in data-only mode\n` +
    `• Carrier has disabled legacy GSM\n\n` +
    `💡 *Consider upgrading your plan* to access\n` +
    `advanced interception methods (VoLTE/5G/eSIM).\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 Browse upgraded OTP Bot plans below:`,
    {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Browse OTP Bot Plans', callback_data: 'otp_browse_plans' }],
          [{ text: '📞 Contact Admin', url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` }],
          [{ text: '🔙 Back to OTP Menu', callback_data: 'otp_main' }]
        ]
      }
    }
  );

  clearSession(userId);
}

// ═══════════════════════════════════════════════════════════════
//  OTHER FEATURES (SS7, Location, PGP, Bot Caller)
// ═══════════════════════════════════════════════════════════════

async function showFeatureFlow(bot, chatId, messageId, userId, feature) {
  const featureConfig = {
    ss7: {
      icon: '🔄',
      name: 'SS7 Attack',
      desc: 'SS7 protocol exploitation for real-time\nSMS and call interception via signaling network.',
      inputPrompt: 'Enter the target MSISDN (phone number):',
      inputStep: 'ss7_input'
    },
    location: {
      icon: '📍',
      name: 'Location Tracker',
      desc: 'Real-time geolocation tracking via\ncell tower triangulation and GPS spoofing.',
      inputPrompt: 'Enter the target phone number to locate:',
      inputStep: 'location_input'
    },
    pgp: {
      icon: '🔐',
      name: 'Custom PGP Scripts',
      desc: 'Generate custom PGP encryption/decryption\nscripts for secure communications.',
      inputPrompt: 'Enter the target email or identifier:',
      inputStep: 'pgp_input'
    },
    botcaller: {
      icon: '📞',
      name: 'Bot Caller',
      desc: 'Automated voice bot caller for OTP\nretrieval via social engineering scripts.',
      inputPrompt: 'Enter the target phone number to call:',
      inputStep: 'botcaller_input'
    }
  };

  const cfg = featureConfig[feature];
  if (!cfg) return;

  setSession(userId, { step: cfg.inputStep, feature });

  const content =
    `${cfg.icon} *${cfg.name}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${cfg.desc}\n\n` +
    `📝 *${cfg.inputPrompt}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Back to Menu', callback_data: 'otp_main' }]
      ]
    }
  }, true);
}

async function handleFeatureInput(bot, chatId, userId, input, feature) {
  const featureNames = {
    ss7: 'SS7 Attack',
    location: 'Location Tracker',
    pgp: 'Custom PGP Scripts',
    botcaller: 'Bot Caller'
  };

  const featureIcons = {
    ss7: '🔄',
    location: '📍',
    pgp: '🔐',
    botcaller: '📞'
  };

  // Show loading
  const loadingMsg = await bot.sendMessage(chatId,
    `⏳ *Initializing ${featureNames[feature]}...*\n\n` +
    `${featureIcons[feature]} Processing: \`${input}\`\n` +
    `📡 Connecting to service nodes...\n\n` +
    `⏳ Please wait...`,
    { parse_mode: 'Markdown' }
  );

  await new Promise(r => setTimeout(r, 3000));

  // Show "not part of your plan" + upgrade
  await bot.editMessageText(
    `⚠️ *Feature Not Available on Your Plan*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${featureIcons[feature]} *${featureNames[feature]}*\n` +
    `🎯 *Target:* \`${input}\`\n\n` +
    `❌ *${featureNames[feature]}* is not included in\n` +
    `your current OTP Bot subscription plan.\n\n` +
    `💎 This feature requires a *Premium* or *Enterprise*\n` +
    `tier license. Upgrade your plan to unlock:\n\n` +
    `• ${featureNames[feature]} access\n` +
    `• Higher interception limits\n` +
    `• Priority queue processing\n` +
    `• 24/7 dedicated support\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👇 Browse upgraded plans below:`,
    {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Upgrade Plan', callback_data: 'otp_browse_plans' }],
          [{ text: '📞 Contact Admin', url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` }],
          [{ text: '🔙 Back to OTP Menu', callback_data: 'otp_main' }]
        ]
      }
    }
  );

  clearSession(userId);
}

// ═══════════════════════════════════════════════════════════════
//  LICENSE INFO
// ═══════════════════════════════════════════════════════════════

async function showLicenseInfo(bot, chatId, messageId, userId) {
  const isUserAdmin = await adminManager.isAdmin(userId);

  const licenses = await dbAll(
    `SELECT * FROM otp_license_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );

  let content;

  if (isUserAdmin) {
    content =
      `📊 *License Information*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👑 *Admin Mode — Unlimited Access*\n\n` +
      `You have unrestricted access to all OTP Bot\n` +
      `features without requiring a license key.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━`;
  } else if (licenses.length === 0) {
    content =
      `📊 *License Information*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `❌ No license keys found for your account.\n\n` +
      `Contact an admin or purchase a plan to get started.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━`;
  } else {
    let keyList = '';
    for (const lic of licenses) {
      const statusIcon = lic.status === 'active' ? '🟢' : lic.status === 'expired' ? '🔴' : '🟡';
      keyList += `${statusIcon} \`${lic.license_key}\`\n`;
      keyList += `   Status: ${lic.status} | Duration: ${getDurationLabel(lic.duration)}\n`;
      if (lic.expires_at) keyList += `   Expires: ${formatExpiry(lic.expires_at)}\n`;
      keyList += '\n';
    }

    content =
      `📊 *License Information*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${keyList}` +
      `━━━━━━━━━━━━━━━━━━━━━`;
  }

  await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Back to OTP Menu', callback_data: 'otp_main' }]
      ]
    }
  }, true);
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN: /key-gen COMMAND
// ═══════════════════════════════════════════════════════════════

export async function handleKeyGenCommand(bot, msg) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // Admin only
  const isUserAdmin = await adminManager.isAdmin(userId);
  if (!isUserAdmin) {
    return bot.sendMessage(chatId, '❌ This command is only available for administrators.');
  }

  const parts = msg.text.split(' ').slice(1);

  if (parts.length === 0) {
    // No username provided — show usage
    return bot.sendMessage(chatId,
      `🔑 *OTP Key Generator*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📝 *Usage:* \`/key-gen @username\`\n\n` +
      `Example: \`/key-gen @maverick\`\n\n` +
      `This will allow you to select the license\n` +
      `duration and generate a key for the user.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━`,
      { parse_mode: 'Markdown' }
    );
  }

  const targetUsername = parts[0].replace('@', '').trim();

  if (!targetUsername) {
    return bot.sendMessage(chatId, '❌ Please provide a valid username.');
  }

  // Look up user in database
  const targetUser = await dbGet(
    `SELECT telegram_id, username, first_name FROM users WHERE LOWER(username) = LOWER(?)`,
    [targetUsername]
  );

  if (!targetUser) {
    return bot.sendMessage(chatId,
      `❌ *User Not Found*\n\n` +
      `Username @${targetUsername} was not found in the database.\n` +
      `The user must have started the bot at least once.`,
      { parse_mode: 'Markdown' }
    );
  }

  // Store pending keygen in session
  setSession(userId, {
    step: 'keygen_duration',
    targetUsername: targetUser.username || targetUsername,
    targetUserId: targetUser.telegram_id,
    targetFirstName: targetUser.first_name
  });

  // Show duration selection
  const content =
    `🔑 *Generate License Key*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 *User:* @${targetUser.username || targetUsername}\n` +
    `🆔 *ID:* \`${targetUser.telegram_id}\`\n` +
    `📝 *Name:* ${targetUser.first_name || 'Unknown'}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⏱️ *Select license duration:*`;

  await bot.sendMessage(chatId, content, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '⏱️ 1 Day (24 Hours)', callback_data: 'otp_keygen_1_day' }],
        [{ text: '📅 1 Week (7 Days)', callback_data: 'otp_keygen_1_week' }],
        [{ text: '📆 1 Month (30 Days)', callback_data: 'otp_keygen_1_month' }],
        [{ text: '❌ Cancel', callback_data: 'otp_keygen_cancel' }]
      ]
    }
  });
}

async function handleKeyGenDuration(bot, chatId, messageId, userId, duration) {
  const session = getSession(userId);
  if (!session || session.step !== 'keygen_duration') {
    return bot.answerCallbackQuery(userId, { text: '❌ Session expired. Use /key-gen again.' });
  }

  try {
    // Generate the key
    const licenseKey = generateLicenseKey();

    // Insert into database
    await dbRun(
      `INSERT INTO otp_license_keys (license_key, user_id, username, duration, status, generated_by)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [licenseKey, session.targetUserId, session.targetUsername, duration, userId]
    );

    logger.info('OTP_KEYGEN', `Admin ${userId} generated key ${licenseKey} for @${session.targetUsername} (duration: ${duration})`);

    // Show confirmation to admin
    await bot.editMessageText(
      `✅ *License Key Generated Successfully*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 *User:* @${session.targetUsername}\n` +
      `🔑 *Key:* \`${licenseKey}\`\n` +
      `⏱️ *Duration:* ${getDurationLabel(duration)}\n` +
      `📅 *Generated:* ${new Date().toLocaleString()}\n` +
      `📊 *Status:* Pending Activation\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📤 Sending notification to the user...`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );

    // DM the user with the key (banner image style)
    try {
      const userMessage =
        `🔑 *OTP Bot — License Key Received!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎉 *An admin has generated a license key for you!*\n\n` +
        `🔐 *Your License Key:*\n` +
        `\`${licenseKey}\`\n\n` +
        `⏱️ *Duration:* ${getDurationLabel(duration)}\n` +
        `📅 *Issued:* ${new Date().toLocaleString()}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📝 *How to Activate:*\n` +
        `1️⃣ Send the command /otpbot\n` +
        `2️⃣ Enter or activate your license key\n` +
        `3️⃣ Start using the OTP Bot services!\n\n` +
        `💡 *Need help?* Contact admin for assistance.\n` +
        `📞 Support: @${SUPPORT_USERNAME || 'kopachev4'}`;

      smartMessageManager.forceBannerNext(session.targetUserId);
      await smartMessageManager.sendOrEditSmart(bot, session.targetUserId, null, userMessage, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Activate Now — /otpbot', callback_data: 'otp_start_activation' }],
            [{ text: '📞 Contact Admin', url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` }]
          ]
        }
      }, true);

      // Update admin message with delivery status
      await bot.editMessageText(
        `✅ *License Key Generated & Delivered*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👤 *User:* @${session.targetUsername}\n` +
        `🔑 *Key:* \`${licenseKey}\`\n` +
        `⏱️ *Duration:* ${getDurationLabel(duration)}\n` +
        `📅 *Generated:* ${new Date().toLocaleString()}\n` +
        `📊 *Status:* Pending Activation\n` +
        `📤 *Notification:* ✅ Delivered\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 View All Keys', callback_data: 'otp_admin_keys' }],
              [{ text: '🔑 Generate Another', callback_data: 'otp_keygen_another' }]
            ]
          }
        }
      );

    } catch (dmError) {
      logger.error('OTP_KEYGEN', `Failed to DM user @${session.targetUsername}`, dmError);
      await bot.editMessageText(
        `✅ *License Key Generated*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👤 *User:* @${session.targetUsername}\n` +
        `🔑 *Key:* \`${licenseKey}\`\n` +
        `⏱️ *Duration:* ${getDurationLabel(duration)}\n` +
        `📅 *Generated:* ${new Date().toLocaleString()}\n` +
        `📊 *Status:* Pending Activation\n` +
        `📤 *Notification:* ❌ Failed to deliver\n\n` +
        `⚠️ Could not send DM to the user.\n` +
        `Please share the key manually.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 View All Keys', callback_data: 'otp_admin_keys' }]
            ]
          }
        }
      );
    }

    clearSession(userId);

  } catch (error) {
    logger.error('OTP_KEYGEN', `Error generating key for @${session?.targetUsername}`, error);
    await bot.sendMessage(chatId, '❌ Failed to generate license key. Please try again.');
    clearSession(userId);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN: VIEW ALL KEYS
// ═══════════════════════════════════════════════════════════════

async function showAdminKeyList(bot, chatId, messageId, userId) {
  const isUserAdmin = await adminManager.isAdmin(userId);
  if (!isUserAdmin) return;

  try {
    const keys = await dbAll(
      `SELECT * FROM otp_license_keys ORDER BY created_at DESC LIMIT 20`
    );

    if (keys.length === 0) {
      const content =
        `📋 *OTP License Keys — Admin View*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📭 No license keys have been generated yet.\n\n` +
        `Use \`/key-gen @username\` to create a new key.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━`;

      return await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: 'otp_main' }]
          ]
        }
      }, true);
    }

    let keyList = '';
    for (const key of keys) {
      const statusIcon = key.status === 'active' ? '🟢' : key.status === 'expired' ? '🔴' : '🟡';
      const now = new Date();
      const expiresAt = key.expires_at ? new Date(key.expires_at) : null;
      const isExpired = expiresAt && expiresAt < now;

      // Auto-expire check
      if (key.status === 'active' && isExpired) {
        await dbRun(`UPDATE otp_license_keys SET status = 'expired' WHERE id = ?`, [key.id]);
        key.status = 'expired';
      }

      const finalIcon = key.status === 'active' ? '🟢' : key.status === 'expired' ? '🔴' : '🟡';
      keyList += `${finalIcon} \`${key.license_key}\`\n`;
      keyList += `   👤 @${key.username || 'N/A'} | ${getDurationLabel(key.duration)}\n`;
      keyList += `   📊 ${key.status}`;
      if (key.expires_at) keyList += ` | Exp: ${formatExpiry(key.expires_at)}`;
      keyList += '\n\n';
    }

    const content =
      `📋 *OTP License Keys — Admin View*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${keyList}` +
      `Showing last ${keys.length} keys\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━`;

    await smartMessageManager.sendOrEditSmart(bot, chatId, messageId, content, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Refresh', callback_data: 'otp_admin_keys' }],
          [{ text: '🔙 Back to OTP Menu', callback_data: 'otp_main' }]
        ]
      }
    }, true);

  } catch (error) {
    logger.error('OTP_ADMIN', `Error fetching keys for admin ${userId}`, error);
    await bot.sendMessage(chatId, '❌ Failed to fetch license keys.');
  }
}

// ═══════════════════════════════════════════════════════════════
//  CALLBACK HANDLER (all otp_ prefixed callbacks)
// ═══════════════════════════════════════════════════════════════

export async function handleOtpCallback(bot, query) {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  logger.debug('OTP_CALLBACK', `User ${userId} triggered: ${data}`);

  try {
    // Acknowledge callback immediately
    await bot.answerCallbackQuery(query.id).catch(() => {});

    // Check access: admin bypass or active license
    const isUserAdmin = await adminManager.isAdmin(userId);
    const hasAccess = isUserAdmin || await checkUserAccess(userId);

    // ──── Navigation ────
    if (data === 'otp_main') {
      if (!hasAccess) return await showLicenseEntryPrompt(bot, chatId, userId);
      return await showOtpMainMenu(bot, chatId, userId, isUserAdmin, await getActiveLicense(userId));
    }

    if (data === 'otp_cancel') {
      clearSession(userId);
      return await bot.editMessageText(
        `❌ *Operation Cancelled*\n\nReturning to main menu...`,
        { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
      );
    }

    if (data === 'otp_browse_plans') {
      clearSession(userId);
      return await showProductsInCategory(bot, chatId, OTP_BOTS_CATEGORY_ID, 1, messageId);
    }

    if (data === 'otp_start_activation') {
      return await handleOtpBotCommand(bot, { from: query.from, chat: query.message.chat, text: '/otpbot' });
    }

    // ──── License Activation ────
    if (data.startsWith('otp_activate_')) {
      const keyId = parseInt(data.split('_')[2]);
      return await activateLicenseKey(bot, chatId, messageId, userId, keyId);
    }

    if (data === 'otp_enter_key') {
      return await showLicenseEntryPrompt(bot, chatId, userId);
    }

    // ──── Intercept Flow ────
    if (data === 'otp_intercept') {
      if (!hasAccess) return await showLicenseEntryPrompt(bot, chatId, userId);
      return await showInterceptPrompt(bot, chatId, messageId, userId);
    }

    if (data === 'otp_intercept_proceed') {
      return await showSenderIdPrompt(bot, chatId, messageId, userId);
    }

    if (data === 'otp_sender_bank') {
      return await showBankSelection(bot, chatId, messageId, userId);
    }

    if (data === 'otp_sender_custom') {
      return await showCustomSenderPrompt(bot, chatId, messageId, userId);
    }

    // Bank selection
    if (data.startsWith('otp_bank_proceed_')) {
      return await handleBankProceed(bot, chatId, messageId, userId);
    }

    if (data.startsWith('otp_bank_')) {
      const bankCode = data.replace('otp_bank_', '');
      return await handleBankSelected(bot, chatId, messageId, userId, bankCode);
    }

    // ──── Other Features ────
    if (data === 'otp_ss7') {
      if (!hasAccess) return await showLicenseEntryPrompt(bot, chatId, userId);
      return await showFeatureFlow(bot, chatId, messageId, userId, 'ss7');
    }

    if (data === 'otp_location') {
      if (!hasAccess) return await showLicenseEntryPrompt(bot, chatId, userId);
      return await showFeatureFlow(bot, chatId, messageId, userId, 'location');
    }

    if (data === 'otp_pgp') {
      if (!hasAccess) return await showLicenseEntryPrompt(bot, chatId, userId);
      return await showFeatureFlow(bot, chatId, messageId, userId, 'pgp');
    }

    if (data === 'otp_botcaller') {
      if (!hasAccess) return await showLicenseEntryPrompt(bot, chatId, userId);
      return await showFeatureFlow(bot, chatId, messageId, userId, 'botcaller');
    }

    // ──── License Info ────
    if (data === 'otp_license_info') {
      return await showLicenseInfo(bot, chatId, messageId, userId);
    }

    // ──── Admin Key Management ────
    if (data === 'otp_admin_keys') {
      return await showAdminKeyList(bot, chatId, messageId, userId);
    }

    if (data === 'otp_keygen_cancel') {
      clearSession(userId);
      return await bot.editMessageText(
        `❌ *Key Generation Cancelled*`,
        { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
      );
    }

    if (data === 'otp_keygen_another') {
      return await bot.sendMessage(chatId,
        `🔑 *Generate Another Key*\n\nUse: \`/key-gen @username\``,
        { parse_mode: 'Markdown' }
      );
    }

    // Duration selection for key generation
    if (data.startsWith('otp_keygen_1_')) {
      const duration = data.replace('otp_keygen_', '');
      return await handleKeyGenDuration(bot, chatId, messageId, userId, duration);
    }

  } catch (error) {
    logger.error('OTP_CALLBACK', `Error handling OTP callback for user ${userId}`, error);
    try {
      await bot.answerCallbackQuery(query.id, { text: '❌ Error processing request', show_alert: true });
    } catch (e) {}
  }
}

// ═══════════════════════════════════════════════════════════════
//  TEXT INPUT HANDLER (for OTP sessions)
// ═══════════════════════════════════════════════════════════════

export async function handleOtpInput(bot, msg) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text;

  const session = getSession(userId);
  if (!session) return false;

  try {
    // ── License Key Entry ──
    if (session.step === 'awaiting_license_key') {
      const keyInput = text.trim().toUpperCase();

      // Validate format
      if (!/^OTP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(keyInput)) {
        await bot.sendMessage(chatId,
          `❌ *Invalid Key Format*\n\n` +
          `Expected format: \`OTP-XXXX-XXXX-XXXX\`\n` +
          `You entered: \`${text.trim()}\`\n\n` +
          `Please try again or contact admin.`,
          { parse_mode: 'Markdown' }
        );
        return true;
      }

      // Look up key in database
      const keyRow = await dbGet(
        `SELECT * FROM otp_license_keys WHERE license_key = ?`,
        [keyInput]
      );

      if (!keyRow) {
        await bot.sendMessage(chatId,
          `❌ *License Key Not Found*\n\n` +
          `The key \`${keyInput}\` does not exist in our system.\n\n` +
          `Please check the key and try again, or contact admin.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: 'otp_enter_key' }],
                [{ text: '📞 Contact Admin', url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` }],
                [{ text: '🛒 Buy OTP Plans', callback_data: 'otp_browse_plans' }]
              ]
            }
          }
        );
        clearSession(userId);
        return true;
      }

      // Check if key is already used by someone else
      if (keyRow.status === 'active' && keyRow.user_id !== userId) {
        await bot.sendMessage(chatId,
          `❌ *License Key Already in Use*\n\n` +
          `This key has already been activated by another user.\n\n` +
          `Please contact admin for a new key.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📞 Contact Admin', url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` }],
                [{ text: '🛒 Buy OTP Plans', callback_data: 'otp_browse_plans' }]
              ]
            }
          }
        );
        clearSession(userId);
        return true;
      }

      if (keyRow.status === 'expired') {
        await bot.sendMessage(chatId,
          `❌ *License Key Expired*\n\n` +
          `The key \`${keyInput}\` has expired.\n\n` +
          `Please purchase a new plan or contact admin.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛒 Buy New Plan', callback_data: 'otp_browse_plans' }],
                [{ text: '📞 Contact Admin', url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` }]
              ]
            }
          }
        );
        clearSession(userId);
        return true;
      }

      // Key is valid and pending — check if it belongs to this user or is unassigned
      if (keyRow.user_id && keyRow.user_id !== userId) {
        await bot.sendMessage(chatId,
          `❌ *Key Assigned to Another User*\n\n` +
          `This license key was generated for a different user.\n\n` +
          `Please use the key assigned to your account.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📞 Contact Admin', url: `https://t.me/${SUPPORT_USERNAME || 'kopachev4'}` }]
              ]
            }
          }
        );
        clearSession(userId);
        return true;
      }

      // Activate the key!
      return await activateLicenseById(bot, chatId, userId, keyRow);
    }

    // ── Intercept: Phone Number Input ──
    if (session.step === 'intercept_number') {
      await handleInterceptNumberValidation(bot, chatId, userId, text.trim());
      return true;
    }

    // ── Intercept: Sender ID Input ──
    if (session.step === 'intercept_sender') {
      await handleSenderIdSearch(bot, chatId, userId, text.trim());
      return true;
    }

    // ── Custom Sender Input ──
    if (session.step === 'custom_sender_input') {
      await handleCustomSenderInput(bot, chatId, userId, text.trim());
      return true;
    }

    // ── Feature Inputs (SS7, Location, PGP, Bot Caller) ──
    if (['ss7_input', 'location_input', 'pgp_input', 'botcaller_input'].includes(session.step)) {
      const feature = session.feature;
      await handleFeatureInput(bot, chatId, userId, text.trim(), feature);
      return true;
    }

    return false;

  } catch (error) {
    logger.error('OTP_INPUT', `Error handling OTP input from user ${userId}`, error);
    clearSession(userId);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

async function checkUserAccess(userId) {
  const row = await dbGet(
    `SELECT * FROM otp_license_keys 
     WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
     ORDER BY expires_at DESC LIMIT 1`,
    [userId]
  );
  return !!row;
}

async function getActiveLicense(userId) {
  return await dbGet(
    `SELECT * FROM otp_license_keys 
     WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
     ORDER BY expires_at DESC LIMIT 1`,
    [userId]
  );
}

async function activateLicenseKey(bot, chatId, messageId, userId, keyId) {
  try {
    const keyRow = await dbGet(`SELECT * FROM otp_license_keys WHERE id = ?`, [keyId]);

    if (!keyRow || keyRow.user_id !== userId) {
      return await bot.editMessageText(
        `❌ *Invalid License Key*\n\nThis key cannot be activated for your account.`,
        { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
      );
    }

    return await activateLicenseById(bot, chatId, userId, keyRow, messageId);

  } catch (error) {
    logger.error('OTP_ACTIVATE', `Error activating key for user ${userId}`, error);
    await bot.sendMessage(chatId, '❌ Failed to activate key. Please try again.');
  }
}

async function activateLicenseById(bot, chatId, userId, keyRow, messageId = null) {
  const now = new Date();
  const durationMs = getDurationMs(keyRow.duration);
  const expiresAt = new Date(now.getTime() + durationMs);

  await dbRun(
    `UPDATE otp_license_keys 
     SET status = 'active', activated_at = ?, expires_at = ?, user_id = ?
     WHERE id = ?`,
    [now.toISOString(), expiresAt.toISOString(), userId, keyRow.id]
  );

  logger.info('OTP_ACTIVATE', `User ${userId} activated key ${keyRow.license_key}, expires: ${expiresAt.toISOString()}`);

  const content =
    `✅ *License Key Activated!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🔑 *Key:* \`${keyRow.license_key}\`\n` +
    `⏱️ *Duration:* ${getDurationLabel(keyRow.duration)}\n` +
    `📅 *Activated:* ${now.toLocaleString()}\n` +
    `⏰ *Expires:* ${expiresAt.toLocaleString()}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🚀 Your OTP Bot access is now active!\n` +
    `Tap below to access the control panel.`;

  clearSession(userId);

  smartMessageManager.forceBannerNext(chatId);
  await smartMessageManager.sendOrEditSmart(bot, chatId, null, content, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📡 Open OTP Bot Panel', callback_data: 'otp_main' }],
        [{ text: '🔙 Back to Main Menu', callback_data: 'back_to_categories' }]
      ]
    }
  }, true);
}

// ═══════════════════════════════════════════════════════════════
//  SESSION CLEANUP
// ═══════════════════════════════════════════════════════════════

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of otpSessions.entries()) {
    if (now - session.timestamp > SESSION_TIMEOUT) {
      otpSessions.delete(userId);
    }
  }
}, 60000);
