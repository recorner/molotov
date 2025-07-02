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

    const text = `🧾 *Order Summary*\n\n` +
      `🛍️ Product: *${product.name}*\n` +
      `💵 Price: *$${product.price}*\n` +
      `🕒 Time: ${new Date().toLocaleString()}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Please choose your payment method:`;

    const buttons = [
      [{ text: '💸 Pay with BTC', callback_data: `pay_btc_${product.id}` }],
      [{ text: '💸 Pay with LTC', callback_data: `pay_ltc_${product.id}` }]
    ];

    bot.sendMessage(query.message.chat.id, text, {
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

          const adminMsg = `📢 *New Payment Initiated*\n\n` +
            `🧾 Order ID: *#${orderId}*\n` +
            `👤 User: [${from.first_name}](tg://user?id=${from.id})\n` +
            `🛍️ Product: *${product.name}*\n` +
            `💵 Amount: *$${price}* (${currency.toUpperCase()})\n` +
            `🏦 Address: \`${address}\`\n` +
            `🕒 Time: ${new Date().toLocaleString()}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━`;

          notifyGroup(bot, adminMsg, { parse_mode: 'Markdown' });

          const msg = `💰 *Payment Details*\n\n` +
            `🧾 Order ID: *#${orderId}*\n` +
            `💵 Amount: *$${price}*\n` +
            `🪙 Currency: *${currency.toUpperCase()}*\n` +
            `🏦 Address: \`${address}\`\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `After sending payment, confirm below:`;

          bot.sendMessage(query.message.chat.id, msg, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ I\'ve Paid', callback_data: `confirm_${orderId}` }]
              ]
            }
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
  const text = msg.text || msg.caption || null;
  
  console.log('[DEBUG] Message content:', { fileId: !!fileId, photoId: !!photoId, text: !!text });
  
  if (!fileId && !photoId && !text) {
    console.log('[DEBUG] No content found in message');
    return bot.sendMessage(msg.chat.id, '❌ Please send a file, photo, or text message as product details.');
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
      const deliveryType = fileId ? 'File' : photoId ? 'Image' : 'Text';
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
        `🌟 *Success Story & Team Appreciation* 🌟\n\n` +
        `🎉 Another successful delivery completed!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👑 **Special Recognition:**\n\n` +
        `🧠 **Shadrack** (@novachek) - The visionary mastermind\n` +
        `💖 **Purity** (@pury23) - The brilliant coding partner\n\n` +
        `🚀 Your hard work and dedication continue to pay off!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💪 **Keep Going Team!**\n` +
        `Every order brings us closer to greatness. Your innovation and teamwork are changing lives and building the future. Don't stop now - you're crushing it!\n\n` +
        `🎯 **$1M Target Before 2026** - We're getting there!\n` +
        `📈 **Each success builds momentum**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💙 Keep building, keep innovating, keep inspiring!\n` +
        `🚀 The best is yet to come! ✨`,
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
