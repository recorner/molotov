// clear_users.js - Clear users table for fresh testing
import { db } from './database.js';

function clearUsers() {
  console.log('Clearing users table for fresh testing...');
  
  db.run('DELETE FROM users', (err) => {
    if (err) {
      console.error('❌ Error clearing users table:', err.message);
    } else {
      console.log('✅ Users table cleared successfully!');
      console.log('🔄 You can now test the language selection flow from scratch');
    }
    
    // Close the database connection
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('📄 Database connection closed');
      }
    });
  });
}

clearUsers();
