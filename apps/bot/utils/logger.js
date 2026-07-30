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
  cleanupOldLogs(daysToKeep = 7) { // Changed default to 7 days
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      let cleanedCount = 0;
      let totalSize = 0;

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stat = fs.statSync(filePath);
        
        // Clean up daily logs (YYYY-MM-DD.log format)
        if (file.match(/^\d{4}-\d{2}-\d{2}\.log$/)) {
          const fileDate = new Date(file.replace('.log', ''));
          if (fileDate < cutoffDate) {
            totalSize += stat.size;
            fs.unlinkSync(filePath);
            cleanedCount++;
            this.info('CLEANUP', `Removed old daily log: ${file}`);
          }
        }
        
        // Clean up other log files older than retention period
        else if (file.endsWith('.log') && stat.mtime < cutoffDate) {
          // Keep core log files (errors.log, security.log, transactions.log) but truncate if too large
          if (['errors.log', 'security.log', 'transactions.log'].includes(file)) {
            if (stat.size > 10 * 1024 * 1024) { // 10MB
              this.truncateLogFile(filePath, 1000); // Keep last 1000 lines
              this.info('CLEANUP', `Truncated large log file: ${file}`);
            }
          } else {
            totalSize += stat.size;
            fs.unlinkSync(filePath);
            cleanedCount++;
            this.info('CLEANUP', `Removed old log file: ${file}`);
          }
        }
      });
      
      if (cleanedCount > 0) {
        this.info('CLEANUP', `Log cleanup completed: ${cleanedCount} files removed, ${Math.round(totalSize / 1024)}KB freed`);
      }
      
      return { cleanedCount, totalSize };
    } catch (error) {
      this.error('CLEANUP', 'Failed to cleanup old logs', error);
      return { cleanedCount: 0, totalSize: 0 };
    }
  }

  // Truncate large log files to keep only recent entries
  truncateLogFile(filePath, linesToKeep = 1000) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      if (lines.length > linesToKeep) {
        const recentLines = lines.slice(-linesToKeep);
        const header = `# Log file truncated on ${new Date().toISOString()}\n# Keeping last ${linesToKeep} entries\n\n`;
        fs.writeFileSync(filePath, header + recentLines.join('\n'));
      }
    } catch (error) {
      this.error('CLEANUP', `Failed to truncate log file: ${filePath}`, error);
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