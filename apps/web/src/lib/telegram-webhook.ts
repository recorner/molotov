// Simple telegram webhook handler without the full bot class
// This works around TypeScript module issues

import prisma from '$lib/prisma.js';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import * as argon from 'argon2';

// Helper functions for user creation
function generateMd2faCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    codes.push(code);
  }
  return codes;
}

async function hashPassword(password: string): Promise<string> {
  return await argon.hash(password);
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      username?: string;
      first_name: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      username?: string;
      first_name: string;
    };
    data?: string;
    message?: any;
  };
}

export async function handleTelegramWebhook(update: TelegramUpdate, botToken: string) {
  try {
    if (update.message) {
      await handleMessage(update.message, botToken);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, botToken);
    }
  } catch (error) {
    console.error('Webhook handling error:', error);
  }
}

async function handleMessage(message: any, botToken: string) {
  const chatId = message.chat.id.toString();
  const text = message.text;
  const userId = message.from.id;
  const username = message.from.username;

  console.log(`Received message from ${userId} (${username}): ${text}`);

  if (text === '/start') {
    await sendStartMessage(chatId, userId, botToken);
  } else if (text === '/register') {
    await sendRegisterMessage(chatId, botToken);
  } else if (text === '/link') {
    await sendLinkMessage(chatId, userId, botToken);
  } else if (text === '/login') {
    await handleLoginCommand(chatId, userId, botToken);
  } else if (text === '/status') {
    await handleStatusCommand(chatId, userId, botToken);
  } else if (text === '/help') {
    await sendHelpMessage(chatId, botToken);
  } else if (text && text.startsWith('/')) {
    // Unknown command
    await sendMessage(chatId, "❓ Unknown command. Send /help to see available commands.", botToken);
  } else if (text && text.length >= 3 && text.length <= 16 && /^[a-zA-Z0-9_]+$/.test(text)) {
    // Potential username for direct registration
    await handleDirectRegistration(chatId, userId, username, text, botToken);
  } else if (text) {
    // Invalid input
    await sendMessage(chatId, "🤔 I didn't understand that. Send /help for commands or a valid username (3-16 chars, letters/numbers/underscore only).", botToken);
  }
}

async function handleCallbackQuery(callbackQuery: any, botToken: string) {
  const chatId = callbackQuery.message.chat.id.toString();
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  // Answer callback query first
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQuery.id })
  });

  switch (data) {
    case 'register_account':
      await sendRegisterMessage(chatId, botToken);
      break;
    case 'link_account':
      await sendLinkMessage(chatId, userId, botToken);
      break;
    case 'generate_code':
      await handleLoginCommand(chatId, userId, botToken);
      break;
    case 'session_status':
      await handleStatusCommand(chatId, userId, botToken);
      break;
    case 'help':
      await sendHelpMessage(chatId, botToken);
      break;
  }
}

async function sendStartMessage(chatId: string, userId: number, botToken: string) {
  // Check if user is already linked
  const existingUser = await prisma.user.findFirst({
    where: { telegramId: chatId }
  });

  let message, keyboard;

  if (existingUser) {
    message = `🎉 Welcome back, ${existingUser.username}!\n\nYour account is already linked. What would you like to do?`;
    keyboard = {
      inline_keyboard: [
        [{ text: '🔐 Generate Login Code', callback_data: 'generate_code' }],
        [{ text: '📊 Session Status', callback_data: 'session_status' }],
        [{ text: '❓ Help', callback_data: 'help' }]
      ]
    };
  } else {
    message = `🚀 Welcome to the Secure Login System!\n\nI can help you:\n• 📝 Register a new account via Telegram\n• 🔗 Link existing account for quick access\n• 🔐 Generate secure login codes\n• 🔄 Manage your login sessions\n\nChoose an option below:`;
    keyboard = {
      inline_keyboard: [
        [{ text: '📝 Register New Account', callback_data: 'register_account' }],
        [{ text: '🔗 Link Existing Account', callback_data: 'link_account' }],
        [{ text: '❓ Help', callback_data: 'help' }]
      ]
    };
  }

  await sendMessage(chatId, message, botToken, keyboard);
}

async function sendRegisterMessage(chatId: string, botToken: string) {
  const message = `📝 Register New Account

To register via Telegram:

1. Visit our website registration page
2. Choose "Telegram" registration method
3. Follow the on-screen instructions

Or send me a username to register directly here.

Requirements:
• 3-16 characters
• Letters, numbers, underscore only
• Must be unique`;

  await sendMessage(chatId, message, botToken);
}

async function sendLinkMessage(chatId: string, userId: number, botToken: string) {
  // Check if already linked
  const existingUser = await prisma.user.findFirst({
    where: { telegramId: chatId }
  });

  if (existingUser) {
    const message = `🔗 Already Linked

Username: ${existingUser.username}
Use /login to generate login codes or /unlink to disconnect.`;
    await sendMessage(chatId, message, botToken);
    return;
  }

  const message = `🔗 Link Your Account

To link your existing account:

1. Visit our website login page
2. Choose "Telegram" login method
3. Use the code I'll generate for you

Or send me your website username to link directly.`;

  await sendMessage(chatId, message, botToken);
}

