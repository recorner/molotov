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

  _getFullUser(telegramId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE telegram_id = ?',
        [telegramId],
        (err, row) => (err ? reject(err) : resolve(row || null))
      );
    });
  }

  /**
   * Archive a user to the removed_users_ledger before deleting them.
   * Preserves all original data for future reference.
   */
  async _archiveToLedger(telegramId, category, reason, apiErrorMsg = null) {
    const user = await this._getFullUser(telegramId);
    if (!user) return; // Already gone

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO removed_users_ledger
          (telegram_id, username, first_name, last_name, language_code,
           original_created_at, last_activity, removal_reason, removal_category, api_error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.telegram_id,
          user.username || null,
          user.first_name || null,
          user.last_name || null,
          user.language_code || null,
          user.created_at || null,
          user.last_activity || null,
          reason,
          category,
          apiErrorMsg
        ],
        function (err) { err ? reject(err) : resolve(this.lastID); }
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
   * STRICT POLICY — only confirmed-reachable users stay:
   *   "user is deactivated"  → account is genuinely gone     → ARCHIVE + DELETE
   *   "chat not found"       → bot can't resolve the user    → ARCHIVE + DELETE
   *   "bot was blocked"      → user blocked the bot           → ARCHIVE + DELETE
   *   "PEER_ID_INVALID"      → bot never interacted           → ARCHIVE + DELETE
   *   "user not found"       → can't resolve                  → ARCHIVE + DELETE
   *   anything else          → transient / unknown            → KEEP (skip)
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

    const totalArchived = results.deletedAccounts.length + results.unreachable.length + results.blocked.length;
    const lines = [
      `🔄 *Username Sync In Progress...*\n`,
      `${bar}  ${pct}%`,
      `📊 ${results.checked} / ${totalUsers} users checked`,
      `✅ ${results.confirmed} confirmed reachable`,
      `✏️ ${results.usernameUpdated.length} usernames updated`,
      `📦 ${totalArchived} archived to ledger:`,
      `  🗑️ ${results.deletedAccounts.length} deleted`,
      `  🔇 ${results.unreachable.length} unreachable`,
      `  🚫 ${results.blocked.length} blocked`,
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
        await this._archiveToLedger(user.telegram_id, 'deleted', 'Deleted / deactivated account (API confirmed)');
        await this._deleteUser(user.telegram_id);
        results.deletedAccounts.push({
          telegramId: user.telegram_id,
          username: user.username || 'N/A',
          firstName: user.first_name || 'N/A',
          reason: 'Deleted / deactivated account'
        });
        logger.info('USERNAME_SYNC', `Archived & removed deleted account: ${user.telegram_id} (@${user.username || 'none'})`);
        return;
      }

      // ── User is confirmed reachable — mark as verified ──
      results.confirmed++;

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
          await this._archiveToLedger(user.telegram_id, 'deleted', 'Account deactivated', errMsg);
          await this._deleteUser(user.telegram_id);
          results.deletedAccounts.push({
            telegramId: user.telegram_id,
            username: user.username || 'N/A',
            firstName: user.first_name || 'N/A',
            reason: errMsg
          });
          logger.info('USERNAME_SYNC', `Archived & removed deactivated account: ${user.telegram_id} (${errMsg})`);
          break;

        case 'unreachable':
          await this._archiveToLedger(user.telegram_id, 'unreachable', 'Chat not found / unresolvable', errMsg);
          await this._deleteUser(user.telegram_id);
          results.unreachable.push({
            telegramId: user.telegram_id,
            username: user.username || 'N/A',
            firstName: user.first_name || 'N/A',
            reason: errMsg
          });
          logger.info('USERNAME_SYNC', `Archived & removed unreachable user: ${user.telegram_id} — ${errMsg}`);
          break;

        case 'blocked':
          await this._archiveToLedger(user.telegram_id, 'blocked', 'User blocked the bot', errMsg);
          await this._deleteUser(user.telegram_id);
          results.blocked.push({
            telegramId: user.telegram_id,
            username: user.username || 'N/A',
            firstName: user.first_name || 'N/A'
          });
          logger.info('USERNAME_SYNC', `Archived & removed blocked user: ${user.telegram_id}`);
          break;

        default:
          // Transient / unknown errors — keep the user, don't archive
          results.errors.push({ telegramId: user.telegram_id, error: errMsg });
          logger.error('USERNAME_SYNC', `Transient error (user kept): ${user.telegram_id}: ${errMsg}`);
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
      confirmed: 0,       // users confirmed reachable — the ONLY ones kept
      usernameUpdated: [],
      deletedAccounts: [], // archived + removed
      noUsername: [],
      unreachable: [],     // archived + removed (chat not found)
      blocked: [],         // archived + removed (bot was blocked)
      errors: [],          // transient errors — users kept
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
        `checked: ${results.checked}, confirmed: ${results.confirmed}, ` +
        `updated: ${results.usernameUpdated.length}, ` +
        `archived: ${results.deletedAccounts.length + results.unreachable.length + results.blocked.length} ` +
        `(deleted: ${results.deletedAccounts.length}, unreachable: ${results.unreachable.length}, ` +
        `blocked: ${results.blocked.length}), errors: ${results.errors.length}`
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
    const totalArchived = results.deletedAccounts.length + results.unreachable.length + results.blocked.length;
    const lines = [];

    lines.push(`🔄 *Username Sync Report*\n`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📊 *Overview*`);
    lines.push(`• Total users scanned: ${results.totalUsers}`);
    lines.push(`• Confirmed reachable: ✅ ${results.confirmed}`);
    lines.push(`• Archived to ledger: 📦 ${totalArchived}`);
    lines.push(`• Transient errors (kept): ${results.errors.length}`);
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

    // Deleted accounts (archived to ledger)
    if (results.deletedAccounts.length > 0) {
      lines.push(`🗑️ *Deleted Accounts → Ledger (${results.deletedAccounts.length})*`);
      for (const d of results.deletedAccounts.slice(0, 15)) {
        lines.push(`  • \`${d.telegramId}\` @${d.username} — ${d.reason}`);
      }
      if (results.deletedAccounts.length > 15) {
        lines.push(`  _…and ${results.deletedAccounts.length - 15} more_`);
      }
      lines.push('');
    }

    // Unreachable (archived to ledger)
    if (results.unreachable.length > 0) {
      lines.push(`🔇 *Unreachable → Ledger (${results.unreachable.length})*`);
      for (const u of results.unreachable.slice(0, 10)) {
        lines.push(`  • \`${u.telegramId}\` @${u.username} — ${u.reason}`);
      }
      if (results.unreachable.length > 10) {
        lines.push(`  _…and ${results.unreachable.length - 10} more_`);
      }
      lines.push('');
    }

    // Blocked (archived to ledger)
    if (results.blocked.length > 0) {
      lines.push(`🚫 *Blocked Bot → Ledger (${results.blocked.length})*`);
      for (const b of results.blocked.slice(0, 10)) {
        lines.push(`  • \`${b.telegramId}\` @${b.username}`);
      }
      if (results.blocked.length > 10) {
        lines.push(`  _…and ${results.blocked.length - 10} more_`);
      }
      lines.push('');
    }

    // No username (still confirmed reachable, kept in DB)
    if (results.noUsername.length > 0) {
      lines.push(`⚠️ *No Username Set — kept (${results.noUsername.length})*`);
      for (const n of results.noUsername.slice(0, 10)) {
        lines.push(`  • \`${n.telegramId}\` (${n.firstName})`);
      }
      if (results.noUsername.length > 10) {
        lines.push(`  _…and ${results.noUsername.length - 10} more_`);
      }
      lines.push('');
    }

    // Errors (transient — users kept)
    if (results.errors.length > 0) {
      lines.push(`❌ *Transient Errors — kept (${results.errors.length})*`);
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
      totalArchived === 0 &&
      results.noUsername.length === 0 &&
      results.errors.length === 0
    ) {
      lines.push(`✅ *All users are confirmed & up to date — no changes needed.*`);
    }

    if (totalArchived > 0) {
      lines.push(`💡 _Archived users are saved in the ledger for future reference._`);
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

  // ═══════════════════════════════════════════════════════════════════════
  //  Ledger queries — view archived users
  // ═══════════════════════════════════════════════════════════════════════

  _getLedgerStats() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT removal_category,
                COUNT(*) as count,
                MAX(removed_at) as last_removed
         FROM removed_users_ledger
         WHERE restored_at IS NULL
         GROUP BY removal_category`,
        [],
        (err, rows) => (err ? reject(err) : resolve(rows || []))
      );
    });
  }

  _getLedgerEntries(category = null, limit = 20) {
    const where = category ? 'WHERE removal_category = ? AND restored_at IS NULL' : 'WHERE restored_at IS NULL';
    const params = category ? [category, limit] : [limit];
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM removed_users_ledger ${where} ORDER BY removed_at DESC LIMIT ?`,
        params,
        (err, rows) => (err ? reject(err) : resolve(rows || []))
      );
    });
  }

  _getLedgerTotal() {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as total FROM removed_users_ledger WHERE restored_at IS NULL',
        [],
        (err, row) => (err ? reject(err) : resolve(row?.total || 0))
      );
    });
  }

  /**
   * /ledger command — display archived users summary
   */
  async handleLedgerCommand(bot, msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    const adminManager = (await import('./adminManager.js')).default;
    const isAdmin = await adminManager.isAdmin(userId);
    if (!isAdmin) {
      return bot.sendMessage(chatId, '⛔ This command is restricted to administrators.');
    }

    try {
      const [stats, total] = await Promise.all([
        this._getLedgerStats(),
        this._getLedgerTotal()
      ]);

      const lines = [];
      lines.push(`📦 *Removed Users Ledger*\n`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`📊 *Total archived: ${total}*\n`);

      if (stats.length === 0) {
        lines.push(`✅ Ledger is empty — no users have been removed yet.`);
      } else {
        const icons = { deleted: '🗑️', unreachable: '🔇', blocked: '🚫' };
        for (const row of stats) {
          const icon = icons[row.removal_category] || '❓';
          const lastDate = row.last_removed ? new Date(row.last_removed).toLocaleDateString() : 'N/A';
          lines.push(`${icon} *${row.removal_category}*: ${row.count} users (last: ${lastDate})`);
        }

        lines.push('');

        // Show recent entries
        const recent = await this._getLedgerEntries(null, 10);
        if (recent.length > 0) {
          lines.push(`\n📋 *Recent Removals (last 10)*`);
          for (const entry of recent) {
            const date = new Date(entry.removed_at).toLocaleDateString();
            const cat = entry.removal_category;
            const icon = icons[cat] || '❓';
            lines.push(`  ${icon} \`${entry.telegram_id}\` @${entry.username || 'none'} — ${cat} (${date})`);
          }
        }
      }

      lines.push(`\n━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`💡 _Users are archived here when removed by /merger sync._`);
      lines.push(`_Only users confirmed reachable by the bot stay in the active DB._`);
      lines.push(`🕒 ${new Date().toLocaleString()}`);

      let text = lines.join('\n');
      if (text.length > 4000) {
        text = text.substring(0, 3950) + '\n\n_…report truncated_';
      }

      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('LEDGER', 'Failed to generate ledger report', err);
      await bot.sendMessage(chatId, '❌ Failed to retrieve ledger data. Check logs.');
    }
  }
}

// Export singleton
const usernameNormalizer = new UsernameNormalizer();
export default usernameNormalizer;
