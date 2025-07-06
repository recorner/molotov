// migrations.js - Database migration system for backward compatibility
import { db } from '../database.js';
import encryptionManager from './encryption.js';
import logger from './logger.js';

class MigrationManager {
  constructor() {
    this.migrations = [
      {
        version: 1,
        name: 'add_encryption_flags',
        description: 'Add encryption flags to existing tables',
        up: this.migration_001_add_encryption_flags.bind(this),
        down: this.migration_001_down.bind(this)
      },
      {
        version: 2,
        name: 'encrypt_existing_data',
        description: 'Encrypt existing sensitive data',
        up: this.migration_002_encrypt_existing_data.bind(this),
        down: this.migration_002_down.bind(this)
      },
      {
        version: 3,
        name: 'add_sidekick_columns',
        description: 'Add sidekick-specific columns to existing tables',
        up: this.migration_003_add_sidekick_columns.bind(this),
        down: this.migration_003_down.bind(this)
      },
      {
        version: 4,
        name: 'add_scheduling_features',
        description: 'Add scheduling capabilities to payouts',
        up: this.migration_004_add_scheduling.bind(this),
        down: this.migration_004_down.bind(this)
      }
    ];
    
    this.initializeMigrationTable();
  }

  // Initialize migration tracking table
  initializeMigrationTable() {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER UNIQUE NOT NULL,
          name TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          logger.error('MIGRATION', 'Failed to create migrations table', err);
        } else {
          logger.info('MIGRATION', 'Migration tracking table ready');
        }
      });
    });
  }

  // Check which migrations have been applied
  async getAppliedMigrations() {
    return new Promise((resolve, reject) => {
      db.all('SELECT version FROM migrations ORDER BY version', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.version));
      });
    });
  }

  // Record migration as applied
  async recordMigration(version, name) {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO migrations (version, name) VALUES (?, ?)',
        [version, name],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Remove migration record
  async removeMigrationRecord(version) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM migrations WHERE version = ?', [version], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Run pending migrations
  async runMigrations() {
    try {
      const appliedMigrations = await this.getAppliedMigrations();
      const pendingMigrations = this.migrations.filter(
        migration => !appliedMigrations.includes(migration.version)
      );

      if (pendingMigrations.length === 0) {
        logger.info('MIGRATION', 'No pending migrations');
        return;
      }

      logger.info('MIGRATION', `Running ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        logger.info('MIGRATION', `Applying migration ${migration.version}: ${migration.name}`);
        
        try {
          await migration.up();
          await this.recordMigration(migration.version, migration.name);
          logger.info('MIGRATION', `Successfully applied migration ${migration.version}`);
        } catch (error) {
          logger.error('MIGRATION', `Failed to apply migration ${migration.version}`, error);
          throw error;
        }
      }

      logger.info('MIGRATION', 'All migrations completed successfully');
    } catch (error) {
      logger.error('MIGRATION', 'Migration process failed', error);
      throw error;
    }
  }

  // Migration 001: Add encryption flags
  async migration_001_add_encryption_flags() {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Add encryption flag to wallet_addresses if not exists
        db.run(`
          ALTER TABLE wallet_addresses 
          ADD COLUMN is_encrypted BOOLEAN DEFAULT 0
        `, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  async migration_001_down() {
    // Rollback not recommended for column additions
    logger.warn('MIGRATION', 'Rollback for migration 001 not implemented (column addition)');
  }

  // Migration 002: Encrypt existing sensitive data
  async migration_002_encrypt_existing_data() {
    return new Promise((resolve, reject) => {
      // Encrypt existing private keys
      db.all('SELECT id, private_key FROM wallet_addresses WHERE private_key IS NOT NULL AND is_encrypted = 0', (err, rows) => {
        if (err) return reject(err);

        if (rows.length === 0) {
          return resolve();
        }

        let processed = 0;
        const total = rows.length;

        rows.forEach(row => {
          if (row.private_key && row.private_key !== null) {
            try {
              const encryptedKey = encryptionManager.encryptDatabaseField(
                row.private_key,
                'wallet_addresses',
                'private_key',
                row.id
              );

              db.run(
                'UPDATE wallet_addresses SET private_key = ?, is_encrypted = 1 WHERE id = ?',
                [encryptedKey, row.id],
                (err) => {
                  if (err) {
                    logger.error('MIGRATION', `Failed to encrypt private key for wallet ${row.id}`, err);
                  } else {
                    logger.debug('MIGRATION', `Encrypted private key for wallet ${row.id}`);
                  }

                  processed++;
                  if (processed === total) {
                    resolve();
                  }
                }
              );
            } catch (error) {
              logger.error('MIGRATION', `Encryption failed for wallet ${row.id}`, error);
              processed++;
              if (processed === total) {
                resolve();
              }
            }
          } else {
            processed++;
            if (processed === total) {
              resolve();
            }
          }
        });
      });
    });
  }

  async migration_002_down() {
    // Decrypt data back to original format
    return new Promise((resolve, reject) => {
      db.all('SELECT id, private_key FROM wallet_addresses WHERE is_encrypted = 1', (err, rows) => {
        if (err) return reject(err);

        if (rows.length === 0) {
          return resolve();
        }

        let processed = 0;
        const total = rows.length;

        rows.forEach(row => {
          try {
            const decryptedKey = encryptionManager.decryptDatabaseField(
              row.private_key,
              'wallet_addresses',
              'private_key',
              row.id
            );

            db.run(
              'UPDATE wallet_addresses SET private_key = ?, is_encrypted = 0 WHERE id = ?',
              [decryptedKey, row.id],
              (err) => {
                processed++;
                if (processed === total) {
                  resolve();
                }
              }
            );
          } catch (error) {
            logger.error('MIGRATION', `Decryption failed for wallet ${row.id}`, error);
            processed++;
            if (processed === total) {
              resolve();
            }
          }
        });
      });
    });
  }

  // Migration 003: Add sidekick-specific columns
  async migration_003_add_sidekick_columns() {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        const alterations = [
          // Payouts table enhancements
          `ALTER TABLE payouts ADD COLUMN fee_amount REAL DEFAULT 0`,
          `ALTER TABLE payouts ADD COLUMN priority TEXT DEFAULT 'normal'`,
          `ALTER TABLE payouts ADD COLUMN batch_id TEXT`,
          
          // Auto settlement enhancements
          `ALTER TABLE auto_settlement ADD COLUMN min_threshold REAL DEFAULT 0`,
          `ALTER TABLE auto_settlement ADD COLUMN max_amount REAL`,
          
          // Transaction pins enhancements
          `ALTER TABLE transaction_pins ADD COLUMN failed_attempts INTEGER DEFAULT 0`,
          `ALTER TABLE transaction_pins ADD COLUMN locked_until TIMESTAMP`,
          
          // Sidekick settings enhancements
          `ALTER TABLE sidekick_settings ADD COLUMN category TEXT DEFAULT 'general'`,
          `ALTER TABLE sidekick_settings ADD COLUMN updated_by INTEGER`,
          
          // Detected transactions enhancements
          `ALTER TABLE detected_transactions ADD COLUMN notification_sent BOOLEAN DEFAULT FALSE`
        ];

        let completed = 0;
        const total = alterations.length;

        alterations.forEach(sql => {
          db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              logger.error('MIGRATION', `Failed to execute: ${sql}`, err);
            }
            
            completed++;
            if (completed === total) {
              resolve();
            }
          });
        });
      });
    });
  }

  async migration_003_down() {
    logger.warn('MIGRATION', 'Rollback for migration 003 not implemented (column additions)');
  }

  // Migration 004: Add scheduling features
  async migration_004_add_scheduling() {
    logger.info('MIGRATION', 'Adding scheduling features to payouts table');
    
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Add scheduling columns to payouts table
        db.run(`
          ALTER TABLE payouts ADD COLUMN scheduled_at TIMESTAMP
        `, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            logger.error('MIGRATION', 'Failed to add scheduled_at column', err);
            reject(err);
            return;
          }
        });

        db.run(`
          ALTER TABLE payouts ADD COLUMN recurrence_type TEXT
        `, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            logger.error('MIGRATION', 'Failed to add recurrence_type column', err);
            reject(err);
            return;
          }
        });

        db.run(`
          ALTER TABLE payouts ADD COLUMN recurrence_interval INTEGER DEFAULT 0
        `, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            logger.error('MIGRATION', 'Failed to add recurrence_interval column', err);
            reject(err);
            return;
          }
        });

        // Create settlement execution history table
        db.run(`
          CREATE TABLE IF NOT EXISTS settlement_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger_type TEXT NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            total_amount REAL NOT NULL,
            currency TEXT NOT NULL,
            rules_applied INTEGER NOT NULL,
            status TEXT DEFAULT 'completed',
            error_message TEXT
          )
        `, (err) => {
          if (err) {
            logger.error('MIGRATION', 'Failed to create settlement_executions table', err);
            reject(err);
          } else {
            logger.info('MIGRATION', 'Successfully added scheduling features');
            resolve();
          }
        });
      });
    });
  }

  async migration_004_down() {
    logger.warn('MIGRATION', 'Rollback for migration 004 not implemented (scheduling features)');
  }

  // Export for use in bot.js
  static async runMigrationsIfNeeded() {
    const manager = new MigrationManager();
    await manager.runMigrations();
    return manager;
  }
}

// Export the class
export { MigrationManager };
export default MigrationManager;
