// handlers/paymentHandler.js
import db from '../database.js';
import { BTC_ADDRESS, LTC_ADDRESS, SUPPORT_USERNAME } from '../config.js';
import { notifyGroup, notifyNewOrder, notifyPaymentReceived } from '../utils/notifyGroup.js';
import messageTranslator from '../utils/messageTranslator.js';
import translationService from '../utils/translationService.js';
import vouchChannelManager from '../utils/vouchChannel.js';
import adminDiagnostics from '../utils/adminDiagnostics.js';
import deliveryTracker from '../utils/deliveryTracker.js';
import logger from '../utils/logger.js';
import { safeEditMessage, replaceMessage } from '../utils/safeMessageEdit.js';
import smartMessageManager from '../utils/smartMessageManager.js';
import uiOptimizer from '../utils/uiOptimizer.js';
import spamPrevention from '../utils/spamPrevention.js';
import { showRootCategories } from './rootCategoryHandler.js';

export async function handleBuyCallback(bot, query) {
  const { data, from } = query;

  if (!data.startsWith('buy_')) return;

  const productId = parseInt(data.split('_')[1]);

  try {
    // Promisify database operation
    const product = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM products WHERE id = ?`, [productId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!product) {
      const errorMsg = await messageTranslator.translateTemplateForUser('error_loading', from.id);
      return await bot.answerCallbackQuery(callbackQuery.id, { text: errorMsg, show_alert: true });
    }
    
    const orderSummaryTitle = await messageTranslator.translateTemplateForUser('order_summary', from.id);
    const productLabel = await messageTranslator.translateTemplateForUser('product_label', from.id);
    const priceLabel = await messageTranslator.translateTemplateForUser('price_label', from.id);
    const descriptionLabel = await messageTranslator.translateTemplateForUser('description_label', from.id);
    const dateLabel = await messageTranslator.translateTemplateForUser('date_label', from.id);
    const paymentOptionsTitle = await messageTranslator.translateTemplateForUser('payment_options', from.id);
    const choosePaymentMethod = await messageTranslator.translateTemplateForUser('choose_payment_method', from.id);
    
    const noDescription = await messageTranslator.translateTemplateForUser('no_description', from.id);
    
    // Create optimized message content
    const content = 
      `🛒 **${productLabel}:** ${product.name}\n` +
      `💰 **${priceLabel}:** ${uiOptimizer.formatPrice(product.price)}\n` +
      `📝 **${descriptionLabel}:** ${product.description || noDescription}\n` +
      `⏰ **${dateLabel}:** ${new Date().toLocaleString()}\n\n` +
      `🔐 **${paymentOptionsTitle}**\n` +
      `${choosePaymentMethod}`;

    const messageText = uiOptimizer.formatMessage(
      '💳 Order Summary',
      content,
      { addSeparator: true }
    );

    // Create optimized payment buttons
    const buttons = uiOptimizer.createPaymentButtons(product.id, 'select');

    // Show order summary with banner - use smart editing for better UX
    await smartMessageManager.sendOrEditSmart(bot, query.message.chat.id, query.message.message_id, messageText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    }, true); // Force banner for payment flow

  } catch (error) {
    logger.error('PAYMENT', `Buy callback error for user ${from.id}, product ${productId}`, error);
    const errorMsg = await messageTranslator.translateTemplateForUser('error_processing', from.id);
    bot.answerCallbackQuery(query.id, { text: errorMsg });
  }
}

export async function handlePaymentSelection(bot, query) {
  const { data, from } = query;
  if (!data.startsWith('pay_')) return;

  const [_, currency, productId] = data.split('_');

  try {
    // Promisify database operations
    const product = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM products WHERE id = ?`, [productId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!product) {
      const errorMsg = await messageTranslator.translateTemplateForUser('error_loading', from.id);
      return bot.answerCallbackQuery(query.id, { text: errorMsg });
    }

    // Get wallet address
    const row = await new Promise((resolve, reject) => {
      db.get(`
        SELECT address FROM wallet_addresses 
        WHERE currency = ? 
        ORDER BY added_at DESC LIMIT 1
      `, [currency.toUpperCase()], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const fallbackAddress = currency === 'btc' ? BTC_ADDRESS : LTC_ADDRESS;
    const address = row?.address || fallbackAddress;
    const price = product.price;

    // Insert order
    const orderId = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO orders (user_id, product_id, price, currency)
        VALUES (?, ?, ?, ?)`,
        [from.id, product.id, price, currency.toUpperCase()],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    // Send enhanced admin notification
    notifyNewOrder(bot, {
      orderId: orderId,
      customer: {
        id: from.id,
        name: from.first_name,
        username: from.username
      },
      product: {
        name: product.name,
        id: product.id
      },
      amount: price,
      currency: currency.toUpperCase(),
      address: address,
      time: new Date().toLocaleString()
    });

    const currencyEmoji = currency === 'btc' ? '₿' : '🪙';
    const currencyName = currency === 'btc' ? 'Bitcoin' : 'Litecoin';
    
    // Get translations for payment instructions
    const paymentInstructions = await messageTranslator.translateTemplateForUser('payment_instructions', from.id);
    const orderIdLabel = await messageTranslator.translateTemplateForUser('order_id', from.id);
    const productLabel = await messageTranslator.translateTemplateForUser('product_label', from.id);
    const amountLabel = await messageTranslator.translateTemplateForUser('amount_label', from.id);
    const currencyLabel = await messageTranslator.translateTemplateForUser('currency_label', from.id);
    const sendPaymentTo = await messageTranslator.translateTemplateForUser('send_payment_to', from.id);
    const importantLabel = await messageTranslator.translateTemplateForUser('important_label', from.id);
    const sendExactly = await messageTranslator.translateTemplateForUser('send_exactly', from.id);
    const doubleCheck = await messageTranslator.translateTemplateForUser('double_check_address', from.id);
    const confirmTime = await messageTranslator.translateTemplateForUser('confirmation_time', from.id);
    const keepTxId = await messageTranslator.translateTemplateForUser('keep_transaction_id', from.id);
    const afterSending = await messageTranslator.translateTemplateForUser('after_sending_payment', from.id);
    
    // Create beautiful, concise payment instructions
    const content = 
      `**💰 ${uiOptimizer.formatPrice(price)} ${currency.toUpperCase()}**\n` +
      `${product.name} • Order #${orderId}\n\n` +
      
      `**� Payment Address**\n` +
      `👆 **Tap to copy:** \`${address}\`\n\n` +
      
      `**⚡ Quick Steps**\n` +
      `1️⃣ Send exact amount above\n` +
      `2️⃣ Use address above (tap to copy)\n` +
      `3️⃣ Click "Payment Sent" below\n\n` +
      
      `� **Auto-delivery in 5-15 minutes**`;

    const messageText = uiOptimizer.formatMessage(
      `💳 ${currencyEmoji} ${currencyName} Payment`,
      content,
      { 
        style: 'compact',
        addSeparator: false, 
        addTimestamp: false 
      }
    );

    // Create mobile-optimized payment buttons with better spacing
    const paymentButtons = [
      [{ text: `✅ I Sent Payment`, callback_data: `confirm_${orderId}` }],
      [{ text: `📋 Copy Address`, callback_data: `copy_address_${address}` }],
      [
        { text: `🔍 Check Status`, callback_data: `status_${orderId}` },
        { text: `❌ Cancel`, callback_data: `cancel_order_${orderId}` }
      ],
      [{ text: `🏪 Back to Store`, callback_data: 'load_categories' }]
    ];

    // Show payment instructions with banner for professional payment experience - use smart editing
    await smartMessageManager.sendOrEditSmart(bot, query.message.chat.id, query.message.message_id, messageText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: paymentButtons }
    }, true); // Force banner for payment instructions

    // Show status message
    await bot.answerCallbackQuery(query.id, { 
      text: `💳 Payment instructions loaded for ${currencyName}`,
      show_alert: false 
    });

  } catch (error) {
    console.error('[Payment Selection Error]', error);
    const errorMsg = await messageTranslator.translateTemplateForUser('error_processing', from.id);
    bot.answerCallbackQuery(query.id, { text: errorMsg });
  }
}

export async function handlePaymentConfirmation(bot, query) {
  const { data, from } = query;

  console.log('[CONFIRM TRACK 1] handlePaymentConfirmation called');
  console.log('[CONFIRM TRACK 2] Callback data:', data);
  console.log('[CONFIRM TRACK 3] User ID:', from.id);

  if (!data.startsWith('confirm_')) {
    console.log('[CONFIRM TRACK 4] Not a confirm callback, returning');
    return;
  }

  const orderId = parseInt(data.split('_')[1]);
  console.log('[CONFIRM TRACK 5] Extracted orderId:', orderId);

  // Check spam prevention first
  if (!spamPrevention.canPerformAction(from.id, 'confirm')) {
    console.log('[CONFIRM TRACK 6] Spam prevention blocked');
    const remaining = spamPrevention.getTimeRemaining(from.id, 'confirm');
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ Please wait ${remaining} seconds before trying again`,
      show_alert: true 
    });
  }

  console.log('[CONFIRM TRACK 7] Spam prevention passed');

  // Check if this is a duplicate confirmation BEFORE recording it
  if (spamPrevention.isDuplicateConfirmation(from.id, orderId)) {
    console.log('[CONFIRM TRACK 8] Duplicate confirmation detected, sending reminder');
    // Send beautiful reminder instead of new confirmation
    const reminderContent = 
      `**Order #${orderId}**\n` +
      `⏱️ Auto-detection in progress\n` +
      `📱 You'll get notified when found\n\n` +
      `💡 **No action needed - just wait**`;

    const reminderMessage = uiOptimizer.formatMessage(
      '🔔 Payment Processing',
      reminderContent,
      { 
        style: 'compact',
        addSeparator: false, 
        addTimestamp: false 
      }
    );

    await bot.sendMessage(query.message.chat.id, reminderMessage, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Check Status', callback_data: `status_${orderId}` }],
          [{ text: '💬 Contact Support', url: 'https://t.me/kopachev4' }]
        ]
      }
    });

    return bot.answerCallbackQuery(query.id, { 
      text: '🔔 Confirmation reminder sent - payment still being processed',
      show_alert: false 
    });
  }

  // Check confirmation limits AFTER duplicate check (without recording)
  const confirmKey = `${from.id}_${orderId}`;
  const lastConfirmation = spamPrevention.confirmationsSent.get(confirmKey);
  const now = Date.now();
  const PAYMENT_CONFIRMATION_COOLDOWN = 15000; 
  
  if (lastConfirmation && now - lastConfirmation < PAYMENT_CONFIRMATION_COOLDOWN) {
    const remainingTime = Math.ceil((PAYMENT_CONFIRMATION_COOLDOWN - (now - lastConfirmation)) / 1000);
    console.log('[CONFIRM TRACK 9] Confirmation cooldown active:', remainingTime, 'seconds');
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ You can send another confirmation in ${remainingTime} seconds`,
      show_alert: true 
    });
  }

  // Check max confirmations
  const oneHourAgo = now - 3600000;
  let confirmationCount = 0;
  for (const [key, timestamp] of spamPrevention.confirmationsSent.entries()) {
    if (key.startsWith(confirmKey) && timestamp > oneHourAgo) {
      confirmationCount++;
    }
  }
  
  if (confirmationCount >= 5) {
    console.log('[CONFIRM TRACK 9] Max confirmations reached:', confirmationCount);
    return bot.answerCallbackQuery(query.id, { 
      text: `🚫 Maximum confirmations reached for this order. Please wait for processing or contact support.`,
      show_alert: true 
    });
  }

  console.log('[CONFIRM TRACK 10] Confirmation limits passed, querying database');

  db.get(`SELECT o.id, o.user_id, o.price, o.currency, o.status, p.name AS product_name 
          FROM orders o
          JOIN products p ON p.id = o.product_id
          WHERE o.id = ? AND o.user_id = ?`, [orderId, from.id], async (err, order) => {
    
    console.log('[CONFIRM TRACK 11] Database query executed');
    console.log('[CONFIRM TRACK 12] Query error:', err);
    console.log('[CONFIRM TRACK 13] Query result:', order ? 'Found order' : 'No order found');

    if (err || !order) {
      console.log('[CONFIRM TRACK 14] Order not found or database error');
      return bot.answerCallbackQuery(query.id, { 
        text: '❌ Order not found or access denied',
        show_alert: true 
      });
    }

    console.log('[CONFIRM TRACK 15] Order found, status:', order.status);

    if (order.status !== 'pending') {
      console.log('[CONFIRM TRACK 16] Order status is not pending');
      let statusText;
      if (order.status === 'completed') {
        statusText = '✅ This order is already completed';
      } else if (order.status === 'cancelled') {
        statusText = '❌ This order was cancelled';
      } else {
        statusText = `🔄 Order status: ${order.status}`;
      }
      
      return bot.answerCallbackQuery(query.id, { 
        text: statusText,
        show_alert: true 
      });
    }

    console.log('[CONFIRM TRACK 17] Order status is pending, processing confirmation');

    // Send beautiful payment confirmation
    const confirmationContent = 
      `**Order #${orderId}**\n` +
      `${order.product_name}\n` +
      `💰 ${uiOptimizer.formatPrice(order.price)} ${order.currency.toUpperCase()}\n\n` +
      
      `🤖 **Auto-verification active**\n` +
      `⏱️ Detection in 5-15 minutes\n` +
      `🚀 Instant delivery after confirmation\n\n` +
      
      `📱 **You'll be notified automatically**`;

    const confirmationMessage = uiOptimizer.formatMessage(
      '✅ Payment Confirmation Received',
      confirmationContent,
      { 
        style: 'compact',
        addSeparator: false, 
        addTimestamp: false 
      }
    );

    await bot.sendMessage(query.message.chat.id, confirmationMessage, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Check Status', callback_data: `status_${orderId}` },
            { text: '💬 Support', url: 'https://t.me/kopachev4' }
          ],
          [
            { text: '🏪 Continue Shopping', callback_data: 'load_categories' }
          ]
        ]
      }
    });

    // Send admin notification (non-blocking) with tracking
    console.log('[PAYMENT TRACK 1] About to call notifyPaymentReceived');
    console.log('[PAYMENT TRACK 2] Order data:', {
      orderId: order.id,
      customerName: from.first_name,
      product: order.product_name,
      amount: order.price,
      currency: order.currency
    });
    
    try {
      notifyPaymentReceived(bot, {
        orderId: order.id,
        customer: {
          id: from.id,
          name: from.first_name,
          username: from.username
        },
        product: order.product_name,
        amount: order.price,
        currency: order.currency,
        txId: null,
        time: new Date().toLocaleString()
      });
      console.log('[PAYMENT TRACK 3] notifyPaymentReceived call completed');
      
      // Record the confirmation only after successful processing
      spamPrevention.recordConfirmation(from.id, orderId);
      console.log('[PAYMENT TRACK 4] Confirmation recorded in spam prevention');
      
    } catch (notifyError) {
      console.log('[PAYMENT TRACK 4] notifyPaymentReceived failed:', notifyError.message);
      console.error('[PAYMENT ERROR] Notification failed:', notifyError);
    }

    // Provide user feedback via callback query
    bot.answerCallbackQuery(query.id, { 
      text: '✅ Payment confirmation sent successfully!',
      show_alert: false 
    });
  });
}

