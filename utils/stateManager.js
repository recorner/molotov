// stateManager.js - Advanced state management for bot operations
import fs from 'fs';
import encryptionManager from './encryption.js';
import logger from './logger.js';

class StateManager {
  constructor() {
    this.stateFile = './bot_state.json';
    this.encryptedStateFile = './bot_state.encrypted';
    this.inMemoryState = new Map();
    this.autoSaveInterval = 30000; // 30 seconds
    this.loadState();
    this.startAutoSave();
  }

  // Load state from encrypted file
  loadState() {
    try {
      if (fs.existsSync(this.encryptedStateFile)) {
        const encryptedData = fs.readFileSync(this.encryptedStateFile, 'utf8');
        const decryptedData = encryptionManager.decrypt(encryptedData, 'state');
        const state = JSON.parse(decryptedData);
        
        Object.entries(state).forEach(([key, value]) => {
          this.inMemoryState.set(key, value);
        });
        
        logger.info('STATE', 'State loaded from encrypted file');
      } else if (fs.existsSync(this.stateFile)) {
        // Legacy unencrypted state file
        const data = fs.readFileSync(this.stateFile, 'utf8');
        const state = JSON.parse(data);
        
        Object.entries(state).forEach(([key, value]) => {
          this.inMemoryState.set(key, value);
        });
        
        // Migrate to encrypted format
        this.saveState();
        fs.unlinkSync(this.stateFile);
        logger.info('STATE', 'Migrated state to encrypted format');
      } else {
        logger.info('STATE', 'No existing state file found, starting fresh');
      }
    } catch (error) {
      logger.error('STATE', 'Failed to load state', error);
      this.inMemoryState.clear();
    }
  }

  // Save state to encrypted file
  saveState() {
    try {
      const stateObject = Object.fromEntries(this.inMemoryState);
      const jsonData = JSON.stringify(stateObject, null, 2);
      const encryptedData = encryptionManager.encrypt(jsonData, 'state');
      
      fs.writeFileSync(this.encryptedStateFile, encryptedData);
      logger.debug('STATE', 'State saved to encrypted file');
    } catch (error) {
      logger.error('STATE', 'Failed to save state', error);
    }
  }

  // Auto-save mechanism
  startAutoSave() {
    setInterval(() => {
      this.saveState();
    }, this.autoSaveInterval);
  }

  // Set state value
  set(key, value, options = {}) {
    const { ttl, encrypt = false } = options;
    
    const stateValue = {
      value: encrypt ? encryptionManager.encrypt(JSON.stringify(value), 'state_item') : value,
      encrypted: encrypt,
      timestamp: Date.now(),
      ttl: ttl ? Date.now() + ttl : null
    };
    
    this.inMemoryState.set(key, stateValue);
    logger.debug('STATE', `Set state: ${key}`, { encrypted: encrypt, ttl });
  }

  // Get state value
  get(key, defaultValue = null) {
    const stateValue = this.inMemoryState.get(key);
    
    if (!stateValue) {
      return defaultValue;
    }
    
    // Check TTL
    if (stateValue.ttl && Date.now() > stateValue.ttl) {
      this.delete(key);
      return defaultValue;
    }
    
    try {
      if (stateValue.encrypted) {
        const decryptedData = encryptionManager.decrypt(stateValue.value, 'state_item');
        return JSON.parse(decryptedData);
      } else {
        return stateValue.value;
      }
    } catch (error) {
      logger.error('STATE', `Failed to decrypt state: ${key}`, error);
      return defaultValue;
    }
  }

