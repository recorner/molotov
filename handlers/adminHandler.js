// handlers/adminHandler.js
import db from '../database.js';
import { ADMIN_IDS } from '../config.js';

export function handleAdminCommand(bot, msg) {
  const { text, from } = msg;
  const args = text.split(' ');
  const command = args[0];

  if (!ADMIN_IDS.includes(from.id)) {
    return bot.sendMessage(msg.chat.id, '⛔ Unauthorized.');
  }

  if (command === '/addcategory') {
    const name = args.slice(1).join(' ');
    if (!name) return bot.sendMessage(msg.chat.id, '⚠️ Usage: /addcategory <name>');

    db.run(`INSERT INTO categories (name) VALUES (?)`, [name], function (err) {
      if (err) return bot.sendMessage(msg.chat.id, '❌ DB Error.');
      bot.sendMessage(msg.chat.id, `✅ Category *${name}* added (ID: ${this.lastID})`, { parse_mode: 'Markdown' });
    });
  }

  if (command === '/addsubcategory') {
    const parentId = parseInt(args[1]);
    const name = args.slice(2).join(' ');
    if (!parentId || !name) return bot.sendMessage(msg.chat.id, '⚠️ Usage: /addsubcategory <parent_id> <name>');

    db.run(`INSERT INTO categories (name, parent_id) VALUES (?, ?)`, [name, parentId], function (err) {
      if (err) return bot.sendMessage(msg.chat.id, '❌ DB Error.');
      bot.sendMessage(msg.chat.id, `✅ Subcategory *${name}* added (ID: ${this.lastID})`, { parse_mode: 'Markdown' });
    });
  }

  if (command === '/addproduct') {
    const [categoryId, price] = [parseInt(args[1]), parseFloat(args[2])];
    const name = args.slice(3).join(' ');

    if (!categoryId || !price || !name) {
      return bot.sendMessage(msg.chat.id, '⚠️ Usage: /addproduct <category_id> <price> <name>');
    }

    db.run(`INSERT INTO products (name, price, category_id) VALUES (?, ?, ?)`, [name, price, categoryId], function (err) {
      if (err) return bot.sendMessage(msg.chat.id, '❌ DB Error.');
      bot.sendMessage(msg.chat.id, `✅ Product *${name}* added (ID: ${this.lastID})`, { parse_mode: 'Markdown' });
    });
  }
}
