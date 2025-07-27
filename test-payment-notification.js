// test-payment-notification.js
import { notifyPaymentReceived } from './utils/notifyGroup.js';

console.log('🧪 Testing Payment Notification Generation...');

// Create test payment data
const testPaymentData = {
  orderId: 12345,
  customer: {
    id: 7904666227,
    name: 'Test User',
    username: 'testuser'
  },
  amount: 29.99,
  currency: 'BTC',
  txId: 'test_transaction_123',
  time: new Date().toLocaleString()
};

// Mock bot object to capture the notification
const mockBot = {
  sendMessage: (chatId, message, options) => {
    console.log('\n📨 Generated Admin Notification:');
    console.log('Chat ID:', chatId);
    console.log('Message:', message);
    console.log('Options:', JSON.stringify(options, null, 2));
    
    if (options.reply_markup && options.reply_markup.inline_keyboard) {
      console.log('\n🔲 Button Analysis:');
      options.reply_markup.inline_keyboard.forEach((row, i) => {
        row.forEach((button, j) => {
          console.log(`  Button [${i}][${j}]: "${button.text}" -> "${button.callback_data}"`);
        });
      });
    }
    
    return Promise.resolve();
  }
};

// Test the notification
console.log('\n📋 Test Payment Data:');
console.log(JSON.stringify(testPaymentData, null, 2));

notifyPaymentReceived(mockBot, testPaymentData);

console.log('\n✅ Test completed! Check the button callback_data above.');
console.log('The callback_data should be in format: admin_confirm_12345_7904666227');