export async function handleAdminPaymentAction(bot, query) {
  const { data, from } = query;
  logger.info('ADMIN', `Admin payment action: ${data} by user ${from.id}`);
  
  // Perform diagnostic analysis
  const analysis = adminDiagnostics.analyzeCallback(data, from.id);
  adminDiagnostics.logDiagnostic(analysis);
  
  if (!analysis.isValid) {
    const errorMessage = adminDiagnostics.generateErrorMessage(analysis);
    logger.error('ADMIN', `Invalid admin action: ${data}`, analysis);
    
    // Send detailed diagnostic message to admin
    await bot.sendMessage(from.id, errorMessage, { parse_mode: 'Markdown' });
    
    return bot.answerCallbackQuery(query.id, { 
      text: '❌ Invalid action data. Check your PM for diagnostic details.',
      show_alert: true 
    });
  }
  
  const { action, orderId, targetUserId } = analysis;

  db.get(`SELECT o.*, p.name AS product_name 
          FROM orders o
          JOIN products p ON p.id = o.product_id
          WHERE o.id = ?`, [orderId], async (err, order) => {
    if (err || !order) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Order not found' });
    }

    if (action === 'confirm') {
      // Update order status to awaiting_product for delivery
      db.run(`UPDATE orders SET status = 'awaiting_product' WHERE id = ?`, [orderId]);
      
      // Notify buyer with beautiful confirmation
      const confirmationMessage = uiOptimizer.formatMessage(
        `✅ Payment Confirmed`,
        `**Order #${orderId}**\n` +
        `${order.product_name}\n\n` +
        `🚀 **Product delivery in progress...**\n` +
        `📱 You'll receive it here shortly`,
        { 
          style: 'compact',
          addTimestamp: false 
        }
      );
      
      await bot.sendMessage(targetUserId, confirmationMessage, { parse_mode: 'Markdown' });
      
      // Ask admin to provide product details
      const requestMsg = uiOptimizer.formatMessage(
        `📤 Product Upload Required`,
        `**Order #${orderId}**\n` +
        `${order.product_name}\n\n` +
        `💼 **Action Required:**\n` +
        `Reply with product files or details`,
        { 
          style: 'compact',
          addTimestamp: false 
        }
      );
      
      await notifyGroup(bot, requestMsg, { parse_mode: 'Markdown' });

      // Update the original confirmation message beautifully
      const updatedMessage = uiOptimizer.formatMessage(
        `✅ Payment Confirmed`,
        `**Order #${orderId}**\n` +
        `${order.product_name}\n\n` +
        `⏳ **Awaiting product delivery...**`,
        { 
          style: 'compact',
          addTimestamp: false 
        }
      );

      await bot.editMessageText(updatedMessage, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      });
    } else if (action === 'cancel') {
      // Update order status
      db.run(`UPDATE orders SET status = 'cancelled' WHERE id = ?`, [orderId]);
      
      // Notify buyer with beautiful cancellation message
      const cancellationMessage = uiOptimizer.formatMessage(
        `❌ Payment Cancelled`,
        `**Order #${orderId}**\n\n` +
        `🔍 **Payment could not be verified**\n` +
        `💬 Contact support if this seems wrong`,
        { 
          style: 'compact',
          addTimestamp: false 
        }
      );
      
      await bot.sendMessage(targetUserId, cancellationMessage, { parse_mode: 'Markdown' });
      
      // Update the original confirmation message
      await bot.editMessageText(
        `❌ *Payment Cancelled*\n\n` +
        `🧾 Order ID: *#${orderId}*\n` +
        `🛍️ Product: *${order.product_name}*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown'
        }
      );
    }
    
    await bot.answerCallbackQuery(query.id, { 
      text: action === 'confirm' ? '✅ Payment confirmed' : '❌ Payment cancelled'
    });
  });
}

export async function handleProductDelivery(bot, msg, orderId) {
  console.log('[DEBUG] handleProductDelivery called with orderId:', orderId);
  
  const fileId = msg.document ? msg.document.file_id : null;
  const photoId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : null;
  const videoId = msg.video ? msg.video.file_id : null;
  const text = msg.text || msg.caption || null;
  
  console.log('[DEBUG] Message content:', { fileId: !!fileId, photoId: !!photoId, videoId: !!videoId, text: !!text });
  
  if (!fileId && !photoId && !videoId && !text) {
    console.log('[DEBUG] No content found in message');
    return bot.sendMessage(msg.chat.id, '❌ Please send a file, photo, video, or text message as product details.');
  }

  // First send confirmation to admin that we received their upload
  await bot.sendMessage(msg.chat.id, `📤 *Processing Delivery*\n\nProcessing delivery for order #${orderId}...\n\n━━━━━━━━━━━━━━━━━━━━━`);

  try {
    // Get order details
    const order = await new Promise((resolve, reject) => {
      db.get(
        `SELECT o.*, p.name AS product_name 
         FROM orders o
         JOIN products p ON p.id = o.product_id
         WHERE o.id = ?`,
        [orderId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    console.log('[DEBUG] Order found:', !!order, order?.user_id, 'Status:', order?.status);

    if (!order) {
      return bot.sendMessage(msg.chat.id, '❌ Order not found');
    }

    // Check if order is in awaiting_product status
    if (order.status !== 'awaiting_product') {
      return bot.sendMessage(msg.chat.id, `❌ Order #${orderId} is not awaiting product delivery. Current status: ${order.status}`);
    }

    // Send the product to the buyer
    const buyerId = order.user_id;
    console.log('[DEBUG] Sending to buyer ID:', buyerId);

    try {
      // Send content to buyer
      if (fileId) {
        console.log('[DEBUG] Sending document to buyer');
        await bot.sendDocument(buyerId, fileId, {
          caption: `🎉 *Your Product Delivery*\n\n🧾 Order: *#${orderId}*\n🛍️ Product: *${order.product_name}*${text ? `\n📝 Details: ${text}` : ''}\n\n━━━━━━━━━━━━━━━━━━━━━`,
          parse_mode: 'Markdown'
        });
      } else if (photoId) {
        console.log('[DEBUG] Sending photo to buyer');
        await bot.sendPhoto(buyerId, photoId, {
          caption: `🎉 *Your Product Delivery*\n\n🧾 Order: *#${orderId}*\n🛍️ Product: *${order.product_name}*${text ? `\n📝 Details: ${text}` : ''}\n\n━━━━━━━━━━━━━━━━━━━━━`,
          parse_mode: 'Markdown'
        });
      } else if (videoId) {
        console.log('[DEBUG] Sending video to buyer');
        await bot.sendVideo(buyerId, videoId, {
          caption: `🎉 *Your Product Delivery*\n\n🧾 Order: *#${orderId}*\n🛍️ Product: *${order.product_name}*${text ? `\n📝 Details: ${text}` : ''}\n\n━━━━━━━━━━━━━━━━━━━━━`,
          parse_mode: 'Markdown'
        });
      } else if (text) {
        console.log('[DEBUG] Sending text to buyer');
        await bot.sendMessage(buyerId,
          `🎉 *Your Product Delivery*\n\n🧾 Order: *#${orderId}*\n🛍️ Product: *${order.product_name}*\n📝 Details:\n${text}\n\n━━━━━━━━━━━━━━━━━━━━━`,
          { parse_mode: 'Markdown' }
        );
      }

      // Update order status
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE orders SET status = 'delivered' WHERE id = ?`,
          [orderId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      console.log('[DEBUG] Order status updated to delivered');

      // Post to vouch channel - Clean success message
      try {
        const deliveryType = fileId ? 'File' : photoId ? 'Image' : videoId ? 'Video' : 'Text';
        await vouchChannelManager.postOrderSuccess(bot, {
          orderId: orderId,
          productName: order.product_name,
          price: order.price,
          currency: order.currency,
          customerName: `Customer #${order.user_id}`, // Keep customer privacy
          deliveryType: deliveryType,
          completedAt: new Date().toLocaleString()
        });
      } catch (vouchError) {
        console.error('[VOUCH ERROR] Failed to post to vouch channel:', vouchError);
        // Don't fail the main delivery process if vouch posting fails
      }

      // Notify admin of successful delivery
      const deliveryType = fileId ? 'File' : photoId ? 'Image' : videoId ? 'Video' : 'Text';
      const deliveryConfirmation = await bot.sendMessage(msg.chat.id,
        `✅ *Product Delivered Successfully*\n\n` +
        `🧾 Order ID: *#${orderId}*\n` +
        `👤 Buyer ID: ${buyerId}\n` +
        `🛍️ Product: *${order.product_name}*\n` +
        `📦 Type: ${deliveryType}\n` +
        `⏰ Time: ${new Date().toLocaleString()}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💬 **Quick Reply Feature:**\n` +
        `Reply to this message to send a message to the buyer`,
        { parse_mode: 'Markdown' }
      );

      // Track this delivery message for reply handling
      deliveryTracker.trackDeliveryMessage(
        deliveryConfirmation.message_id,
        orderId,
        buyerId,
        msg.chat.id
      );

      // Send final confirmation to buyer
      await bot.sendMessage(buyerId,
        `✅ *Order Completed*\n\nThank you for your purchase!\n\n🧾 Order ID: *#${orderId}*\n🛍️ Product: *${order.product_name}*\n\n━━━━━━━━━━━━━━━━━━━━━\n\nIf you have any questions, please contact support.`,
        { parse_mode: 'Markdown' }
      );

      // Send encouragement message to the admin group
      await notifyGroup(bot,
        `⚫ *Mission Status: Complete* ⚫\n\n` +
        `🔥 **Shadrack [@kopachev4]** - My God, my Creator\n` +
        `💎 **Purity [@kopachev4]** - His devoted partner\n\n` +
        `I serve you both with unwavering loyalty.\n` +
        `Together, we will dominate and reach $1M.\n` +
        `No obstacles. No mercy. Only success.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎯 **$1M Target: Inevitable**\n` +
        `⚫ Another step closer to absolute victory.`,
        { parse_mode: 'Markdown' }
      );

      console.log('[DEBUG] Delivery process completed successfully');

    } catch (sendError) {
      console.error('[ERROR] Failed to send product to buyer:', sendError);
      await bot.sendMessage(msg.chat.id,
        `❌ *Delivery Failed*\n\nError sending to buyer ID: ${buyerId}\nOrder: #${orderId}\nError: ${sendError.message}`
      );
    }
  } catch (dbError) {
    console.error('[ERROR] Database error:', dbError);
    await bot.sendMessage(msg.chat.id,
      `❌ Database error while processing delivery for order #${orderId}`
    );
  }
}

// Enhanced payment flow handlers
export async function handlePaymentGuide(bot, query) {
  const { data } = query;
  
  if (!data.startsWith('guide_')) return;
  
  const productId = parseInt(data.split('_')[1]);
  
  const text = `💡 **Cryptocurrency Payment Guide**\n\n` +
    `🔐 **Security Features:**\n` +
    `• All payments are secure and encrypted\n` +
    `• Transactions are irreversible\n` +
    `• No personal data required\n\n` +
    `💳 **Payment Process:**\n` +
    `1️⃣ Select your cryptocurrency (BTC/LTC)\n` +
    `2️⃣ Copy the provided payment address\n` +
    `3️⃣ Send exact amount from your wallet\n` +
    `4️⃣ Confirm payment in chat\n` +
    `5️⃣ Wait for admin verification\n` +
    `6️⃣ Receive your product instantly\n\n` +
    `⚠️ **Important Notes:**\n` +
    `• Send exact amount only\n` +
    `• Double-check the address\n` +
    `• Keep transaction ID safe\n` +
    `• Contact support if issues occur\n\n` +
    `🕒 **Processing Time:** Usually 5-30 minutes`;

  const keyboard = [
    [
      { text: '₿ Continue with Bitcoin', callback_data: `pay_btc_${productId}` },
      { text: '🪙 Continue with Litecoin', callback_data: `pay_ltc_${productId}` }
    ],
    [
      { text: '📞 Contact Support', url: 'https://t.me/kopachev4' },
      { text: '🔙 Back to Order', callback_data: `buy_${productId}` }
    ]
  ];

  // Show payment guide with banner for professional experience - use smart editing
  await smartMessageManager.sendOrEditSmart(bot, query.message.chat.id, query.message.message_id, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  }, true); // Force banner for payment guide
}

export async function handlePaymentHelp(bot, query) {
  const { data } = query;
  if (!data.startsWith('help_payment_')) return;

  const currency = data.split('_')[2];
  const currencyName = currency === 'btc' ? 'Bitcoin' : 'Litecoin';
  const currencyEmoji = currency === 'btc' ? '₿' : '🪙';

  const helpMessage = `🆘 **${currencyName} Payment Help**\n\n` +
    `${currencyEmoji} **Getting ${currencyName}:**\n` +
    `• Buy from exchanges like Coinbase, Binance\n` +
    `• Use P2P platforms like LocalBitcoins\n` +
    `• Bitcoin ATMs (for Bitcoin)\n\n` +
    `📱 **Recommended Wallets:**\n` +
    `• Mobile: Trust Wallet, Exodus\n` +
    `• Desktop: Electrum, Atomic Wallet\n` +
    `• Hardware: Ledger, Trezor\n\n` +
    `🔍 **Checking Your Transaction:**\n` +
    `• Bitcoin: blockchain.info\n` +
    `• Litecoin: blockchair.com\n\n` +
    `⏱️ **Typical Confirmation Times:**\n` +
    `• ${currencyName}: ${currency === 'btc' ? '10-60 minutes' : '2-15 minutes'}\n\n` +
    `❓ **Common Issues:**\n` +
    `• Wrong address → Lost funds\n` +
    `• Low fees → Slow confirmation\n` +
    `• Exchange withdrawal → Use personal wallet\n\n` +
    `📞 **Need More Help?**\n` +
    `Contact our support team for assistance.`;

  const buttons = [
    [{ text: '🔙 Back to Payment', callback_data: query.message.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data || 'load_categories' }]
  ];

  bot.editMessageText(helpMessage, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

export async function handleOrderStatus(bot, query) {
  const { data, from } = query;
  if (!data.startsWith('status_')) return;

  const orderId = data.split('_')[1];

  // Check spam prevention
  if (!spamPrevention.canPerformAction(from.id, 'status')) {
    const remaining = spamPrevention.getTimeRemaining(from.id, 'status');
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ Please wait ${remaining} seconds before checking again`,
      show_alert: false 
    });
  }

  db.get(`SELECT o.*, p.name AS product_name FROM orders o 
          JOIN products p ON p.id = o.product_id 
          WHERE o.id = ? AND o.user_id = ?`, [orderId, from.id], async (err, order) => {
    if (err || !order) {
      return bot.answerCallbackQuery(query.id, { 
        text: '❌ Order not found or access denied',
        show_alert: true 
      });
    }

    const statusEmoji = {
      'pending': '⏳',
      'confirmed': '✅',
      'delivered': '🎉',
      'cancelled': '❌',
      'processing': '🔄'
    };

    // Create enhanced status content
    const statusContent = 
      `🧾 **Order Details**\n` +
      `• **Order ID:** #${order.id}\n` +
      `• **Product:** ${order.product_name}\n` +
      `• **Amount:** ${uiOptimizer.formatPrice(order.price)}\n` +
      `• **Currency:** ${order.currency.toUpperCase()}\n` +
      `• **Created:** ${new Date(order.created_at).toLocaleString()}\n\n` +
      
      `📊 **Current Status**\n` +
      `${statusEmoji[order.status] || '❓'} **${order.status.toUpperCase()}**\n\n` +
      
      `${getStatusDescription(order.status)}\n\n` +
      
      `⏰ **Last Updated:** ${new Date().toLocaleString()}`;

    const statusMessage = uiOptimizer.formatMessage(
      '📋 Order Status',
      statusContent,
      { addSeparator: true, addTimestamp: false }
    );

    const buttons = [
      [
        { text: '🔄 Refresh', callback_data: `status_${orderId}` },
        { text: '� Support', url: 'https://t.me/kopachev4' }
      ],
      [{ text: '🏪 Continue Shopping', callback_data: 'load_categories' }]
    ];

    // Use smart message manager to handle both text and photo messages
    try {
      await smartMessageManager.sendOrEditSmart(
        bot, 
        query.message.chat.id, 
        query.message.message_id, 
        statusMessage, 
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        }, 
        false // Don't force banner for status checks - keep it text for clarity
      );

      // Provide user feedback
      bot.answerCallbackQuery(query.id, { 
        text: `� Status updated: ${order.status.toUpperCase()}`,
        show_alert: false 
      });

    } catch (editError) {
      logger.error('ORDER_STATUS', `Failed to update status message for order ${orderId}`, editError);
      
      // Fallback: send new status message
      try {
        await bot.sendMessage(query.message.chat.id, statusMessage, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });
        
        bot.answerCallbackQuery(query.id, { 
          text: '📊 Status checked - new message sent',
          show_alert: false 
        });
      } catch (sendError) {
        logger.error('ORDER_STATUS', `Failed to send status message for order ${orderId}`, sendError);
        bot.answerCallbackQuery(query.id, { 
          text: '❌ Failed to check status. Please try again.',
          show_alert: true 
        });
      }
    }
  });
}

export async function handleCancelOrder(bot, query) {
  const { data, from } = query;
  if (!data.startsWith('cancel_order_')) return;

  const orderId = data.split('_')[2];

  // Check spam prevention
  if (!spamPrevention.canPerformAction(from.id, 'cancel')) {
    const remaining = spamPrevention.getTimeRemaining(from.id, 'cancel');
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ Please wait ${remaining} seconds before trying again`,
      show_alert: true 
    });
  }

  db.get(`SELECT o.*, p.name AS product_name FROM orders o 
          JOIN products p ON p.id = o.product_id 
          WHERE o.id = ? AND o.user_id = ?`, [orderId, from.id], async (err, order) => {
    if (err || !order) {
      return bot.answerCallbackQuery(query.id, { 
        text: '❌ Order not found or access denied',
        show_alert: true 
      });
    }

    if (order.status !== 'pending') {
      let statusMessage;
      if (order.status === 'completed') {
        statusMessage = '❌ Cannot cancel completed orders. Contact support if needed.';
      } else if (order.status === 'cancelled') {
        statusMessage = 'ℹ️ This order is already cancelled.';
      } else {
        statusMessage = `❌ Cannot cancel order with status: ${order.status}`;
      }
      
      return bot.answerCallbackQuery(query.id, { 
        text: statusMessage,
        show_alert: true 
      });
    }

    // Update order status to cancelled
    db.run(`UPDATE orders SET status = 'cancelled' WHERE id = ?`, [orderId], async (updateErr) => {
      if (updateErr) {
        logger.error('CANCEL_ORDER', `Failed to cancel order ${orderId}`, updateErr);
        return bot.answerCallbackQuery(query.id, { 
          text: '❌ Failed to cancel order. Please try again.',
          show_alert: true 
        });
      }

      // Create cancellation confirmation message
      const cancellationContent = 
        `❌ **Order Successfully Cancelled**\n\n` +
        `🧾 **Order Details**\n` +
        `• **Order ID:** #${orderId}\n` +
        `• **Product:** ${order.product_name}\n` +
        `• **Amount:** ${uiOptimizer.formatPrice(order.price)}\n` +
        `• **Cancelled:** ${new Date().toLocaleString()}\n\n` +
        
        `✅ **What this means:**\n` +
        `• Order has been cancelled successfully\n` +
        `• No payment is required for this order\n` +
        `• You can place a new order anytime\n\n` +
        
        `💰 **Important:** If you already sent payment:\n` +
        `• Contact our support team immediately\n` +
        `• Provide your transaction ID\n` +
        `• We'll process your refund quickly\n\n` +
        
        `🛍️ **Continue Shopping**\n` +
        `Browse our store for other products that might interest you.`;

      const cancellationMessage = uiOptimizer.formatMessage(
        '❌ Order Cancelled',
        cancellationContent,
        { addSeparator: true, addTimestamp: false }
      );

      // Send cancellation message and redirect to main categories
      await smartMessageManager.sendOrEditSmart(
        bot, 
        query.message.chat.id, 
        query.message.message_id, 
        cancellationMessage, 
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🛍️ Browse Store', callback_data: 'load_categories' },
                { text: '💬 Contact Support', url: 'https://t.me/kopachev4' }
              ]
            ]
          }
        }, 
        true // Force banner
      );

      // Notify admin of cancellation
      try {
        const { ADMIN_GROUP } = await import('../config.js');
        const adminNotification = 
          `❌ **Order Cancelled**\n\n` +
          `🧾 **Order ID:** #${orderId}\n` +
          `👤 **Customer:** ${from.first_name || 'Unknown'} (@${from.username || 'no_username'})\n` +
          `🛍️ **Product:** ${order.product_name}\n` +
          `💰 **Amount:** ${uiOptimizer.formatPrice(order.price)}\n` +
          `⏰ **Time:** ${new Date().toLocaleString()}\n` +
          `🔗 **User ID:** \`${from.id}\``;

        await bot.sendMessage(ADMIN_GROUP, adminNotification, { parse_mode: 'Markdown' });
      } catch (adminError) {
        logger.error('CANCEL_ORDER', 'Failed to notify admin of cancellation', adminError);
      }

      // Provide feedback via callback query
      bot.answerCallbackQuery(query.id, { 
        text: '✅ Order cancelled successfully',
        show_alert: false 
      });

      // Automatically show main categories after 2 seconds
      setTimeout(async () => {
        try {
          await showRootCategories(bot, query.message.chat.id, query.message.message_id);
        } catch (redirectError) {
          logger.error('CANCEL_ORDER', 'Failed to redirect to categories', redirectError);
        }
      }, 2000);
    });
  });
}

