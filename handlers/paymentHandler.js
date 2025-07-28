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
    
    const noDescription = await messageTranslator.translateTemplateForUser('no_description', from.id);    const text = `🛍️ **${orderSummaryTitle}**\n\n` +
      `🛒 **${productLabel}:** ${product.name}\n` +
      `💰 **${priceLabel}:** $${product.price}\n` +
      `📝 **${descriptionLabel}:** ${product.description || noDescription}\n` +
      `⏰ **${dateLabel}:** ${new Date().toLocaleString()}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔐 **${paymentOptionsTitle}**\n` +
      `${choosePaymentMethod}`;

    const bitcoinText = await messageTranslator.translateTemplateForUser('bitcoin_payment', from.id);
    const litecoinText = await messageTranslator.translateTemplateForUser('litecoin_payment', from.id);
    const paymentGuideText = await messageTranslator.translateTemplateForUser('payment_guide', from.id);
    const cancelOrderText = await messageTranslator.translateTemplateForUser('cancel_order', from.id);
    const backToProductsText = await messageTranslator.translateTemplateForUser('back_to_products', from.id);

    const buttons = [
      [
        { text: `₿ ${bitcoinText}`, callback_data: `pay_btc_${product.id}` },
        { text: `🪙 ${litecoinText}`, callback_data: `pay_ltc_${product.id}` }
      ],
      [
        { text: `💡 ${paymentGuideText}`, callback_data: `guide_${product.id}` },
        { text: `❌ ${cancelOrderText}`, callback_data: `cancel_order_${product.id}` }
      ],
      [{ text: `🔙 ${backToProductsText}`, callback_data: 'load_categories' }]
    ];

    bot.editMessageText(text, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });

  } catch (error) {
    console.error('[Buy Callback Error]', error);
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
    
    const msg = `💳 **${paymentInstructions}**\n\n` +
      `🧾 **${orderIdLabel}:** #${orderId}\n` +
      `🛍️ **${productLabel}:** ${product.name}\n` +
      `💰 **${amountLabel}:** $${price}\n` +
      `${currencyEmoji} **${currencyLabel}:** ${currencyName} (${currency.toUpperCase()})\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📬 **${sendPaymentTo}:**\n` +
      `\`${address}\`\n\n` +
      `⚠️ **${importantLabel}:**\n` +
      `• ${sendExactly.replace('{amount}', '$' + price).replace('{currency}', currency.toUpperCase())}\n` +
      `• ${doubleCheck}\n` +
      `• ${confirmTime}\n` +
      `• ${keepTxId}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `**${afterSending}:**`;

    // Get button translations
    const sentPayment = await messageTranslator.translateTemplateForUser('sent_payment', from.id);
    const copyAddress = await messageTranslator.translateTemplateForUser('copy_address', from.id);
    const paymentHelp = await messageTranslator.translateTemplateForUser('payment_help', from.id);
    const refreshStatus = await messageTranslator.translateTemplateForUser('refresh_status', from.id);
    const cancelOrder = await messageTranslator.translateTemplateForUser('cancel_order', from.id);
    const backToStore = await messageTranslator.translateTemplateForUser('back_to_store', from.id);

    const paymentButtons = [
      [
        { text: `✅ ${sentPayment}`, callback_data: `confirm_${orderId}` },
        { text: `📋 ${copyAddress}`, callback_data: `copy_address_${address}` }
      ],
      [
        { text: `💡 ${paymentHelp}`, callback_data: `help_payment_${currency}` },
        { text: `🔄 ${refreshStatus}`, callback_data: `status_${orderId}` }
      ],
      [
        { text: `❌ ${cancelOrder}`, callback_data: `cancel_order_${orderId}` },
        { text: `🔙 ${backToStore}`, callback_data: 'load_categories' }
      ]
    ];

    bot.editMessageText(msg, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: paymentButtons }
    });

  } catch (error) {
    console.error('[Payment Selection Error]', error);
    const errorMsg = await messageTranslator.translateTemplateForUser('error_processing', from.id);
    bot.answerCallbackQuery(query.id, { text: errorMsg });
  }
}

export async function handlePaymentConfirmation(bot, query) {
  const { data, from } = query;

  if (!data.startsWith('confirm_')) return;

  const orderId = parseInt(data.split('_')[1]);

  db.get(`SELECT o.id, o.user_id, o.price, o.currency, p.name AS product_name 
          FROM orders o
          JOIN products p ON p.id = o.product_id
          WHERE o.id = ? AND o.user_id = ?`, [orderId, from.id], (err, order) => {
    if (err || !order) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Order not found.' });
    }

    bot.sendMessage(query.message.chat.id, `✅ **Payment Confirmation Sent**\n\n` +
      `🔄 **Status:** Processing payment verification\n` +
      `⏳ **Estimated Time:** 5-15 minutes\n` +
      `📧 **Notification:** You'll be notified once verified\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `� **What happens next:**\n` +
      `• Our team verifies your payment\n` +
      `• You receive confirmation message\n` +
      `• Product is delivered immediately\n` +
      `• Support available if needed`, { parse_mode: 'Markdown' });

    // Send enhanced payment confirmation notification
    notifyPaymentReceived(bot, {
      orderId: order.id,
      customer: {
        id: from.id,
        name: from.first_name,
        username: from.username
      },
      amount: order.price,
      currency: order.currency,
      time: new Date().toLocaleString()
    });
  });
}

