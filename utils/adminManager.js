// utils/adminManager.js
import db from '../database.js';
import logger from './logger.js';

class AdminManager {
  constructor() {
    this.adminCache = new Map(); // Cache for performance
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = 0;
  }

  // === Dynamic Admin Recognition ===
  
  /**
   * Check if a user is an admin in any registered admin group
   * @param {number} userId - Telegram user ID
   * @returns {Promise<boolean>}
   */
  async isAdmin(userId) {
    try {
      // Check cache first
      if (this.adminCache.has(userId) && (Date.now() - this.lastCacheUpdate) < this.cacheExpiry) {
        return this.adminCache.get(userId);
      }

      return new Promise((resolve) => {
        db.get(`
          SELECT COUNT(*) as count 
          FROM group_admins ga
          JOIN admin_groups ag ON ga.group_id = ag.group_id
          WHERE ga.user_id = ? AND ag.is_active = 1
        `, [userId], (err, row) => {
          if (err) {
            logger.error('ADMIN', `Error checking admin status for user ${userId}`, err);
            resolve(false);
            return;
          }

          const isAdmin = row && row.count > 0;
          this.adminCache.set(userId, isAdmin);
          this.lastCacheUpdate = Date.now();
          resolve(isAdmin);
        });
      });
    } catch (error) {
      logger.error('ADMIN', `Admin check failed for user ${userId}`, error);
      return false;
    }
  }

  /**
   * Add an admin group to the system
   * @param {number} groupId - Telegram group ID
   * @param {string} groupName - Group name
   * @returns {Promise<boolean>}
   */
  async addAdminGroup(groupId, groupName = null) {
    return new Promise((resolve) => {
      db.run(`
        INSERT OR REPLACE INTO admin_groups (group_id, group_name, is_active)
        VALUES (?, ?, 1)
      `, [groupId, groupName], (err) => {
        if (err) {
          logger.error('ADMIN', `Failed to add admin group ${groupId}`, err);
          resolve(false);
          return;
        }

        logger.info('ADMIN', `Admin group ${groupId} (${groupName}) added successfully`);
        this.clearCache();
        resolve(true);
      });
    });
  }

  /**
   * Update admin list from a group's current administrators
   * @param {object} bot - Telegram bot instance
   * @param {number} groupId - Telegram group ID
   * @returns {Promise<number>} Number of admins updated
   */
  async updateAdminsFromGroup(bot, groupId) {
    try {
      // Get current group administrators from Telegram
      const admins = await bot.getChatAdministrators(groupId);
      let updatedCount = 0;

      for (const admin of admins) {
        if (admin.user.is_bot) continue; // Skip bots

        const success = await this.addGroupAdmin(
          groupId,
          admin.user.id,
          admin.user.username,
          admin.user.first_name,
          admin.status
        );

        if (success) updatedCount++;
      }

      logger.info('ADMIN', `Updated ${updatedCount} admins from group ${groupId}`);
      return updatedCount;
    } catch (error) {
      logger.error('ADMIN', `Failed to update admins from group ${groupId}`, error);
      return 0;
    }
  }

