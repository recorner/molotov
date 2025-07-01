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

    const text = `🧾 *Order Summary:*\n\n` +
      `🛍️ Product: *${product.name}*\n` +
      `💵 Price: *$${product.price}*\n` +
      `🕒 Time: ${new Date().toLocaleString()}\n\n` +
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

    const address = currency === 'btc' ? BTC_ADDRESS : LTC_ADDRESS;
    const price = product.price;

    db.run(`
      INSERT INTO orders (user_id, product_id, price, currency)
      VALUES (?, ?, ?, ?)`,
      [from.id, product.id, price, currency.toUpperCase()],
      function (err) {
        if (err) {
          console.error('[DB] Order Insert Error:', err.message);
          return bot.answerCallbackQuery(query.id, { text: '❌ Error creating order.' });
        }

        const orderId = this.lastID;

        // ✅ Send admin notification BEFORE prompting user
        const adminMsg = `📢 *New Payment Initiated*\n\n` +
          `🧾 Order ID: *#${orderId}*\n` +
          `👤 User: [${from.first_name}](tg://user?id=${from.id})\n` +
          `🛍️ Product: *${product.name}*\n` +
          `💵 Amount: *$${price}* (${currency.toUpperCase()})\n` +
          `🏦 Address: \`${address}\`\n` +
          `🕒 Time: ${new Date().toLocaleString()}`;

        notifyGroup(bot, adminMsg, { parse_mode: 'Markdown' });

        // ✅ Then send payment instructions to user
        const msg = `💰 *Payment Details:*\n\n` +
          `🧾 Order ID: *#${orderId}*\n` +
          `💵 Amount: *$${price}*\n` +
          `🪙 Currency: *${currency.toUpperCase()}*\n` +
          `🏦 Address: \`${address}\`\n\n` +
          `After sending payment, confirm using the button below 👇`;

        bot.sendMessage(query.message.chat.id, msg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ I\'ve Paid', callback_data: `confirm_${orderId}` }]
            ]
          }
        });
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

    bot.sendMessage(query.message.chat.id, '✅ Payment initialized. Please wait while we verify your transaction. for queries please contact @nova_chok');

    // Notify group
    const msg = `📥 *Payment Confirmation Request*\n\n` +
      `🧾 Order ID: *#${order.id}*\n` +
      `👤 User: [${from.first_name}](tg://user?id=${from.id})\n` +
      `🛍️ Product: *${order.product_name}*\n` +
      `💵 Amount: *$${order.price}* ${order.currency}\n` +
      `🕐 Time: ${new Date().toLocaleString()}\n\n` +
      `🕵️ Please verify manually and deliver product.`

    notifyGroup(bot, msg, { parse_mode: 'Markdown' });
  });
}
