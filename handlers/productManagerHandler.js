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
    return bot.sendMessage(chatId, '🚫 Admin access required.');
  }

  clearState(userId);
  return showMainMenu(bot, chatId, userId);
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN MENU
// ═══════════════════════════════════════════════════════════════════════

async function showMainMenu(bot, chatId, userId, messageId = null) {
  const stats = await productManager.getStats();

  const text =
    `🐱 *Product Manager — Tomcat*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📂 Categories: *${stats.activeCategories}*\n` +
    `🛍️ Active Products: *${stats.activeProducts}*\n` +
    `🗄️ Archived: *${stats.archivedProducts}*\n` +
    `📜 History Entries: *${stats.historyEntries}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  const buttons = [
    [
      { text: '📂 Categories', callback_data: 'pm_cat_menu' },
      { text: '🛍️ Products', callback_data: 'pm_prod_menu' }
    ],
    [
      { text: '📥 Bulk Import', callback_data: 'pm_bulk_menu' },
      { text: '📤 Export', callback_data: 'pm_export_menu' }
    ],
    [
      { text: '🔍 Search', callback_data: 'pm_search_start' },
      { text: '📜 History', callback_data: 'pm_history_menu' }
    ],
    [{ text: '❌ Close', callback_data: 'pm_close' }]
  ];

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  CATEGORY MENU
// ═══════════════════════════════════════════════════════════════════════

async function showCategoryMenu(bot, chatId, messageId = null) {
  const roots = await productManager.getRootCategories();

  let text = `📂 *Category Management*\n\n`;
  if (roots.length === 0) {
    text += `_No categories yet. Create one below._`;
  } else {
    for (const cat of roots) {
      text += `• *${cat.name}* — ${cat.childCount} subs, ${cat.productCount} items\n`;
    }
  }

  const buttons = roots.map(c => [{ text: `📂 ${c.name}`, callback_data: `pm_cat_view_${c.id}` }]);
  buttons.push([{ text: '➕ Add Root Category', callback_data: 'pm_cat_add_root' }]);
  buttons.push([{ text: '🔙 Main Menu', callback_data: 'pm_main' }]);

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  PRODUCT MENU
// ═══════════════════════════════════════════════════════════════════════

async function showProductMenu(bot, chatId, messageId = null) {
  const stats = await productManager.getStats();

  const text =
    `🛍️ *Product Management*\n\n` +
    `Active: *${stats.activeProducts}* | Archived: *${stats.archivedProducts}*`;

  const buttons = [
    [
      { text: '📋 Browse by Category', callback_data: 'pm_prod_browse' },
      { text: '🔍 Search', callback_data: 'pm_search_start' }
    ],
    [
      { text: '➕ Add Product', callback_data: 'pm_prod_add_cat' },
      { text: '🗄️ Archived Items', callback_data: 'pm_prod_archived_1' }
    ],
    [
      { text: '💣 Nuke All Products', callback_data: 'pm_nuke_start' }
    ],
    [{ text: '🔙 Main Menu', callback_data: 'pm_main' }]
  ];

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  BROWSE CATEGORIES (for product listing)
// ═══════════════════════════════════════════════════════════════════════

async function showBrowseCategories(bot, chatId, messageId = null) {
  const roots = await productManager.getRootCategories();

  const buttons = roots.map(c => [
    { text: `📂 ${c.name} (${c.productCount + c.childCount})`, callback_data: `pm_prod_cat_${c.id}` }
  ]);
  buttons.push([{ text: '🔙 Products', callback_data: 'pm_prod_menu' }]);

  return send(bot, chatId, `📂 *Browse Products by Category*\n\nSelect a category:`, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  PRODUCT LIST (in category)
// ═══════════════════════════════════════════════════════════════════════

async function showProductList(bot, chatId, categoryId, page, messageId = null) {
  const cat = await productManager.getCategory(categoryId);
  const subs = await productManager.getSubcategories(categoryId);
  const isLeaf = await productManager.isLeafCategory(categoryId);
  const result = await productManager.searchProducts({ categoryId, status: 'active', page, pageSize: 8 });

  let text = `📂 *${cat?.name || 'Unknown'}*\n\n`;

  // Show subcategories first
  const buttons = [];
  if (subs.length > 0) {
    text += `📁 *Subcategories:*\n`;
    for (const s of subs) {
      text += `  • ${s.name} (${s.productCount} items)\n`;
    }
    text += '\n';
    for (const s of subs) {
      buttons.push([{ text: `📂 ${s.name} (${s.productCount})`, callback_data: `pm_prod_cat_${s.id}` }]);
    }
  }

  // Show products
  if (result.products.length > 0) {
    text += `🛍️ *Products (${result.total}):*\n`;
    for (const p of result.products) {
      const stock = p.stock_quantity === -1 ? '∞' : p.stock_quantity;
      text += `• ${p.name} — $${p.price} [${stock}]\n`;
    }
  } else if (subs.length === 0) {
    text += `_No products in this category._`;
  }

  // Product buttons
  for (const p of result.products) {
    buttons.push([{ text: `🛍️ ${p.name}`, callback_data: `pm_prod_view_${p.id}` }]);
  }

  // Pagination
  if (result.totalPages > 1) {
    const paginationRow = [];
    if (result.page > 1) paginationRow.push({ text: '◀️ Prev', callback_data: `pm_prod_list_${categoryId}_${result.page - 1}` });
    paginationRow.push({ text: `📄 ${result.page}/${result.totalPages}`, callback_data: 'pm_noop' });
    if (result.page < result.totalPages) paginationRow.push({ text: 'Next ▶️', callback_data: `pm_prod_list_${categoryId}_${result.page + 1}` });
    buttons.push(paginationRow);
  }

  // Action buttons (only for leaf categories)
  if (isLeaf) {
    buttons.push([
      { text: '➕ Add Product Here', callback_data: `pm_prod_add_in_${categoryId}` },
      { text: '📥 Bulk Import Here', callback_data: `pm_bulk_to_cat_${categoryId}` }
    ]);
  }

  // Back: go to parent category, or browse root
  if (cat?.parent_id) {
    buttons.push([{ text: '🔙 Back', callback_data: `pm_prod_cat_${cat.parent_id}` }]);
  } else {
    buttons.push([{ text: '🔙 Browse', callback_data: 'pm_prod_browse' }]);
  }

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  PRODUCT VIEW (single product detail)
// ═══════════════════════════════════════════════════════════════════════

async function showProductView(bot, chatId, productId, messageId = null) {
  const p = await productManager.getProduct(productId);
  if (!p) return send(bot, chatId, '❌ Product not found.', [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);

  const stock = p.stock_quantity === -1 ? '∞ Unlimited' : String(p.stock_quantity);
  const text =
    `🛍️ *${p.name}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📝 ${p.description || '_No description_'}\n` +
    `💰 *Price:* $${p.price}\n` +
    `📦 *Stock:* ${stock}\n` +
    `🏷️ *SKU:* ${p.sku || '—'}\n` +
    `📂 *Category:* ${p.category_name || '—'}\n` +
    `📊 *Status:* ${p.status}\n` +
    `🆔 *ID:* \`${p.id}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  const buttons = [
    [
      { text: '✏️ Name', callback_data: `pm_edit_name_${p.id}` },
      { text: '💰 Price', callback_data: `pm_edit_price_${p.id}` },
      { text: '📝 Desc', callback_data: `pm_edit_desc_${p.id}` }
    ],
    [
      { text: '📦 Stock', callback_data: `pm_edit_stock_${p.id}` },
      { text: '🏷️ SKU', callback_data: `pm_edit_sku_${p.id}` },
      { text: '📂 Move', callback_data: `pm_edit_cat_${p.id}` }
    ]
  ];

  if (p.status === 'active') {
    buttons.push([{ text: '🗑️ Delete (Archive)', callback_data: `pm_prod_del_${p.id}` }]);
  } else {
    buttons.push([{ text: '♻️ Restore', callback_data: `pm_prod_restore_${p.id}` }]);
  }

  buttons.push([{ text: '🔙 Back', callback_data: p.category_id ? `pm_prod_cat_${p.category_id}` : 'pm_prod_menu' }]);

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  ARCHIVED PRODUCTS
// ═══════════════════════════════════════════════════════════════════════

async function showArchivedProducts(bot, chatId, page, messageId = null) {
  const result = await productManager.searchProducts({ status: 'archived', page, pageSize: 10 });

  if (result.total === 0) {
    return send(bot, chatId, '🗄️ *Archived Products*\n\n_No archived products._', [[{ text: '🔙 Products', callback_data: 'pm_prod_menu' }]], messageId);
  }

  let text = `🗄️ *Archived Products (${result.total})*\n\n`;
  const buttons = [];

  for (const p of result.products) {
    text += `• ${p.name} — $${p.price} (${p.category_name || '?'})\n`;
    buttons.push([
      { text: `♻️ Restore: ${p.name}`, callback_data: `pm_prod_restore_${p.id}` }
    ]);
  }

  if (result.totalPages > 1) {
    const pag = [];
    if (result.page > 1) pag.push({ text: '◀️', callback_data: `pm_prod_archived_${result.page - 1}` });
    pag.push({ text: `${result.page}/${result.totalPages}`, callback_data: 'pm_noop' });
    if (result.page < result.totalPages) pag.push({ text: '▶️', callback_data: `pm_prod_archived_${result.page + 1}` });
    buttons.push(pag);
  }

  buttons.push([{ text: '🔙 Products', callback_data: 'pm_prod_menu' }]);
  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  SEARCH RESULTS
// ═══════════════════════════════════════════════════════════════════════

async function showSearchResults(bot, chatId, query, page, messageId = null) {
  const result = await productManager.searchProducts({ query, page, pageSize: 10 });

  let text = `🔍 *Search: "${query}"*\n\nFound *${result.total}* results.\n\n`;
  const buttons = [];

  for (const p of result.products) {
    const stock = p.stock_quantity === -1 ? '∞' : p.stock_quantity;
    text += `• *${p.name}* — $${p.price} [${stock}] (${p.category_name || '?'})\n`;
    buttons.push([{ text: `🛍️ ${p.name}`, callback_data: `pm_prod_view_${p.id}` }]);
  }

  if (result.totalPages > 1) {
    const pag = [];
    if (result.page > 1) pag.push({ text: '◀️', callback_data: `pm_search_page_${result.page - 1}` });
    pag.push({ text: `${result.page}/${result.totalPages}`, callback_data: 'pm_noop' });
    if (result.page < result.totalPages) pag.push({ text: '▶️', callback_data: `pm_search_page_${result.page + 1}` });
    buttons.push(pag);
  }

  buttons.push([{ text: '🔍 New Search', callback_data: 'pm_search_start' }, { text: '🔙 Main Menu', callback_data: 'pm_main' }]);
  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  BULK MENU
// ═══════════════════════════════════════════════════════════════════════

async function showBulkMenu(bot, chatId, messageId = null) {
  const text =
    `📥 *Bulk Operations*\n\n` +
    `Import products from a CSV or TXT file, or paste data directly.\n\n` +
    `*Supported formats:*\n` +
    `• \`name,price,category\` (minimal)\n` +
    `• \`sku,name,desc,price,category,stock\` (full)\n` +
    `• Auto-detects headers & delimiters\n` +
    `• Accepts .csv, .txt, .tsv files`;

  const buttons = [
    [{ text: '📤 Send CSV/TXT File', callback_data: 'pm_bulk_import_start' }],
    [{ text: '📋 Paste CSV Text', callback_data: 'pm_bulk_paste_start' }],
    [{ text: '📂 Import to Specific Category', callback_data: 'pm_bulk_pick_cat' }],
    [{ text: '📜 Bulk Op History', callback_data: 'pm_bulk_history' }],
    [{ text: '🔙 Main Menu', callback_data: 'pm_main' }]
  ];

  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  BULK HISTORY
// ═══════════════════════════════════════════════════════════════════════

async function showBulkHistory(bot, chatId, messageId = null) {
  const ops = await productManager.getBulkOperations(10);

  if (ops.length === 0) {
    return send(bot, chatId, '📜 *Bulk Operation History*\n\n_No operations yet._', [[{ text: '🔙 Bulk Menu', callback_data: 'pm_bulk_menu' }]], messageId);
  }

  let text = `📜 *Bulk Operation History*\n\n`;
  const buttons = [];

  for (const op of ops) {
    const icon = op.status === 'committed' ? '✅' : op.status === 'reverted' ? '♻️' : '⏳';
    const type = op.type === 'nuke' ? '💣 Nuke' : '📥 Import';
    text += `${icon} ${type} — ${op.total_items} items (${op.status})\n`;
    text += `  📅 ${op.created_at?.slice(0, 16) || '?'}\n\n`;

    if (op.status === 'committed') {
      buttons.push([{ text: `♻️ Revert: ${op.type} (${op.total_items})`, callback_data: `pm_bulk_revert_${op.batch_id}` }]);
    }
  }

  buttons.push([{ text: '🔙 Bulk Menu', callback_data: 'pm_bulk_menu' }]);
  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  EXPORT MENU
// ═══════════════════════════════════════════════════════════════════════

async function showExportMenu(bot, chatId, messageId = null) {
  const roots = await productManager.getRootCategories();

  const buttons = [[{ text: '📤 Export All Products', callback_data: 'pm_export_all' }]];
  for (const cat of roots) {
    buttons.push([{ text: `📤 ${cat.name}`, callback_data: `pm_export_cat_${cat.id}` }]);
  }
  buttons.push([{ text: '🔙 Main Menu', callback_data: 'pm_main' }]);

  return send(bot, chatId, `📤 *Export Products*\n\nChoose what to export as CSV:`, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  HISTORY MENU
// ═══════════════════════════════════════════════════════════════════════

async function showHistoryMenu(bot, chatId, page = 1, messageId = null) {
  const entries = await productManager.getRecentHistory(50);
  const pageSize = 10;
  const totalPages = Math.max(Math.ceil(entries.length / pageSize), 1);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const slice = entries.slice((safePage - 1) * pageSize, safePage * pageSize);

  let text = `📜 *Change History*\n\n`;
  const buttons = [];

  if (slice.length === 0) {
    text += `_No history entries._`;
  }

  for (const e of slice) {
    const icon = { create: '🆕', update: '✏️', delete: '🗑️', restore: '♻️', revert: '↩️' }[e.action] || '❓';
    const reverted = e.reverted ? ' _(reverted)_' : '';
    text += `${icon} ${e.entity_type} #${e.entity_id} — ${e.action}${reverted}\n`;
    text += `  📅 ${e.changed_at?.slice(0, 16) || '?'}\n`;

    if (!e.reverted && (e.action === 'create' || e.action === 'update' || e.action === 'delete')) {
      buttons.push([{ text: `↩️ Undo: ${e.entity_type} #${e.entity_id} ${e.action}`, callback_data: `pm_undo_${e.id}` }]);
    }
  }

  if (totalPages > 1) {
    const pag = [];
    if (safePage > 1) pag.push({ text: '◀️', callback_data: `pm_history_${safePage - 1}` });
    pag.push({ text: `${safePage}/${totalPages}`, callback_data: 'pm_noop' });
    if (safePage < totalPages) pag.push({ text: '▶️', callback_data: `pm_history_${safePage + 1}` });
    buttons.push(pag);
  }

  buttons.push([{ text: '🔙 Main Menu', callback_data: 'pm_main' }]);
  return send(bot, chatId, text, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  CATEGORY PICKER (for add-product, move, bulk import)
//  Only shows LEAF categories (no children) to prevent misplacement.
// ═══════════════════════════════════════════════════════════════════════

async function showCategoryPicker(bot, chatId, messageId, callbackPrefix, title, backCallback = 'pm_prod_menu') {
  const tree = await productManager.getCategoryTree();

  // Separate leaf vs parent categories
  const parentIds = new Set(tree.filter(c => c.parent_id !== null).map(c => c.parent_id));
  const leaves = tree.filter(c => !parentIds.has(c.id));

  if (leaves.length === 0) {
    return send(bot, chatId, `${title}\n\n_No leaf categories available. Create subcategories first._`, [[{ text: '🔙 Back', callback_data: backCallback }]], messageId);
  }

  const buttons = [];
  for (const leaf of leaves) {
    // Build breadcrumb: find parent chain
    const breadcrumb = [];
    let current = leaf;
    while (current.parent_id) {
      const parent = tree.find(c => c.id === current.parent_id);
      if (parent) {
        breadcrumb.unshift(parent.name);
        current = parent;
      } else break;
    }

    const path = breadcrumb.length > 0 ? `${breadcrumb.join(' › ')} › ${leaf.name}` : leaf.name;
    buttons.push([{ text: `📂 ${path}`, callback_data: `${callbackPrefix}${leaf.id}` }]);
  }

  buttons.push([{ text: '🔙 Back', callback_data: backCallback }]);
  return send(bot, chatId, title + `\n\n_Only leaf categories (no subcategories) are shown._`, buttons, messageId);
}

// ═══════════════════════════════════════════════════════════════════════
//  CALLBACK ROUTER
// ═══════════════════════════════════════════════════════════════════════

export async function handleProductManagerCallback(bot, query) {
  const data = query.data;
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const messageId = query.message.message_id;

  // Admin check
  const isAdmin = await adminManager.isAdmin(userId);
  if (!isAdmin) {
    return bot.answerCallbackQuery(query.id, { text: '🚫 Admin only', show_alert: true });
  }

  // ── Utility ──
  if (data === 'pm_noop') return bot.answerCallbackQuery(query.id);
  if (data === 'pm_close') {
    clearState(userId);
    try { await bot.deleteMessage(chatId, messageId); } catch { /* ignore */ }
    return;
  }

  // ── Navigation ──
  if (data === 'pm_main') { clearState(userId); return showMainMenu(bot, chatId, userId, messageId); }
  if (data === 'pm_cat_menu') return showCategoryMenu(bot, chatId, messageId);
  if (data === 'pm_prod_menu') return showProductMenu(bot, chatId, messageId);
  if (data === 'pm_prod_browse') return showBrowseCategories(bot, chatId, messageId);

  // ── Category view ──
  if (data.startsWith('pm_cat_view_')) {
    const catId = parseInt(data.replace('pm_cat_view_', ''), 10);
    const cat = await productManager.getCategory(catId);
    if (!cat) return send(bot, chatId, '❌ Category not found.', [[{ text: '🔙 Back', callback_data: 'pm_cat_menu' }]], messageId);

    const subs = await productManager.getSubcategories(catId);
    const isLeaf = await productManager.isLeafCategory(catId);
    const products = isLeaf
      ? (await productManager.searchProducts({ categoryId: catId, status: 'active', pageSize: 5 }))
      : { total: 0 };

    let text = `📂 *${cat.name}*\n\n`;
    if (subs.length > 0) {
      text += `📁 *Subcategories:*\n`;
      for (const s of subs) text += `  • ${s.name} (${s.productCount} items)\n`;
      text += '\n';
    }
    if (isLeaf) {
      text += `🛍️ Products: *${products.total}*\n`;
    } else {
      text += `⚠️ _This is a parent category — products can only be added to leaf categories._\n`;
    }

    const buttons = [];
    for (const s of subs) {
      buttons.push([{ text: `📂 ${s.name}`, callback_data: `pm_cat_view_${s.id}` }]);
    }
    buttons.push([{ text: '➕ Add Subcategory', callback_data: `pm_cat_add_sub_${catId}` }]);
    buttons.push([
      { text: '✏️ Rename', callback_data: `pm_cat_rename_${catId}` },
      { text: '🗑️ Delete', callback_data: `pm_cat_del_confirm_${catId}` }
    ]);
    if (isLeaf) {
      buttons.push([{ text: '🛍️ View Products', callback_data: `pm_prod_cat_${catId}` }]);
    }
    if (cat.parent_id) {
      buttons.push([{ text: '🔙 Back', callback_data: `pm_cat_view_${cat.parent_id}` }]);
    } else {
      buttons.push([{ text: '🔙 Categories', callback_data: 'pm_cat_menu' }]);
    }

    return send(bot, chatId, text, buttons, messageId);
  }

  // ── Category: add root ──
  if (data === 'pm_cat_add_root') {
    setState(userId, { step: 'cat_add_root' });
    return send(bot, chatId, `📂 *Add Root Category*\n\nType the category name:`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_cat_menu' }]], messageId);
  }

  // ── Category: add subcategory ──
  if (data.startsWith('pm_cat_add_sub_')) {
    const parentId = parseInt(data.replace('pm_cat_add_sub_', ''), 10);
    const parent = await productManager.getCategory(parentId);
    setState(userId, { step: 'cat_add_sub', parentId });
    return send(bot, chatId, `📂 *Add Subcategory to "${parent?.name}"*\n\nType the subcategory name:`,
      [[{ text: '🔙 Cancel', callback_data: `pm_cat_view_${parentId}` }]], messageId);
  }

  // ── Category: rename ──
  if (data.startsWith('pm_cat_rename_')) {
    const catId = parseInt(data.replace('pm_cat_rename_', ''), 10);
    const cat = await productManager.getCategory(catId);
    setState(userId, { step: 'cat_rename', catId });
    return send(bot, chatId, `✏️ *Rename "${cat?.name}"*\n\nType the new name:`,
      [[{ text: '🔙 Cancel', callback_data: `pm_cat_view_${catId}` }]], messageId);
  }

  // ── Category: delete confirmation ──
  if (data.startsWith('pm_cat_del_confirm_')) {
    const catId = parseInt(data.replace('pm_cat_del_confirm_', ''), 10);
    const impact = await productManager.getCategoryDeleteImpact(catId);
    if (!impact) return send(bot, chatId, '❌ Category not found.', [[{ text: '🔙 Back', callback_data: 'pm_cat_menu' }]], messageId);

    const text =
      `⚠️ *Delete "${impact.category.name}"?*\n\n` +
      `This will archive:\n` +
      `• ${impact.subcatCount} subcategories\n` +
      `• ${impact.productCount} direct products\n` +
      `• ${impact.allDescendantProducts} descendant products\n\n` +
      `_You can revert this from Bulk History._`;

    return send(bot, chatId, text, [
      [
        { text: '✅ Yes, Delete', callback_data: `pm_cat_del_exec_${catId}` },
        { text: '❌ Cancel', callback_data: `pm_cat_view_${catId}` }
      ]
    ], messageId);
  }

  // ── Category: execute delete ──
  if (data.startsWith('pm_cat_del_exec_')) {
    const catId = parseInt(data.replace('pm_cat_del_exec_', ''), 10);
    const res = await productManager.deleteCategory(catId, userId);
    if (!res.ok) return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: 'pm_cat_menu' }]], messageId);
    return send(bot, chatId, `✅ Category deleted (archived). Batch: \`${res.batchId}\``,
      [[{ text: '🔙 Categories', callback_data: 'pm_cat_menu' }]], messageId);
  }

  // ── Product listing ──
  if (data.startsWith('pm_prod_cat_')) {
    const catId = parseInt(data.replace('pm_prod_cat_', ''), 10);
    return showProductList(bot, chatId, catId, 1, messageId);
  }

  if (data.startsWith('pm_prod_list_')) {
    const parts = data.replace('pm_prod_list_', '').split('_');
    const catId = parseInt(parts[0], 10);
    const page = parseInt(parts[1], 10);
    return showProductList(bot, chatId, catId, page, messageId);
  }

  // ── Product view ──
  if (data.startsWith('pm_prod_view_')) {
    const prodId = parseInt(data.replace('pm_prod_view_', ''), 10);
    return showProductView(bot, chatId, prodId, messageId);
  }

  // ── Product delete ──
  if (data.startsWith('pm_prod_del_')) {
    const prodId = parseInt(data.replace('pm_prod_del_', ''), 10);
    const res = await productManager.deleteProduct(prodId, userId);
    if (!res.ok) return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
    return send(bot, chatId, `✅ Product deleted. You can restore it from Archived Items.`,
      [[{ text: '🗄️ Archived', callback_data: 'pm_prod_archived_1' }, { text: '🔙 Products', callback_data: 'pm_prod_menu' }]], messageId);
  }

  // ── Product restore ──
  if (data.startsWith('pm_prod_restore_')) {
    const prodId = parseInt(data.replace('pm_prod_restore_', ''), 10);
    const res = await productManager.restoreProduct(prodId, userId);
    if (!res.ok) return send(bot, chatId, `❌ ${res.error}`, [[{ text: '🔙 Back', callback_data: 'pm_prod_menu' }]], messageId);
    return send(bot, chatId, `✅ Product restored!`, [[{ text: '👁️ View', callback_data: `pm_prod_view_${prodId}` }, { text: '🔙 Products', callback_data: 'pm_prod_menu' }]], messageId);
  }

  // ── Archived list ──
  if (data.startsWith('pm_prod_archived_')) {
    const page = parseInt(data.replace('pm_prod_archived_', ''), 10);
    return showArchivedProducts(bot, chatId, page, messageId);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  NUKE ALL PRODUCTS
  // ═══════════════════════════════════════════════════════════════════

  if (data === 'pm_nuke_start') {
    const stats = await productManager.getStats();
    if (stats.activeProducts === 0) {
      return send(bot, chatId, '💣 _No active products to nuke._', [[{ text: '🔙 Products', callback_data: 'pm_prod_menu' }]], messageId);
    }
    return send(bot, chatId,
      `💣 *NUKE ALL PRODUCTS*\n\n` +
      `⚠️ This will archive ALL *${stats.activeProducts}* active products.\n\n` +
      `This action can be reverted from Bulk History.\n\n` +
      `*Are you absolutely sure?*`,
      [
        [{ text: '💣 YES, NUKE EVERYTHING', callback_data: 'pm_nuke_confirm' }],
        [{ text: '❌ Cancel', callback_data: 'pm_prod_menu' }]
      ], messageId);
  }

  if (data === 'pm_nuke_confirm') {
    const stats = await productManager.getStats();
    return send(bot, chatId,
      `💣🔴 *FINAL CONFIRMATION*\n\n` +
      `You are about to archive *${stats.activeProducts}* products.\n\n` +
      `Type the button below to proceed:`,
      [
        [{ text: `☠️ NUKE ${stats.activeProducts} PRODUCTS NOW`, callback_data: 'pm_nuke_exec' }],
        [{ text: '❌ Cancel — Take Me Back', callback_data: 'pm_prod_menu' }]
      ], messageId);
  }

  if (data === 'pm_nuke_exec') {
    const statusMsg = await bot.sendMessage(chatId, '💣 Nuking all products...');
    try {
      const res = await productManager.nukeAllProducts(userId);
      if (!res.ok) {
        return bot.editMessageText(`❌ ${res.error}`, { chat_id: chatId, message_id: statusMsg.message_id });
      }
      return bot.editMessageText(
        `💣 *NUKE COMPLETE*\n\n☠️ *${res.count}* products archived.\n🔖 Batch: \`${res.batchId}\`\n\n_You can revert this from Bulk History._`,
        {
          chat_id: chatId, message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [
            [{ text: '♻️ Undo Nuke', callback_data: `pm_bulk_revert_${res.batchId}` }],
            [{ text: '🔙 Main Menu', callback_data: 'pm_main' }]
          ]}
        }
      );
    } catch (err) {
      logger.error('PRODUCT', 'Nuke error', err);
      return bot.editMessageText(`❌ Nuke failed: ${err.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ADD PRODUCT WIZARD
  // ═══════════════════════════════════════════════════════════════════

  // Step 1: pick category
  if (data === 'pm_prod_add_cat') {
    return showCategoryPicker(bot, chatId, messageId, 'pm_prod_add_in_', '🛍️ *Add Product*\n\nSelect a category:', 'pm_prod_menu');
  }

  // Step 2: category selected → show options (single or bulk)
  if (data.startsWith('pm_prod_add_in_')) {
    const catId = parseInt(data.replace('pm_prod_add_in_', ''), 10);

    // Verify it's a leaf category
    const isLeaf = await productManager.isLeafCategory(catId);
    if (!isLeaf) {
      return send(bot, chatId,
        `⚠️ *This category has subcategories.*\n\nProducts can only be added to leaf categories (no children).`,
        [[{ text: '🔙 Pick Another', callback_data: 'pm_prod_add_cat' }]], messageId);
    }

    const cat = await productManager.getCategory(catId);
    return send(bot, chatId,
      `🛍️ *Add to "${cat?.name}"*\n\nChoose an option:`,
      [
        [{ text: '✏️ Add Single Product', callback_data: `pm_prod_add_single_${catId}` }],
        [{ text: '📥 Bulk Import to This Category', callback_data: `pm_bulk_to_cat_${catId}` }],
        [{ text: '🔙 Pick Another Category', callback_data: 'pm_prod_add_cat' }]
      ], messageId);
  }

  // Step 2b: single product — ask name
  if (data.startsWith('pm_prod_add_single_')) {
    const catId = parseInt(data.replace('pm_prod_add_single_', ''), 10);
    const cat = await productManager.getCategory(catId);
    setState(userId, { step: 'prod_add_name', catId, catName: cat?.name });
    return send(bot, chatId, `🛍️ *Add Product to "${cat?.name}"*\n\nType the product *name*:`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_prod_menu' }]], messageId);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  EDIT PRODUCT FIELDS
  // ═══════════════════════════════════════════════════════════════════

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
    return showCategoryPicker(bot, chatId, messageId, `pm_edit_cat_sel_${prodId}_`, '📂 *Move Product*\n\nSelect new category:', `pm_prod_view_${prodId}`);
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

  // ═══════════════════════════════════════════════════════════════════
  //  SEARCH
  // ═══════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════
  //  BULK OPS
  // ═══════════════════════════════════════════════════════════════════

  if (data === 'pm_bulk_menu') return showBulkMenu(bot, chatId, messageId);
  if (data === 'pm_bulk_history') return showBulkHistory(bot, chatId, messageId);

  // General bulk import (file) — any category
  if (data === 'pm_bulk_import_start') {
    setState(userId, { step: 'bulk_import_file' });
    return send(bot, chatId,
      `📤 *Bulk Import — Send File*\n\n` +
      `Send me a CSV or TXT file with your products.\n\n` +
      `*Supported column names:*\n` +
      `\`name\`, \`price\`, \`category\` (required)\n` +
      `\`sku\`, \`description\`, \`stock\` (optional)\n\n` +
      `*Example:*\n` +
      `\`\`\`\nname,price,category\nProduct A,29.99,USA CVV\nProduct B,49.99,Local Bank\n\`\`\`\n\n` +
      `📎 _Send the file now, or press Cancel._`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_bulk_menu' }]], messageId);
  }

  // General bulk import (paste) — any category
  if (data === 'pm_bulk_paste_start') {
    setState(userId, { step: 'bulk_import_file' });
    return send(bot, chatId,
      `📋 *Bulk Import — Paste Data*\n\n` +
      `Paste your CSV data as a text message.\n\n` +
      `*Example:*\n` +
      `\`\`\`\nname,price,category\nProduct A,29.99,USA CVV\nProduct B,49.99,Local Bank\n\`\`\`\n\n` +
      `✏️ _Paste your data now, or press Cancel._`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_bulk_menu' }]], messageId);
  }

  // Bulk import → pick category first
  if (data === 'pm_bulk_pick_cat') {
    return showCategoryPicker(bot, chatId, messageId, 'pm_bulk_to_cat_', '📥 *Bulk Import*\n\nSelect target category:', 'pm_bulk_menu');
  }

  // Bulk import to specific category
  if (data.startsWith('pm_bulk_to_cat_')) {
    const catId = parseInt(data.replace('pm_bulk_to_cat_', ''), 10);

    // Verify leaf
    const isLeaf = await productManager.isLeafCategory(catId);
    if (!isLeaf) {
      return send(bot, chatId,
        `⚠️ *This category has subcategories.*\n\nBulk import only works with leaf categories.`,
        [[{ text: '🔙 Pick Another', callback_data: 'pm_bulk_pick_cat' }]], messageId);
    }

    const cat = await productManager.getCategory(catId);
    setState(userId, { step: 'bulk_import_file', forceCategoryId: catId, catName: cat?.name });
    return send(bot, chatId,
      `📥 *Bulk Import to "${cat?.name}"*\n\n` +
      `Send a CSV/TXT file or paste text.\n\n` +
      `Since a category is pre-selected, you only need:\n` +
      `\`name,price\` (minimal) or \`name,price,description,stock\`\n\n` +
      `📎 _Send file or paste data now._`,
      [[{ text: '🔙 Cancel', callback_data: 'pm_bulk_menu' }]], messageId);
  }

  // Bulk preview — commit
  if (data.startsWith('pm_bulk_commit_')) {
    const batchId = data.replace('pm_bulk_commit_', '');
    const statusMsg = await bot.sendMessage(chatId, '⏳ Committing bulk import...');

    try {
      const res = await productManager.commitBulkOperation(batchId, userId, async (done, total, success, errors) => {
        try {
          await bot.editMessageText(
            `⏳ *Bulk Import Progress*\n\nProcessed: ${done}/${total}\n✅ Success: ${success}\n❌ Errors: ${errors}`,
            { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
          );
        } catch { /* ignore rate limits */ }
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
        reply_markup: { inline_keyboard: [[{ text: '🔙 Main Menu', callback_data: 'pm_main' }]] }
      });
    } catch (err) {
      logger.error('PRODUCT', 'Bulk commit error', err);
      return bot.editMessageText(`❌ Bulk commit failed: ${err.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
    }
  }

  // Bulk preview — cancel
  if (data.startsWith('pm_bulk_cancel_')) {
    clearState(userId);
    return send(bot, chatId, '❌ Bulk import cancelled.', [[{ text: '🔙 Bulk Menu', callback_data: 'pm_bulk_menu' }]], messageId);
  }

  // Bulk revert — ask confirmation
  if (data.startsWith('pm_bulk_revert_') && !data.includes('confirm')) {
    const batchId = data.replace('pm_bulk_revert_', '');
    return send(bot, chatId,
      `⚠️ *Revert this bulk operation?*\n\nBatch: \`${batchId}\`\n\nAll changes from this operation will be undone.`,
      [
        [
          { text: '✅ Yes, Revert', callback_data: `pm_bulk_revert_confirm_${batchId}` },
          { text: '❌ Cancel', callback_data: 'pm_bulk_history' }
        ]
      ], messageId);
  }

  // Bulk revert — execute
  if (data.startsWith('pm_bulk_revert_confirm_')) {
    const batchId = data.replace('pm_bulk_revert_confirm_', '');
    const statusMsg = await bot.sendMessage(chatId, '♻️ Reverting...');
    try {
      const res = await productManager.revertBulkOperation(batchId, userId);
      if (!res.ok) {
        return bot.editMessageText(`❌ ${res.error}`, { chat_id: chatId, message_id: statusMsg.message_id });
      }
      return bot.editMessageText(
        `✅ *Reverted!*\n\n♻️ ${res.revertedCount}/${res.total} items restored.`,
        {
          chat_id: chatId, message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🔙 Bulk Menu', callback_data: 'pm_bulk_menu' }]] }
        }
      );
    } catch (err) {
      logger.error('PRODUCT', 'Bulk revert error', err);
      return bot.editMessageText(`❌ Revert failed: ${err.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  EXPORT
  // ═══════════════════════════════════════════════════════════════════

  if (data === 'pm_export_menu') return showExportMenu(bot, chatId, messageId);

  if (data === 'pm_export_all' || data.startsWith('pm_export_cat_')) {
    const catId = data === 'pm_export_all' ? null : parseInt(data.replace('pm_export_cat_', ''), 10);
    try {
      const csv = await productManager.exportProductsCSV(catId);
      const buf = Buffer.from(csv, 'utf-8');
      const fileName = catId ? `products_cat_${catId}.csv` : 'products_all.csv';
      await bot.sendDocument(chatId, buf, { caption: `📤 Exported ${csv.split('\n').length - 1} products.` }, { filename: fileName, contentType: 'text/csv' });
    } catch (err) {
      logger.error('PRODUCT', 'Export error', err);
      await bot.sendMessage(chatId, `❌ Export failed: ${err.message}`);
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HISTORY
  // ═══════════════════════════════════════════════════════════════════

  if (data === 'pm_history_menu') return showHistoryMenu(bot, chatId, 1, messageId);
  if (data.startsWith('pm_history_')) {
    const page = parseInt(data.replace('pm_history_', ''), 10);
    return showHistoryMenu(bot, chatId, page, messageId);
  }

  // Undo single change — ask confirmation
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
    return send(bot, chatId, `✅ Change reverted!`, [[{ text: '🔙 History', callback_data: 'pm_history_menu' }]], messageId);
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
    return await processBulkCSV(bot, chatId, userId, text, state.forceCategoryId || null);
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════
//  DOCUMENT HANDLER — for CSV/TXT file uploads
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
  const name = (doc.file_name || '').toLowerCase();

  // Accept CSV, TXT, and common text-based extensions
  const allowedExts = ['.csv', '.txt', '.tsv', '.text', '.dat'];
  const hasAllowed = allowedExts.some(ext => name.endsWith(ext));
  const isText = (doc.mime_type || '').startsWith('text/') || doc.mime_type === 'application/csv';

  if (!hasAllowed && !isText) {
    await bot.sendMessage(chatId,
      '❌ Unsupported file type.\n\nPlease send a `.csv`, `.txt`, or `.tsv` file.\nOr paste the data as a text message.',
      { parse_mode: 'Markdown' }
    );
    return true;
  }

  // Size check (max 5 MB)
  if (doc.file_size > 5 * 1024 * 1024) {
    await bot.sendMessage(chatId, '❌ File too large (max 5 MB). Split your data into smaller files.');
    return true;
  }

  try {
    logger.info('PRODUCT', `Downloading bulk file: ${doc.file_name} (${doc.file_size} bytes) from user ${userId}`);
    const fileLink = await bot.getFileLink(doc.file_id);
    logger.info('PRODUCT', `File link obtained: ${fileLink}`);

    const response = await fetch(fileLink);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const csvText = await response.text();
    logger.info('PRODUCT', `File downloaded: ${csvText.length} chars, ${csvText.split('\n').length} lines`);

    return await processBulkCSV(bot, chatId, userId, csvText, state.forceCategoryId || null);
  } catch (err) {
    logger.error('PRODUCT', 'Failed to download/process CSV file', err);
    await bot.sendMessage(chatId,
      `❌ Failed to process the file.\n\n*Error:* ${err.message}\n\nPlease try again or paste the data as text.`,
      { parse_mode: 'Markdown' }
    );
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Shared bulk CSV processor
// ═══════════════════════════════════════════════════════════════════════

async function processBulkCSV(bot, chatId, userId, csvText, forceCategoryId = null) {
  clearState(userId);

  let statusMsg;
  try {
    statusMsg = await bot.sendMessage(chatId, '⏳ Parsing data and validating...');
  } catch (err) {
    logger.error('PRODUCT', 'Failed to send status message', err);
    return true;
  }

  try {
    const preview = await productManager.createBulkPreview(csvText, userId, forceCategoryId);

    let text =
      `📋 *Bulk Import Preview*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *Summary*\n` +
      `• Total valid rows: *${preview.totalRows}*\n` +
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
      text += `\n_No valid rows to import. Check your data format._`;
      buttons.push([{ text: '🔙 Try Again', callback_data: 'pm_bulk_menu' }]);
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
  } catch (err) {
    logger.error('PRODUCT', 'Bulk CSV processing error', err);
    try {
      await bot.editMessageText(
        `❌ *Bulk Import Failed*\n\n*Error:* ${err.message}\n\nPlease check your data format and try again.`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🔙 Bulk Menu', callback_data: 'pm_bulk_menu' }]] }
        }
      );
    } catch {
      await bot.sendMessage(chatId, `❌ Bulk import failed: ${err.message}`);
    }
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
        { text: '➕ Add Another', callback_data: `pm_prod_add_in_${state.productData.category_id}` },
        { text: '👁️ View Product', callback_data: `pm_prod_view_${res.id}` }
      ],
      [{ text: '🔙 Products', callback_data: 'pm_prod_menu' }]
    ],
    messageId
  );
}
