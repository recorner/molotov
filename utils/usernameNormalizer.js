// utils/usernameNormalizer.js - Daily username sync & account cleanup service
// v2 — concurrent batches, live progress, strict deletion rules
import db from '../database.js';
import logger from './logger.js';
import cron from 'node-cron';
import { ADMIN_GROUP } from '../config.js';

class UsernameNormalizer {
  constructor() {
    this.isRunning = false;
    this.lastRunResults = null;

    // ── Tuning knobs ──
    this.BATCH_SIZE = 25;            // concurrent getChat calls per batch
    this.BATCH_PAUSE_MS = 1100;      // pause between batches (Telegram ≤ 30/s)
    this.PROGRESS_EDIT_INTERVAL = 2; // edit progress message every N batches
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DB helpers (promisified)
  // ═══════════════════════════════════════════════════════════════════════

  _getAllUsers() {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT id, telegram_id, username, first_name, last_name FROM users ORDER BY id',
        [],
        (err, rows) => (err ? reject(err) : resolve(rows || []))
      );
    });
  }

  _updateUsername(telegramId, newUsername) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET username = ?, last_activity = ? WHERE telegram_id = ?',
        [newUsername, new Date().toISOString(), telegramId],
        function (err) { err ? reject(err) : resolve(this.changes); }
      );
    });
  }

  _deleteUser(telegramId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM users WHERE telegram_id = ?',
        [telegramId],
        function (err) { err ? reject(err) : resolve(this.changes); }
      );
    });
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Deletion policy — STRICT: only truly gone accounts
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Decide if a successful getChat response indicates a deleted account.
   * Only returns true for accounts Telegram explicitly marks as deleted.
   */
  _isChatDeleted(chat) {
    if (!chat) return true;
    if (chat.first_name === 'Deleted Account') return true;
    // Completely blank private chat = ghost record
    if (chat.type === 'private' && !chat.first_name && !chat.last_name && !chat.username) return true;
    return false;
  }

  /**
   * Classify a Telegram API error to decide what action to take.
   *
   * CRITICAL RULES:
   *   "user is deactivated"  → account is genuinely gone     → DELETE
   *   "chat not found"       → bot can't resolve, user exists → KEEP (skip)
   *   "bot was blocked"      → real user, blocked the bot     → KEEP (skip)
   *   "PEER_ID_INVALID"      → bot never interacted           → KEEP (skip)
   *   "user not found"       → can't resolve                  → KEEP (skip)
   *   anything else          → unknown                        → KEEP (skip)
   */
  _classifyError(errMsg) {
    const msg = (errMsg || '').toLowerCase();

    // ── Definitely deleted ──
    if (msg.includes('user is deactivated')) return 'deleted';

    // ── User exists but we can't reach them ──
    if (msg.includes('chat not found'))   return 'unreachable';
    if (msg.includes('bot was blocked'))  return 'blocked';
    if (msg.includes('peer_id_invalid'))  return 'unreachable';
    if (msg.includes('user not found'))   return 'unreachable';

    // ── Everything else ──
    return 'error';
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Live progress bar
  // ═══════════════════════════════════════════════════════════════════════

  _buildProgressMessage(results, totalUsers, elapsedMs) {
    const pct = totalUsers > 0 ? Math.round((results.checked / totalUsers) * 100) : 0;
    const filled = Math.round(pct / 5);   // 20-char bar
    const empty = 20 - filled;
    const bar = '▓'.repeat(filled) + '░'.repeat(empty);

    const elapsedSec = (elapsedMs / 1000).toFixed(0);
    const rate = results.checked / (elapsedMs / 1000 || 1);
    const remaining = totalUsers - results.checked;
    const etaSec = rate > 0 ? Math.round(remaining / rate) : '??';

    const lines = [
      `🔄 *Username Sync In Progress...*\n`,
      `${bar}  ${pct}%`,
      `📊 ${results.checked} / ${totalUsers} users checked`,
      `✏️ ${results.usernameUpdated.length} usernames updated`,
      `🗑️ ${results.deletedAccounts.length} deleted accounts removed`,
      `⚠️ ${results.unreachable.length} unreachable (skipped)`,
      `🚫 ${results.blocked.length} blocked bot (skipped)`,
      `⏱️ Elapsed: ${elapsedSec}s | ETA: ~${etaSec}s`
    ];
    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Process one user (pure logic, no sleep)
  // ═══════════════════════════════════════════════════════════════════════

  async _processUser(bot, user, results) {
    try {
      const chat = await bot.getChat(user.telegram_id);

      // ── Deleted account (successful API response but marked deleted) ──
      if (this._isChatDeleted(chat)) {
        await this._deleteUser(user.telegram_id);
        results.deletedAccounts.push({
          telegramId: user.telegram_id,
          username: user.username || 'N/A',
          firstName: user.first_name || 'N/A',
          reason: 'Deleted / deactivated account'
        });
        logger.info('USERNAME_SYNC', `Removed deleted account: ${user.telegram_id} (@${user.username || 'none'})`);
        return;
      }

      // ── Username change detection ──
      const currentUsername = chat.username || null;
      const storedUsername = user.username || null;

      if (currentUsername !== storedUsername) {
        await this._updateUsername(user.telegram_id, currentUsername);

        if (currentUsername) {
          results.usernameUpdated.push({
            telegramId: user.telegram_id,
            oldUsername: storedUsername || '(none)',
            newUsername: currentUsername
          });
          logger.info('USERNAME_SYNC', `Username updated: ${user.telegram_id} @${storedUsername || 'none'} → @${currentUsername}`);
        } else {
          results.noUsername.push({
            telegramId: user.telegram_id,
            firstName: chat.first_name || user.first_name || 'Unknown'
          });
          logger.warn('USERNAME_SYNC', `User ${user.telegram_id} (${chat.first_name}) removed their username`);
        }
      }
    } catch (apiErr) {
      const errMsg = apiErr?.message || String(apiErr);
      const classification = this._classifyError(errMsg);

      switch (classification) {
        case 'deleted':
          await this._deleteUser(user.telegram_id);
          results.deletedAccounts.push({
            telegramId: user.telegram_id,
            username: user.username || 'N/A',
            firstName: user.first_name || 'N/A',
            reason: errMsg
          });
          logger.info('USERNAME_SYNC', `Removed deactivated account: ${user.telegram_id} (${errMsg})`);
          break;

        case 'unreachable':
          results.unreachable.push({
            telegramId: user.telegram_id,
            username: user.username || 'N/A',
            firstName: user.first_name || 'N/A',
            reason: errMsg
          });
          logger.debug('USERNAME_SYNC', `User unreachable (kept): ${user.telegram_id} — ${errMsg}`);
          break;

        case 'blocked':
          results.blocked.push({
            telegramId: user.telegram_id,
            username: user.username || 'N/A',
            firstName: user.first_name || 'N/A'
          });
          logger.debug('USERNAME_SYNC', `User blocked bot (kept): ${user.telegram_id}`);
          break;

        default:
          results.errors.push({ telegramId: user.telegram_id, error: errMsg });
          logger.error('USERNAME_SYNC', `Unexpected error for ${user.telegram_id}: ${errMsg}`);
          break;
      }
    } finally {
      results.checked++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Main normalization runner — batched & concurrent
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * @param {Object} bot           - Telegram bot instance
   * @param {Object} [progressCtx] - { chatId, messageId } for live editing
   */
  async runNormalization(bot, progressCtx = null) {
    if (this.isRunning) {
      logger.warn('USERNAME_SYNC', 'Normalization already in progress, skipping');
      return { error: 'Already running' };
    }

    this.isRunning = true;
    const startTime = Date.now();

    const results = {
      totalUsers: 0,
      checked: 0,
      usernameUpdated: [],
      deletedAccounts: [],
      noUsername: [],
      unreachable: [],   // "chat not found" — kept in DB
      blocked: [],       // "bot was blocked" — kept in DB
      errors: [],
      duration: 0
    };

    try {
      const users = await this._getAllUsers();
      results.totalUsers = users.length;
      logger.info('USERNAME_SYNC', `Starting normalization for ${users.length} users (batch size: ${this.BATCH_SIZE})`);

      // Split users into batches
      const batches = [];
      for (let i = 0; i < users.length; i += this.BATCH_SIZE) {
        batches.push(users.slice(i, i + this.BATCH_SIZE));
      }

      let batchIndex = 0;

      for (const batch of batches) {
        // Fire all getChat calls in this batch concurrently
        await Promise.allSettled(
          batch.map((user) => this._processUser(bot, user, results))
        );

        batchIndex++;

        // ── Live progress update ──
        if (progressCtx && (batchIndex % this.PROGRESS_EDIT_INTERVAL === 0 || batchIndex === batches.length)) {
          const elapsed = Date.now() - startTime;
          const progressText = this._buildProgressMessage(results, users.length, elapsed);
          try {
            await bot.editMessageText(progressText, {
              chat_id: progressCtx.chatId,
              message_id: progressCtx.messageId,
              parse_mode: 'Markdown'
            });
          } catch {
            // Edit can fail if text didn't change or rate-limited — ignore
          }
        }

        // Pause between batches to respect rate limits (skip after last batch)
        if (batchIndex < batches.length) {
          await this._sleep(this.BATCH_PAUSE_MS);
        }
      }

      results.duration = Date.now() - startTime;
      this.lastRunResults = results;

      logger.info('USERNAME_SYNC',
        `Normalization complete in ${(results.duration / 1000).toFixed(1)}s — ` +
        `checked: ${results.checked}, updated: ${results.usernameUpdated.length}, ` +
        `deleted: ${results.deletedAccounts.length}, unreachable: ${results.unreachable.length}, ` +
        `blocked: ${results.blocked.length}, errors: ${results.errors.length}`
      );

      return results;
    } catch (err) {
      logger.error('USERNAME_SYNC', 'Normalization failed', err);
      results.duration = Date.now() - startTime;
      this.lastRunResults = results;
      return results;
    } finally {
      this.isRunning = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Report formatting
  // ═══════════════════════════════════════════════════════════════════════

  formatReport(results) {
    const duration = (results.duration / 1000).toFixed(1);
    const lines = [];

    lines.push(`🔄 *Username Sync Report*\n`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📊 *Overview*`);
    lines.push(`• Total users scanned: ${results.totalUsers}`);
    lines.push(`• Successfully checked: ${results.checked}`);
    lines.push(`• Duration: ${duration}s\n`);

    // Updated usernames
    if (results.usernameUpdated.length > 0) {
      lines.push(`✏️ *Usernames Updated (${results.usernameUpdated.length})*`);
      for (const u of results.usernameUpdated.slice(0, 25)) {
        lines.push(`  • \`${u.telegramId}\` @${u.oldUsername} → @${u.newUsername}`);
      }
      if (results.usernameUpdated.length > 25) {
        lines.push(`  _…and ${results.usernameUpdated.length - 25} more_`);
      }
      lines.push('');
    }

    // Deleted accounts (only truly confirmed ones)
    if (results.deletedAccounts.length > 0) {
      lines.push(`🗑️ *Removed Accounts (${results.deletedAccounts.length})*`);
      for (const d of results.deletedAccounts.slice(0, 15)) {
        lines.push(`  • \`${d.telegramId}\` @${d.username} — ${d.reason}`);
      }
      if (results.deletedAccounts.length > 15) {
        lines.push(`  _…and ${results.deletedAccounts.length - 15} more_`);
      }
      lines.push('');
    }

    // Unreachable (kept — not deleted)
    if (results.unreachable.length > 0) {
      lines.push(`🔇 *Unreachable — kept in DB (${results.unreachable.length})*`);
      for (const u of results.unreachable.slice(0, 10)) {
        lines.push(`  • \`${u.telegramId}\` @${u.username}`);
      }
      if (results.unreachable.length > 10) {
        lines.push(`  _…and ${results.unreachable.length - 10} more_`);
      }
      lines.push('');
    }

    // Blocked
    if (results.blocked.length > 0) {
      lines.push(`🚫 *Blocked Bot — kept in DB (${results.blocked.length})*`);
      for (const b of results.blocked.slice(0, 10)) {
        lines.push(`  • \`${b.telegramId}\` @${b.username}`);
      }
      if (results.blocked.length > 10) {
        lines.push(`  _…and ${results.blocked.length - 10} more_`);
      }
      lines.push('');
    }

    // No username
    if (results.noUsername.length > 0) {
      lines.push(`⚠️ *No Username Set (${results.noUsername.length})*`);
      for (const n of results.noUsername.slice(0, 10)) {
        lines.push(`  • \`${n.telegramId}\` (${n.firstName})`);
      }
      if (results.noUsername.length > 10) {
        lines.push(`  _…and ${results.noUsername.length - 10} more_`);
      }
      lines.push('');
    }

    // Errors
    if (results.errors.length > 0) {
      lines.push(`❌ *Errors (${results.errors.length})*`);
      for (const e of results.errors.slice(0, 5)) {
        lines.push(`  • \`${e.telegramId}\` — ${e.error}`);
      }
      if (results.errors.length > 5) {
        lines.push(`  _…and ${results.errors.length - 5} more_`);
      }
      lines.push('');
    }

    // All clean
    if (
      results.usernameUpdated.length === 0 &&
      results.deletedAccounts.length === 0 &&
      results.noUsername.length === 0 &&
      results.errors.length === 0
    ) {
      lines.push(`✅ *All users are up to date — no changes needed.*`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🕒 ${new Date().toLocaleString()}`);

    let text = lines.join('\n');
    if (text.length > 4000) {
      text = text.substring(0, 3950) + '\n\n_…report truncated_';
    }
    return text;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Admin notification
  // ═══════════════════════════════════════════════════════════════════════

  async notifyAdmins(bot, results) {
    if (!ADMIN_GROUP) {
      logger.warn('USERNAME_SYNC', 'ADMIN_GROUP not configured, cannot send report');
      return;
    }

    const report = this.formatReport(results);

    try {
      await bot.sendMessage(ADMIN_GROUP, report, { parse_mode: 'Markdown' });
      logger.info('USERNAME_SYNC', 'Sync report sent to admin group');
    } catch (err) {
      logger.error('USERNAME_SYNC', 'Failed to send sync report to admin group', err);
      try {
        await bot.sendMessage(ADMIN_GROUP, report.replace(/[*_`]/g, ''));
      } catch (fallbackErr) {
        logger.error('USERNAME_SYNC', 'Fallback report also failed', fallbackErr);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Daily cron
  // ═══════════════════════════════════════════════════════════════════════

  setupDailySync(bot, cronExpression = '0 3 * * *', timezone = 'Africa/Nairobi') {
    logger.info('USERNAME_SYNC', `Daily username sync scheduled: "${cronExpression}" (${timezone})`);

    cron.schedule(cronExpression, async () => {
      logger.info('USERNAME_SYNC', 'Daily cron triggered — starting normalization');

      // For cron runs, send a "started" message then use it for live progress
      let progressCtx = null;
      if (ADMIN_GROUP) {
        try {
          const msg = await bot.sendMessage(ADMIN_GROUP,
            '🔄 *Username Sync Starting...*\n\nPreparing to scan all users…',
            { parse_mode: 'Markdown' }
          );
          progressCtx = { chatId: ADMIN_GROUP, messageId: msg.message_id };
        } catch {
          // Non-critical — proceed without live progress
        }
      }

      const results = await this.runNormalization(bot, progressCtx);

      // Replace the progress message with the final report
      if (progressCtx) {
        const report = this.formatReport(results);
        try {
          await bot.editMessageText(report, {
            chat_id: progressCtx.chatId,
            message_id: progressCtx.messageId,
            parse_mode: 'Markdown'
          });
        } catch {
          // If edit fails, send as new message
          await this.notifyAdmins(bot, results);
        }
      } else {
        await this.notifyAdmins(bot, results);
      }
    }, { timezone });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  /merger command handler
  // ═══════════════════════════════════════════════════════════════════════

  async handleMergerCommand(bot, msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    // Dynamic admin check
    const adminManager = (await import('./adminManager.js')).default;
    const isAdmin = await adminManager.isAdmin(userId);
    if (!isAdmin) {
      return bot.sendMessage(chatId, '⛔ This command is restricted to administrators.');
    }

    if (this.isRunning) {
      return bot.sendMessage(chatId, '⏳ Username normalization is already running. Please wait…');
    }

    // Send initial progress message
    const ack = await bot.sendMessage(chatId,
      '🔄 *Username Sync Starting...*\n\nPreparing to scan all users…',
      { parse_mode: 'Markdown' }
    );

    const progressCtx = { chatId, messageId: ack.message_id };

    // Run with live progress
    const results = await this.runNormalization(bot, progressCtx);
    const report = this.formatReport(results);

    // Replace progress with final report
    try {
      await bot.editMessageText(report, {
        chat_id: chatId,
        message_id: ack.message_id,
        parse_mode: 'Markdown'
      });
    } catch {
      await bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
    }

    // Cross-post to admin group if command wasn't run there
    if (ADMIN_GROUP && chatId !== ADMIN_GROUP) {
      await this.notifyAdmins(bot, results);
    }
  }
}

// Export singleton
const usernameNormalizer = new UsernameNormalizer();
export default usernameNormalizer;
