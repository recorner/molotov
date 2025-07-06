// handlers/paymentHandler.js
import db from '../database.js';
import { BTC_ADDRESS, LTC_ADDRESS } from '../config.js';
import { notifyGroup } from '../utils/notifyGroup.js';

export async function handleBuyCallback(bot, query) {
  const { data, from } = query;

  if (!data.startsWith('buy_')) return;

  const productId = parseInt(data.split('_')[1]);

  db.get(`SELECT * FROM products WHERE id = ?`, [productId], (err, product) => {
    if (err || !product) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Product not found.' });
    }

    const text = `🛍️ **Order Summary**\n\n` +
      `🛒 **Product:** ${product.name}\n` +
      `💰 **Price:** $${product.price}\n` +
      `📝 **Description:** ${product.description || 'No description available'}\n` +
      `⏰ **Date:** ${new Date().toLocaleString()}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔐 **Secure Payment Options**\n` +
      `Choose your preferred cryptocurrency:`;

    const buttons = [
      [
        { text: '₿ Bitcoin (BTC)', callback_data: `pay_btc_${product.id}` },
        { text: '🪙 Litecoin (LTC)', callback_data: `pay_ltc_${product.id}` }
      ],
      [
        { text: '💡 Payment Guide', callback_data: `guide_${product.id}` },
        { text: '❌ Cancel Order', callback_data: `cancel_order_${product.id}` }
      ],
      [{ text: '🔙 Back to Products', callback_data: 'load_categories' }]
    ];

    bot.editMessageText(text, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  });
}

export async function handlePaymentSelection(bot, query) {
  const { data, from } = query;
  if (!data.startsWith('pay_')) return;

  const [_, currency, productId] = data.split('_');

  db.get(`SELECT * FROM products WHERE id = ?`, [productId], (err, product) => {
    if (err || !product) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Product not found.' });
    }

    // First try getting address from DB
    db.get(`
      SELECT address FROM wallet_addresses 
      WHERE currency = ? 
      ORDER BY added_at DESC LIMIT 1
    `, [currency.toUpperCase()], (dbErr, row) => {
      if (dbErr) {
        console.error('[DB] Wallet fetch error:', dbErr.message);
        return bot.answerCallbackQuery(query.id, { text: '❌ DB Error fetching wallet' });
      }

      const fallbackAddress = currency === 'btc' ? BTC_ADDRESS : LTC_ADDRESS;
      const address = row?.address || fallbackAddress;
      const price = product.price;

      db.run(`
        INSERT INTO orders (user_id, product_id, price, currency)
        VALUES (?, ?, ?, ?)`,
        [from.id, product.id, price, currency.toUpperCase()],
        function (insertErr) {
          if (insertErr) {
            console.error('[DB] Order Insert Error:', insertErr.message);
            return bot.answerCallbackQuery(query.id, { text: '❌ Error creating order.' });
          }

          const orderId = this.lastID;

          const adminMsg = `📢 **New Payment Initiated**\n\n` +
            `🧾 **Order ID:** #${orderId}\n` +
            `👤 **Customer:** [${from.first_name}](tg://user?id=${from.id}) (${from.username ? '@' + from.username : 'No username'})\n` +
            `🛍️ **Product:** ${product.name}\n` +
            `💵 **Amount:** $${price} (${currency.toUpperCase()})\n` +
            `🏦 **Address:** \`${address}\`\n` +
            `⏰ **Time:** ${new Date().toLocaleString()}\n\n` +
            `🔔 **Waiting for customer payment confirmation...**`;

          notifyGroup(bot, adminMsg, { parse_mode: 'Markdown' });

          const currencyEmoji = currency === 'btc' ? '₿' : '🪙';
          const currencyName = currency === 'btc' ? 'Bitcoin' : 'Litecoin';
          
          const msg = `💳 **Payment Instructions**\n\n` +
            `🧾 **Order ID:** #${orderId}\n` +
            `🛍️ **Product:** ${product.name}\n` +
            `💰 **Amount:** $${price}\n` +
            `${currencyEmoji} **Currency:** ${currencyName} (${currency.toUpperCase()})\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📬 **Send Payment To:**\n` +
            `\`${address}\`\n\n` +
            `⚠️ **Important:**\n` +
            `• Send exactly $${price} worth of ${currency.toUpperCase()}\n` +
            `• Double-check the address above\n` +
            `• Payment may take 10-60 minutes to confirm\n` +
            `• Keep your transaction ID for reference\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `**After sending payment, click the button below:**`;

          const paymentButtons = [
            [
              { text: '✅ I\'ve Sent Payment', callback_data: `confirm_${orderId}` },
              { text: '📋 Copy Address', callback_data: `copy_address_${address}` }
            ],
            [
              { text: '💡 Payment Help', callback_data: `help_payment_${currency}` },
              { text: '🔄 Refresh Status', callback_data: `status_${orderId}` }
            ],
            [
              { text: '❌ Cancel Order', callback_data: `cancel_order_${orderId}` },
              { text: '🔙 Back to Store', callback_data: 'load_categories' }
            ]
          ];

          bot.editMessageText(msg, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: paymentButtons }
          });
        }
      );
    });
  });
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

    bot.sendMessage(query.message.chat.id, `✅ *Payment Confirmation Sent*\n\nPlease wait while we verify your transaction.\nWe will notify you once verified.\n\n━━━━━━━━━━━━━━━━━━━━━`);

    // Notify group with confirmation buttons
    const msg = `📥 *Payment Confirmation Request*\n\n` +
      `🧾 Order ID: *#${order.id}*\n` +
      `👤 User: [${from.first_name}](tg://user?id=${from.id})\n` +
      `🛍️ Product: *${order.product_name}*\n` +
      `💵 Amount: *$${order.price}* ${order.currency}\n` +
      `🕐 Time: ${new Date().toLocaleString()}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Please verify the payment and respond:`;

    notifyGroup(bot, msg, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm Payment', callback_data: `admin_confirm_${order.id}_${order.user_id}` },
            { text: '❌ Cancel Payment', callback_data: `admin_cancel_${order.id}_${order.user_id}` }
          ]
        ]
      }
    });
  });
}

export async function handleAdminPaymentAction(bot, query) {
  const { data, from } = query;
  const [action, orderId, userId] = data.split('_').slice(1);
  
  if (!action || !orderId || !userId) {
    return bot.answerCallbackQuery(query.id, { text: '❌ Invalid action data' });
  }

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
      await bot.sendMessage(userId, `✅ *Payment Confirmed*\n\nYour payment for order #${orderId} has been confirmed!\nThe product will be delivered shortly.\n\n━━━━━━━━━━━━━━━━━━━━━`);
      
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
      await bot.sendMessage(userId, `❌ *Payment Cancelled*\n\nUnfortunately, your payment for order #${orderId} could not be verified.\nPlease contact support if you believe this is an error.\n\n━━━━━━━━━━━━━━━━━━━━━`);
      
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

      // Notify admin of successful delivery
      const deliveryType = fileId ? 'File' : photoId ? 'Image' : videoId ? 'Video' : 'Text';
      await bot.sendMessage(msg.chat.id,
        `✅ *Product Delivered Successfully*\n\n` +
        `🧾 Order ID: *#${orderId}*\n` +
        `👤 Buyer ID: ${buyerId}\n` +
        `🛍️ Product: *${order.product_name}*\n` +
        `📦 Type: ${deliveryType}\n` +
        `⏰ Time: ${new Date().toLocaleString()}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'Markdown' }
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