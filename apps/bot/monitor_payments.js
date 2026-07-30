#!/usr/bin/env node

// Monitor payment confirmations and debug issues
import sqlite3 from 'sqlite3';
import { ADMIN_GROUP } from './config.js';

console.log('🔍 Payment Confirmation Monitor');
console.log('================================');

const db = new sqlite3.Database('./store.db');

// Check recent orders
console.log('\n📊 Recent Orders (Last 24 hours):');
db.all(`
  SELECT o.id, o.user_id, o.price, o.currency, o.status, o.created_at, p.name as product_name
  FROM orders o
  JOIN products p ON p.id = o.product_id
  WHERE o.created_at > datetime('now', '-1 day')
  ORDER BY o.created_at DESC
`, (err, orders) => {
  if (err) {
    console.error('❌ Error fetching orders:', err);
    return;
  }
  
  if (orders.length === 0) {
    console.log('📭 No orders in the last 24 hours');
  } else {
    orders.forEach(order => {
      console.log(`🧾 Order #${order.id} - ${order.product_name} - $${order.price} ${order.currency} - Status: ${order.status} - User: ${order.user_id} - Created: ${order.created_at}`);
    });
  }
  
  // Check status distribution
  console.log('\n📈 Order Status Distribution:');
  db.all(`
    SELECT status, COUNT(*) as count
    FROM orders
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY status
  `, (err, stats) => {
    if (err) {
      console.error('❌ Error fetching stats:', err);
    } else {
      stats.forEach(stat => {
        console.log(`   ${stat.status}: ${stat.count} orders`);
      });
    }
    
    console.log('\n🔧 Recommendations:');
    console.log('1. Check if users are clicking "I Sent Payment" button');
    console.log('2. Verify ADMIN_GROUP is properly configured:', ADMIN_GROUP);
    console.log('3. Check bot logs for any errors during payment confirmation');
    console.log('4. Consider reducing spam prevention cooldowns if too restrictive');
    
    console.log('\n💡 To test payment notifications:');
    console.log('   1. Create a test order');
    console.log('   2. Click "I Sent Payment" button');
    console.log('   3. Check admin group for notification');
    
    db.close();
  });
});