  /**
   * Add a group admin to the database
   * @param {number} groupId - Group ID
   * @param {number} userId - User ID
   * @param {string} username - Username
   * @param {string} firstName - First name
   * @param {string} status - Admin status
   * @returns {Promise<boolean>}
   */
  async addGroupAdmin(groupId, userId, username, firstName, status = 'administrator') {
    return new Promise((resolve) => {
      db.run(`
        INSERT OR REPLACE INTO group_admins 
        (group_id, user_id, username, first_name, status, last_seen)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [groupId, userId, username, firstName, status], (err) => {
        if (err) {
          logger.error('ADMIN', `Failed to add group admin ${userId}`, err);
          resolve(false);
          return;
        }

        this.clearCache();
        resolve(true);
      });
    });
  }

  /**
   * Remove an admin group
   * @param {number} groupId - Group ID to remove
   * @returns {Promise<boolean>}
   */
  async removeAdminGroup(groupId) {
    return new Promise((resolve) => {
      db.run(`UPDATE admin_groups SET is_active = 0 WHERE group_id = ?`, [groupId], (err) => {
        if (err) {
          logger.error('ADMIN', `Failed to remove admin group ${groupId}`, err);
          resolve(false);
          return;
        }

        logger.info('ADMIN', `Admin group ${groupId} deactivated`);
        this.clearCache();
        resolve(true);
      });
    });
  }

  /**
   * Get all active admin groups
   * @returns {Promise<Array>}
   */
  async getAdminGroups() {
    return new Promise((resolve) => {
      db.all(`
        SELECT ag.*, COUNT(ga.user_id) as admin_count
        FROM admin_groups ag
        LEFT JOIN group_admins ga ON ag.group_id = ga.group_id
        WHERE ag.is_active = 1
        GROUP BY ag.group_id
        ORDER BY ag.added_at DESC
      `, [], (err, rows) => {
        if (err) {
          logger.error('ADMIN', 'Failed to fetch admin groups', err);
          resolve([]);
          return;
        }

        resolve(rows || []);
      });
    });
  }

  /**
   * Get all admins from all groups
   * @returns {Promise<Array>}
   */
  async getAllAdmins() {
    return new Promise((resolve) => {
      db.all(`
        SELECT DISTINCT ga.user_id, ga.username, ga.first_name, 
               COUNT(ga.group_id) as group_count,
               MAX(ga.last_seen) as last_seen
        FROM group_admins ga
        JOIN admin_groups ag ON ga.group_id = ag.group_id
        WHERE ag.is_active = 1
        GROUP BY ga.user_id
        ORDER BY ga.last_seen DESC
      `, [], (err, rows) => {
        if (err) {
          logger.error('ADMIN', 'Failed to fetch all admins', err);
          resolve([]);
          return;
        }

        resolve(rows || []);
      });
    });
  }

  /**
   * Get admin info for a specific user
   * @param {number} userId - User ID
   * @returns {Promise<object|null>}
   */
  async getAdminInfo(userId) {
    return new Promise((resolve) => {
      db.get(`
        SELECT ga.*, ag.group_name
        FROM group_admins ga
        JOIN admin_groups ag ON ga.group_id = ag.group_id
        WHERE ga.user_id = ? AND ag.is_active = 1
        ORDER BY ga.last_seen DESC
        LIMIT 1
      `, [userId], (err, row) => {
        if (err) {
          logger.error('ADMIN', `Failed to get admin info for ${userId}`, err);
          resolve(null);
          return;
        }

        resolve(row || null);
      });
    });
  }

  /**
   * Clear the admin cache
   */
  clearCache() {
    this.adminCache.clear();
    this.lastCacheUpdate = 0;
    logger.debug('ADMIN', 'Admin cache cleared');
  }

  /**
   * Initialize admin system with current admin groups
   * @param {object} bot - Telegram bot instance
   * @param {Array} groupIds - Array of group IDs to initialize
   */
  async initializeAdminSystem(bot, groupIds = []) {
    logger.info('ADMIN', 'Initializing dynamic admin system...');
    
    let totalUpdated = 0;
    
    for (const groupId of groupIds) {
      try {
        // Add group to admin groups
        await this.addAdminGroup(groupId);
        
        // Update admins from group
        const updated = await this.updateAdminsFromGroup(bot, groupId);
        totalUpdated += updated;
      } catch (error) {
        logger.error('ADMIN', `Failed to initialize group ${groupId}`, error);
      }
    }

    logger.info('ADMIN', `Dynamic admin system initialized with ${totalUpdated} admins`);
    return totalUpdated;
  }
}

// Create and export singleton instance
const adminManager = new AdminManager();
export default adminManager;

// Utility function for backward compatibility
export const isAdmin = (userId) => adminManager.isAdmin(userId);
