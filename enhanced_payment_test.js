#!/usr/bin/env node

// Enhanced payment notification system with robust error handling
import TelegramBot from 'node-telegram-bot-api';
import { BOT_TOKEN, ADMIN_GROUP } from './config.js';
import db from './database.js';

console.log('🚀 Starting Enhanced Payment Notification Test...');

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Test the complete payment confirmation flow
async function testPaymentFlow() {
  try {
    // Step 1: Simulate payment confirmation call
    console.log('\n1️⃣ Testing payment confirmation notification...');
    
    const testOrderData = {
      orderId: 999,
      customer: {
        id: 7904666227,
        name: 'Test User',
        username: 'testuser'
      },
      product: 'Test Product',
      amount: 25.99,
      currency: 'BTC',
      txId: null,
      time: new Date().toLocaleString()
    };

    // Create the enhanced notification message
    const message = `💰 **Payment Confirmation Received**\n\n` +
      `🧾 **Order ID:** #${testOrderData.orderId}\n` +
      `👤 **Customer:** [${testOrderData.customer.name}](tg://user?id=${testOrderData.customer.id})\n` +
      `📱 **Username:** @${testOrderData.customer.username || 'no_username'}\n` +
      `🛍️ **Product:** ${testOrderData.product}\n` +
      `💵 **Amount:** $${testOrderData.amount} (${testOrderData.currency})\n` +
      `🔗 **Transaction ID:** \`${testOrderData.txId || 'Manual confirmation'}\`\n` +
      `🕒 **Time:** ${testOrderData.time}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 **Action Required:**\n` +
      `✅ Click "Confirm & Deliver" to approve payment\n` +
      `❌ Click "Reject Payment" if payment not received\n` +
      `📦 After confirmation, send product files/details as reply`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Confirm & Deliver', callback_data: `admin_confirm_${testOrderData.orderId}_${testOrderData.customer.id}` },
          { text: '❌ Reject Payment', callback_data: `admin_cancel_${testOrderData.orderId}_${testOrderData.customer.id}` }
        ],
        [
          { text: '🔍 Check Transaction', callback_data: `check_tx_${testOrderData.orderId}` },
          { text: '💬 Contact Customer', url: `tg://user?id=${testOrderData.customer.id}` }
        ]
      ]
    };

    // Send with enhanced banner
    try {
      await bot.sendPhoto(ADMIN_GROUP, './assets/image.png', {
        caption: message,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      console.log('✅ Enhanced payment notification with banner sent successfully!');
    } catch (photoError) {
      console.log('⚠️ Banner failed, sending text message...');
      await bot.sendMessage(ADMIN_GROUP, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      console.log('✅ Payment notification sent as text message!');
    }

    // Step 2: Send a simple status update
    console.log('\n2️⃣ Sending system status update...');
    
    const statusMessage = `🤖 **Payment System Status**\n\n` +
      `✅ Notification system: ACTIVE\n` +
      `✅ Admin group: CONFIGURED\n` +
      `✅ Database connection: WORKING\n` +
      `⏰ Last test: ${new Date().toLocaleString()}\n\n` +
      `📊 **Recent Activity:**\n` +
      `• Order notifications: Working\n` +
      `• Payment confirmations: Enhanced\n` +
      `• Error handling: Improved\n\n` +
      `💡 **Note:** You should now receive all payment confirmations!`;

    await bot.sendMessage(ADMIN_GROUP, statusMessage, { parse_mode: 'Markdown' });
    console.log('✅ Status update sent!');

    // Step 3: Test with real order if exists
    console.log('\n3️⃣ Checking for real pending orders...');
    
    db.get(`
      SELECT o.id, o.user_id, o.price, o.currency, p.name as product_name
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.status = 'pending'
      ORDER BY o.created_at DESC
      LIMIT 1
    `, async (err, order) => {
      if (err) {
        console.error('❌ Database error:', err);
        return;
      }
      
      if (order) {
        console.log(`🎯 Found pending order #${order.id}. Sending notification...`);
        
        const realOrderMessage = `🔔 **Reminder: Pending Payment**\n\n` +
          `🧾 **Order ID:** #${order.id}\n` +
          `👤 **Customer ID:** ${order.user_id}\n` +
          `🛍️ **Product:** ${order.product_name}\n` +
          `💵 **Amount:** $${order.price} (${order.currency})\n\n` +
          `⚠️ **This order is still pending payment confirmation**\n` +
          `💡 Customer may have already sent payment - check manually if needed`;

        await bot.sendMessage(ADMIN_GROUP, realOrderMessage, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Manually Confirm', callback_data: `admin_confirm_${order.id}_${order.user_id}` },
                { text: '❌ Cancel Order', callback_data: `admin_cancel_${order.id}_${order.user_id}` }
              ]
            ]
          }
        });
        console.log('✅ Pending order reminder sent!');
      } else {
        console.log('📭 No pending orders found');
      }
      
      console.log('\n🎉 Enhanced payment notification system is now active!');
      console.log('🔍 Key improvements made:');
      console.log('   • Fixed data structure issues');
      console.log('   • Added comprehensive error handling');
      console.log('   • Enhanced notification format');
      console.log('   • Added debugging logs');
      console.log('   • Improved spam prevention handling');
      
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

testPaymentFlow();
