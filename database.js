// database.js
import sqlite3 from 'sqlite3';
import encryptionManager from './utils/encryption.js';

const db = new sqlite3.Database('./store.db', (err) => {
  if (err) console.error('[DB] Error:', err.message);
  else console.log('[DB] SQLite store initialized with encryption support.');
});

// Database wrapper with encryption support
class SecureDatabase {
  constructor(db) {
    this.db = db;
    this.encryptedFields = {
      'wallet_addresses': ['private_key'],
      'transaction_pins': ['pin_hash'],
      'payouts': ['notes'], // Encrypt sensitive notes
      'sidekick_settings': ['value'] // Encrypt settings values
    };
  }

  // Encrypt sensitive fields before storage
  encryptRow(tableName, row, recordId = null) {
    const fieldsToEncrypt = this.encryptedFields[tableName] || [];
    const encryptedRow = { ...row };
    
    fieldsToEncrypt.forEach(field => {
      if (encryptedRow[field] && encryptedRow[field] !== null) {
        try {
          const id = recordId || Date.now(); // Use recordId or timestamp
          encryptedRow[field] = encryptionManager.encryptDatabaseField(
            encryptedRow[field], 
            tableName, 
            field, 
            id
          );
        } catch (error) {
          console.error(`[DB] Encryption error for ${tableName}.${field}:`, error);
        }
      }
    });
    
    return encryptedRow;
  }

  // Decrypt sensitive fields after retrieval
  decryptRow(tableName, row) {
    if (!row) return row;
    
    const fieldsToDecrypt = this.encryptedFields[tableName] || [];
    const decryptedRow = { ...row };
    
    fieldsToDecrypt.forEach(field => {
      if (decryptedRow[field] && decryptedRow[field] !== null) {
        try {
          decryptedRow[field] = encryptionManager.decryptDatabaseField(
            decryptedRow[field],
            tableName,
            field,
            row.id || row.user_id || Date.now()
          );
        } catch (error) {
          console.error(`[DB] Decryption error for ${tableName}.${field}:`, error);
          decryptedRow[field] = '[ENCRYPTED]'; // Fallback for corrupted data
        }
      }
    });
    
    return decryptedRow;
  }

  // Secure run method with encryption
  run(sql, params = [], callback = null) {
    return this.db.run(sql, params, callback);
  }

  // Secure get method with decryption
  get(sql, params = [], callback = null) {
    return this.db.get(sql, params, (err, row) => {
      if (err || !row) {
        if (callback) callback(err, row);
        return;
      }
      
      // Extract table name from SQL
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : '';
      
      const decryptedRow = this.decryptRow(tableName, row);
      if (callback) callback(err, decryptedRow);
    });
  }

  // Secure all method with decryption
  all(sql, params = [], callback = null) {
    return this.db.all(sql, params, (err, rows) => {
      if (err || !rows) {
        if (callback) callback(err, rows);
        return;
      }
      
      // Extract table name from SQL
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : '';
      
      const decryptedRows = rows.map(row => this.decryptRow(tableName, row));
      if (callback) callback(err, decryptedRows);
    });
  }

  // Serialize method
  serialize(callback) {
    return this.db.serialize(callback);
  }
}

// Create secure database wrapper
const secureDb = new SecureDatabase(db);