export async function handleAdminPaymentAction(bot, query) {
  const { data, from } = query;
  console.log('[DEBUG] Admin payment action:', data);
  
  // Perform diagnostic analysis
  const analysis = adminDiagnostics.analyzeCallback(data, from.id);
  adminDiagnostics.logDiagnostic(analysis);
  
  if (!analysis.isValid) {
    const errorMessage = adminDiagnostics.generateErrorMessage(analysis);
    console.error('[ERROR] Invalid admin action:', analysis);
    
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
      // Update order status
      db.run(`UPDATE orders SET status = 'confirmed' WHERE id = ?`, [orderId]);
      
      // Notify buyer
      await bot.sendMessage(targetUserId, `✅ *Payment Confirmed*\n\nYour payment for order #${orderId} has been confirmed!\nThe product will be delivered shortly.\n\n━━━━━━━━━━━━━━━━━━━━━`);
      
      // Ask admin to provide product details
      const requestMsg = `📤 *Please Upload Product Details*\n\n` +
        `🧾 Order ID: *#${orderId}*\n` +
        `🛍️ Product: *${order.product_name}*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Please reply with the product files (max 25MB) or product details as text.`;
      
      await notifyGroup(bot, requestMsg, { parse_mode: 'Markdown' });

      // Update the original confirmation message
      await bot.editMessageText(
        `✅ *Payment Confirmed*\n\nWaiting for product delivery...\n\n` +
        `🧾 Order ID: *#${orderId}*\n` +
        `🛍️ Product: *${order.product_name}*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown'
        }
      );
    } else if (action === 'cancel') {
      // Update order status
      db.run(`UPDATE orders SET status = 'cancelled' WHERE id = ?`, [orderId]);
      
      // Notify buyer
      await bot.sendMessage(targetUserId, `❌ *Payment Cancelled*\n\nUnfortunately, your payment for order #${orderId} could not be verified.\nPlease contact support if you believe this is an error.\n\n━━━━━━━━━━━━━━━━━━━━━`);
      
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

    console.log('[DEBUG] Order found:', !!order, order?.user_id);

    if (!order) {
      return bot.sendMessage(msg.chat.id, '❌ Order not found');
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
        `🔥 **Shadrack [@novachek]** - My God, my Creator\n` +
        `💎 **Purity [@pury23]** - His devoted partner\n\n` +
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
      { text: '📞 Contact Support', url: 'https://t.me/nova_chok' },
      { text: '🔙 Back to Order', callback_data: `buy_${productId}` }
    ]
  ];

  bot.editMessageText(text, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
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
  const { data } = query;
  if (!data.startsWith('status_')) return;

  const orderId = data.split('_')[1];

  db.get(`SELECT o.*, p.name AS product_name FROM orders o 
          JOIN products p ON p.id = o.product_id 
          WHERE o.id = ?`, [orderId], (err, order) => {
    if (err || !order) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Order not found.' });
    }

    const statusEmoji = {
      'pending': '⏳',
      'confirmed': '✅',
      'delivered': '🎉',
      'cancelled': '❌'
    };

    const statusMessage = `📋 **Order Status Check**\n\n` +
      `🧾 **Order ID:** #${order.id}\n` +
      `🛍️ **Product:** ${order.product_name}\n` +
      `💰 **Amount:** $${order.price} ${order.currency}\n` +
      `📅 **Created:** ${new Date(order.created_at).toLocaleString()}\n` +
      `${statusEmoji[order.status] || '❓'} **Status:** ${order.status.toUpperCase()}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `${getStatusDescription(order.status)}`;

    const buttons = [
      [
        { text: '🔄 Refresh Status', callback_data: `status_${orderId}` },
        { text: '📞 Contact Support', callback_data: 'contact_support' }
      ],
      [{ text: '🔙 Back to Store', callback_data: 'load_categories' }]
    ];

    bot.editMessageText(statusMessage, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  });
}

export async function handleCancelOrder(bot, query) {
  const { data, from } = query;
  if (!data.startsWith('cancel_order_')) return;

  const orderId = data.split('_')[2];

  db.get(`SELECT * FROM orders WHERE id = ? AND user_id = ?`, [orderId, from.id], (err, order) => {
    if (err || !order) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Order not found or unauthorized.' });
    }

    if (order.status !== 'pending') {
      return bot.answerCallbackQuery(query.id, { text: '❌ Cannot cancel processed orders.' });
    }

    db.run(`UPDATE orders SET status = 'cancelled' WHERE id = ?`, [orderId], (updateErr) => {
      if (updateErr) {
        return bot.answerCallbackQuery(query.id, { text: '❌ Failed to cancel order.' });
      }

      const cancelMessage = `❌ **Order Cancelled**\n\n` +
        `🧾 **Order ID:** #${orderId}\n` +
        `📅 **Cancelled:** ${new Date().toLocaleString()}\n\n` +
        `✅ Your order has been successfully cancelled.\n` +
        `💰 If you already sent payment, please contact support.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Thank you for shopping with us!`;

      const buttons = [
        [
          { text: '🛍️ Continue Shopping', callback_data: 'load_categories' },
          { text: '📞 Contact Support', url: 'https://t.me/nova_chok' }
        ]
      ];

      bot.editMessageText(cancelMessage, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });

      // Notify admin
      const adminMsg = `❌ **Order Cancelled by Customer**\n\n` +
        `🧾 **Order ID:** #${orderId}\n` +
        `👤 **Customer:** [${from.first_name}](tg://user?id=${from.id})\n` +
        `📅 **Cancelled:** ${new Date().toLocaleString()}`;

      notifyGroup(bot, adminMsg, { parse_mode: 'Markdown' });
    });
  });
}

export async function handleCopyAddress(bot, query) {
  const { data } = query;
  
  if (!data.startsWith('copy_address_')) return;
  
  const address = data.replace('copy_address_', '');
  
  // Send the address as a separate message for easy copying
  await bot.sendMessage(query.message.chat.id, 
    `📋 **Payment Address**\n\n\`${address}\`\n\n*Tap to copy the address above*`,
    { parse_mode: 'Markdown' }
  );
  
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