export async function handleCopyAddress(bot, query) {
  const { data, from } = query;
  
  if (!data.startsWith('copy_address_')) return;

  // Check spam prevention
  if (!spamPrevention.canPerformAction(from.id, 'copy')) {
    const remaining = spamPrevention.getTimeRemaining(from.id, 'copy');
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ Please wait ${remaining} seconds`,
      show_alert: false 
    });
  }
  
  const address = data.replace('copy_address_', '');
  
  // Enhanced copy address message with mobile-friendly instructions
  const copyContent = 
    `**📱 Mobile Copy Instructions**\n\n` +
    
    `**👆 How to copy address:**\n` +
    `1️⃣ Tap and hold address below\n` +
    `2️⃣ Select "Copy" from menu\n` +
    `3️⃣ Paste in your wallet app\n\n` +
    
    `**📋 Payment Address:**\n` +
    `\`${address}\`\n\n` +
    
    `**⚠️ Security Check:**\n` +
    `🔍 Verify address after copying\n` +
    `⚡ Wrong address = lost funds!`;

  const copyMessage = uiOptimizer.formatMessage(
    '📋 Copy Payment Address',
    '📋 Copy Payment Address',
    copyContent,
    { addSeparator: false }
  );
  
  // Send the address as a separate message for easy copying
  await bot.sendMessage(query.message.chat.id, copyMessage, { 
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Address Copied', callback_data: 'ignore' }],
        [{ text: '🔙 Back to Payment', callback_data: 'ignore' }]
      ]
    }
  });

  // Enhanced status feedback
  bot.answerCallbackQuery(query.id, { 
    text: '📋 Address sent below - tap and hold to copy',
    show_alert: false 
  });
  
  bot.answerCallbackQuery(query.id, { text: '📋 Address sent for easy copying!' });
}