// === Categories Table === (unchanged for backward compatibility)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    )
  `);
});

// === Products Table === (unchanged for backward compatibility)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category_id INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);
});

// === Orders Table === (unchanged for backward compatibility)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Table creation error:', err);
    } else {
      console.log('[DB] Orders table ready.');
    }
  });
});

// === Users Table === (unchanged for backward compatibility)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      language_code TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// === Enhanced Wallet Addresses Table ===
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS wallet_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      currency TEXT NOT NULL,
      address TEXT NOT NULL,
      private_key TEXT,  -- Now encrypted
      label TEXT NOT NULL,
      tag TEXT NOT NULL,
      added_by INTEGER NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_encrypted BOOLEAN DEFAULT 1  -- Flag for encryption status
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Wallet Table Error:', err.message);
    } else {
      console.log('[DB] Enhanced wallet table ready with encryption.');
    }
  });
});

// === Sidekick System Tables ===
db.serialize(() => {
  // Detected blockchain transactions
  db.run(`
    CREATE TABLE IF NOT EXISTS detected_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txid TEXT NOT NULL UNIQUE,
      currency TEXT NOT NULL,
      address TEXT NOT NULL,
      amount REAL NOT NULL,
      confirmations INTEGER DEFAULT 0,
      block_height INTEGER,
      detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed BOOLEAN DEFAULT FALSE,
      notification_sent BOOLEAN DEFAULT FALSE
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Detected transactions table error:', err);
    } else {
      console.log('[DB] Detected transactions table ready.');
    }
  });

  // Enhanced payout management
  db.run(`
    CREATE TABLE IF NOT EXISTS payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      currency TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      txid TEXT,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP,
      notes TEXT,  -- Now encrypted
      fee_amount REAL DEFAULT 0,
      priority TEXT DEFAULT 'normal',
      batch_id TEXT
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Payouts table error:', err);
    } else {
      console.log('[DB] Enhanced payouts table ready.');
    }
  });

  // Auto-settlement addresses
  db.run(`
    CREATE TABLE IF NOT EXISTS auto_settlement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      currency TEXT NOT NULL,
      address TEXT NOT NULL,
      percentage REAL NOT NULL,
      label TEXT NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      min_threshold REAL DEFAULT 0,
      max_amount REAL
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Auto settlement table error:', err);
    } else {
      console.log('[DB] Enhanced auto settlement table ready.');
    }
  });

  // Enhanced transaction pins for security
  db.run(`
    CREATE TABLE IF NOT EXISTS transaction_pins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,  -- Now encrypted
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used TIMESTAMP,
      failed_attempts INTEGER DEFAULT 0,
      locked_until TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Transaction pins table error:', err);
    } else {
      console.log('[DB] Enhanced transaction pins table ready.');
    }
  });

  // Enhanced sidekick system settings
  db.run(`
    CREATE TABLE IF NOT EXISTS sidekick_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,  -- Now encrypted
      category TEXT DEFAULT 'general',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Sidekick settings table error:', err);
    } else {
      console.log('[DB] Enhanced sidekick settings table ready.');
    }
  });

  // Security audit log
  db.run(`
    CREATE TABLE IF NOT EXISTS security_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      success BOOLEAN NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Security log table error:', err);
    } else {
      console.log('[DB] Security audit log ready.');
    }
  });
});

// === Admin Groups Table ===
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER UNIQUE NOT NULL,
      group_name TEXT,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Admin groups table error:', err);
    } else {
      console.log('[DB] Admin groups table ready.');
    }
  });
});

// === Group Admins Table ===
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS group_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT,
      first_name TEXT,
      status TEXT DEFAULT 'administrator',
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES admin_groups(group_id)
    )
  `, (err) => {
    if (err) {
      console.error('[DB] Group admins table error:', err);
    } else {
      console.log('[DB] Group admins table ready.');
    }
  });
});

// === News and Announcements Table ===
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS news_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      target_languages TEXT NOT NULL, -- JSON array of language codes
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      scheduled_at TIMESTAMP,
      sent_at TIMESTAMP,
      status TEXT DEFAULT 'draft', -- draft, scheduled, sending, sent, failed
      recipients_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      FOREIGN KEY (created_by) REFERENCES group_admins(user_id)
    )
  `, (err) => {
    if (err) {
      console.error('[DB] News announcements table error:', err);
    } else {
      console.log('[DB] News announcements table ready.');
    }
  });
});

// === News Delivery Log Table ===
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS news_delivery_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      news_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      telegram_id INTEGER NOT NULL,
      language_code TEXT,
      status TEXT NOT NULL, -- sent, failed, skipped
      error_message TEXT,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (news_id) REFERENCES news_announcements(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('[DB] News delivery log table error:', err);
    } else {
      console.log('[DB] News delivery log table ready.');
    }
  });
});

// === News and Announcements Table ===
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS news_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      target_languages TEXT NOT NULL, -- JSON array of language codes
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      scheduled_at TIMESTAMP,
      sent_at TIMESTAMP,
      status TEXT DEFAULT 'draft', -- draft, scheduled, sending, sent, failed
      recipients_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      FOREIGN KEY (created_by) REFERENCES group_admins(user_id)
    )
  `, (err) => {
    if (err) {
      console.error('[DB] News announcements table error:', err);
    } else {
      console.log('[DB] News announcements table ready.');
    }
  });
});

// === News Recipients Table ===
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS news_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, sent, failed
      sent_at TIMESTAMP,
      error_message TEXT,
      FOREIGN KEY (announcement_id) REFERENCES news_announcements(id),
      FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )
  `, (err) => {
    if (err) {
      console.error('[DB] News recipients table error:', err);
    } else {
      console.log('[DB] News recipients table ready.');
    }
  });

  // News delivery log table
  db.run(`
    CREATE TABLE IF NOT EXISTS news_delivery_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (announcement_id) REFERENCES news_announcements(id)
    )
  `, (err) => {
    if (err) {
      console.error('[DB] News delivery log table error:', err);
    } else {
      console.log('[DB] News delivery log table ready.');
    }
  });
});

// === Removed Users Ledger Table ===
// Archives users removed by the daily username sync (deleted, unreachable, blocked)
db.serialize(() => {
  db.run(`
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
  `, (err) => {
    if (err) {
      console.error('[DB] Removed users ledger table error:', err);
    } else {
      console.log('[DB] Removed users ledger table ready.');
    }
  });

  // Index for quick lookups by telegram_id and category
  db.run(`CREATE INDEX IF NOT EXISTS idx_removed_ledger_telegram_id ON removed_users_ledger(telegram_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_removed_ledger_category ON removed_users_ledger(removal_category)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_removed_ledger_removed_at ON removed_users_ledger(removed_at)`);
});

export default secureDb;
export { db }; // Export raw db for backward compatibility