async function handleLoginCommand(chatId: string, userId: number, botToken: string) {
  // Check if user is linked
  const user = await prisma.user.findFirst({
    where: { telegramId: chatId }
  });

  if (!user) {
    const message = `❌ Account Not Linked

Please link your account first using /link`;
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔗 Link Account', callback_data: 'link_account' }]
      ]
    };
    await sendMessage(chatId, message, botToken, keyboard);
    return;
  }

  // Generate 6-digit code
  const loginCode = crypto.randomInt(100000, 999999).toString();
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  try {
    // Clean up old sessions
    await prisma.telegramSession.deleteMany({
      where: {
        chatId,
        expiresAt: { lt: new Date() }
      }
    });

    // Create new session
    await prisma.telegramSession.create({
      data: {
        chatId,
        sessionId,
        loginCode,
        expiresAt,
        userId: user.id
      }
    });

    const message = `🔐 Login Code Generated

Code: ${loginCode}
Valid for: 5 minutes
Username: ${user.username}

Enter this code on the login page to access your account.

⚠️ Security Note: This code will expire automatically for your protection.`;

    await sendMessage(chatId, message, botToken);

  } catch (error) {
    console.error('Code generation error:', error);
    await sendMessage(chatId, '❌ Failed to generate login code. Please try again.', botToken);
  }
}

async function handleStatusCommand(chatId: string, userId: number, botToken: string) {
  const user = await prisma.user.findFirst({
    where: { telegramId: chatId }
  });

  if (!user) {
    const message = `❌ No Linked Account

Use /link to connect your account first.`;
    await sendMessage(chatId, message, botToken);
    return;
  }

  // Get active sessions
  const activeSessions = await prisma.telegramSession.findMany({
    where: {
      chatId,
      isActive: true,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' }
  });

  const sessionCount = activeSessions.length;
  const latestSession = activeSessions[0];

  let statusMessage = `📊 Session Status

Username: ${user.username}
Active Sessions: ${sessionCount}
`;

  if (latestSession) {
    const timeLeft = Math.max(0, Math.floor((latestSession.expiresAt.getTime() - Date.now()) / 1000 / 60));
    statusMessage += `Latest Code: ${latestSession.loginCode ? '🟢 Available' : '🔴 Used'}\nExpires in: ${timeLeft} minutes\n`;
  }

  statusMessage += `\nLinked: ${user.telegramLinked ? '✅' : '❌'}`;

  await sendMessage(chatId, statusMessage, botToken);
}

async function handleDirectRegistration(chatId: string, userId: number, telegramUsername: string | undefined, desiredUsername: string, botToken: string) {
  try {
    // Check if user is already registered
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: desiredUsername },
          { telegramId: chatId }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.telegramId === chatId) {
        await sendMessage(chatId, `🔗 You're already registered as @${existingUser.username}! Use /login to generate login codes.`, botToken);
      } else {
        await sendMessage(chatId, `❌ Username "${desiredUsername}" is already taken. Please try another one.`, botToken);
      }
      return;
    }

    // Generate M2FA codes
    const md2faCodes = generateMd2faCodes().sort();
    const hashedMd2faCodes = await Promise.all(md2faCodes.map(code => hashPassword(code)));

    // Create new user via Telegram
    const newUser = await prisma.user.create({
      data: {
        username: desiredUsername,
        password: await hashPassword('TELEGRAM_USER_' + Math.random().toString(36)), // Dummy password
        md2faCodes: hashedMd2faCodes,
        role: ['BUYER'],
        telegram: telegramUsername || null,
        telegramId: chatId,
        telegramLinked: true
      }
    });

    // Send success message with backup codes
    const codesText = md2faCodes.join(', ');
    const message = `🎉 Registration Successful!

✅ Username: @${desiredUsername}
🔗 Telegram: Linked

🔐 Backup Codes:
${codesText}

⚠️ IMPORTANT: Save these codes safely! They're needed for account recovery.

Use /login to generate login codes for website access.`;

    await sendMessage(chatId, message, botToken);

    console.log(`User ${desiredUsername} successfully registered via Telegram (ID: ${userId})`);
  } catch (error) {
    console.error('Direct registration error:', error);
    await sendMessage(chatId, `❌ Registration failed. Please try again or contact support.`, botToken);
  }
}

async function sendHelpMessage(chatId: string, botToken: string) {
  const message = `🤖 **Telegram Auth Bot Help**\n\n**Commands:**\n/start - Main menu\n/register - Register new account\n/link - Link existing account\n/login - Generate login code\n/status - Check session status\n/unlink - Unlink account\n\n**Features:**\n• Instant account registration via Telegram\n• Secure 6-digit login codes\n• Session management\n• Account linking with username verification\n• Auto-expiring sessions for security\n\n💡 **Security:** All codes expire in 5 minutes for your protection.`;

  await sendMessage(chatId, message, botToken);
}

async function sendMessage(chatId: string, text: string, botToken: string, replyMarkup?: any) {
  const payload: any = {
    chat_id: chatId,
    text: text
    // Removed parse_mode to avoid markdown parsing errors
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Telegram API error:', errorText);
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

export async function validateLoginCode(code: string): Promise<{ valid: boolean; userId?: number; username?: string }> {
  try {
    const session = await prisma.telegramSession.findFirst({
      where: {
        loginCode: code,
        isActive: true,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });

    if (!session || !session.user) {
      return { valid: false };
    }

    // Mark code as used
    await prisma.telegramSession.update({
      where: { id: session.id },
      data: { 
        loginCode: null, // Clear the code after use
        isActive: false
      }
    });

    return {
      valid: true,
      userId: session.user.id,
      username: session.user.username
    };

  } catch (error) {
    console.error('Login code validation error:', error);
    return { valid: false };
  }
}
