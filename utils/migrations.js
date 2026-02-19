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
      },
      {
        version: 5,
        name: 'enhance_language_support',
        description: 'Enhance multi-language support and user preferences',
        up: this.migration_005_enhance_language_support.bind(this),
        down: this.migration_005_down.bind(this)
      },
      {
        version: 6,
        name: 'fix_language_support_columns',
        description: 'Fix missing columns for language support',
        up: this.migration_006_fix_language_columns.bind(this),
        down: this.migration_006_down.bind(this)
      },
      {
        version: 7,
        name: 'product_management_system',
        description: 'Enhanced categories/products, audit history, bulk operations, indexes',
        up: this.migration_007_product_management.bind(this),
        down: this.migration_007_down.bind(this)
      },
      {
        version: 8,
        name: 'removed_users_ledger',
        description: 'Create removed_users_ledger table for archiving users removed by username sync',
        up: this.migration_008_removed_users_ledger.bind(this),
        down: this.migration_008_down.bind(this)
      },
      {
        version: 9,
        name: 'otp_license_keys',
        description: 'Create OTP license keys table for OTP Bot service',
        up: this.migration_009_otp_license_keys.bind(this),
        down: this.migration_009_down.bind(this)
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

  // Migration 005: Enhance language support
  async migration_005_enhance_language_support() {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Enhance users table for better language support
        const alterations = [
          // Add timezone support
          `ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'UTC'`,
          
          // Add language preference timestamp
          `ALTER TABLE users ADD COLUMN language_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
          
          // Add user preferences JSON field (encrypted)
          `ALTER TABLE users ADD COLUMN preferences TEXT`,
          
          // Add user status for better management
          `ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`,
          
          // Add last activity tracking
          `ALTER TABLE users ADD COLUMN last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
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
              // Create language usage statistics table
              db.run(`
                CREATE TABLE IF NOT EXISTS language_stats (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  language_code TEXT NOT NULL,
                  user_count INTEGER DEFAULT 0,
                  active_users INTEGER DEFAULT 0,
                  daily_users INTEGER DEFAULT 0,
                  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE(language_code)
                )
              `, (err) => {
                if (err) {
                  logger.error('MIGRATION', 'Failed to create language_stats table', err);
                  reject(err);
                } else {
                  // Create translation cache table
                  db.run(`
                    CREATE TABLE IF NOT EXISTS translation_cache (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      source_text TEXT NOT NULL,
                      target_language TEXT NOT NULL,
                      translated_text TEXT NOT NULL,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      expires_at TIMESTAMP,
                      hit_count INTEGER DEFAULT 1,
                      UNIQUE(source_text, target_language)
                    )
                  `, (err) => {
                    if (err) {
                      logger.error('MIGRATION', 'Failed to create translation_cache table', err);
                      reject(err);
                    } else {
                      logger.info('MIGRATION', 'Successfully enhanced language support');
                      resolve();
                    }
                  });
                }
              });
            }
          });
        });
      });
    });
  }

  async migration_005_down() {
    logger.warn('MIGRATION', 'Rollback for migration 005 not implemented (language enhancements)');
  }

  // Migration 006: Fix missing language support columns
  async migration_006_fix_language_columns() {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Add missing columns to users table
        const userAlterations = [
          `ALTER TABLE users ADD COLUMN last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
          `ALTER TABLE users ADD COLUMN language_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
        ];

        let completed = 0;
        const totalUserAlterations = userAlterations.length;

        userAlterations.forEach(sql => {
          db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              logger.error('MIGRATION', `Failed to execute: ${sql}`, err);
            }
            
            completed++;
            if (completed === totalUserAlterations) {
              // Add missing columns to language_stats table
              const statsAlterations = [
                `ALTER TABLE language_stats ADD COLUMN active_users INTEGER DEFAULT 0`,
                `ALTER TABLE language_stats ADD COLUMN daily_users INTEGER DEFAULT 0`
              ];

              let statsCompleted = 0;
              const totalStatsAlterations = statsAlterations.length;

              statsAlterations.forEach(sql => {
                db.run(sql, (err) => {
                  if (err && !err.message.includes('duplicate column')) {
                    logger.error('MIGRATION', `Failed to execute: ${sql}`, err);
                  }
                  
                  statsCompleted++;
                  if (statsCompleted === totalStatsAlterations) {
                    logger.info('MIGRATION', 'Successfully fixed language support columns');
                    resolve();
                  }
                });
              });
            }
          });
        });
      });
    });
  }

  async migration_006_down() {
    logger.warn('MIGRATION', 'Rollback for migration 006 not implemented (language column fixes)');
  }

  // Migration 007: Product management system — enhanced columns, audit history, bulk ops, indexes
  async migration_007_product_management() {
    logger.info('MIGRATION', 'Applying product management system migration');

    const runSQL = (sql) => new Promise((resolve) => {
      db.run(sql, (err) => {
        if (err && !err.message.includes('duplicate column') && !err.message.includes('already exists')) {
          logger.error('MIGRATION', `SQL error: ${err.message}`, { sql: sql.substring(0, 120) });
        }
        resolve();
      });
    });

    // ── Enhanced categories columns ──
    await runSQL(`ALTER TABLE categories ADD COLUMN status TEXT DEFAULT 'active'`);
    await runSQL(`ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0`);
    await runSQL(`ALTER TABLE categories ADD COLUMN description TEXT`);
    await runSQL(`ALTER TABLE categories ADD COLUMN created_at TIMESTAMP`);
    await runSQL(`ALTER TABLE categories ADD COLUMN updated_at TIMESTAMP`);
    await runSQL(`ALTER TABLE categories ADD COLUMN created_by INTEGER`);
    // Backfill timestamps for existing rows
    await runSQL(`UPDATE categories SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`);
    await runSQL(`UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);

    // ── Enhanced products columns ──
    await runSQL(`ALTER TABLE products ADD COLUMN sku TEXT`);
    await runSQL(`ALTER TABLE products ADD COLUMN status TEXT DEFAULT 'active'`);
    await runSQL(`ALTER TABLE products ADD COLUMN stock_quantity INTEGER DEFAULT -1`);
    await runSQL(`ALTER TABLE products ADD COLUMN image_url TEXT`);
    await runSQL(`ALTER TABLE products ADD COLUMN sort_order INTEGER DEFAULT 0`);
    await runSQL(`ALTER TABLE products ADD COLUMN created_at TIMESTAMP`);
    await runSQL(`ALTER TABLE products ADD COLUMN updated_at TIMESTAMP`);
    await runSQL(`ALTER TABLE products ADD COLUMN created_by INTEGER`);
    // Backfill timestamps for existing rows
    await runSQL(`UPDATE products SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`);
    await runSQL(`UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);

    // ── Product history / audit trail ──
    await runSQL(`
      CREATE TABLE IF NOT EXISTS product_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        old_data TEXT,
        new_data TEXT,
        changed_by INTEGER NOT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        batch_id TEXT,
        reverted INTEGER DEFAULT 0
      )
    `);

    // ── Bulk operations ──
    await runSQL(`
      CREATE TABLE IF NOT EXISTS bulk_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending_preview',
        total_items INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        preview_data TEXT,
        errors TEXT,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        committed_at TIMESTAMP
      )
    `);

    // ── Performance indexes for 10K+ products ──
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_products_category_status ON products(category_id, status)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_categories_parent_status ON categories(parent_id, status)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_history_entity ON product_history(entity_type, entity_id)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_history_batch ON product_history(batch_id)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_history_changed_at ON product_history(changed_at)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_bulk_ops_batch ON bulk_operations(batch_id)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_bulk_ops_status ON bulk_operations(status)`);

    logger.info('MIGRATION', 'Product management system migration complete');
  }

  async migration_007_down() {
    logger.warn('MIGRATION', 'Rollback for migration 007: soft-delete tables. Manual cleanup required.');
  }

  // Migration 008: Removed users ledger for username sync archival
  async migration_008_removed_users_ledger() {
    logger.info('MIGRATION', 'Creating removed_users_ledger table');

    const runSQL = (sql) => new Promise((resolve) => {
      db.run(sql, (err) => {
        if (err && !err.message.includes('already exists')) {
          logger.error('MIGRATION', `SQL error: ${err.message}`, { sql: sql.substring(0, 120) });
        }
        resolve();
      });
    });

    await runSQL(`
      CREATE TABLE IF NOT EXISTS removed_users_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        language_code TEXT,
        original_created_at TEXT,
        last_activity TEXT,
        removal_reason TEXT NOT NULL,
        removal_category TEXT NOT NULL,
        api_error_message TEXT,
        removed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        restored_at TIMESTAMP,
        notes TEXT
      )
    `);

    await runSQL(`CREATE INDEX IF NOT EXISTS idx_removed_ledger_telegram_id ON removed_users_ledger(telegram_id)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_removed_ledger_category ON removed_users_ledger(removal_category)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_removed_ledger_removed_at ON removed_users_ledger(removed_at)`);

    logger.info('MIGRATION', 'Removed users ledger migration complete');
  }

  async migration_008_down() {
    const runSQL = (sql) => new Promise((resolve) => {
      db.run(sql, (err) => { resolve(); });
    });
    await runSQL(`DROP TABLE IF EXISTS removed_users_ledger`);
    logger.warn('MIGRATION', 'Rolled back migration 008: dropped removed_users_ledger');
  }

  // Migration 009: OTP License Keys table for OTP Bot service
  async migration_009_otp_license_keys() {
    logger.info('MIGRATION', 'Creating otp_license_keys table');

    const runSQL = (sql) => new Promise((resolve) => {
      db.run(sql, (err) => {
        if (err && !err.message.includes('already exists')) {
          logger.error('MIGRATION', `SQL error: ${err.message}`, { sql: sql.substring(0, 120) });
        }
        resolve();
      });
    });

    await runSQL(`
      CREATE TABLE IF NOT EXISTS otp_license_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        username TEXT,
        key_type TEXT NOT NULL DEFAULT 'standard',
        duration TEXT NOT NULL DEFAULT '1_day',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activated_at TIMESTAMP,
        expires_at TIMESTAMP,
        status TEXT DEFAULT 'pending',
        generated_by INTEGER NOT NULL,
        notes TEXT
      )
    `);

    await runSQL(`CREATE INDEX IF NOT EXISTS idx_otp_keys_user ON otp_license_keys(user_id)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_otp_keys_username ON otp_license_keys(username)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_otp_keys_status ON otp_license_keys(status)`);
    await runSQL(`CREATE INDEX IF NOT EXISTS idx_otp_keys_key ON otp_license_keys(license_key)`);

    logger.info('MIGRATION', 'OTP license keys migration complete');
  }

  async migration_009_down() {
    const runSQL = (sql) => new Promise((resolve) => {
      db.run(sql, (err) => { resolve(); });
    });
    await runSQL(`DROP TABLE IF EXISTS otp_license_keys`);
    logger.warn('MIGRATION', 'Rolled back migration 009: dropped otp_license_keys');
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
