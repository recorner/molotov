// pinManager.js - Manages transaction PINs for security
import crypto from 'crypto';
import db from '../database.js';
import encryptionManager from './encryption.js';
import logger from './logger.js';

class PinManager {
  constructor() {
    this.activePinSessions = new Map();
    this.pinAttempts = new Map();
    this.maxAttempts = 3;
    this.lockoutDuration = 300000; // 5 minutes
  }

  // Hash PIN securely using encryption manager
  hashPin(pin) {
    return encryptionManager.hashPassword(pin);
  }

  // Verify PIN using encryption manager
  verifyPin(pin, storedHash) {
    return encryptionManager.verifyPassword(pin, storedHash);
  }

  // Set PIN for user
  async setPin(userId, pin) {
    if (!/^\d{4,8}$/.test(pin)) {
      throw new Error('PIN must be 4-8 digits');
    }

    const { hash } = this.hashPin(pin);
    const timestamp = new Date().toISOString();

    return new Promise((resolve, reject) => {
      // Check if user already has a PIN
      db.get(
        `SELECT id FROM transaction_pins WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) return reject(err);

          if (row) {
            // Update existing PIN
            db.run(
              `UPDATE transaction_pins SET pin_hash = ?, created_at = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?`,
              [hash, timestamp, userId],
              (err) => {
                if (err) {
                  logger.error('PIN', `Failed to update PIN for user ${userId}`, err);
                  reject(err);
                } else {
                  logger.logSecurity('PIN_UPDATED', userId, true);
                  resolve({ success: true, message: 'PIN updated successfully' });
                }
              }
            );
          } else {
            // Create new PIN
            db.run(
              `INSERT INTO transaction_pins (user_id, pin_hash, created_at) VALUES (?, ?, ?)`,
              [userId, hash, timestamp],
              (err) => {
                if (err) {
                  logger.error('PIN', `Failed to create PIN for user ${userId}`, err);
                  reject(err);
                } else {
                  logger.logSecurity('PIN_CREATED', userId, true);
                  resolve({ success: true, message: 'PIN created successfully' });
                }
              }
            );
          }
        }
      );
    });
  }

  // Verify PIN for user
  async verifyUserPin(userId, pin) {
    // Check if user is locked out
    const lockout = await this.checkDatabaseLockout(userId);
    if (lockout.locked) {
      const timeLeft = Math.ceil(lockout.timeLeft / 1000);
      logger.logSecurity('PIN_VERIFY_LOCKOUT', userId, false, { timeLeft });
      throw new Error(`Too many failed attempts. Try again in ${timeLeft} seconds.`);
    }

    return new Promise((resolve, reject) => {
      db.get(
        `SELECT pin_hash, failed_attempts FROM transaction_pins WHERE user_id = ?`,
        [userId],
        async (err, row) => {
          if (err) return reject(err);
          
          if (!row) {
            logger.logSecurity('PIN_VERIFY_NO_PIN', userId, false);
            return reject(new Error('No PIN set for this user'));
          }

          const isValid = this.verifyPin(pin, row.pin_hash);
          
          if (isValid) {
            // Reset failed attempts and update last used
            await this.resetFailedAttempts(userId);
            
            db.run(
              `UPDATE transaction_pins SET last_used = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?`,
              [new Date().toISOString(), userId]
            );
            
            logger.logSecurity('PIN_VERIFY_SUCCESS', userId, true);
            resolve({ success: true, message: 'PIN verified successfully' });
          } else {
            // Track failed attempt in database
            await this.trackFailedAttemptDB(userId);
            logger.logSecurity('PIN_VERIFY_FAILED', userId, false, { attempts: row.failed_attempts + 1 });
            reject(new Error('Invalid PIN'));
          }
        }
      );
    });
  }

  // Track failed PIN attempts in database
  async trackFailedAttemptDB(userId) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE transaction_pins 
         SET failed_attempts = failed_attempts + 1,
             locked_until = CASE 
               WHEN failed_attempts + 1 >= ? 
               THEN datetime('now', '+${this.lockoutDuration / 1000} seconds')
               ELSE locked_until 
             END
         WHERE user_id = ?`,
        [this.maxAttempts, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Reset failed attempts
  async resetFailedAttempts(userId) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE transaction_pins SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?`,
        [userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Check database lockout status
  async checkDatabaseLockout(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT failed_attempts, locked_until FROM transaction_pins WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) return reject(err);
          
          if (!row || row.failed_attempts < this.maxAttempts) {
            return resolve({ locked: false, timeLeft: 0 });
          }
          
          if (row.locked_until) {
            const lockoutEnd = new Date(row.locked_until).getTime();
            const now = Date.now();
            const timeLeft = lockoutEnd - now;
            
            if (timeLeft <= 0) {
              // Lockout expired, reset
              this.resetFailedAttempts(userId);
              return resolve({ locked: false, timeLeft: 0 });
            }
            
            return resolve({ locked: true, timeLeft });
          }
          
          resolve({ locked: false, timeLeft: 0 });
        }
      );
    });
  }

  // Generate secure temporary PIN
  generateTemporaryPin() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit PIN
  }

  // Create PIN verification session
  createPinSession(userId, action, data = {}) {
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + 300000; // 5 minutes
    
    this.activePinSessions.set(sessionId, {
      userId,
      action,
      data,
      expiresAt,
      verified: false,
      createdAt: Date.now()
    });
    
    // Auto-cleanup expired session
    setTimeout(() => {
      if (this.activePinSessions.has(sessionId)) {
        this.activePinSessions.delete(sessionId);
        logger.debug('PIN', `Auto-cleaned expired session: ${sessionId}`);
      }
    }, 300000);
    
    logger.debug('PIN', `Created PIN session for user ${userId}`, { sessionId, action });
    return sessionId;
  }

  // Verify PIN for session
  async verifyPinSession(sessionId, pin) {
    const session = this.activePinSessions.get(sessionId);
    
    if (!session) {
      logger.logSecurity('PIN_SESSION_INVALID', 0, false, { sessionId });
      throw new Error('Invalid or expired session');
    }
    
    if (Date.now() > session.expiresAt) {
      this.activePinSessions.delete(sessionId);
      logger.logSecurity('PIN_SESSION_EXPIRED', session.userId, false, { sessionId });
      throw new Error('Session expired');
    }
    
    try {
      await this.verifyUserPin(session.userId, pin);
      session.verified = true;
      session.verifiedAt = Date.now();
      logger.logSecurity('PIN_SESSION_VERIFIED', session.userId, true, { sessionId });
      return session;
    } catch (error) {
      logger.logSecurity('PIN_SESSION_VERIFY_FAILED', session.userId, false, { sessionId, error: error.message });
      throw error;
    }
  }

  // Get PIN session
  getPinSession(sessionId) {
    const session = this.activePinSessions.get(sessionId);
    
    if (!session || Date.now() > session.expiresAt) {
      this.activePinSessions.delete(sessionId);
      return null;
    }
    
    return session;
  }

  // Remove PIN session
  removePinSession(sessionId) {
    const deleted = this.activePinSessions.delete(sessionId);
    if (deleted) {
      logger.debug('PIN', `Removed PIN session: ${sessionId}`);
    }
    return deleted;
  }

  // Check if user has PIN set
  async hasPin(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM transaction_pins WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
  }

  // Remove PIN for user
  async removePin(userId) {
    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM transaction_pins WHERE user_id = ?`,
        [userId],
        (err) => {
          if (err) {
            logger.error('PIN', `Failed to remove PIN for user ${userId}`, err);
            reject(err);
          } else {
            this.pinAttempts.delete(userId);
            logger.logSecurity('PIN_REMOVED', userId, true);
            resolve({ success: true, message: 'PIN removed successfully' });
          }
        }
      );
    });
  }

  // Get PIN statistics
  async getPinStats(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT created_at, last_used, failed_attempts, locked_until FROM transaction_pins WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) return reject(err);
          
          const lockout = row && row.locked_until ? {
            locked: new Date(row.locked_until) > new Date(),
            lockedUntil: row.locked_until
          } : { locked: false, lockedUntil: null };
          
          resolve({
            hasPin: !!row,
            createdAt: row?.created_at,
            lastUsed: row?.last_used,
            failedAttempts: row?.failed_attempts || 0,
            lockout
          });
        }
      );
    });
  }

  // Get session statistics
  getSessionStats() {
    const now = Date.now();
    let activeCount = 0;
    let expiredCount = 0;
    let verifiedCount = 0;
    
    for (const session of this.activePinSessions.values()) {
      if (now > session.expiresAt) {
        expiredCount++;
      } else {
        activeCount++;
        if (session.verified) {
          verifiedCount++;
        }
      }
    }
    
    return {
      total: this.activePinSessions.size,
      active: activeCount,
      expired: expiredCount,
      verified: verifiedCount
    };
  }

  // Cleanup expired sessions
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.activePinSessions.entries()) {
      if (now > session.expiresAt) {
        this.activePinSessions.delete(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('PIN', `Cleaned up ${cleanedCount} expired PIN sessions`);
    }
    
    return cleanedCount;
  }

  // Audit all PIN operations
  async auditPinOperations(userId = null, limit = 100) {
    return new Promise((resolve, reject) => {
      let query = `SELECT * FROM security_log WHERE action LIKE 'PIN_%' ORDER BY timestamp DESC LIMIT ?`;
      let params = [limit];
      
      if (userId) {
        query = `SELECT * FROM security_log WHERE user_id = ? AND action LIKE 'PIN_%' ORDER BY timestamp DESC LIMIT ?`;
        params = [userId, limit];
      }
      
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

export default PinManager;