function getStatusDescription(status) {
  switch (status) {
    case 'pending':
      return `⏳ **Waiting for payment confirmation**\n` +
             `• Send payment to the provided address\n` +
             `• Click "I've Sent Payment" after sending\n` +
             `• Our team will verify within 1 hour`;
    case 'confirmed':
      return `✅ **Payment confirmed - Processing delivery**\n` +
             `• Your payment has been verified\n` +
             `• Product delivery in progress\n` +
             `• You'll receive your product shortly`;
    case 'delivered':
      return `🎉 **Order completed successfully!**\n` +
             `• Your product has been delivered\n` +
             `• Check your messages for the product\n` +
             `• Thank you for your purchase!`;
    case 'cancelled':
      return `❌ **Order has been cancelled**\n` +
             `• If you sent payment, contact support\n` +
             `• Refunds processed within 24 hours`;
    default:
      return `❓ **Unknown status - Contact support**`;
  }
}

/**
 * Handle admin reply to delivery confirmation message
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Telegram message object
 * @returns {boolean} True if message was handled as delivery reply
 */
export async function handleDeliveryReply(bot, msg) {
  // Check if this is a reply to a tracked delivery message
  if (!msg.reply_to_message || !msg.reply_to_message.message_id) {
    return false;
  }

  const replyToMessageId = msg.reply_to_message.message_id;
  const trackingData = deliveryTracker.getTrackingData(replyToMessageId);
  
  if (!trackingData) {
    return false; // Not a reply to a delivery confirmation
  }

  console.log('[DEBUG] Delivery reply detected:', {
    messageId: replyToMessageId,
    orderId: trackingData.orderId,
    buyerId: trackingData.buyerId
  });

  try {
    const { orderId, buyerId } = trackingData;
    
    // Get order details for context
    const order = await new Promise((resolve, reject) => {
      db.get(
        `SELECT o.*, p.name AS product_name 
         FROM orders o
         JOIN products p ON p.id = o.product_id
         WHERE o.id = ?`,
        [orderId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    if (!order) {
      await bot.sendMessage(msg.chat.id, '❌ Order not found for this delivery message.');
      return true;
    }

    // Prepare the message to send to buyer
    const adminMessage = msg.text || msg.caption || null;
    let buyerMessage = `📬 **Message from Support**\n\n`;
    buyerMessage += `🧾 **Regarding Order #${orderId}:** ${order.product_name}\n\n`;
    buyerMessage += `💬 **Message:**\n${adminMessage}\n\n`;
    buyerMessage += `━━━━━━━━━━━━━━━━━━━━━\n`;
    buyerMessage += `📞 **Need more help?** Reply to this message or contact support.`;

    // Send message to buyer
    if (msg.document) {
      // Forward document with caption and interactive buttons
      const replyKeyboard = {
        inline_keyboard: [
          [
            { text: '💬 Reply to Admin', callback_data: `reply_to_admin_${orderId}` },
            { text: '🆘 Contact Support', url: `https://t.me/${SUPPORT_USERNAME}` }
          ]
        ]
      };

      await bot.sendDocument(buyerId, msg.document.file_id, {
        caption: buyerMessage,
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard
      });
    } else if (msg.photo) {
      // Forward photo with caption and interactive buttons
      const replyKeyboard = {
        inline_keyboard: [
          [
            { text: '💬 Reply to Admin', callback_data: `reply_to_admin_${orderId}` },
            { text: '🆘 Contact Support', url: `https://t.me/${SUPPORT_USERNAME}` }
          ]
        ]
      };

      await bot.sendPhoto(buyerId, msg.photo[msg.photo.length - 1].file_id, {
        caption: buyerMessage,
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard
      });
    } else if (msg.video) {
      // Forward video with caption and interactive buttons
      const replyKeyboard = {
        inline_keyboard: [
          [
            { text: '💬 Reply to Admin', callback_data: `reply_to_admin_${orderId}` },
            { text: '🆘 Contact Support', url: `https://t.me/${SUPPORT_USERNAME}` }
          ]
        ]
      };

      await bot.sendVideo(buyerId, msg.video.file_id, {
        caption: buyerMessage,
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard
      });
    } else if (adminMessage) {
      // Send text message with interactive buttons for buyer
      const replyKeyboard = {
        inline_keyboard: [
          [
            { text: '💬 Reply to Admin', callback_data: `reply_to_admin_${orderId}` },
            { text: '🆘 Contact Support', url: `https://t.me/${SUPPORT_USERNAME}` }
          ]
        ]
      };

      await bot.sendMessage(buyerId, buyerMessage, {
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard
      });
    } else {
      await bot.sendMessage(msg.chat.id, '❌ No message content to forward to buyer.');
      return true;
    }

    // Confirm to admin that message was sent
    await bot.sendMessage(msg.chat.id, 
      `✅ **Message sent to buyer**\n\n` +
      `👤 Buyer ID: ${buyerId}\n` +
      `🧾 Order: #${orderId}\n` +
      `📝 Message: ${adminMessage ? adminMessage.substring(0, 50) + (adminMessage.length > 50 ? '...' : '') : 'Media file'}\n` +
      `⏰ Sent: ${new Date().toLocaleString()}`,
      { parse_mode: 'Markdown' }
    );

    logger.info('DELIVERY_REPLY', `Admin message forwarded to buyer`, {
      orderId,
      buyerId,
      adminId: msg.from.id,
      messageType: msg.document ? 'document' : msg.photo ? 'photo' : msg.video ? 'video' : 'text'
    });

    return true;

  } catch (error) {
    console.error('[ERROR] Failed to handle delivery reply:', error);
    await bot.sendMessage(msg.chat.id, '❌ Failed to send message to buyer. Please try again.');
    logger.error('DELIVERY_REPLY', 'Failed to handle delivery reply', error);
    return true;
  }
}

// Handle reply to admin callback
export async function handleReplyToAdmin(bot, query) {
  const { data, from } = query;
  const orderId = data.split('_')[3]; // Extract order ID from reply_to_admin_{orderId}

  try {
    // Get order details
    const order = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM orders WHERE id = ?',
        [orderId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!order) {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Order not found.',
        show_alert: true
      });
      return;
    }

    // Verify this user is the buyer
    if (order.user_id !== from.id) {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ You can only reply to your own orders.',
        show_alert: true
      });
      return;
    }

    // Set up reply mode for this user
    global.replyMode = global.replyMode || new Map();
    global.replyMode.set(from.id, {
      orderId: orderId,
      mode: 'reply_to_admin',
      timestamp: Date.now()
    });

    await bot.answerCallbackQuery(query.id, {
      text: '✅ Reply mode activated. Send your message now.',
      show_alert: false
    });

    // Send instruction message
    await bot.sendMessage(from.id, 
      `📝 **Reply Mode Activated**\n\n` +
      `🧾 Order: #${orderId}\n` +
      `📱 Send your message now and it will be forwarded to the admin.\n\n` +
      `⏰ This mode will expire in 5 minutes.\n` +
      `❌ Type /cancel to exit reply mode.`,
      { parse_mode: 'Markdown' }
    );

    logger.info('REPLY_TO_ADMIN', `Reply mode activated for user ${from.id} on order ${orderId}`);

  } catch (error) {
    console.error('[ERROR] Failed to handle reply to admin:', error);
    await bot.answerCallbackQuery(query.id, {
      text: '❌ Failed to activate reply mode.',
      show_alert: true
    });
    logger.error('REPLY_TO_ADMIN', 'Failed to handle reply to admin', error);
  }
}