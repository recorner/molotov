// utils/newsSessionManager.js
import logger from './logger.js';

class NewsSessionManager {
  constructor() {
    this.sessions = new Map(); // userId -> session data
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    
    // Cleanup expired sessions every 5 minutes
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }

  /**
   * Create a new editing session for a user
   * @param {number} userId - User ID
   * @param {object} sessionData - Session configuration
   */
  createSession(userId, sessionData) {
    const session = {
      ...sessionData,
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      step: 'editing', // editing, confirming, scheduling
      messageHistory: []
    };
    
    this.sessions.set(userId, session);
    logger.info('NEWS_SESSION', `Created editing session for user ${userId}`, { 
      type: sessionData.type, 
      lang: sessionData.lang 
    });
    
    return session;
  }

  /**
   * Get user's active session
   * @param {number} userId - User ID
   * @returns {object|null} Session data or null
   */
  getSession(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      // Update last activity
      session.lastActivity = Date.now();
      return session;
    }
    return null;
  }

  /**
   * Update session data
   * @param {number} userId - User ID
   * @param {object} updateData - Data to update
   * @returns {boolean} True if session was updated
   */
  updateSession(userId, updateData) {
    const session = this.sessions.get(userId);
    if (session) {
      Object.assign(session, updateData);
      session.lastActivity = Date.now();
      logger.debug('NEWS_SESSION', `Session updated for user ${userId}`, updateData);
      return true;
    }
    return false;
  }

  /**
   * Clear session content but keep session active
   * @param {number} userId - User ID
   * @returns {boolean} True if session was cleared
   */
  clearSession(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      session.title = '';
      session.content = '';
      session.lastActivity = Date.now();
      logger.debug('NEWS_SESSION', `Session cleared for user ${userId}`);
      return true;
    }
    return false;
  }

  /**
   * Add message to session history
   * @param {number} userId - User ID
   * @param {string} message - Message to add
   */
  addToHistory(userId, message) {
    const session = this.sessions.get(userId);
    if (session) {
      if (!session.messageHistory) {
        session.messageHistory = [];
      }
      session.messageHistory.push({
        message,
        timestamp: Date.now()
      });
      session.lastActivity = Date.now();
    }
  }

  /**
   * End user's session
   * @param {number} userId - User ID
   * @returns {boolean} True if session was ended
   */
  endSession(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      this.sessions.delete(userId);
      logger.debug('NEWS_SESSION', `Session ended for user ${userId}`);
      return true;
    }
    return false;
  }

  /**
   * Check if user has an active session
   * @param {number} userId - User ID
   * @returns {boolean} True if user has active session
   */
  hasActiveSession(userId) {
    return this.sessions.has(userId);
  }

  /**
   * Get all active sessions (for debugging)
   * @returns {Array} Array of session objects
   */
  getActiveSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeout) {
        this.sessions.delete(userId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info('NEWS_SESSION', `Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  /**
   * Get session statistics
   * @returns {object} Session statistics
   */
  getStats() {
    const sessions = this.getActiveSessions();
    const stats = {
      total: sessions.length,
      byType: {},
      byLanguage: {},
      avgAge: 0
    };
    
    if (sessions.length > 0) {
      const now = Date.now();
      let totalAge = 0;
      
      sessions.forEach(session => {
        // Count by type
        stats.byType[session.type] = (stats.byType[session.type] || 0) + 1;
        
        // Count by language
        stats.byLanguage[session.lang] = (stats.byLanguage[session.lang] || 0) + 1;
        
        // Calculate age
        totalAge += now - session.createdAt;
      });
      
      stats.avgAge = Math.round(totalAge / sessions.length / 1000); // seconds
    }
    
    return stats;
  }
}

// Create and export singleton instance
const newsSessionManager = new NewsSessionManager();
export default newsSessionManager;