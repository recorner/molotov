#!/usr/bin/env node

// Test script to debug payment notifications
import TelegramBot from 'node-telegram-bot-api';
import { BOT_TOKEN, ADMIN_GROUP } from './config.js';
import { notifyPaymentReceived } from './utils/notifyGroup.js';

console.log('🔍 Testing Payment Notification System...');
console.log('BOT_TOKEN configured:', !!BOT_TOKEN);
console.log('ADMIN_GROUP configured:', ADMIN_GROUP);

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not found in environment');
  process.exit(1);
}

if (!ADMIN_GROUP) {
  console.error('❌ ADMIN_GROUP not found in environment');
  process.exit(1);
}

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Test data
const testData = {
  orderId: 12345,
  customer: {
    id: 7904666227, // Your admin ID
    name: 'Test Customer',
    username: 'testuser'
  },
  product: 'Test Product',
  amount: 25.99,
  currency: 'BTC',
  txId: null,
  time: new Date().toLocaleString()
};

console.log('\n📤 Sending test payment notification...');
console.log('Test data:', JSON.stringify(testData, null, 2));

try {
  await notifyPaymentReceived(bot, testData);
  console.log('✅ Test notification sent successfully!');
  
  // Also test a simple direct message
  console.log('\n📤 Sending direct test message...');
  await bot.sendMessage(ADMIN_GROUP, '🧪 **Test Message**\n\nThis is a direct test message to verify the admin group is working correctly.', {
    parse_mode: 'Markdown'
  });
  console.log('✅ Direct test message sent successfully!');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('Full error:', error);
}

console.log('\n🏁 Test completed. Check your admin group for messages.');
process.exit(0);
