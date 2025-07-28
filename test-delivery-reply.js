// test-delivery-reply.js
import deliveryTracker from './utils/deliveryTracker.js';

console.log('🧪 Testing Delivery Reply System...');

// Test tracking functionality
console.log('\n📋 Testing delivery message tracking:');

// Simulate tracking a delivery message
const testMessageId = 12345;
const testOrderId = 66;
const testBuyerId = 1056383998;
const testAdminChatId = -1002645332615;

deliveryTracker.trackDeliveryMessage(testMessageId, testOrderId, testBuyerId, testAdminChatId);

console.log('✅ Tracked delivery message:', {
  messageId: testMessageId,
  orderId: testOrderId,
  buyerId: testBuyerId,
  adminChatId: testAdminChatId
});

// Test retrieval
const trackingData = deliveryTracker.getTrackingData(testMessageId);
console.log('📊 Retrieved tracking data:', trackingData);

// Test checking if message is tracked
const isTracked = deliveryTracker.isDeliveryMessage(testMessageId);
console.log('✅ Is message tracked:', isTracked);

// Test with non-existent message
const notTracked = deliveryTracker.isDeliveryMessage(99999);
console.log('❌ Non-existent message tracked:', notTracked);

// Test statistics
const stats = deliveryTracker.getStats();
console.log('📈 Tracker statistics:', stats);

console.log('\n✅ Delivery reply system test completed!');
console.log('\n🎯 How it works:');
console.log('1. When an admin delivers a product, the confirmation message is tracked');
console.log('2. When admin replies to that message, it forwards the reply to the buyer');
console.log('3. Buyer receives message with order context');
console.log('4. Admin gets confirmation that message was sent');
