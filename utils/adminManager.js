// utils/adminManager.js — Live admin system with active group monitoring
// Super admins (ADMIN_IDS env) always have access and cannot be demoted.
// All other admins are derived from the ADMIN_GROUP chat administrators.
// The bot polls the chat admin list periodically and detects changes.
import db from '../database.js';
import logger from './logger.js';
import { ADMIN_IDS, ADMIN_GROUP } from '../config.js';

// ── Polling interval (env-configurable, default 60 s) ───────────────
const ADMIN_POLL_INTERVAL_MS = parseInt(process.env.ADMIN_POLL_INTERVAL || '5000', 10);

class AdminManager {
  constructor() {
    // In-memory set of current admin user IDs (fast O(1) lookup)
    this.adminSet = new Set();
    // Detailed info keyed by userId
    this.adminDetails = new Map();
    // Super admins from env (immutable)
    this.superAdmins = new Set(ADMIN_IDS || []);
    // Track bot instance for polling
    this._bot = null;
    this._pollTimer = null;
    // Initialised flag
    this._initialised = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Core check — used by every handler in the bot
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Fast synchronous-feeling admin check.
   * Returns true if userId is a super admin OR a current group admin.
   */
  async isAdmin(userId) {
    // Super admins always pass
    if (this.superAdmins.has(userId)) return true;
    // Group admins from live polling
    return this.adminSet.has(userId);
  }

  /**
   * Check if a user is a super admin (env ADMIN_IDS).
   */
  isSuperAdmin(userId) {
    return this.superAdmins.has(userId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Initialisation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Boot the admin system.  Call once from bot.js after the bot is created.
   *  1. Seed super admins into the set.
   *  2. Fetch the current group admin list from Telegram.
   *  3. Persist to DB for reference.
   *  4. Start the periodic polling timer.
   */
  async initializeAdminSystem(bot, groupIds = []) {
    this._bot = bot;
    logger.info('ADMIN', 'Initialising live admin system…');

    // Seed super admins
    for (const id of this.superAdmins) {
      this.adminSet.add(id);
    }

    // Register the admin group
    const groupId = groupIds[0] || ADMIN_GROUP;
    if (groupId) {
      await this._addAdminGroupDB(groupId);
      await this._syncAdminsFromChat(bot, groupId, true); // silent on first run
    }

    // Start polling
    this._startPolling(bot, groupId);
    this._initialised = true;

    logger.info('ADMIN', `Admin system live — ${this.adminSet.size} admins (${this.superAdmins.size} super)`);
    return this.adminSet.size;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Polling
  // ═══════════════════════════════════════════════════════════════════════

  _startPolling(bot, groupId) {
    if (!groupId) return;
    if (this._pollTimer) clearInterval(this._pollTimer);

    this._pollTimer = setInterval(async () => {
      try {
        await this._syncAdminsFromChat(bot, groupId, false);
      } catch (err) {
        logger.error('ADMIN', 'Poll sync error', err);
      }
    }, ADMIN_POLL_INTERVAL_MS);

    logger.info('ADMIN', `Admin polling started every ${ADMIN_POLL_INTERVAL_MS / 1000}s`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Sync — fetch Telegram admin list and diff with local state
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Fetch getChatAdministrators, diff against local state,
   * and emit join/leave notifications.
   * @param {boolean} silent - suppress notifications on first boot
   */
  async _syncAdminsFromChat(bot, groupId, silent = false) {
    let telegramAdmins;
    try {
      telegramAdmins = await bot.getChatAdministrators(groupId);
    } catch (err) {
      logger.error('ADMIN', `getChatAdministrators failed for ${groupId}`, err);
      return;
    }

    // Build fresh set from Telegram (skip bots)
    const freshSet = new Set();
    const freshDetails = new Map();

    for (const member of telegramAdmins) {
      if (member.user.is_bot) continue;
      const uid = member.user.id;
      freshSet.add(uid);
      freshDetails.set(uid, {
        userId: uid,
        username: member.user.username || null,
        firstName: member.user.first_name || '',
        lastName: member.user.last_name || '',
        status: member.status, // 'creator' | 'administrator'
        isSuperAdmin: this.superAdmins.has(uid)
      });
    }

    // Also always include super admins (they might not be in the chat)
    for (const id of this.superAdmins) {
      if (!freshSet.has(id)) {
        freshSet.add(id);
        // Keep existing detail if we have it, else minimal
        if (!freshDetails.has(id)) {
          const existing = this.adminDetails.get(id);
          freshDetails.set(id, existing || {
            userId: id,
            username: null,
            firstName: 'Super Admin',
            lastName: '',
            status: 'super_admin',
            isSuperAdmin: true
          });
        }
      }
      // Mark super admin flag
      if (freshDetails.has(id)) {
        freshDetails.get(id).isSuperAdmin = true;
      }
    }

    // ── Diff: detect new admins & removed admins ──
    const previousSet = new Set(this.adminSet);
    const newAdmins = [];
    const removedAdmins = [];

    for (const uid of freshSet) {
      if (!previousSet.has(uid)) {
        newAdmins.push(freshDetails.get(uid));
      }
    }
    for (const uid of previousSet) {
      if (!freshSet.has(uid) && !this.superAdmins.has(uid)) {
        removedAdmins.push(this.adminDetails.get(uid) || { userId: uid });
      }
    }

    // ── Apply changes ──
    this.adminSet = freshSet;
    this.adminDetails = freshDetails;

    // Persist to DB
    await this._persistAdminsToDB(groupId, freshDetails);

    // ── Notifications ──
    if (!silent && newAdmins.length > 0) {
      for (const admin of newAdmins) {
        // Don't announce super admins that were already in env
        if (admin.isSuperAdmin && admin.status === 'super_admin') continue;
        await this._announceNewAdmin(bot, groupId, admin);
      }
    }
    if (!silent && removedAdmins.length > 0) {
      for (const admin of removedAdmins) {
        await this._announceRemovedAdmin(bot, groupId, admin);
      }
    }

    if (newAdmins.length > 0 || removedAdmins.length > 0) {
      logger.info('ADMIN', `Sync: +${newAdmins.length} new, -${removedAdmins.length} removed, total ${this.adminSet.size}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Notifications
  // ═══════════════════════════════════════════════════════════════════════

  async _announceNewAdmin(bot, groupId, admin) {
    const name = admin.firstName + (admin.lastName ? ` ${admin.lastName}` : '');
    const usernameStr = admin.username ? `@${admin.username}` : `[${name}](tg://user?id=${admin.userId})`;

    const msg =
      `🆕 *New Staff Member*\n\n` +
      `👤 *Name:* ${name}\n` +
      `🔗 *Username:* ${usernameStr}\n` +
      `🆔 *ID:* \`${admin.userId}\`\n` +
      `🛡️ *Role:* ${admin.status === 'creator' ? 'Owner' : 'Administrator'}\n` +
      `🕒 *Since:* ${new Date().toLocaleString()}\n\n` +
      `✅ Bot admin privileges are now active.`;

    try {
      await bot.sendMessage(groupId, msg, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('ADMIN', 'Failed to announce new admin', err);
      try { await bot.sendMessage(groupId, msg.replace(/[*_`\[\]()]/g, '')); } catch { /* ignore */ }
    }
  }

  async _announceRemovedAdmin(bot, groupId, admin) {
    const name = admin.firstName || 'Unknown';
    const usernameStr = admin.username ? `@${admin.username}` : `ID ${admin.userId}`;

    const msg =
      `🔴 *Admin Removed*\n\n` +
      `👤 ${name} (${usernameStr})\n` +
      `❌ Bot admin privileges have been revoked.`;

    try {
      await bot.sendMessage(groupId, msg, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('ADMIN', 'Failed to announce removed admin', err);
      try { await bot.sendMessage(groupId, msg.replace(/[*_`\[\]()]/g, '')); } catch { /* ignore */ }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DB persistence (for reference / analytics — live state is in memory)
  // ═══════════════════════════════════════════════════════════════════════

  _addAdminGroupDB(groupId) {
    return new Promise((resolve) => {
      db.run(
        `INSERT OR REPLACE INTO admin_groups (group_id, group_name, is_active) VALUES (?, ?, 1)`,
        [groupId, 'Main Admin Group'],
        (err) => { if (err) logger.error('ADMIN', 'DB: add group failed', err); resolve(); }
      );
    });
  }

  async _persistAdminsToDB(groupId, details) {
    for (const [uid, info] of details) {
      await new Promise((resolve) => {
        db.run(
          `INSERT OR REPLACE INTO group_admins
           (group_id, user_id, username, first_name, status, last_seen)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [groupId, uid, info.username, info.firstName, info.status],
          (err) => { if (err) logger.error('ADMIN', `DB: persist admin ${uid} failed`, err); resolve(); }
        );
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Getters
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get all current admin user IDs.
   */
  getAdminIds() {
    return [...this.adminSet];
  }

  /**
   * Get detailed admin list (for /heads command).
   */
  getAdminList() {
    return [...this.adminDetails.values()];
  }

  /**
   * Get info for one admin.
   */
  getAdminInfo(userId) {
    return this.adminDetails.get(userId) || null;
  }

  /**
   * Get all admins (Promise wrapper for backward compat).
   */
  async getAllAdmins() {
    return this.getAdminList();
  }

  clearCache() {
    // No-op for backward compat — live state doesn't use a timed cache
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  /heads command — list all admins
  // ═══════════════════════════════════════════════════════════════════════

  async handleHeadsCommand(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const isUserAdmin = await this.isAdmin(userId);
    if (!isUserAdmin) {
      return bot.sendMessage(chatId, '⛔ This command is restricted to administrators.');
    }

    const admins = this.getAdminList();

    if (admins.length === 0) {
      return bot.sendMessage(chatId, '⚠️ No admins found.', { parse_mode: 'Markdown' });
    }

    // Sort: super admins first, then creators, then administrators
    admins.sort((a, b) => {
      const rank = (x) => x.isSuperAdmin ? 0 : x.status === 'creator' ? 1 : 2;
      return rank(a) - rank(b);
    });

    const lines = [`👥 *Admin Team — ${admins.length} members*\n`, `━━━━━━━━━━━━━━━━━━━━━`];

    for (const admin of admins) {
      const name = admin.firstName + (admin.lastName ? ` ${admin.lastName}` : '');
      const usernameStr = admin.username ? `@${admin.username}` : '—';
      let badge = '👤';
      if (admin.isSuperAdmin) badge = '⭐';
      else if (admin.status === 'creator') badge = '👑';

      const role = admin.isSuperAdmin ? 'Super Admin' : admin.status === 'creator' ? 'Owner' : 'Admin';

      lines.push(`${badge} *${name}*`);
      lines.push(`    🔗 ${usernameStr}  |  🛡️ ${role}  |  🆔 \`${admin.userId}\``);
    }

    lines.push(`\n━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🕒 ${new Date().toLocaleString()}`);

    const text = lines.join('\n');
    try {
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch {
      await bot.sendMessage(chatId, text.replace(/[*_`]/g, ''));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  /promote and /demote commands
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Resolve a target user from the message.
   * Supports: /promote @username | reply to a message with /promote
   * Returns { userId, username, firstName } or null.
   */
  async _resolveTarget(bot, msg) {
    // 1. Check if replying to a message
    if (msg.reply_to_message) {
      const target = msg.reply_to_message.from;
      if (target.is_bot) return { error: '❌ Cannot promote/demote a bot.' };
      return {
        userId: target.id,
        username: target.username || null,
        firstName: target.first_name || 'Unknown'
      };
    }

    // 2. Check for @username or user_id argument
    const parts = (msg.text || '').split(/\s+/).slice(1); // remove the command itself
    if (parts.length === 0) {
      return { error: '❌ Please reply to a user\'s message or provide a username.\n\nUsage: `/promote @username` or reply with `/promote`' };
    }

    const arg = parts[0].replace('@', '').trim();

    // If it's a number, treat as user ID
    if (/^\d+$/.test(arg)) {
      const targetId = parseInt(arg, 10);
      try {
        const chat = await bot.getChat(targetId);
        return { userId: chat.id, username: chat.username || null, firstName: chat.first_name || 'Unknown' };
      } catch {
        return { error: `❌ Could not find user with ID \`${arg}\`.` };
      }
    }

    // Try to find user by username in our database
    const user = await new Promise((resolve) => {
      db.get(
        'SELECT telegram_id, username, first_name FROM users WHERE LOWER(username) = LOWER(?)',
        [arg],
        (err, row) => resolve(row || null)
      );
    });

    // Also check group_admins table
    const adminRow = await new Promise((resolve) => {
      db.get(
        'SELECT user_id, username, first_name FROM group_admins WHERE LOWER(username) = LOWER(?)',
        [arg],
        (err, row) => resolve(row || null)
      );
    });

    if (user) {
      return { userId: user.telegram_id, username: user.username, firstName: user.first_name || 'Unknown' };
    }
    if (adminRow) {
      return { userId: adminRow.user_id, username: adminRow.username, firstName: adminRow.first_name || 'Unknown' };
    }

    return { error: `❌ Could not find user @${arg}. Make sure the username is correct.` };
  }

  /**
   * /promote handler — promote a user to admin in the chat & in the bot.
   */
  async handlePromoteCommand(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Only super admins or the chat creator can promote
    const isUserAdmin = await this.isAdmin(userId);
    if (!isUserAdmin) {
      return bot.sendMessage(chatId, '⛔ This command is restricted to administrators.');
    }

    const target = await this._resolveTarget(bot, msg);
    if (target.error) {
      return bot.sendMessage(chatId, target.error, { parse_mode: 'Markdown' });
    }

    // Can't promote a super admin (already has full access)
    if (this.superAdmins.has(target.userId)) {
      return bot.sendMessage(chatId, '⭐ This user is a Super Admin — already has full privileges.');
    }

    // Can't promote if already admin
    if (this.adminSet.has(target.userId)) {
      return bot.sendMessage(chatId, `✅ @${target.username || target.firstName} is already an admin.`);
    }

    // Try to promote in the Telegram chat
    const groupId = ADMIN_GROUP;
    if (!groupId) {
      return bot.sendMessage(chatId, '❌ No ADMIN_GROUP configured.');
    }

    try {
      await bot.promoteChatMember(groupId, target.userId, {
        can_manage_chat: true,
        can_delete_messages: true,
        can_manage_video_chats: true,
        can_restrict_members: true,
        can_promote_members: false,
        can_change_info: false,
        can_invite_users: true,
        can_pin_messages: true
      });

      // Immediately add to local state
      this.adminSet.add(target.userId);
      this.adminDetails.set(target.userId, {
        userId: target.userId,
        username: target.username,
        firstName: target.firstName,
        lastName: '',
        status: 'administrator',
        isSuperAdmin: false
      });

      const name = target.username ? `@${target.username}` : target.firstName;
      await bot.sendMessage(chatId,
        `✅ *Admin Promoted*\n\n👤 ${name} (\`${target.userId}\`)\n🛡️ Now has administrator privileges.`,
        { parse_mode: 'Markdown' }
      );

      logger.info('ADMIN', `User ${target.userId} (@${target.username}) promoted by ${userId}`);
    } catch (err) {
      const errMsg = err?.message || String(err);
      logger.error('ADMIN', `Promote failed for ${target.userId}`, err);

      if (errMsg.includes('not enough rights')) {
        return bot.sendMessage(chatId, '❌ Bot does not have enough rights to promote members. Make sure the bot is an admin with "Add new admins" permission.');
      }
      if (errMsg.includes('USER_NOT_PARTICIPANT')) {
        return bot.sendMessage(chatId, '❌ User is not a member of the admin group. They need to join first.');
      }
      return bot.sendMessage(chatId, `❌ Failed to promote: ${errMsg}`);
    }
  }

  /**
   * /demote handler — demote a user from admin in the chat & in the bot.
   */
  async handleDemoteCommand(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Only super admins can demote
    const isUserAdmin = await this.isAdmin(userId);
    if (!isUserAdmin) {
      return bot.sendMessage(chatId, '⛔ This command is restricted to administrators.');
    }

    const target = await this._resolveTarget(bot, msg);
    if (target.error) {
      return bot.sendMessage(chatId, target.error, { parse_mode: 'Markdown' });
    }

    // Can't demote a super admin
    if (this.superAdmins.has(target.userId)) {
      return bot.sendMessage(chatId, '⭐ Super Admins cannot be demoted. Remove them from ADMIN_IDS in .env.');
    }

    // Check if target is even an admin
    if (!this.adminSet.has(target.userId)) {
      return bot.sendMessage(chatId, `⚠️ @${target.username || target.firstName} is not currently an admin.`);
    }

    // Check if target is the creator
    const targetDetail = this.adminDetails.get(target.userId);
    if (targetDetail && targetDetail.status === 'creator') {
      return bot.sendMessage(chatId, '👑 The group creator cannot be demoted.');
    }

    // Try to demote in the Telegram chat
    const groupId = ADMIN_GROUP;
    if (!groupId) {
      return bot.sendMessage(chatId, '❌ No ADMIN_GROUP configured.');
    }

    try {
      // Setting all permissions to false effectively demotes the user
      await bot.promoteChatMember(groupId, target.userId, {
        can_manage_chat: false,
        can_delete_messages: false,
        can_manage_video_chats: false,
        can_restrict_members: false,
        can_promote_members: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
      });

      // Remove from local state
      this.adminSet.delete(target.userId);
      this.adminDetails.delete(target.userId);

      const name = target.username ? `@${target.username}` : target.firstName;
      await bot.sendMessage(chatId,
        `🔴 *Admin Demoted*\n\n👤 ${name} (\`${target.userId}\`)\n❌ Administrator privileges revoked.`,
        { parse_mode: 'Markdown' }
      );

      logger.info('ADMIN', `User ${target.userId} (@${target.username}) demoted by ${userId}`);
    } catch (err) {
      const errMsg = err?.message || String(err);
      logger.error('ADMIN', `Demote failed for ${target.userId}`, err);

      if (errMsg.includes('not enough rights')) {
        return bot.sendMessage(chatId, '❌ Bot does not have enough rights to demote members. Make sure the bot has "Add new admins" permission.');
      }
      if (errMsg.includes('CHAT_ADMIN_REQUIRED')) {
        return bot.sendMessage(chatId, '❌ Bot needs admin privileges to manage other admins.');
      }
      return bot.sendMessage(chatId, `❌ Failed to demote: ${errMsg}`);
    }
  }
}

// Create and export singleton instance
const adminManager = new AdminManager();
export default adminManager;

// Utility function for backward compatibility
export const isAdmin = (userId) => adminManager.isAdmin(userId);
