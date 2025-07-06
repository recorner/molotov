// demo.js - Demonstration of Sidekick System functionality
import db from './database.js';

console.log('🚀 Sidekick System Demo\n');

// Simulate some detected transactions
const demoTransactions = [
  {
    txid: 'demo_btc_tx_001',
    currency: 'BTC',
    address: 'bc1q0sqmxmkdlv8x2llyu5d5fdgclf7u3men7n2x5c',
    amount: 0.001234,
    confirmations: 3,
    block_height: 825001
  },
  {
    txid: 'demo_ltc_tx_001', 
    currency: 'LTC',
    address: 'LfMSjAirzbHzZaDDXaXv1kqJBjG2QSa1KY',
    amount: 0.5678,
    confirmations: 6,
    block_height: 2650001
  }
];

// Insert demo transactions
console.log('📊 Adding demo transactions...');
demoTransactions.forEach(tx => {
  db.run(
    `INSERT INTO detected_transactions (txid, currency, address, amount, confirmations, block_height) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tx.txid, tx.currency, tx.address, tx.amount, tx.confirmations, tx.block_height],
    (err) => {
      if (err && !err.message.includes('UNIQUE constraint failed')) {
        console.error('Error inserting demo transaction:', err);
      } else {
        console.log(`✅ Added ${tx.currency} transaction: ${tx.amount}`);
      }
    }
  );
});

// Create demo payout
console.log('\n💸 Creating demo payout...');
db.run(
  `INSERT INTO payouts (currency, to_address, amount, created_by, notes) 
   VALUES (?, ?, ?, ?, ?)`,
  ['BTC', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 0.0005, 123456789, 'Demo payout for testing'],
  function(err) {
    if (err && !err.message.includes('UNIQUE constraint failed')) {
      console.error('Error creating demo payout:', err);
    } else {
      console.log('✅ Demo payout created with ID:', this.lastID);
    }
  }
);

// Create demo auto-settlement rule
console.log('\n⚡ Creating demo auto-settlement rule...');
db.run(
  `INSERT INTO auto_settlement (currency, address, percentage, label) 
   VALUES (?, ?, ?, ?)`,
  ['BTC', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 25.0, 'Demo Settlement - 25%'],
  function(err) {
    if (err && !err.message.includes('UNIQUE constraint failed')) {
      console.error('Error creating demo settlement rule:', err);
    } else {
      console.log('✅ Demo auto-settlement rule created');
    }
  }
);

// Show system status
setTimeout(() => {
  console.log('\n📊 Current System Status:');
  
  db.get(`SELECT COUNT(*) as count FROM detected_transactions`, (err, row) => {
    if (!err) console.log(`📥 Detected Transactions: ${row.count}`);
  });
  
  db.get(`SELECT COUNT(*) as count FROM payouts WHERE status = 'pending'`, (err, row) => {
    if (!err) console.log(`⏳ Pending Payouts: ${row.count}`);
  });
  
  db.get(`SELECT COUNT(*) as count FROM auto_settlement WHERE enabled = 1`, (err, row) => {
    if (!err) console.log(`⚡ Active Settlement Rules: ${row.count}`);
  });
  
  console.log('\n🎯 Sidekick System Features:');
  console.log('• 🔍 Blockchain monitoring (simulated)');
  console.log('• 💸 Payout management');
  console.log('• ⚡ Auto-settlement rules');
  console.log('• 🔐 Transaction PIN security');
  console.log('• 💰 Balance tracking');
  console.log('• 📊 Transaction history');
  console.log('• ⚙️ System settings');
  
  console.log('\n📱 Access via Telegram:');
  console.log('• Send /sidekick command');
  console.log('• Use callback buttons in admin panel');
  console.log('• Respond to transaction notifications');
  
  console.log('\n✨ Demo completed! The Sidekick system is ready to use.');
  process.exit(0);
}, 1000);
