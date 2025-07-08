// logger.js - Advanced logging system for Molotov bot
import fs from 'fs';
import path from 'path';

class Logger {
  constructor() {
    this.logDir = './logs';
    this.createLogDirectory();
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    this.currentLevel = this.logLevels.INFO;
  }

  createLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatTimestamp() {
    return new Date().toISOString();
  }

  formatMessage(level, component, message, data = null) {
    const timestamp = this.formatTimestamp();
    let logMessage = `[${timestamp}] [${level}] [${component}] ${message}`;
    
    if (data) {
      logMessage += ` | Data: ${JSON.stringify(data)}`;
    }
    
    return logMessage;
  }

  writeToFile(filename, message) {
    const logFile = path.join(this.logDir, filename);
    const logEntry = message + '\n';
    
    try {
      fs.appendFileSync(logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(level, component, message, data = null) {
    if (this.logLevels[level] > this.currentLevel) return;

    const formattedMessage = this.formatMessage(level, component, message, data);
    
    // Console output with colors
    const colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow
      INFO: '\x1b[36m',  // Cyan
      DEBUG: '\x1b[37m'  // White
    };
    
    console.log(`${colors[level]}${formattedMessage}\x1b[0m`);
    
    // File output
    const today = new Date().toISOString().split('T')[0];
    this.writeToFile(`${today}.log`, formattedMessage);
    
    // Separate files for different levels
    if (level === 'ERROR') {
      this.writeToFile('errors.log', formattedMessage);
    }
    
    if (component === 'SECURITY') {
      this.writeToFile('security.log', formattedMessage);
    }
    
    if (component === 'TRANSACTION') {
      this.writeToFile('transactions.log', formattedMessage);
    }
  }

  error(component, message, data = null) {
    this.log('ERROR', component, message, data);
  }

  warn(component, message, data = null) {
    this.log('WARN', component, message, data);
  }

  info(component, message, data = null) {
    this.log('INFO', component, message, data);
  }

  debug(component, message, data = null) {
    this.log('DEBUG', component, message, data);
  }

  // Specialized logging methods
  logTransaction(type, details) {
    this.info('TRANSACTION', `${type} transaction`, details);
  }

  logSecurity(event, userId, success, details = null) {
    const level = success ? 'INFO' : 'WARN';
    this.log(level, 'SECURITY', `${event} - User: ${userId} - Success: ${success}`, details);
  }

  logSystemEvent(event, details = null) {
    this.info('SYSTEM', event, details);
  }

  logPayment(orderId, amount, currency, status) {
    this.info('PAYMENT', `Order ${orderId}: ${amount} ${currency} - ${status}`);
  }

  logWalletOperation(operation, currency, address, amount = null) {
    this.info('WALLET', `${operation} - ${currency} - ${address}`, { amount });
  }

  logAdminAction(adminId, action, details = null) {
    this.info('ADMIN', `Admin ${adminId}: ${action}`, details);
  }

  logDatabaseOperation(operation, table, recordId = null) {
    this.debug('DATABASE', `${operation} on ${table}`, { recordId });
  }

  logAPICall(service, endpoint, status, responseTime = null) {
    this.info('API', `${service} ${endpoint} - ${status}`, { responseTime });
  }

  logBlockchainEvent(currency, event, txid = null, details = null) {
    this.info('BLOCKCHAIN', `${currency} ${event}`, { txid, ...details });
  }

  // Log cleanup methods
  cleanupOldLogs(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      files.forEach(file => {
        if (file.endsWith('.log') && file.match(/^\d{4}-\d{2}-\d{2}\.log$/)) {
          const fileDate = new Date(file.replace('.log', ''));
          if (fileDate < cutoffDate) {
            fs.unlinkSync(path.join(this.logDir, file));
            this.info('SYSTEM', `Cleaned up old log file: ${file}`);
          }
        }
      });
    } catch (error) {
      this.error('SYSTEM', 'Failed to cleanup old logs', error);
    }
  }

  // Get log statistics
  getLogStats() {
    try {
      const files = fs.readdirSync(this.logDir);
      const stats = {
        totalFiles: files.length,
        totalSize: 0,
        oldestLog: null,
        newestLog: null
      };

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stat = fs.statSync(filePath);
        stats.totalSize += stat.size;

        if (!stats.oldestLog || stat.mtime < stats.oldestLog) {
          stats.oldestLog = stat.mtime;
        }
        if (!stats.newestLog || stat.mtime > stats.newestLog) {
          stats.newestLog = stat.mtime;
        }
      });

      return stats;
    } catch (error) {
      this.error('SYSTEM', 'Failed to get log stats', error);
      return null;
    }
  }

  // Set log level
  setLogLevel(level) {
    if (this.logLevels.hasOwnProperty(level)) {
      this.currentLevel = this.logLevels[level];
      this.info('SYSTEM', `Log level set to ${level}`);
    }
  }
}

// Global logger instance
const logger = new Logger();

export default logger;