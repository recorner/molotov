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
    
    // Get ALL translations for payment instructions page
    const [
      paymentTitle, addressTitle, tapToCopy, quickStepsTitle,
      stepSendExact, stepUseAddress, stepClickSent, autoDelivery,
      btnSentPayment, btnCopyAddress, btnCheckStatus, btnCancel, btnBackToStore
    ] = await Promise.all([
      messageTranslator.translateTemplateForUser('payment_page_title', from.id, { currency: currencyName }),
      messageTranslator.translateTemplateForUser('payment_address_title', from.id),
      messageTranslator.translateTemplateForUser('tap_to_copy_prefix', from.id),
      messageTranslator.translateTemplateForUser('quick_steps_title', from.id),
      messageTranslator.translateTemplateForUser('step_send_exact', from.id),
      messageTranslator.translateTemplateForUser('step_use_address', from.id),
      messageTranslator.translateTemplateForUser('step_click_sent', from.id),
      messageTranslator.translateTemplateForUser('auto_delivery_notice', from.id),
      messageTranslator.translateTemplateForUser('btn_i_sent_payment', from.id),
      messageTranslator.translateTemplateForUser('btn_copy_address', from.id),
      messageTranslator.translateTemplateForUser('btn_check_status', from.id),
      messageTranslator.translateTemplateForUser('btn_cancel', from.id),
      messageTranslator.translateTemplateForUser('btn_back_to_store', from.id),
    ]);
    
    // Create translated payment instructions
    const content = 
      `**💰 ${uiOptimizer.formatPrice(price)} ${currency.toUpperCase()}**\n` +
      `${product.name} • Order #${orderId}\n\n` +
      
      `**📍 ${addressTitle}**\n` +
      `👆 **${tapToCopy}** \`${address}\`\n\n` +
      
      `**⚡ ${quickStepsTitle}**\n` +
      `1️⃣ ${stepSendExact}\n` +
      `2️⃣ ${stepUseAddress}\n` +
      `3️⃣ ${stepClickSent}\n\n` +
      
      `📦 **${autoDelivery}**`;

    const messageText = uiOptimizer.formatMessage(
      `💳 ${currencyEmoji} ${paymentTitle}`,
      content,
      { 
        style: 'compact',
        addSeparator: false, 
        addTimestamp: false 
      }
    );

    // Create translated payment buttons
    const paymentButtons = [
      [{ text: `✅ ${btnSentPayment}`, callback_data: `confirm_${orderId}` }],
      [{ text: `📋 ${btnCopyAddress}`, callback_data: `copy_address_${address}` }],
      [
        { text: `🔍 ${btnCheckStatus}`, callback_data: `status_${orderId}` },
        { text: `❌ ${btnCancel}`, callback_data: `cancel_order_${orderId}` }
      ],
      [{ text: `🏪 ${btnBackToStore}`, callback_data: 'load_categories' }]
    ];

    // Show payment instructions with banner for professional payment experience - use smart editing
    await smartMessageManager.sendOrEditSmart(bot, query.message.chat.id, query.message.message_id, messageText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: paymentButtons }
    }, true); // Force banner for payment instructions

    // Show translated status message
    const loadedAlert = await messageTranslator.translateTemplateForUser('payment_loaded_alert', from.id, { currency: currencyName });
    await bot.answerCallbackQuery(query.id, { 
      text: `💳 ${loadedAlert}`,
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
    const waitMsg = await messageTranslator.translateTemplateForUser('wait_seconds', from.id, { seconds: remaining });
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ ${waitMsg}`,
      show_alert: true 
    });
  }

  console.log('[CONFIRM TRACK 7] Spam prevention passed');

  // Check if this is a duplicate confirmation BEFORE recording it
  if (spamPrevention.isDuplicateConfirmation(from.id, orderId)) {
    console.log('[CONFIRM TRACK 8] Duplicate confirmation detected, sending reminder');
    // Fetch translated reminder strings
    const [autoDetect, notifyFound, noAction, processingTitle,
      btnStatus, btnContactSupport, reminderAlert
    ] = await Promise.all([
      messageTranslator.translateTemplateForUser('auto_detection_in_progress', from.id),
      messageTranslator.translateTemplateForUser('get_notified_when_found', from.id),
      messageTranslator.translateTemplateForUser('no_action_needed_wait', from.id),
      messageTranslator.translateTemplateForUser('payment_processing_title', from.id),
      messageTranslator.translateTemplateForUser('btn_check_status', from.id),
      messageTranslator.translateTemplateForUser('btn_contact_support', from.id),
      messageTranslator.translateTemplateForUser('confirmation_reminder_alert', from.id),
    ]);
    
    const reminderContent = 
      `**Order #${orderId}**\n` +
      `⏱️ ${autoDetect}\n` +
      `📱 ${notifyFound}\n\n` +
      `💡 **${noAction}**`;

    const reminderMessage = uiOptimizer.formatMessage(
      `🔔 ${processingTitle}`,
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
          [{ text: `🔄 ${btnStatus}`, callback_data: `status_${orderId}` }],
          [{ text: `💬 ${btnContactSupport}`, url: 'https://t.me/kopachev4' }]
        ]
      }
    });

    return bot.answerCallbackQuery(query.id, { 
      text: `🔔 ${reminderAlert}`,
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
    const cooldownMsg = await messageTranslator.translateTemplateForUser('confirm_cooldown', from.id, { seconds: remainingTime });
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ ${cooldownMsg}`,
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
    const maxMsg = await messageTranslator.translateTemplateForUser('max_confirmations_error', from.id);
    return bot.answerCallbackQuery(query.id, { 
      text: `🚫 ${maxMsg}`,
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
      const notFoundMsg = await messageTranslator.translateTemplateForUser('order_not_found_error', from.id);
      return bot.answerCallbackQuery(query.id, { 
        text: `❌ ${notFoundMsg}`,
        show_alert: true 
      });
    }

    console.log('[CONFIRM TRACK 15] Order found, status:', order.status);

    if (order.status !== 'pending') {
      console.log('[CONFIRM TRACK 16] Order status is not pending');
      let statusText;
      if (order.status === 'completed') {
        statusText = '✅ ' + await messageTranslator.translateTemplateForUser('order_already_completed', from.id);
      } else if (order.status === 'cancelled') {
        statusText = '❌ ' + await messageTranslator.translateTemplateForUser('order_was_cancelled', from.id);
      } else {
        statusText = '🔄 ' + await messageTranslator.translateTemplateForUser('order_status_text', from.id, { status: order.status });
      }
      
      return bot.answerCallbackQuery(query.id, { 
        text: statusText,
        show_alert: true 
      });
    }

    console.log('[CONFIRM TRACK 17] Order status is pending, processing confirmation');

    // Fetch translations for confirmation page
    const [confirmTitle, autoVerify, detectTime, instantDelivery,
      notifiedAuto, btnStatus, btnSupport, btnContinue, confirmAlert
    ] = await Promise.all([
      messageTranslator.translateTemplateForUser('payment_confirmation_title', from.id),
      messageTranslator.translateTemplateForUser('auto_verification_active', from.id),
      messageTranslator.translateTemplateForUser('detection_5_15_min', from.id),
      messageTranslator.translateTemplateForUser('instant_delivery_after_confirm', from.id),
      messageTranslator.translateTemplateForUser('notified_automatically', from.id),
      messageTranslator.translateTemplateForUser('btn_check_status', from.id),
      messageTranslator.translateTemplateForUser('btn_support', from.id),
      messageTranslator.translateTemplateForUser('btn_continue_shopping', from.id),
      messageTranslator.translateTemplateForUser('payment_confirm_success', from.id),
    ]);

    const confirmationContent = 
      `**Order #${orderId}**\n` +
      `${order.product_name}\n` +
      `💰 ${uiOptimizer.formatPrice(order.price)} ${order.currency.toUpperCase()}\n\n` +
      
      `🤖 **${autoVerify}**\n` +
      `⏱️ ${detectTime}\n` +
      `🚀 ${instantDelivery}\n\n` +
      
      `📱 **${notifiedAuto}**`;

    const confirmationMessage = uiOptimizer.formatMessage(
      `✅ ${confirmTitle}`,
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
            { text: `🔄 ${btnStatus}`, callback_data: `status_${orderId}` },
            { text: `💬 ${btnSupport}`, url: 'https://t.me/kopachev4' }
          ],
          [
            { text: `🏪 ${btnContinue}`, callback_data: 'load_categories' }
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
      text: `✅ ${confirmAlert}`,
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
      
      // Translate buyer notification using BUYER's language
      const [buyerConfirmed, buyerDelivery, buyerReceive] = await Promise.all([
        messageTranslator.translateTemplateForUser('buyer_payment_confirmed', targetUserId),
        messageTranslator.translateTemplateForUser('buyer_delivery_in_progress', targetUserId),
        messageTranslator.translateTemplateForUser('buyer_receive_shortly', targetUserId),
      ]);
      
      // Notify buyer with translated confirmation
      const confirmationMessage = uiOptimizer.formatMessage(
        `✅ ${buyerConfirmed}`,
        `**Order #${orderId}**\n` +
        `${order.product_name}\n\n` +
        `🚀 **${buyerDelivery}**\n` +
        `📱 ${buyerReceive}`,
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
      
      // Translate buyer cancellation using BUYER's language
      const [buyerCancelled, buyerNotVerified, buyerContactWrong] = await Promise.all([
        messageTranslator.translateTemplateForUser('buyer_payment_cancelled', targetUserId),
        messageTranslator.translateTemplateForUser('buyer_payment_not_verified', targetUserId),
        messageTranslator.translateTemplateForUser('buyer_contact_if_wrong', targetUserId),
      ]);
      
      // Notify buyer with translated cancellation message
      const cancellationMessage = uiOptimizer.formatMessage(
        `❌ ${buyerCancelled}`,
        `**Order #${orderId}**\n\n` +
        `🔍 **${buyerNotVerified}**\n` +
        `💬 ${buyerContactWrong}`,
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
      // Translate delivery caption using BUYER's language
      const [deliveryTitle, orderLabel, detailsLabel] = await Promise.all([
        messageTranslator.translateTemplateForUser('product_delivery_title', buyerId),
        messageTranslator.translateTemplateForUser('order_id', buyerId),
        messageTranslator.translateTemplateForUser('description_label', buyerId),
      ]);
      const deliveryCaption = `🎉 *${deliveryTitle}*\n\n🧾 ${orderLabel}: *#${orderId}*\n🛍️ Product: *${order.product_name}*${text ? `\n📝 ${detailsLabel}: ${text}` : ''}\n\n━━━━━━━━━━━━━━━━━━━━━`;
      
      // Send content to buyer
      if (fileId) {
        console.log('[DEBUG] Sending document to buyer');
        await bot.sendDocument(buyerId, fileId, {
          caption: deliveryCaption,
          parse_mode: 'Markdown'
        });
      } else if (photoId) {
        console.log('[DEBUG] Sending photo to buyer');
        await bot.sendPhoto(buyerId, photoId, {
          caption: deliveryCaption,
          parse_mode: 'Markdown'
        });
      } else if (videoId) {
        console.log('[DEBUG] Sending video to buyer');
        await bot.sendVideo(buyerId, videoId, {
          caption: deliveryCaption,
          parse_mode: 'Markdown'
        });
      } else if (text) {
        console.log('[DEBUG] Sending text to buyer');
        await bot.sendMessage(buyerId,
          `🎉 *${deliveryTitle}*\n\n🧾 ${orderLabel}: *#${orderId}*\n🛍️ Product: *${order.product_name}*\n📝 ${detailsLabel}:\n${text}\n\n━━━━━━━━━━━━━━━━━━━━━`,
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

      // Send translated final confirmation to buyer
      const [completeText, thankYou, questionsSupport] = await Promise.all([
        messageTranslator.translateTemplateForUser('order_complete_text', buyerId),
        messageTranslator.translateTemplateForUser('thank_you_purchase', buyerId),
        messageTranslator.translateTemplateForUser('questions_contact_support', buyerId),
      ]);
      await bot.sendMessage(buyerId,
        `✅ *${completeText}*\n\n${thankYou}\n\n🧾 ${orderLabel}: *#${orderId}*\n🛍️ Product: *${order.product_name}*\n\n━━━━━━━━━━━━━━━━━━━━━\n\n${questionsSupport}`,
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
  const { data, from } = query;
  
  if (!data.startsWith('guide_')) return;
  
  const productId = parseInt(data.split('_')[1]);
  
  // Fetch all guide translations in parallel
  const [guideTitle, secTitle, secEncrypted, secIrreversible, secNoPersonal,
    procTitle, gStep1, gStep2, gStep3, gStep4, gStep5, gStep6,
    impTitle, noteExact, noteDouble, noteTx, noteContact, procTime,
    btnBtc, btnLtc, btnContactSupport, btnBackOrder
  ] = await Promise.all([
    messageTranslator.translateTemplateForUser('guide_title', from.id),
    messageTranslator.translateTemplateForUser('guide_security_title', from.id),
    messageTranslator.translateTemplateForUser('guide_secure_encrypted', from.id),
    messageTranslator.translateTemplateForUser('guide_irreversible', from.id),
    messageTranslator.translateTemplateForUser('guide_no_personal_data', from.id),
    messageTranslator.translateTemplateForUser('guide_process_title', from.id),
    messageTranslator.translateTemplateForUser('guide_step_select_crypto', from.id),
    messageTranslator.translateTemplateForUser('guide_step_copy_address', from.id),
    messageTranslator.translateTemplateForUser('guide_step_send_amount', from.id),
    messageTranslator.translateTemplateForUser('guide_step_confirm_chat', from.id),
    messageTranslator.translateTemplateForUser('guide_step_wait_verify', from.id),
    messageTranslator.translateTemplateForUser('guide_step_receive_product', from.id),
    messageTranslator.translateTemplateForUser('guide_important_title', from.id),
    messageTranslator.translateTemplateForUser('guide_exact_amount', from.id),
    messageTranslator.translateTemplateForUser('guide_double_check', from.id),
    messageTranslator.translateTemplateForUser('guide_keep_tx_id', from.id),
    messageTranslator.translateTemplateForUser('guide_contact_issues', from.id),
    messageTranslator.translateTemplateForUser('guide_processing_time', from.id),
    messageTranslator.translateTemplateForUser('btn_continue_btc', from.id),
    messageTranslator.translateTemplateForUser('btn_continue_ltc', from.id),
    messageTranslator.translateTemplateForUser('btn_contact_support', from.id),
    messageTranslator.translateTemplateForUser('btn_back_to_order', from.id),
  ]);
  
  const text = `💡 **${guideTitle}**\n\n` +
    `🔐 **${secTitle}**\n` +
    `• ${secEncrypted}\n` +
    `• ${secIrreversible}\n` +
    `• ${secNoPersonal}\n\n` +
    `💳 **${procTitle}**\n` +
    `1️⃣ ${gStep1}\n` +
    `2️⃣ ${gStep2}\n` +
    `3️⃣ ${gStep3}\n` +
    `4️⃣ ${gStep4}\n` +
    `5️⃣ ${gStep5}\n` +
    `6️⃣ ${gStep6}\n\n` +
    `⚠️ **${impTitle}**\n` +
    `• ${noteExact}\n` +
    `• ${noteDouble}\n` +
    `• ${noteTx}\n` +
    `• ${noteContact}\n\n` +
    `🕒 **${procTime}**`;

  const keyboard = [
    [
      { text: `₿ ${btnBtc}`, callback_data: `pay_btc_${productId}` },
      { text: `🪙 ${btnLtc}`, callback_data: `pay_ltc_${productId}` }
    ],
    [
      { text: `📞 ${btnContactSupport}`, url: 'https://t.me/kopachev4' },
      { text: `🔙 ${btnBackOrder}`, callback_data: `buy_${productId}` }
    ]
  ];

  // Show payment guide with banner for professional experience - use smart editing
  await smartMessageManager.sendOrEditSmart(bot, query.message.chat.id, query.message.message_id, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  }, true); // Force banner for payment guide
}

export async function handlePaymentHelp(bot, query) {
  const { data, from } = query;
  if (!data.startsWith('help_payment_')) return;

  const currency = data.split('_')[2];
  const currencyName = currency === 'btc' ? 'Bitcoin' : 'Litecoin';
  const currencyEmoji = currency === 'btc' ? '₿' : '🪙';
  const confirmTimeText = currency === 'btc' ? '10-60 min' : '2-15 min';

  // Fetch all help translations in parallel
  const [helpTitle, getCrypto, buyExchanges, useP2P, btcAtms,
    walletsTitle, mobileW, desktopW, hardwareW,
    checkTx, btcExplorer, ltcExplorer, confirmTimes,
    issuesTitle, wrongAddr, lowFees, exchangeW,
    needMore, contactTeam, btnBackPayment
  ] = await Promise.all([
    messageTranslator.translateTemplateForUser('help_title', from.id, { currency: currencyName }),
    messageTranslator.translateTemplateForUser('help_getting_crypto', from.id, { currency: currencyName }),
    messageTranslator.translateTemplateForUser('help_buy_exchanges', from.id),
    messageTranslator.translateTemplateForUser('help_p2p', from.id),
    messageTranslator.translateTemplateForUser('help_btc_atms', from.id),
    messageTranslator.translateTemplateForUser('help_wallets_title', from.id),
    messageTranslator.translateTemplateForUser('help_mobile_wallets', from.id),
    messageTranslator.translateTemplateForUser('help_desktop_wallets', from.id),
    messageTranslator.translateTemplateForUser('help_hardware_wallets', from.id),
    messageTranslator.translateTemplateForUser('help_check_tx_title', from.id),
    messageTranslator.translateTemplateForUser('help_btc_explorer', from.id),
    messageTranslator.translateTemplateForUser('help_ltc_explorer', from.id),
    messageTranslator.translateTemplateForUser('help_confirm_times', from.id),
    messageTranslator.translateTemplateForUser('help_issues_title', from.id),
    messageTranslator.translateTemplateForUser('help_wrong_address', from.id),
    messageTranslator.translateTemplateForUser('help_low_fees', from.id),
    messageTranslator.translateTemplateForUser('help_exchange_withdrawal', from.id),
    messageTranslator.translateTemplateForUser('help_need_more', from.id),
    messageTranslator.translateTemplateForUser('help_contact_team', from.id),
    messageTranslator.translateTemplateForUser('btn_back_to_payment', from.id),
  ]);

  const helpMessage = `🆘 **${helpTitle}**\n\n` +
    `${currencyEmoji} **${getCrypto}**\n` +
    `• ${buyExchanges}\n` +
    `• ${useP2P}\n` +
    `• ${btcAtms}\n\n` +
    `📱 **${walletsTitle}**\n` +
    `• ${mobileW}\n` +
    `• ${desktopW}\n` +
    `• ${hardwareW}\n\n` +
    `🔍 **${checkTx}**\n` +
    `• ${btcExplorer}\n` +
    `• ${ltcExplorer}\n\n` +
    `⏱️ **${confirmTimes}**\n` +
    `• ${currencyName}: ${confirmTimeText}\n\n` +
    `❓ **${issuesTitle}**\n` +
    `• ${wrongAddr}\n` +
    `• ${lowFees}\n` +
    `• ${exchangeW}\n\n` +
    `📞 **${needMore}**\n` +
    `${contactTeam}`;

  const buttons = [
    [{ text: `🔙 ${btnBackPayment}`, callback_data: query.message.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data || 'load_categories' }]
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
    const waitMsg = await messageTranslator.translateTemplateForUser('wait_seconds', from.id, { seconds: remaining });
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ ${waitMsg}`,
      show_alert: false 
    });
  }

  db.get(`SELECT o.*, p.name AS product_name FROM orders o 
          JOIN products p ON p.id = o.product_id 
          WHERE o.id = ? AND o.user_id = ?`, [orderId, from.id], async (err, order) => {
    if (err || !order) {
      const notFoundMsg = await messageTranslator.translateTemplateForUser('order_not_found_error', from.id);
      return bot.answerCallbackQuery(query.id, { 
        text: `❌ ${notFoundMsg}`,
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

    // Fetch translated status labels
    const [statusTitle, detailsSection, orderIdLabel, productLabel,
      amountLabel, currencyLabel, createdLabel, currentStatusLabel,
      lastUpdatedLabel, btnRefresh, btnSupport, btnContinue
    ] = await Promise.all([
      messageTranslator.translateTemplateForUser('order_status_title', from.id),
      messageTranslator.translateTemplateForUser('order_details_section', from.id),
      messageTranslator.translateTemplateForUser('order_id', from.id),
      messageTranslator.translateTemplateForUser('product_label', from.id),
      messageTranslator.translateTemplateForUser('amount_label', from.id),
      messageTranslator.translateTemplateForUser('currency_label', from.id),
      messageTranslator.translateTemplateForUser('created_label', from.id),
      messageTranslator.translateTemplateForUser('current_status_section', from.id),
      messageTranslator.translateTemplateForUser('last_updated_label', from.id),
      messageTranslator.translateTemplateForUser('btn_refresh', from.id),
      messageTranslator.translateTemplateForUser('btn_support', from.id),
      messageTranslator.translateTemplateForUser('btn_continue_shopping', from.id),
    ]);

    const statusDesc = await getStatusDescription(order.status, from.id);

    // Create translated status content
    const statusContent = 
      `🧾 **${detailsSection}**\n` +
      `• **${orderIdLabel}:** #${order.id}\n` +
      `• **${productLabel}:** ${order.product_name}\n` +
      `• **${amountLabel}:** ${uiOptimizer.formatPrice(order.price)}\n` +
      `• **${currencyLabel}:** ${order.currency.toUpperCase()}\n` +
      `• **${createdLabel}:** ${new Date(order.created_at).toLocaleString()}\n\n` +
      
      `📊 **${currentStatusLabel}**\n` +
      `${statusEmoji[order.status] || '❓'} **${order.status.toUpperCase()}**\n\n` +
      
      `${statusDesc}\n\n` +
      
      `⏰ **${lastUpdatedLabel}:** ${new Date().toLocaleString()}`;

    const statusMessage = uiOptimizer.formatMessage(
      `📋 ${statusTitle}`,
      statusContent,
      { addSeparator: true, addTimestamp: false }
    );

    const buttons = [
      [
        { text: `🔄 ${btnRefresh}`, callback_data: `status_${orderId}` },
        { text: `💬 ${btnSupport}`, url: 'https://t.me/kopachev4' }
      ],
      [{ text: `🏪 ${btnContinue}`, callback_data: 'load_categories' }]
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
    const waitMsg = await messageTranslator.translateTemplateForUser('wait_seconds', from.id, { seconds: remaining });
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ ${waitMsg}`,
      show_alert: true 
    });
  }

  db.get(`SELECT o.*, p.name AS product_name FROM orders o 
          JOIN products p ON p.id = o.product_id 
          WHERE o.id = ? AND o.user_id = ?`, [orderId, from.id], async (err, order) => {
    if (err || !order) {
      const notFoundMsg = await messageTranslator.translateTemplateForUser('order_not_found_error', from.id);
      return bot.answerCallbackQuery(query.id, { 
        text: `❌ ${notFoundMsg}`,
        show_alert: true 
      });
    }

    if (order.status !== 'pending') {
      let statusMessage;
      if (order.status === 'completed') {
        statusMessage = '❌ ' + await messageTranslator.translateTemplateForUser('cancel_already_completed', from.id);
      } else if (order.status === 'cancelled') {
        statusMessage = 'ℹ️ ' + await messageTranslator.translateTemplateForUser('cancel_already_cancelled', from.id);
      } else {
        statusMessage = '❌ ' + await messageTranslator.translateTemplateForUser('cancel_wrong_status', from.id, { status: order.status });
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

      // Fetch cancellation translations
      const [cancelTitle, cancelSuccess, detailsSection, orderIdLabel, productLabel,
        amountLabel, cancelledLabel, whatMeans, cancelInfo1, cancelInfo2, cancelInfo3,
        ifPaid, contactImm, provideTx, refundQuick, continueText,
        btnBrowse, btnContactSupport, cancelAlert
      ] = await Promise.all([
        messageTranslator.translateTemplateForUser('order_cancelled_title', from.id),
        messageTranslator.translateTemplateForUser('order_cancelled_success', from.id),
        messageTranslator.translateTemplateForUser('order_details_section', from.id),
        messageTranslator.translateTemplateForUser('order_id', from.id),
        messageTranslator.translateTemplateForUser('product_label', from.id),
        messageTranslator.translateTemplateForUser('amount_label', from.id),
        messageTranslator.translateTemplateForUser('cancelled_at', from.id),
        messageTranslator.translateTemplateForUser('cancel_what_this_means', from.id),
        messageTranslator.translateTemplateForUser('cancel_info_success', from.id),
        messageTranslator.translateTemplateForUser('cancel_info_no_payment', from.id),
        messageTranslator.translateTemplateForUser('cancel_info_new_order', from.id),
        messageTranslator.translateTemplateForUser('cancel_if_already_paid', from.id),
        messageTranslator.translateTemplateForUser('cancel_contact_immediately', from.id),
        messageTranslator.translateTemplateForUser('cancel_provide_tx_id', from.id),
        messageTranslator.translateTemplateForUser('cancel_refund_quickly', from.id),
        messageTranslator.translateTemplateForUser('cancel_continue_text', from.id),
        messageTranslator.translateTemplateForUser('btn_browse_store', from.id),
        messageTranslator.translateTemplateForUser('btn_contact_support', from.id),
        messageTranslator.translateTemplateForUser('cancel_success_alert', from.id),
      ]);

      // Create translated cancellation confirmation message
      const cancellationContent = 
        `❌ **${cancelSuccess}**\n\n` +
        `🧾 **${detailsSection}**\n` +
        `• **${orderIdLabel}:** #${orderId}\n` +
        `• **${productLabel}:** ${order.product_name}\n` +
        `• **${amountLabel}:** ${uiOptimizer.formatPrice(order.price)}\n` +
        `• **${cancelledLabel}:** ${new Date().toLocaleString()}\n\n` +
        
        `✅ **${whatMeans}**\n` +
        `• ${cancelInfo1}\n` +
        `• ${cancelInfo2}\n` +
        `• ${cancelInfo3}\n\n` +
        
        `💰 **${ifPaid}**\n` +
        `• ${contactImm}\n` +
        `• ${provideTx}\n` +
        `• ${refundQuick}\n\n` +
        
        `🛍️ **${continueText}**`;

      const cancellationMessage = uiOptimizer.formatMessage(
        `❌ ${cancelTitle}`,
        cancellationContent,
        { addSeparator: true, addTimestamp: false }
      );

      // Send translated cancellation message
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
                { text: `🛍️ ${btnBrowse}`, callback_data: 'load_categories' },
                { text: `💬 ${btnContactSupport}`, url: 'https://t.me/kopachev4' }
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
        text: `✅ ${cancelAlert}`,
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
    const waitMsg = await messageTranslator.translateTemplateForUser('wait_seconds_short', from.id, { seconds: remaining });
    return bot.answerCallbackQuery(query.id, { 
      text: `⏱️ ${waitMsg}`,
      show_alert: false 
    });
  }
  
  const address = data.replace('copy_address_', '');
  
  // Fetch copy address translations
  const [copyTitle, mobileInstr, howToCopy, stepTap, stepSelect, stepPaste,
    securityCheck, verifyAddr, wrongAddrWarn, copyAlert,
    btnCopied, btnBackPayment
  ] = await Promise.all([
    messageTranslator.translateTemplateForUser('copy_address_title', from.id),
    messageTranslator.translateTemplateForUser('copy_mobile_instructions', from.id),
    messageTranslator.translateTemplateForUser('copy_how_to', from.id),
    messageTranslator.translateTemplateForUser('copy_step_tap_hold', from.id),
    messageTranslator.translateTemplateForUser('copy_step_select_copy', from.id),
    messageTranslator.translateTemplateForUser('copy_step_paste_wallet', from.id),
    messageTranslator.translateTemplateForUser('copy_security_check', from.id),
    messageTranslator.translateTemplateForUser('copy_verify_address', from.id),
    messageTranslator.translateTemplateForUser('copy_wrong_address_warning', from.id),
    messageTranslator.translateTemplateForUser('copy_address_alert', from.id),
    messageTranslator.translateTemplateForUser('btn_address_copied', from.id),
    messageTranslator.translateTemplateForUser('btn_back_to_payment', from.id),
  ]);

  // Translated copy address content
  const copyContent = 
    `**📱 ${mobileInstr}**\n\n` +
    
    `**👆 ${howToCopy}**\n` +
    `1️⃣ ${stepTap}\n` +
    `2️⃣ ${stepSelect}\n` +
    `3️⃣ ${stepPaste}\n\n` +
    
    `**📋 Payment Address:**\n` +
    `\`${address}\`\n\n` +
    
    `**⚠️ ${securityCheck}**\n` +
    `🔍 ${verifyAddr}\n` +
    `⚡ ${wrongAddrWarn}`;

  const copyMessage = uiOptimizer.formatMessage(
    `📋 ${copyTitle}`,
    `📋 ${copyTitle}`,
    copyContent,
    { addSeparator: false }
  );
  
  // Send the address as a separate message for easy copying
  await bot.sendMessage(query.message.chat.id, copyMessage, { 
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: `✅ ${btnCopied}`, callback_data: 'ignore' }],
        [{ text: `🔙 ${btnBackPayment}`, callback_data: 'ignore' }]
      ]
    }
  });

  // Translated status feedback
  bot.answerCallbackQuery(query.id, { 
    text: `📋 ${copyAlert}`,
    show_alert: false 
  });
}

async function getStatusDescription(status, userId) {
  const statusMap = {
    'pending': 'status_desc_pending',
    'confirmed': 'status_desc_confirmed',
    'awaiting_product': 'status_desc_awaiting',
    'delivered': 'status_desc_delivered',
    'cancelled': 'status_desc_cancelled',
    'processing': 'status_desc_confirmed',
  };
  const key = statusMap[status] || 'status_desc_unknown';
  return await messageTranslator.translateTemplateForUser(key, userId);
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

    // Prepare the translated message to send to buyer
    const adminMessage = msg.text || msg.caption || null;
    const [msgFromSupport, regardingOrder, supportMsgLabel, needHelpReply, btnReplyAdmin, btnContactSupport] = await Promise.all([
      messageTranslator.translateTemplateForUser('message_from_support', buyerId),
      messageTranslator.translateTemplateForUser('regarding_order_label', buyerId),
      messageTranslator.translateTemplateForUser('support_message_label', buyerId),
      messageTranslator.translateTemplateForUser('need_help_reply', buyerId),
      messageTranslator.translateTemplateForUser('btn_reply_to_admin', buyerId),
      messageTranslator.translateTemplateForUser('btn_contact_support', buyerId),
    ]);
    let buyerMessage = `📬 **${msgFromSupport}**\n\n`;
    buyerMessage += `🧾 **${regardingOrder} #${orderId}:** ${order.product_name}\n\n`;
    buyerMessage += `💬 **${supportMsgLabel}:**\n${adminMessage}\n\n`;
    buyerMessage += `━━━━━━━━━━━━━━━━━━━━━\n`;
    buyerMessage += `📞 **${needHelpReply}**`;

    // Send message to buyer with translated buttons
    const replyKeyboard = {
      inline_keyboard: [
        [
          { text: `💬 ${btnReplyAdmin}`, callback_data: `reply_to_admin_${orderId}` },
          { text: `🆘 ${btnContactSupport}`, url: `https://t.me/${SUPPORT_USERNAME}` }
        ]
      ]
    };

    if (msg.document) {
      await bot.sendDocument(buyerId, msg.document.file_id, {
        caption: buyerMessage,
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard
      });
    } else if (msg.photo) {
      await bot.sendPhoto(buyerId, msg.photo[msg.photo.length - 1].file_id, {
        caption: buyerMessage,
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard
      });
    } else if (msg.video) {
      await bot.sendVideo(buyerId, msg.video.file_id, {
        caption: buyerMessage,
        parse_mode: 'Markdown',
        reply_markup: replyKeyboard
      });
    } else if (adminMessage) {
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

    const [replyActivated, replyTitle, replyOrderLabel, replySendNow, replyExpire, replyCancelCmd] = await Promise.all([
      messageTranslator.translateTemplateForUser('reply_mode_success', from.id),
      messageTranslator.translateTemplateForUser('reply_mode_title', from.id),
      messageTranslator.translateTemplateForUser('regarding_order_label', from.id),
      messageTranslator.translateTemplateForUser('reply_mode_instruction', from.id),
      messageTranslator.translateTemplateForUser('reply_mode_expires', from.id),
      messageTranslator.translateTemplateForUser('reply_mode_cancel_hint', from.id),
    ]);

    await bot.answerCallbackQuery(query.id, {
      text: `✅ ${replyActivated}`,
      show_alert: false
    });

    // Send translated instruction message
    await bot.sendMessage(from.id, 
      `📝 **${replyTitle}**\n\n` +
      `🧾 ${replyOrderLabel}: #${orderId}\n` +
      `📱 ${replySendNow}\n\n` +
      `⏰ ${replyExpire}\n` +
      `❌ ${replyCancelCmd}`,
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