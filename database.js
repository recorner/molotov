// database.js
import sqlite3 from 'sqlite3';
import { DB_PATH } from './config.js';

const db = new sqlite3.Database('./store.db', (err) => {
  if (err) console.error('[DB] Error:', err.message);
  else console.log('[DB] SQLite store initialized.');
});

// === Categories Table ===
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

// After creating categories...
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

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      language_code TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

export default db;