  // Check if key exists and is not expired
  has(key) {
    const stateValue = this.inMemoryState.get(key);
    
    if (!stateValue) {
      return false;
    }
    
    // Check TTL
    if (stateValue.ttl && Date.now() > stateValue.ttl) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  // Delete state value
  delete(key) {
    const deleted = this.inMemoryState.delete(key);
    if (deleted) {
      logger.debug('STATE', `Deleted state: ${key}`);
    }
    return deleted;
  }

  // Clear all state
  clear() {
    this.inMemoryState.clear();
    logger.info('STATE', 'Cleared all state');
  }

  // Get all keys
  keys() {
    return Array.from(this.inMemoryState.keys());
  }

  // Get state size
  size() {
    return this.inMemoryState.size;
  }

  // Specialized state management methods

  // User session management
  setUserSession(userId, sessionData, ttl = 3600000) { // 1 hour default
    this.set(`session_${userId}`, sessionData, { ttl, encrypt: true });
  }

  getUserSession(userId) {
    return this.get(`session_${userId}`);
  }

  clearUserSession(userId) {
    return this.delete(`session_${userId}`);
  }

  // Admin operation tracking
  setAdminOperation(adminId, operation, data) {
    const key = `admin_op_${adminId}_${Date.now()}`;
    this.set(key, { operation, data, adminId }, { ttl: 86400000 }); // 24 hours
    return key;
  }

  getAdminOperation(operationKey) {
    return this.get(operationKey);
  }

  // Temporary data storage
  setTemporary(key, value, ttl = 300000) { // 5 minutes default
    this.set(`temp_${key}`, value, { ttl });
  }

  getTemporary(key) {
    return this.get(`temp_${key}`);
  }

  // Cache management
  setCache(key, value, ttl = 900000) { // 15 minutes default
    this.set(`cache_${key}`, value, { ttl });
  }

  getCache(key) {
    return this.get(`cache_${key}`);
  }

  // Security state
  setSecurityState(userId, state, ttl = 1800000) { // 30 minutes default
    this.set(`security_${userId}`, state, { ttl, encrypt: true });
  }

  getSecurityState(userId) {
    return this.get(`security_${userId}`);
  }

  // System settings
  setSystemSetting(key, value) {
    this.set(`system_${key}`, value, { encrypt: true });
  }

  getSystemSetting(key, defaultValue = null) {
    return this.get(`system_${key}`, defaultValue);
  }

  // Transaction state
  setTransactionState(txId, state) {
    this.set(`tx_${txId}`, state, { ttl: 7200000, encrypt: true }); // 2 hours
  }

  getTransactionState(txId) {
    return this.get(`tx_${txId}`);
  }

  // Cleanup expired entries
  cleanup() {
    let cleanedCount = 0;
    const now = Date.now();
    
    for (const [key, stateValue] of this.inMemoryState.entries()) {
      if (stateValue.ttl && now > stateValue.ttl) {
        this.inMemoryState.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info('STATE', `Cleaned up ${cleanedCount} expired state entries`);
    }
    
    return cleanedCount;
  }

  // Get state statistics
  getStats() {
    const stats = {
      totalEntries: this.inMemoryState.size,
      encrypted: 0,
      withTTL: 0,
      expired: 0,
      categories: {}
    };
    
    const now = Date.now();
    
    for (const [key, stateValue] of this.inMemoryState.entries()) {
      if (stateValue.encrypted) stats.encrypted++;
      if (stateValue.ttl) {
        stats.withTTL++;
        if (now > stateValue.ttl) stats.expired++;
      }
      
      // Categorize by prefix
      const prefix = key.split('_')[0];
      stats.categories[prefix] = (stats.categories[prefix] || 0) + 1;
    }
    
    return stats;
  }

  // Export state for backup
  exportState() {
    const stateObject = Object.fromEntries(this.inMemoryState);
    return {
      timestamp: Date.now(),
      version: '1.0',
      state: stateObject
    };
  }

  // Import state from backup
  importState(backup) {
    try {
      if (backup.version !== '1.0') {
        throw new Error('Unsupported backup version');
      }
      
      this.inMemoryState.clear();
      Object.entries(backup.state).forEach(([key, value]) => {
        this.inMemoryState.set(key, value);
      });
      
      logger.info('STATE', 'State imported from backup');
      return true;
    } catch (error) {
      logger.error('STATE', 'Failed to import state', error);
      return false;
    }
  }

  // Graceful shutdown
  shutdown() {
    this.saveState();
    logger.info('STATE', 'State manager shutdown complete');
  }
}

// Global state manager instance
const stateManager = new StateManager();

// Graceful shutdown handling
process.on('SIGINT', () => {
  stateManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stateManager.shutdown();
  process.exit(0);
});

export default stateManager;