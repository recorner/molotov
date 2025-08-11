// handlers/pokeHandler.js
import { ADMIN_IDS } from '../config.js';
import logger from '../utils/logger.js';
import db from '../database.js';

// Store poke sessions for admins
const pokeSessions = new Map();

export async function handlePokeCommand(bot, msg) {
  const { text, from, chat } = msg;
  
  // Check if user is admin
  if (!ADMIN_IDS.includes(from.id)) {
    await bot.sendMessage(chat.id, '❌ This command is only available for administrators.');
    return;
  }

  try {
    const parts = text.split(' ').slice(1); // Remove /poke from command
    
    if (parts.length === 0) {
      // No usernames provided, ask for them
      pokeSessions.set(from.id, {
        step: 'waiting_usernames',
        timestamp: Date.now()
      });
      
      await bot.sendMessage(chat.id, 
        `📌 **Poke Command Setup**\n\n` +
        `Please provide the usernames to poke (separated by commas):\n\n` +
        `📝 **Format Examples:**\n` +
        `• Single user: @mizzcanny\n` +
        `• Multiple users: @mizzcanny, @username2, @username3\n\n` +
        `❌ Type /cancel to cancel this operation.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Parse usernames
    const usernames = parts.join(' ').split(',').map(username => {
      return username.trim().replace('@', ''); // Remove @ if present
    }).filter(username => username.length > 0);

    if (usernames.length === 0) {
      await bot.sendMessage(chat.id, '❌ Please provide valid usernames.');
      return;
    }

    // Store session for message input
    pokeSessions.set(from.id, {
      step: 'waiting_message',
      usernames: usernames,
      timestamp: Date.now()
    });

    await bot.sendMessage(chat.id,
      `📌 **Poke Command Ready**\n\n` +
      `🎯 **Target users (${usernames.length}):** ${usernames.map(u => '@' + u).join(', ')}\n\n` +
      `📝 **Next Step:** Please provide the message to send to these users.\n\n` +
      `💡 **Tip:** Keep your message clear and concise.\n` +
      `❌ Type /cancel to cancel this operation.`,
      { parse_mode: 'Markdown' }
    );

    logger.info('POKE_COMMAND', `Admin ${from.id} initiated poke for users: ${usernames.join(', ')}`);

  } catch (error) {
    console.error('[ERROR] Failed to handle poke command:', error);
    await bot.sendMessage(chat.id, '❌ Failed to process poke command. Please try again.');
    logger.error('POKE_COMMAND', 'Failed to handle poke command', error);
  }
}

export async function handlePokeInput(bot, msg) {
  const { text, from, chat } = msg;
  
  // Check if user has active poke session
  const session = pokeSessions.get(from.id);
  if (!session) {
    return false; // Not handling this message
  }

  // Check if session has expired (5 minutes)
  if (Date.now() - session.timestamp > 300000) {
    pokeSessions.delete(from.id);
    await bot.sendMessage(chat.id, '⏰ Poke session has expired. Please start again with /poke command.');
    return true;
  }

  // Handle cancel command
  if (text === '/cancel') {
    pokeSessions.delete(from.id);
    await bot.sendMessage(chat.id, '❌ Poke operation cancelled.');
    return true;
  }

  try {
    if (session.step === 'waiting_usernames') {
      // Parse usernames
      const usernames = text.split(',').map(username => {
        return username.trim().replace('@', ''); // Remove @ if present
      }).filter(username => username.length > 0);

      if (usernames.length === 0) {
        await bot.sendMessage(chat.id, '❌ Please provide valid usernames.');
        return true;
      }

      // Update session for message input
      pokeSessions.set(from.id, {
        step: 'waiting_message',
        usernames: usernames,
        timestamp: Date.now()
      });

      await bot.sendMessage(chat.id,
        `📌 **Poke Command Ready**\n\n` +
        `🎯 **Target users (${usernames.length}):** ${usernames.map(u => '@' + u).join(', ')}\n\n` +
        `📝 **Next Step:** Please provide the message to send to these users.\n\n` +
        `💡 **Tip:** Keep your message clear and concise.\n` +
        `❌ Type /cancel to cancel this operation.`,
        { parse_mode: 'Markdown' }
      );

      return true;

    } else if (session.step === 'waiting_message') {
      const { usernames } = session;
      const message = text;

      // Clear session
      pokeSessions.delete(from.id);

      // Find user IDs from database
      const userIds = await getUserIdsByUsernames(usernames);
      
      if (userIds.length === 0) {
        await bot.sendMessage(chat.id, 
          `❌ **No Recipients Found**\n\n` +
          `🔍 **Searched for:** ${usernames.map(u => `@${u}`).join(', ')}\n\n` +
          `💡 **Note:** Users must have interacted with the bot and have a username set.\n\n` +
          `🔄 **Suggestion:** Ask users to start the bot first with /start command.`,
          { parse_mode: 'Markdown' }
        );
        return true;
      }

      // Send message to each user
      let successCount = 0;
      let failedUsers = [];

      for (const { user_id, username } of userIds) {
        try {
          const pokeMessage = `🔔 **Admin Message**\n\n` +
            `${message}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `👨‍💼 **From:** Admin Team\n` +
            `📅 **Date:** ${new Date().toLocaleDateString()}\n` +
            `⏰ **Time:** ${new Date().toLocaleTimeString()}\n\n` +
            `💬 *If you need assistance, feel free to reach out to support.*`;

          await bot.sendMessage(user_id, pokeMessage, {
            parse_mode: 'Markdown'
          });
          
          successCount++;
          logger.info('POKE_SENT', `Message sent to user ${username} (${user_id})`);
        } catch (error) {
          console.error(`[ERROR] Failed to send poke to user ${username}:`, error);
          failedUsers.push(username);
          logger.error('POKE_FAILED', `Failed to send poke to user ${username}`, error);
        }
      }

      // Send confirmation to admin
      let confirmationMessage = `✅ **Poke Operation Completed**\n\n`;
      
      if (successCount > 0) {
        confirmationMessage += `📤 **Successfully delivered to ${successCount} user(s):**\n`;
        userIds.forEach(({ username }) => {
          if (!failedUsers.includes(username)) {
            confirmationMessage += `  ✓ @${username}\n`;
          }
        });
        confirmationMessage += '\n';
      }

      if (failedUsers.length > 0) {
        confirmationMessage += `❌ **Failed deliveries (${failedUsers.length} user(s)):**\n`;
        failedUsers.forEach(username => {
          confirmationMessage += `  ✗ @${username}\n`;
        });
        confirmationMessage += '\n';
      }

      const notFoundUsers = usernames.filter(username => 
        !userIds.some(({ username: foundUsername }) => foundUsername === username)
      );
      
      if (notFoundUsers.length > 0) {
        confirmationMessage += `🔍 **Users not found in database (${notFoundUsers.length}):**\n`;
        notFoundUsers.forEach(username => {
          confirmationMessage += `  ? @${username}\n`;
        });
        confirmationMessage += '\n';
      }

      confirmationMessage += `━━━━━━━━━━━━━━━━━━━━━\n`;
      confirmationMessage += `📝 **Message:** ${message.substring(0, 150)}${message.length > 150 ? '...' : ''}\n`;
      confirmationMessage += `📊 **Summary:** ${successCount} sent, ${failedUsers.length} failed, ${notFoundUsers.length} not found\n`;
      confirmationMessage += `⏰ **Completed:** ${new Date().toLocaleString()}`;

      await bot.sendMessage(chat.id, confirmationMessage, {
        parse_mode: 'Markdown'
      });

      logger.info('POKE_COMPLETE', `Poke operation completed by admin ${from.id}`, {
        targetUsernames: usernames,
        successCount,
        failedCount: failedUsers.length,
        notFoundCount: notFoundUsers.length
      });

      return true;
    }

  } catch (error) {
    console.error('[ERROR] Failed to handle poke input:', error);
    await bot.sendMessage(chat.id, '❌ Failed to process your input. Please try again.');
    pokeSessions.delete(from.id);
    logger.error('POKE_INPUT', 'Failed to handle poke input', error);
    return true;
  }

  return false;
}

// Helper function to get user IDs by usernames from database
async function getUserIdsByUsernames(usernames) {
  return new Promise((resolve, reject) => {
    // Build placeholders for LOWER() function
    const placeholders = usernames.map(() => 'LOWER(?)').join(',');
    const query = `SELECT telegram_id as user_id, username FROM users WHERE LOWER(username) IN (${placeholders}) AND username IS NOT NULL`;
    
    // Convert usernames to lowercase for search
    const lowercaseUsernames = usernames.map(u => u.toLowerCase());
    
    db.all(query, lowercaseUsernames, (err, rows) => {
      if (err) {
        console.error('[ERROR] Database query failed:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of pokeSessions.entries()) {
    if (now - session.timestamp > 300000) { // 5 minutes
      pokeSessions.delete(userId);
    }
  }
}, 60000); // Check every minute
