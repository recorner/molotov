// test-add-users.js - Add test users for news broadcasting
import db from './database.js';
import logger from './utils/logger.js';

const testUsers = [
  { telegram_id: 12345671, first_name: 'Test User 1', username: 'testuser1', language_code: 'en' },
  { telegram_id: 12345672, first_name: 'Test User 2', username: 'testuser2', language_code: 'en' },
  { telegram_id: 12345673, first_name: 'Test User 3', username: 'testuser3', language_code: 'ru' },
  { telegram_id: 12345674, first_name: 'Test User 4', username: 'testuser4', language_code: 'es' },
  { telegram_id: 12345675, first_name: 'Test User 5', username: 'testuser5', language_code: 'en' },
  { telegram_id: 12345676, first_name: 'Test User 6', username: 'testuser6', language_code: 'fr' },
  { telegram_id: 12345677, first_name: 'Test User 7', username: 'testuser7', language_code: 'de' },
  { telegram_id: 12345678, first_name: 'Test User 8', username: 'testuser8', language_code: 'ru' },
  { telegram_id: 12345679, first_name: 'Test User 9', username: 'testuser9', language_code: 'en' },
  { telegram_id: 12345680, first_name: 'Test User 10', username: 'testuser10', language_code: 'ja' }
];

console.log('Adding test users to database...');

const addUser = (user) => {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO users 
      (telegram_id, first_name, username, language_code, created_at, last_activity)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [user.telegram_id, user.first_name, user.username, user.language_code], function(err) {
      if (err) {
        console.error(`Error adding user ${user.username}:`, err);
        reject(err);
      } else {
        console.log(`✅ Added user: ${user.first_name} (${user.username}) - ${user.language_code}`);
        resolve();
      }
    });
  });
};

async function addAllUsers() {
  try {
    for (const user of testUsers) {
      await addUser(user);
    }
    
    // Show statistics
    db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
      if (!err) {
        console.log(`\n📊 Total users in database: ${row.total}`);
      }
    });
    
    db.all(`
      SELECT language_code, COUNT(*) as count 
      FROM users 
      WHERE language_code IS NOT NULL 
      GROUP BY language_code 
      ORDER BY count DESC
    `, [], (err, rows) => {
      if (!err) {
        console.log('\n🌍 Users by language:');
        rows.forEach(row => {
          console.log(`  ${row.language_code}: ${row.count} users`);
        });
      }
      
      console.log('\n✅ Test users added successfully!');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error adding test users:', error);
    process.exit(1);
  }
}

addAllUsers();
