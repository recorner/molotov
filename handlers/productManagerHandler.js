// handlers/productManagerHandler.js — Telegram UI for product management
// Invoked via /tomcat command. All callbacks prefixed with pm_
import db from '../database.js';
import adminManager from '../utils/adminManager.js';
import productManager from '../utils/productManager.js';
import stateManager from '../utils/stateManager.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════════
//  State key helpers  (using stateManager for wizard flows)
// ═══════════════════════════════════════════════════════════════════════

const stKey = (userId) => `pm_${userId}`;

function setState(userId, data) {
  stateManager.set(stKey(userId), data, { ttl: 600_000 }); // 10 min TTL
}

function getState(userId) {
  return stateManager.get(stKey(userId));
}

function clearState(userId) {
  stateManager.delete(stKey(userId));
}

// ═══════════════════════════════════════════════════════════════════════
//  Helper — send or edit
// ═══════════════════════════════════════════════════════════════════════

async function send(bot, chatId, text, buttons, messageId = null) {
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  };
  try {
    if (messageId) {
      return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    } else {
      return await bot.sendMessage(chatId, text, opts);
    }
  } catch (err) {
    // If edit fails (message not modified etc.), send new
    if (err.message?.includes('message is not modified') || err.message?.includes('message to edit not found')) {
      return; // Silently ignore
    }
    try { return await bot.sendMessage(chatId, text, opts); } catch { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  /tomcat command handler
// ═══════════════════════════════════════════════════════════════════════

export async function handleTomcatCommand(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isAdmin = await adminManager.isAdmin(userId);
  if (!isAdmin) {
    return bot.sendMessage(chatId, '⛔ This command is restricted to administrators.');
  }

  clearState(userId);
  return showMainMenu(bot, chatId, userId);
}

// ═══════════════════════════════════════════════════════════════════════
//  Main Menu
// ═══════════════════════════════════════════════════════════════════════

async function showMainMenu(bot, chatId, userId, messageId = null) {
  const stats = await productManager.getStats();

  const text =
    `📦 *Product Management Hub*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Current Inventory*\n` +
    `• Categories: *${stats.activeCategories}*\n` +
    `• Products: *${stats.activeProducts}*\n` +
    `• Archived: *${stats.archivedProducts}*\n` +
    `• History entries: *${stats.historyEntries}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Select a section below:`;

  const buttons = [
    [
      { text: '📂 Categories', callback_data: 'pm_cat_menu' },
      { text: '🛍️ Products', callback_data: 'pm_prod_menu' }
    ],
    [
      { text: '📤 Bulk Import', callback_data: 'pm_bulk_menu' },
      { text: '📥 Export', callback_data: 'pm_export_menu' }
    ],
    [
      { text: '🕰️ History & Undo', callback_data: 'pm_history_menu' },
      { text: '🔍 Search', callback_data: 'pm_search_start' }
    ],
    [{ text: '❌ Close', callback_data: 'pm_close' }]
  ];

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  CATEGORY MENU
// ═══════════════════════════════════════════════════════════════════════

async function showCategoryMenu(bot, chatId, messageId) {
  const tree = await productManager.getCategoryTree();
  const roots = tree.filter(c => c.parent_id === null);

  let listing = '';
  if (roots.length === 0) {
    listing = '_No categories yet._';
  } else {
    for (const root of roots) {
      const subs = tree.filter(c => c.parent_id === root.id);
      listing += `📁 *${root.name}* — ${root.productCount} products`;
      if (subs.length > 0) listing += `, ${subs.length} sub`;
      listing += '\n';
      for (const sub of subs) {
        listing += `   └ ${sub.name} — ${sub.productCount} products\n`;
      }
    }
  }

  const text =
    `📂 *Category Management*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    listing +
    `━━━━━━━━━━━━━━━━━━━━━`;

  const buttons = [
    [
      { text: '➕ Add Root Category', callback_data: 'pm_cat_add_root' },
      { text: '➕ Add Subcategory', callback_data: 'pm_cat_add_sub_pick' }
    ],
    [
      { text: '✏️ Rename', callback_data: 'pm_cat_rename_pick' },
      { text: '🗑️ Delete', callback_data: 'pm_cat_del_pick' }
    ],
    [{ text: '🔙 Back', callback_data: 'pm_main' }]
  ];

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  PRODUCT MENU
// ═══════════════════════════════════════════════════════════════════════

async function showProductMenu(bot, chatId, messageId) {
  const text =
    `🛍️ *Product Management*\n\n` +
    `Select an action:`;

  const buttons = [
    [
      { text: '📋 Browse by Category', callback_data: 'pm_prod_browse' },
      { text: '🔍 Search', callback_data: 'pm_search_start' }
    ],
    [
      { text: '➕ Add Product', callback_data: 'pm_prod_add_cat' },
      { text: '🗑️ Archived Items', callback_data: 'pm_prod_archived_1' }
    ],
    [{ text: '🔙 Back', callback_data: 'pm_main' }]
  ];

  return send(bot, chatId, text, buttons, messageId);
}

// ── Browse products by category ──

async function showProductBrowseCategories(bot, chatId, messageId) {
  const tree = await productManager.getCategoryTree();
  // Show all categories that have products OR have subcategories with products
  const allCats = tree.filter(c => c.productCount > 0 || c.childCount > 0);

  if (allCats.length === 0) {
    return send(bot, chatId, '📭 No categories with products.', [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
  }

  const buttons = [];
  const roots = allCats.filter(c => c.parent_id === null);
  for (const root of roots) {
    buttons.push([{
      text: `📁 ${root.name} (${root.productCount})`,
      callback_data: `pm_prod_list_${root.id}_1`
    }]);
    // Also show subcategories inline
    const subs = allCats.filter(c => c.parent_id === root.id);
    if (subs.length > 0) {
      const subRow = subs.slice(0, 3).map(s => ({
        text: `└ ${s.name} (${s.productCount})`,
        callback_data: `pm_prod_list_${s.id}_1`
      }));
      buttons.push(subRow);
    }
  }
  buttons.push([{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]);

  return send(bot, chatId, `📂 *Select a category to browse:*`, buttons, messageId);
}

// ── Paginated product list ──

async function showProductList(bot, chatId, categoryId, page, messageId) {
  const result = await productManager.searchProducts({ categoryId, status: 'active', page, pageSize: 8 });
  const cat = await productManager.getCategory(categoryId);

  if (result.products.length === 0) {
    return send(bot, chatId, `📭 No active products in *${cat?.name || 'this category'}*.`,
      [[{ text: '🔙 Back', callback_data: 'pm_prod_browse' }]], messageId);
  }

  let text = `🛍️ *${cat?.name || 'Products'}* — Page ${result.page}/${result.totalPages} (${result.total} total)\n\n`;

  const prodButtons = [];
  for (const p of result.products) {
    const stock = p.stock_quantity === -1 ? '∞' : p.stock_quantity;
    text += `• *${p.name}* — $${p.price} [${stock}]\n`;
    prodButtons.push([{
      text: `✏️ ${p.name.substring(0, 30)}`,
      callback_data: `pm_prod_view_${p.id}`
    }]);
  }

  // Pagination
  const navRow = [];
  if (result.page > 1) navRow.push({ text: '⬅️ Prev', callback_data: `pm_prod_list_${categoryId}_${result.page - 1}` });
  navRow.push({ text: `${result.page}/${result.totalPages}`, callback_data: 'pm_noop' });
  if (result.page < result.totalPages) navRow.push({ text: 'Next ➡️', callback_data: `pm_prod_list_${categoryId}_${result.page + 1}` });
  prodButtons.push(navRow);
  prodButtons.push([{ text: '🔙 Back', callback_data: 'pm_prod_browse' }]);

  return send(bot, chatId, text, prodButtons, messageId);
}

// ── View single product ──

async function showProductView(bot, chatId, productId, messageId) {
  const p = await productManager.getProduct(productId);
  if (!p) return send(bot, chatId, '❌ Product not found.', [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);

  const stock = p.stock_quantity === -1 ? '∞ Unlimited' : String(p.stock_quantity);
  const text =
    `🛍️ *Product Details*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *Name:* ${p.name}\n` +
    `📝 *Description:* ${p.description || '—'}\n` +
    `💰 *Price:* $${p.price}\n` +
    `📦 *Stock:* ${stock}\n` +
    `🏷️ *SKU:* ${p.sku || '—'}\n` +
    `📂 *Category:* ${p.category_name || '—'}\n` +
    `📊 *Status:* ${p.status}\n` +
    `🆔 *ID:* \`${p.id}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  const buttons = [
    [
      { text: '✏️ Edit Name', callback_data: `pm_edit_name_${p.id}` },
      { text: '💰 Edit Price', callback_data: `pm_edit_price_${p.id}` }
    ],
    [
      { text: '📝 Edit Description', callback_data: `pm_edit_desc_${p.id}` },
      { text: '📦 Edit Stock', callback_data: `pm_edit_stock_${p.id}` }
    ],
    [
      { text: '📂 Move Category', callback_data: `pm_edit_cat_${p.id}` },
      { text: '🏷️ Edit SKU', callback_data: `pm_edit_sku_${p.id}` }
    ],
    [
      { text: '🗑️ Delete Product', callback_data: `pm_prod_del_${p.id}` }
    ],
    [{ text: '🔙 Back', callback_data: `pm_prod_list_${p.category_id}_1` }]
  ];

  return send(bot, chatId, text, buttons, messageId);
}

// ── Archived products list ──

async function showArchivedProducts(bot, chatId, page, messageId) {
  const result = await productManager.searchProducts({ status: 'archived', page, pageSize: 8 });

  if (result.products.length === 0) {
    return send(bot, chatId, '📭 No archived products.', [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
  }

  let text = `🗑️ *Archived Products* — Page ${result.page}/${result.totalPages}\n\n`;
  const buttons = [];
  for (const p of result.products) {
    text += `• ~~${p.name}~~ — $${p.price}\n`;
    buttons.push([{
      text: `♻️ Restore: ${p.name.substring(0, 25)}`,
      callback_data: `pm_prod_restore_${p.id}`
    }]);
  }

  const navRow = [];
  if (result.page > 1) navRow.push({ text: '⬅️ Prev', callback_data: `pm_prod_archived_${result.page - 1}` });
  if (result.page < result.totalPages) navRow.push({ text: 'Next ➡️', callback_data: `pm_prod_archived_${result.page + 1}` });
  if (navRow.length) buttons.push(navRow);
  buttons.push([{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]);

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════════════════════════════

async function showSearchResults(bot, chatId, query, page, messageId) {
  const result = await productManager.searchProducts({ query, page, pageSize: 8 });

  if (result.total === 0) {
    return send(bot, chatId, `🔍 No products matching *"${query}"*.`,
      [[{ text: '🔙 Back', callback_data: 'pm_main' }]], messageId);
  }

  let text = `🔍 *Search: "${query}"* — ${result.total} results (page ${result.page}/${result.totalPages})\n\n`;
  const buttons = [];
  for (const p of result.products) {
    text += `• *${p.name}* — $${p.price} [${p.category_name || '?'}]\n`;
    buttons.push([{
      text: `✏️ ${p.name.substring(0, 30)}`,
      callback_data: `pm_prod_view_${p.id}`
    }]);
  }

  const navRow = [];
  if (result.page > 1) navRow.push({ text: '⬅️ Prev', callback_data: `pm_search_page_${result.page - 1}` });
  if (result.page < result.totalPages) navRow.push({ text: 'Next ➡️', callback_data: `pm_search_page_${result.page + 1}` });
  if (navRow.length) buttons.push(navRow);
  buttons.push([{ text: '🔙 Back', callback_data: 'pm_main' }]);

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  BULK MENU
// ═══════════════════════════════════════════════════════════════════════

async function showBulkMenu(bot, chatId, messageId) {
  const text =
    `📤 *Bulk Operations*\n\n` +
    `*Import Format (CSV):*\n` +
    `\`sku,name,description,price,category_name,stock_quantity\`\n\n` +
    `• Existing SKUs will be *updated*\n` +
    `• New SKUs will be *created*\n` +
    `• You'll see a *preview* before committing\n` +
    `• All bulk ops can be *reverted*`;

  const ops = await productManager.getBulkOperations(5);
  const buttons = [
    [{ text: '📥 Send CSV File to Import', callback_data: 'pm_bulk_import_start' }],
  ];

  if (ops.length > 0) {
    buttons.push([{ text: '📋 Past Operations', callback_data: 'pm_bulk_history' }]);
  }

  buttons.push([{ text: '🔙 Back', callback_data: 'pm_main' }]);
  return send(bot, chatId, text, buttons, messageId);
}

async function showBulkHistory(bot, chatId, messageId) {
  const ops = await productManager.getBulkOperations(10);

  if (ops.length === 0) {
    return send(bot, chatId, '📭 No bulk operations yet.', [[{ text: '🔙 Back', callback_data: 'pm_bulk_menu' }]], messageId);
  }

  let text = `📋 *Bulk Operation History*\n\n`;
  const buttons = [];
  for (const op of ops) {
    const date = new Date(op.created_at).toLocaleDateString();
    const statusEmoji = op.status === 'committed' ? '✅' : op.status === 'reverted' ? '↩️' : '⏳';
    text += `${statusEmoji} \`${op.batch_id.substring(0, 15)}\` — ${op.total_items} items — ${date}\n`;

    if (op.status === 'committed') {
      buttons.push([{
        text: `↩️ Revert: ${op.total_items} items (${date})`,
        callback_data: `pm_bulk_revert_${op.batch_id}`
      }]);
    }
  }

  buttons.push([{ text: '🔙 Back', callback_data: 'pm_bulk_menu' }]);
  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  EXPORT MENU
// ═══════════════════════════════════════════════════════════════════════

async function showExportMenu(bot, chatId, messageId) {
  const tree = await productManager.getCategoryTree();
  const roots = tree.filter(c => c.parent_id === null);

  const buttons = [
    [{ text: '📥 Export ALL Products', callback_data: 'pm_export_all' }]
  ];

  for (const root of roots) {
    buttons.push([{
      text: `📥 ${root.name} (${root.productCount})`,
      callback_data: `pm_export_cat_${root.id}`
    }]);
  }

  buttons.push([{ text: '🔙 Back', callback_data: 'pm_main' }]);
  return send(bot, chatId, `📥 *Export Products*\n\nSelect what to export (CSV format):`, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  HISTORY MENU
// ═══════════════════════════════════════════════════════════════════════

async function showHistoryMenu(bot, chatId, page, messageId) {
  const limit = 10;
  const entries = await productManager.getRecentHistory(limit * page);
  const pageEntries = entries.slice((page - 1) * limit, page * limit);

  if (pageEntries.length === 0) {
    return send(bot, chatId, '📭 No history entries yet.', [[{ text: '🔙 Back', callback_data: 'pm_main' }]], messageId);
  }

  let text = `🕰️ *Change History* — Page ${page}\n\n`;
  const buttons = [];

  for (const e of pageEntries) {
    const date = new Date(e.changed_at).toLocaleDateString();
    const actionEmoji = { create: '🆕', update: '✏️', delete: '🗑️', restore: '♻️', revert: '↩️', bulk_import: '📤' }[e.action] || '❓';
    const newData = e.new_data ? JSON.parse(e.new_data) : {};
    const name = newData.name || `${e.entity_type} #${e.entity_id}`;

    text += `${actionEmoji} ${e.action.toUpperCase()} ${e.entity_type}: *${name.substring(0, 30)}* (${date})\n`;

    if (!e.reverted && ['create', 'update', 'delete'].includes(e.action)) {
      buttons.push([{
        text: `↩️ Undo: ${e.action} "${name.substring(0, 20)}"`,
        callback_data: `pm_undo_${e.id}`
      }]);
    }
  }

  const navRow = [];
  if (page > 1) navRow.push({ text: '⬅️ Prev', callback_data: `pm_history_${page - 1}` });
  navRow.push({ text: `Page ${page}`, callback_data: 'pm_noop' });
  if (pageEntries.length === limit) navRow.push({ text: 'Next ➡️', callback_data: `pm_history_${page + 1}` });
  buttons.push(navRow);
  buttons.push([{ text: '🔙 Back', callback_data: 'pm_main' }]);

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  CATEGORY PICKERS — shared helper for selecting a category
// ═══════════════════════════════════════════════════════════════════════

async function showCategoryPicker(bot, chatId, messageId, callbackPrefix, title, includeSubcats = true) {
  const tree = await productManager.getCategoryTree();
  const roots = tree.filter(c => c.parent_id === null);

  if (roots.length === 0) {
    return send(bot, chatId, '📭 No categories. Create one first.', [[{ text: '🔙 Back', callback_data: 'pm_cat_menu' }]], messageId);
  }

  const buttons = [];
  for (const root of roots) {
    buttons.push([{
      text: `📁 ${root.name}`,
      callback_data: `${callbackPrefix}${root.id}`
    }]);
    if (includeSubcats) {
      const subs = tree.filter(c => c.parent_id === root.id);
      if (subs.length > 0) {
        const subRow = subs.slice(0, 3).map(s => ({
          text: `└ ${s.name}`,
          callback_data: `${callbackPrefix}${s.id}`
        }));
        buttons.push(subRow);
      }
    }
  }
  buttons.push([{ text: '🔙 Back', callback_data: 'pm_cat_menu' }]);

  return send(bot, chatId, `${title}`, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  CALLBACK ROUTER
// ═══════════════════════════════════════════════════════════════════════

export async function handleProductManagerCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id;
  const data = query.data;

  // Admin check
  const isAdmin = await adminManager.isAdmin(userId);
  if (!isAdmin) {
    return bot.answerCallbackQuery(query.id, { text: '⛔ Unauthorized', show_alert: true });
  }

  try {
    await bot.answerCallbackQuery(query.id);
  } catch { /* ignore */ }

  // ── Main ──
  if (data === 'pm_main') return showMainMenu(bot, chatId, userId, messageId);
  if (data === 'pm_close') {
    clearState(userId);
    try { await bot.deleteMessage(chatId, messageId); } catch { /* ignore */ }
    return;
  }
  if (data === 'pm_noop') return;

  // ── Category menu ──
  if (data === 'pm_cat_menu') return showCategoryMenu(bot, chatId, messageId);

  // Add root category
  if (data === 'pm_cat_add_root') {
    setState(userId, { step: 'cat_add_root' });
    return send(bot, chatId, '📁 *Add Root Category*\n\nType the new category name:', [[{ text: '🔙 Cancel', callback_data: 'pm_cat_menu' }]], messageId);
  }

  // Add subcategory — pick parent
  if (data === 'pm_cat_add_sub_pick') {
    return showCategoryPicker(bot, chatId, messageId, 'pm_cat_add_sub_', '📁 *Add Subcategory*\n\nSelect parent category:', false);
  }

  // Add subcategory — parent selected
  if (data.startsWith('pm_cat_add_sub_')) {
    const parentId = parseInt(data.replace('pm_cat_add_sub_', ''), 10);
    setState(userId, { step: 'cat_add_sub', parentId });
    const parent = await productManager.getCategory(parentId);
    return send(bot, chatId, `📁 *Add Subcategory under "${parent?.name}"*\n\nType the subcategory name:`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_cat_menu' }]], messageId);
  }

  // Rename — pick category
  if (data === 'pm_cat_rename_pick') {
    return showCategoryPicker(bot, chatId, messageId, 'pm_cat_rename_', '✏️ *Rename Category*\n\nSelect category to rename:');
  }

  // Rename — category selected
  if (data.startsWith('pm_cat_rename_')) {
    const catId = parseInt(data.replace('pm_cat_rename_', ''), 10);
    const cat = await productManager.getCategory(catId);
    setState(userId, { step: 'cat_rename', catId });
    return send(bot, chatId, `✏️ *Rename "${cat?.name}"*\n\nType the new name:`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_cat_menu' }]], messageId);
  }

  // Delete — pick category
  if (data === 'pm_cat_del_pick') {
    return showCategoryPicker(bot, chatId, messageId, 'pm_cat_del_', '🗑️ *Delete Category*\n\nSelect category to delete:');
  }

  // Delete — category selected → show impact
  if (data.startsWith('pm_cat_del_') && !data.includes('confirm')) {
    const catId = parseInt(data.replace('pm_cat_del_', ''), 10);
    const impact = await productManager.getCategoryDeleteImpact(catId);
    if (!impact) return send(bot, chatId, '❌ Category not found.', [[{ text: '🔙 Back', callback_data: 'pm_cat_menu' }]], messageId);

    const text =
      `⚠️ *Delete "${impact.category.name}"?*\n\n` +
      `This will archive:\n` +
      `• *${impact.subcatCount}* subcategories\n` +
      `• *${impact.productCount}* direct products\n` +
      `• *${impact.allDescendantProducts}* descendant products\n\n` +
      `_All items will be soft-deleted and can be restored from History._`;

    return send(bot, chatId, text, [
      [
        { text: '✅ Yes, Delete', callback_data: `pm_cat_del_confirm_${catId}` },
        { text: '❌ Cancel', callback_data: 'pm_cat_menu' }
      ]
    ], messageId);
  }

  // Delete — confirmed
  if (data.startsWith('pm_cat_del_confirm_')) {
    const catId = parseInt(data.replace('pm_cat_del_confirm_', ''), 10);
    const res = await productManager.deleteCategory(catId, userId);
    if (!res.ok) return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: 'pm_cat_menu' }]], messageId);
    return send(bot, chatId, `✅ Category deleted. Batch: \`${res.batchId}\`\n\nYou can revert this from History.`,
      [[{ text: '🔙 Back', callback_data: 'pm_cat_menu' }]], messageId);
  }

  // ── Product menu ──
  if (data === 'pm_prod_menu') return showProductMenu(bot, chatId, messageId);
  if (data === 'pm_prod_browse') return showProductBrowseCategories(bot, chatId, messageId);

  // Product list
  if (data.startsWith('pm_prod_list_')) {
    const parts = data.replace('pm_prod_list_', '').split('_');
    return showProductList(bot, chatId, parseInt(parts[0], 10), parseInt(parts[1], 10), messageId);
  }

  // Product view
  if (data.startsWith('pm_prod_view_')) {
    const prodId = parseInt(data.replace('pm_prod_view_', ''), 10);
    return showProductView(bot, chatId, prodId, messageId);
  }

  // Product delete
  if (data.startsWith('pm_prod_del_') && !data.includes('confirm')) {
    const prodId = parseInt(data.replace('pm_prod_del_', ''), 10);
    const p = await productManager.getProduct(prodId);
    return send(bot, chatId,
      `⚠️ *Delete "${p?.name}"?*\n\nThis will soft-delete the product. It can be restored from archived items.`,
      [
        [
          { text: '✅ Yes, Delete', callback_data: `pm_prod_del_confirm_${prodId}` },
          { text: '❌ Cancel', callback_data: `pm_prod_view_${prodId}` }
        ]
      ], messageId);
  }

  // Product delete confirmed
  if (data.startsWith('pm_prod_del_confirm_')) {
    const prodId = parseInt(data.replace('pm_prod_del_confirm_', ''), 10);
    const res = await productManager.deleteProduct(prodId, userId);
    if (!res.ok) return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
    return send(bot, chatId, `✅ Product deleted. You can restore it from Archived Items.`,
      [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
  }

  // Product restore
  if (data.startsWith('pm_prod_restore_')) {
    const prodId = parseInt(data.replace('pm_prod_restore_', ''), 10);
    const res = await productManager.restoreProduct(prodId, userId);
    if (!res.ok) return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
    return send(bot, chatId, `✅ Product restored!`, [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
  }

  // Archived list
  if (data.startsWith('pm_prod_archived_')) {
    const page = parseInt(data.replace('pm_prod_archived_', ''), 10);
    return showArchivedProducts(bot, chatId, page, messageId);
  }

  // ── Add product wizard ──

  // Step 1: pick category
  if (data === 'pm_prod_add_cat') {
    return showCategoryPicker(bot, chatId, messageId, 'pm_prod_add_in_', '🛍️ *Add Product*\n\nSelect category:');
  }

  // Step 2: category selected → ask name
  if (data.startsWith('pm_prod_add_in_')) {
    const catId = parseInt(data.replace('pm_prod_add_in_', ''), 10);
    const cat = await productManager.getCategory(catId);
    setState(userId, { step: 'prod_add_name', catId, catName: cat?.name });
    return send(bot, chatId, `🛍️ *Add Product to "${cat?.name}"*\n\nType the product *name*:`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_prod_menu' }]], messageId);
  }

  // ── Edit product fields ──

  if (data.startsWith('pm_edit_name_')) {
    const prodId = parseInt(data.replace('pm_edit_name_', ''), 10);
    setState(userId, { step: 'edit_name', prodId });
    return send(bot, chatId, `✏️ Type the *new name*:`, [[{ text: '🔙 Cancel', callback_data: `pm_prod_view_${prodId}` }]], messageId);
  }

  if (data.startsWith('pm_edit_price_')) {
    const prodId = parseInt(data.replace('pm_edit_price_', ''), 10);
    setState(userId, { step: 'edit_price', prodId });
    return send(bot, chatId, `💰 Type the *new price* (number):`, [[{ text: '🔙 Cancel', callback_data: `pm_prod_view_${prodId}` }]], messageId);
  }

  if (data.startsWith('pm_edit_desc_')) {
    const prodId = parseInt(data.replace('pm_edit_desc_', ''), 10);
    setState(userId, { step: 'edit_desc', prodId });
    return send(bot, chatId, `📝 Type the *new description*:\n\n_Send "-" to clear the description._`, [[{ text: '🔙 Cancel', callback_data: `pm_prod_view_${prodId}` }]], messageId);
  }

  if (data.startsWith('pm_edit_stock_')) {
    const prodId = parseInt(data.replace('pm_edit_stock_', ''), 10);
    setState(userId, { step: 'edit_stock', prodId });
    return send(bot, chatId, `📦 Type the *new stock quantity*:\n\n_Send "-1" for unlimited._`, [[{ text: '🔙 Cancel', callback_data: `pm_prod_view_${prodId}` }]], messageId);
  }

  if (data.startsWith('pm_edit_sku_')) {
    const prodId = parseInt(data.replace('pm_edit_sku_', ''), 10);
    setState(userId, { step: 'edit_sku', prodId });
    return send(bot, chatId, `🏷️ Type the *new SKU*:\n\n_Send "-" to clear._`, [[{ text: '🔙 Cancel', callback_data: `pm_prod_view_${prodId}` }]], messageId);
  }

  if (data.startsWith('pm_edit_cat_')) {
    const prodId = parseInt(data.replace('pm_edit_cat_', ''), 10);
    setState(userId, { step: 'edit_cat', prodId });
    return showCategoryPicker(bot, chatId, messageId, `pm_edit_cat_sel_${prodId}_`, '📂 *Move Product*\n\nSelect new category:');
  }

  // Move category — selection made
  if (data.startsWith('pm_edit_cat_sel_')) {
    const parts = data.replace('pm_edit_cat_sel_', '').split('_');
    const prodId = parseInt(parts[0], 10);
    const newCatId = parseInt(parts[1], 10);
    clearState(userId);
    const res = await productManager.updateProduct(prodId, { category_id: newCatId }, userId);
    if (!res.ok) return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: `pm_prod_view_${prodId}` }]], messageId);
    return showProductView(bot, chatId, prodId, messageId);
  }

  // ── Search ──
  if (data === 'pm_search_start') {
    setState(userId, { step: 'search' });
    return send(bot, chatId, `🔍 *Search Products*\n\nType a product name, SKU, or keyword:`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_main' }]], messageId);
  }

  if (data.startsWith('pm_search_page_')) {
    const page = parseInt(data.replace('pm_search_page_', ''), 10);
    const state = getState(userId);
    if (state?.searchQuery) {
      return showSearchResults(bot, chatId, state.searchQuery, page, messageId);
    }
    return showMainMenu(bot, chatId, userId, messageId);
  }

  // ── Bulk ops ──
  if (data === 'pm_bulk_menu') return showBulkMenu(bot, chatId, messageId);
  if (data === 'pm_bulk_history') return showBulkHistory(bot, chatId, messageId);

  if (data === 'pm_bulk_import_start') {
    setState(userId, { step: 'bulk_import_file' });
    return send(bot, chatId,
      `📥 *Bulk Import*\n\nSend me a CSV file with this format:\n\n` +
      `\`sku,name,description,price,category_name,stock_quantity\`\n\n` +
      `Or paste the CSV text directly as a message.`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_bulk_menu' }]], messageId);
  }

  // Bulk preview — commit
  if (data.startsWith('pm_bulk_commit_')) {
    const batchId = data.replace('pm_bulk_commit_', '');
    const statusMsg = await bot.sendMessage(chatId, '⏳ Committing bulk import...');

    const res = await productManager.commitBulkOperation(batchId, userId, async (done, total, success, errors) => {
      try {
        await bot.editMessageText(
          `⏳ *Bulk Import Progress*\n\nProcessed: ${done}/${total}\n✅ Success: ${success}\n❌ Errors: ${errors}`,
          { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
        );
      } catch { /* ignore */ }
    });

    if (!res.ok) {
      return bot.editMessageText(`❌ ${res.error}`, { chat_id: chatId, message_id: statusMsg.message_id });
    }

    let resultText = `✅ *Bulk Import Complete*\n\n✅ Success: ${res.successCount}\n❌ Errors: ${res.errorCount}`;
    if (res.errors.length > 0) {
      resultText += `\n\n*Errors:*\n${res.errors.slice(0, 10).join('\n')}`;
    }

    return bot.editMessageText(resultText, {
      chat_id: chatId, message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'pm_main' }]] }
    });
  }

  // Bulk preview — cancel
  if (data.startsWith('pm_bulk_cancel_')) {
    clearState(userId);
    return send(bot, chatId, '❌ Bulk import cancelled.', [[{ text: '🔙 Back', callback_data: 'pm_bulk_menu' }]], messageId);
  }

  // Bulk revert
  if (data.startsWith('pm_bulk_revert_') && !data.includes('confirm')) {
    const batchId = data.replace('pm_bulk_revert_', '');
    return send(bot, chatId,
      `⚠️ *Revert this bulk operation?*\n\nBatch: \`${batchId}\`\n\nAll changes from this import will be undone.`,
      [
        [
          { text: '✅ Yes, Revert', callback_data: `pm_bulk_revert_confirm_${batchId}` },
          { text: '❌ Cancel', callback_data: 'pm_bulk_history' }
        ]
      ], messageId);
  }

  if (data.startsWith('pm_bulk_revert_confirm_')) {
    const batchId = data.replace('pm_bulk_revert_confirm_', '');
    const res = await productManager.revertBulkOperation(batchId, userId);
    if (!res.ok) return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: 'pm_bulk_history' }]], messageId);
    return send(bot, chatId, `✅ *Reverted!*\n\n♻️ ${res.revertedCount}/${res.total} items restored.`,
      [[{ text: '🔙 Back', callback_data: 'pm_bulk_menu' }]], messageId);
  }

  // ── Export ──
  if (data === 'pm_export_menu') return showExportMenu(bot, chatId, messageId);

  if (data === 'pm_export_all' || data.startsWith('pm_export_cat_')) {
    const catId = data === 'pm_export_all' ? null : parseInt(data.replace('pm_export_cat_', ''), 10);
    const csv = await productManager.exportProductsCSV(catId);
    const buf = Buffer.from(csv, 'utf-8');
    const fileName = catId ? `products_cat_${catId}.csv` : 'products_all.csv';

    await bot.sendDocument(chatId, buf, { caption: `📥 Exported ${csv.split('\n').length - 1} products.` }, { filename: fileName, contentType: 'text/csv' });
    return;
  }

  // ── History ──
  if (data === 'pm_history_menu') return showHistoryMenu(bot, chatId, 1, messageId);
  if (data.startsWith('pm_history_')) {
    const page = parseInt(data.replace('pm_history_', ''), 10);
    return showHistoryMenu(bot, chatId, page, messageId);
  }

  // Undo single change
  if (data.startsWith('pm_undo_') && !data.includes('confirm')) {
    const historyId = parseInt(data.replace('pm_undo_', ''), 10);
    return send(bot, chatId, `⚠️ *Undo this change?*\n\nHistory ID: \`${historyId}\``,
      [
        [
          { text: '✅ Yes, Undo', callback_data: `pm_undo_confirm_${historyId}` },
          { text: '❌ Cancel', callback_data: 'pm_history_menu' }
        ]
      ], messageId);
  }

  if (data.startsWith('pm_undo_confirm_')) {
    const historyId = parseInt(data.replace('pm_undo_confirm_', ''), 10);
    const res = await productManager.revertChange(historyId, userId);
    if (!res.ok) return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: 'pm_history_menu' }]], messageId);
    return send(bot, chatId, `✅ Change reverted!`, [[{ text: '🔙 Back', callback_data: 'pm_history_menu' }]], messageId);
  }

  // Fallback
  return showMainMenu(bot, chatId, userId, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  TEXT INPUT HANDLER — called from bot.js message handler
//  Returns true if the message was consumed, false otherwise.
// ═══════════════════════════════════════════════════════════════════════

export async function handleProductManagerInput(bot, msg) {
  const userId = msg.from?.id;
  const chatId = msg.chat?.id;
  if (!userId || !chatId) return false;

  const state = getState(userId);
  if (!state || !state.step) return false;

  const text = msg.text?.trim();

  // ── Category: add root ──
  if (state.step === 'cat_add_root' && text) {
    clearState(userId);
    const res = await productManager.addCategory(text, null, userId);
    if (!res.ok) return bot.sendMessage(chatId, `❌ ${res.error}`) && true;
    await bot.sendMessage(chatId, `✅ Root category *"${text}"* created!`, { parse_mode: 'Markdown' });
    await showCategoryMenu(bot, chatId);
    return true;
  }

  // ── Category: add subcategory ──
  if (state.step === 'cat_add_sub' && text) {
    const { parentId } = state;
    clearState(userId);
    const res = await productManager.addCategory(text, parentId, userId);
    if (!res.ok) return bot.sendMessage(chatId, `❌ ${res.error}`) && true;
    await bot.sendMessage(chatId, `✅ Subcategory *"${text}"* created!`, { parse_mode: 'Markdown' });
    await showCategoryMenu(bot, chatId);
    return true;
  }

  // ── Category: rename ──
  if (state.step === 'cat_rename' && text) {
    const { catId } = state;
    clearState(userId);
    const res = await productManager.renameCategory(catId, text, userId);
    if (!res.ok) return bot.sendMessage(chatId, `❌ ${res.error}`) && true;
    await bot.sendMessage(chatId, `✅ Category renamed to *"${text}"*!`, { parse_mode: 'Markdown' });
    await showCategoryMenu(bot, chatId);
    return true;
  }

  // ── Product: add wizard ──
  if (state.step === 'prod_add_name' && text) {
    setState(userId, { ...state, step: 'prod_add_desc', name: text });
    await bot.sendMessage(chatId, `📝 Now type the *description*:\n\n_Send "-" to skip._`, { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'prod_add_desc' && text) {
    const desc = text === '-' ? null : text;
    setState(userId, { ...state, step: 'prod_add_price', description: desc });
    await bot.sendMessage(chatId, `💰 Now type the *price* (number):`, { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'prod_add_price' && text) {
    const price = parseFloat(text);
    if (isNaN(price) || price < 0) {
      await bot.sendMessage(chatId, '❌ Invalid price. Enter a non-negative number.');
      return true;
    }
    setState(userId, { ...state, step: 'prod_add_sku', price });
    await bot.sendMessage(chatId, `🏷️ Type a *SKU* (unique product code):\n\n_Send "-" to skip._`, { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'prod_add_sku' && text) {
    const sku = text === '-' ? null : text;
    setState(userId, { ...state, step: 'prod_add_stock', sku });
    await bot.sendMessage(chatId, `📦 Type the *stock quantity*:\n\n_Send "-1" for unlimited._`, { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'prod_add_stock' && text) {
    const qty = parseInt(text, 10);
    if (isNaN(qty) || qty < -1) {
      await bot.sendMessage(chatId, '❌ Invalid quantity. Enter -1 (unlimited) or >= 0.');
      return true;
    }

    const data = {
      name: state.name,
      description: state.description,
      price: state.price,
      category_id: state.catId,
      sku: state.sku,
      stock_quantity: qty
    };

    // Show confirmation
    const stock = qty === -1 ? '∞ Unlimited' : String(qty);
    const confirmText =
      `🛍️ *Confirm New Product*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *Name:* ${data.name}\n` +
      `📝 *Description:* ${data.description || '—'}\n` +
      `💰 *Price:* $${data.price}\n` +
      `📦 *Stock:* ${stock}\n` +
      `🏷️ *SKU:* ${data.sku || '—'}\n` +
      `📂 *Category:* ${state.catName}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Save this product?`;

    setState(userId, { ...state, step: 'prod_add_confirm', productData: data });
    await bot.sendMessage(chatId, confirmText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Save', callback_data: 'pm_prod_add_save' },
            { text: '❌ Cancel', callback_data: 'pm_prod_menu' }
          ]
        ]
      }
    });
    return true;
  }

  // ── Edit product fields ──
  if (state.step === 'edit_name' && text) {
    clearState(userId);
    const res = await productManager.updateProduct(state.prodId, { name: text }, userId);
    if (!res.ok) return bot.sendMessage(chatId, `❌ ${res.error}`) && true;
    await bot.sendMessage(chatId, `✅ Name updated!`, { parse_mode: 'Markdown' });
    await showProductView(bot, chatId, state.prodId);
    return true;
  }

  if (state.step === 'edit_price' && text) {
    clearState(userId);
    const price = parseFloat(text);
    if (isNaN(price) || price < 0) {
      await bot.sendMessage(chatId, '❌ Invalid price.');
      return true;
    }
    const res = await productManager.updateProduct(state.prodId, { price }, userId);
    if (!res.ok) return bot.sendMessage(chatId, `❌ ${res.error}`) && true;
    await bot.sendMessage(chatId, `✅ Price updated!`);
    await showProductView(bot, chatId, state.prodId);
    return true;
  }

  if (state.step === 'edit_desc' && text) {
    clearState(userId);
    const desc = text === '-' ? null : text;
    const res = await productManager.updateProduct(state.prodId, { description: desc }, userId);
    if (!res.ok) return bot.sendMessage(chatId, `❌ ${res.error}`) && true;
    await bot.sendMessage(chatId, `✅ Description updated!`);
    await showProductView(bot, chatId, state.prodId);
    return true;
  }

  if (state.step === 'edit_stock' && text) {
    clearState(userId);
    const qty = parseInt(text, 10);
    if (isNaN(qty) || qty < -1) {
      await bot.sendMessage(chatId, '❌ Invalid quantity.');
      return true;
    }
    const res = await productManager.updateProduct(state.prodId, { stock_quantity: qty }, userId);
    if (!res.ok) return bot.sendMessage(chatId, `❌ ${res.error}`) && true;
    await bot.sendMessage(chatId, `✅ Stock updated!`);
    await showProductView(bot, chatId, state.prodId);
    return true;
  }

  if (state.step === 'edit_sku' && text) {
    clearState(userId);
    const sku = text === '-' ? null : text;
    const res = await productManager.updateProduct(state.prodId, { sku }, userId);
    if (!res.ok) return bot.sendMessage(chatId, `❌ ${res.error}`) && true;
    await bot.sendMessage(chatId, `✅ SKU updated!`);
    await showProductView(bot, chatId, state.prodId);
    return true;
  }

  // ── Search ──
  if (state.step === 'search' && text) {
    setState(userId, { step: 'search', searchQuery: text });
    await showSearchResults(bot, chatId, text, 1);
    return true;
  }

  // ── Bulk import — text CSV pasted directly ──
  if (state.step === 'bulk_import_file' && text) {
    return await processBulkCSV(bot, chatId, userId, text);
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════
//  DOCUMENT HANDLER — for CSV file uploads
//  Returns true if consumed.
// ═══════════════════════════════════════════════════════════════════════

export async function handleProductManagerDocument(bot, msg) {
  const userId = msg.from?.id;
  const chatId = msg.chat?.id;
  if (!userId || !chatId) return false;

  const state = getState(userId);
  if (!state || state.step !== 'bulk_import_file') return false;
  if (!msg.document) return false;

  const doc = msg.document;
  const name = doc.file_name || '';
  if (!name.endsWith('.csv') && !name.endsWith('.txt')) {
    await bot.sendMessage(chatId, '❌ Please send a `.csv` or `.txt` file.', { parse_mode: 'Markdown' });
    return true;
  }

  try {
    const fileLink = await bot.getFileLink(doc.file_id);
    const response = await fetch(fileLink);
    const csvText = await response.text();
    return await processBulkCSV(bot, chatId, userId, csvText);
  } catch (err) {
    logger.error('PRODUCT', 'Failed to download CSV file', err);
    await bot.sendMessage(chatId, '❌ Failed to download the file. Please try again.');
    return true;
  }
}

// ── Shared bulk CSV processor ──

async function processBulkCSV(bot, chatId, userId, csvText) {
  clearState(userId);
  const statusMsg = await bot.sendMessage(chatId, '⏳ Parsing CSV and validating...');

  const preview = await productManager.createBulkPreview(csvText, userId);

  let text =
    `📋 *Bulk Import Preview*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Summary*\n` +
    `• Total rows: *${preview.totalRows}*\n` +
    `• New products: *${preview.creates}*\n` +
    `• Updates (by SKU): *${preview.updates}*\n` +
    `• Validation errors: *${preview.errors.length}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n`;

  if (preview.errors.length > 0) {
    text += `\n⚠️ *Errors:*\n`;
    for (const err of preview.errors.slice(0, 10)) {
      text += `• ${err}\n`;
    }
    if (preview.errors.length > 10) text += `_...and ${preview.errors.length - 10} more_\n`;
  }

  if (preview.previewRows.length > 0) {
    text += `\n📝 *Preview (first ${Math.min(preview.previewRows.length, 5)}):*\n`;
    for (const row of preview.previewRows.slice(0, 5)) {
      text += `• ${row._action === 'update' ? '✏️' : '🆕'} ${row.name} — $${row.price}\n`;
    }
  }

  const buttons = [];
  if (preview.totalRows > 0) {
    buttons.push([
      { text: `✅ Commit ${preview.totalRows} items`, callback_data: `pm_bulk_commit_${preview.batchId}` },
      { text: '❌ Cancel', callback_data: `pm_bulk_cancel_${preview.batchId}` }
    ]);
  } else {
    buttons.push([{ text: '🔙 Back', callback_data: 'pm_bulk_menu' }]);
  }

  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  } catch {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════
//  PRODUCT ADD SAVE — special callback during wizard
// ═══════════════════════════════════════════════════════════════════════

export async function handleProductAddSave(bot, query) {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  const state = getState(userId);
  if (!state || state.step !== 'prod_add_confirm' || !state.productData) {
    return send(bot, chatId, '❌ Session expired. Start again.', [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
  }

  clearState(userId);
  const res = await productManager.addProduct(state.productData, userId);
  if (!res.ok) {
    return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
  }

  return send(bot, chatId,
    `✅ *Product created!*\n\n📌 *${state.productData.name}*\n💰 $${state.productData.price}\n🆔 ID: \`${res.id}\``,
    [
      [
        { text: '➕ Add Another', callback_data: 'pm_prod_add_cat' },
        { text: '👁️ View Product', callback_data: `pm_prod_view_${res.id}` }
      ],
      [{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]
    ],
    messageId
  );
}
