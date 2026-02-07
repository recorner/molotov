// utils/productManager.js — Core product & category management service
// Handles CRUD, bulk operations, history/audit, and revert.
// All DB writes go through this service for integrity.
import db from '../database.js';
import { db as rawDb } from '../database.js';
import logger from './logger.js';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

/** Raw db.run — needed for BEGIN/COMMIT/ROLLBACK (SecureDatabase#run passes through) */
const rawRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    rawDb.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const generateBatchId = () => `batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

const now = () => new Date().toISOString();

// ═══════════════════════════════════════════════════════════════════════
//  ProductManager singleton
// ═══════════════════════════════════════════════════════════════════════

class ProductManager {
  constructor() {
    this._categoryTreeCache = null;
    this._categoryCacheTime = 0;
    this._CACHE_TTL = 60_000; // 1 min
  }

  // ─────────── Category tree cache ───────────

  _invalidateCategoryCache() {
    this._categoryTreeCache = null;
    this._categoryCacheTime = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CATEGORY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get full category tree (cached).
   * Returns flat list of { id, name, parent_id, status, depth, childCount, productCount }.
   */
  async getCategoryTree(includeArchived = false) {
    const cacheOk = this._categoryTreeCache && (Date.now() - this._categoryCacheTime < this._CACHE_TTL);
    if (cacheOk && !includeArchived) return this._categoryTreeCache;

    const statusFilter = includeArchived ? '' : `WHERE c.status = 'active'`;
    const rows = await all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM categories sc WHERE sc.parent_id = c.id AND sc.status = 'active') AS childCount,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS productCount
      FROM categories c ${statusFilter}
      ORDER BY c.parent_id IS NULL DESC, c.sort_order ASC, c.name ASC
    `);

    // Assign depth
    const idMap = new Map(rows.map(r => [r.id, r]));
    for (const row of rows) {
      let depth = 0, pid = row.parent_id;
      while (pid && idMap.has(pid)) { depth++; pid = idMap.get(pid).parent_id; }
      row.depth = depth;
    }

    if (!includeArchived) {
      this._categoryTreeCache = rows;
      this._categoryCacheTime = Date.now();
    }
    return rows;
  }

  /** Get root categories. */
  async getRootCategories(includeArchived = false) {
    const tree = await this.getCategoryTree(includeArchived);
    return tree.filter(c => c.parent_id === null);
  }

  /** Get direct children of a parent category. */
  async getSubcategories(parentId) {
    return all(
      `SELECT c.*,
        (SELECT COUNT(*) FROM categories sc WHERE sc.parent_id = c.id AND sc.status = 'active') AS childCount,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS productCount
       FROM categories c WHERE c.parent_id = ? AND c.status = 'active'
       ORDER BY c.sort_order ASC, c.name ASC`,
      [parentId]
    );
  }

  /** Get single category by ID. */
  async getCategory(id) {
    return get(`SELECT * FROM categories WHERE id = ?`, [id]);
  }

  /** Check if a category name already exists under the same parent. */
  async _categoryNameExists(name, parentId, excludeId = null) {
    const trimmed = name.trim();
    let sql = `SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND status = 'active'`;
    const params = [trimmed];
    if (parentId === null) {
      sql += ` AND parent_id IS NULL`;
    } else {
      sql += ` AND parent_id = ?`;
      params.push(parentId);
    }
    if (excludeId) {
      sql += ` AND id != ?`;
      params.push(excludeId);
    }
    return !!(await get(sql, params));
  }

  /**
   * Add a new category (root or sub).
   * @returns {{ ok:boolean, id?:number, error?:string }}
   */
  async addCategory(name, parentId, adminId) {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: 'Category name cannot be empty.' };
    if (trimmed.length > 100) return { ok: false, error: 'Category name too long (max 100 chars).' };

    // If subcategory, verify parent exists
    if (parentId !== null) {
      const parent = await this.getCategory(parentId);
      if (!parent || parent.status !== 'active') return { ok: false, error: 'Parent category not found or inactive.' };
    }

    // Duplicate check
    if (await this._categoryNameExists(trimmed, parentId)) {
      return { ok: false, error: `A category named "${trimmed}" already exists at this level.` };
    }

    const maxOrder = (await get(
      `SELECT COALESCE(MAX(sort_order), 0) AS mx FROM categories WHERE parent_id ${parentId === null ? 'IS NULL' : '= ?'} AND status = 'active'`,
      parentId === null ? [] : [parentId]
    ))?.mx || 0;

    const res = await run(
      `INSERT INTO categories (name, parent_id, status, sort_order, created_at, updated_at, created_by)
       VALUES (?, ?, 'active', ?, ?, ?, ?)`,
      [trimmed, parentId, maxOrder + 1, now(), now(), adminId]
    );

    // History
    await this._recordHistory('category', res.lastID, 'create', null,
      { id: res.lastID, name: trimmed, parent_id: parentId }, adminId);

    this._invalidateCategoryCache();
    logger.info('PRODUCT', `Category created: "${trimmed}" (id=${res.lastID}) by admin ${adminId}`);
    return { ok: true, id: res.lastID };
  }

  /**
   * Rename a category.
   */
  async renameCategory(id, newName, adminId) {
    const trimmed = newName.trim();
    if (!trimmed) return { ok: false, error: 'Name cannot be empty.' };
    if (trimmed.length > 100) return { ok: false, error: 'Name too long (max 100 chars).' };

    const cat = await this.getCategory(id);
    if (!cat) return { ok: false, error: 'Category not found.' };

    if (await this._categoryNameExists(trimmed, cat.parent_id, id)) {
      return { ok: false, error: `A category named "${trimmed}" already exists at this level.` };
    }

    const oldData = { ...cat };
    await run(`UPDATE categories SET name = ?, updated_at = ? WHERE id = ?`, [trimmed, now(), id]);
    await this._recordHistory('category', id, 'update', oldData, { ...cat, name: trimmed }, adminId);

    this._invalidateCategoryCache();
    logger.info('PRODUCT', `Category renamed: "${oldData.name}" → "${trimmed}" (id=${id}) by admin ${adminId}`);
    return { ok: true };
  }

  /**
   * Soft-delete a category.
   * Returns impact info so the handler can show a confirmation dialog.
   */
  async getCategoryDeleteImpact(id) {
    const cat = await this.getCategory(id);
    if (!cat || cat.status !== 'active') return null;

    const subcatCount = (await get(
      `SELECT COUNT(*) AS c FROM categories WHERE parent_id = ? AND status = 'active'`, [id]
    )).c;
    const productCount = (await get(
      `SELECT COUNT(*) AS c FROM products WHERE category_id = ? AND status = 'active'`, [id]
    )).c;

    // Count products in all descendant categories recursively
    const allDescendantProducts = await this._countDescendantProducts(id);

    return { category: cat, subcatCount, productCount, allDescendantProducts };
  }

  async _countDescendantProducts(parentId) {
    const children = await all(
      `SELECT id FROM categories WHERE parent_id = ? AND status = 'active'`, [parentId]
    );
    let total = 0;
    for (const child of children) {
      const cnt = (await get(
        `SELECT COUNT(*) AS c FROM products WHERE category_id = ? AND status = 'active'`, [child.id]
      )).c;
      total += cnt + await this._countDescendantProducts(child.id);
    }
    return total;
  }

  /**
   * Soft-delete a category and all descendants + products.
   */
  async deleteCategory(id, adminId) {
    const cat = await this.getCategory(id);
    if (!cat) return { ok: false, error: 'Category not found.' };

    const batchId = generateBatchId();
    await this._softDeleteCategoryRecursive(id, adminId, batchId);

    this._invalidateCategoryCache();
    logger.info('PRODUCT', `Category deleted: "${cat.name}" (id=${id}) batch=${batchId} by admin ${adminId}`);
    return { ok: true, batchId };
  }

  async _softDeleteCategoryRecursive(catId, adminId, batchId) {
    // Archive all products in this category
    const products = await all(`SELECT * FROM products WHERE category_id = ? AND status = 'active'`, [catId]);
    for (const p of products) {
      await run(`UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?`, [now(), p.id]);
      await this._recordHistory('product', p.id, 'delete', p, { ...p, status: 'archived' }, adminId, batchId);
    }

    // Recursively archive subcategories
    const children = await all(`SELECT * FROM categories WHERE parent_id = ? AND status = 'active'`, [catId]);
    for (const child of children) {
      await this._softDeleteCategoryRecursive(child.id, adminId, batchId);
    }

    // Archive the category itself
    const cat = await this.getCategory(catId);
    await run(`UPDATE categories SET status = 'archived', updated_at = ? WHERE id = ?`, [now(), catId]);
    await this._recordHistory('category', catId, 'delete', cat, { ...cat, status: 'archived' }, adminId, batchId);
  }

  /**
   * Restore a category (and optionally its descendants) from a batch delete.
   */
  async restoreCategory(id, adminId) {
    const cat = await this.getCategory(id);
    if (!cat) return { ok: false, error: 'Category not found.' };
    if (cat.status === 'active') return { ok: false, error: 'Category is already active.' };

    await run(`UPDATE categories SET status = 'active', updated_at = ? WHERE id = ?`, [now(), id]);
    await this._recordHistory('category', id, 'restore', cat, { ...cat, status: 'active' }, adminId);

    this._invalidateCategoryCache();
    logger.info('PRODUCT', `Category restored: id=${id} by admin ${adminId}`);
    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PRODUCT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Validate product data.
   * @returns {string|null} error message or null if valid
   */
  _validateProduct(data, isUpdate = false) {
    if (!isUpdate || data.name !== undefined) {
      if (!data.name || !data.name.trim()) return 'Product name is required.';
      if (data.name.trim().length > 200) return 'Product name too long (max 200 chars).';
    }
    if (!isUpdate || data.price !== undefined) {
      const price = parseFloat(data.price);
      if (isNaN(price) || price < 0) return 'Price must be a non-negative number.';
    }
    if (!isUpdate || data.category_id !== undefined) {
      if (!data.category_id) return 'Category is required.';
    }
    if (data.stock_quantity !== undefined && data.stock_quantity !== null) {
      const qty = parseInt(data.stock_quantity, 10);
      if (isNaN(qty) || (qty < -1)) return 'Stock quantity must be -1 (unlimited) or >= 0.';
    }
    if (data.sku !== undefined && data.sku !== null && data.sku.length > 50) {
      return 'SKU too long (max 50 chars).';
    }
    return null;
  }

  /** Get single product by ID. */
  async getProduct(id) {
    return get(`
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `, [id]);
  }

  /**
   * Paginated product search.
   */
  async searchProducts({ query, categoryId, status, page = 1, pageSize = 10 } = {}) {
    let where = [];
    let params = [];

    if (status) {
      where.push(`p.status = ?`);
      params.push(status);
    } else {
      where.push(`p.status != 'archived'`);
    }
    if (categoryId) {
      where.push(`p.category_id = ?`);
      params.push(categoryId);
    }
    if (query) {
      where.push(`(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)`);
      const q = `%${query}%`;
      params.push(q, q, q);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countRow = await get(
      `SELECT COUNT(*) AS total FROM products p ${whereClause}`, params
    );
    const total = countRow?.total || 0;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const offset = (safePage - 1) * pageSize;

    const products = await all(`
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereClause}
      ORDER BY p.sort_order ASC, p.id DESC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    return { products, total, page: safePage, totalPages, pageSize };
  }

  /**
   * Add a new product.
   */
  async addProduct(data, adminId) {
    const err = this._validateProduct(data);
    if (err) return { ok: false, error: err };

    // Verify category exists
    const cat = await this.getCategory(data.category_id);
    if (!cat || cat.status !== 'active') return { ok: false, error: 'Category not found or inactive.' };

    // SKU uniqueness
    if (data.sku) {
      const dup = await get(`SELECT id FROM products WHERE sku = ? AND status != 'archived'`, [data.sku.trim()]);
      if (dup) return { ok: false, error: `SKU "${data.sku}" already exists.` };
    }

    const maxOrder = (await get(
      `SELECT COALESCE(MAX(sort_order), 0) AS mx FROM products WHERE category_id = ? AND status = 'active'`,
      [data.category_id]
    ))?.mx || 0;

    const res = await run(
      `INSERT INTO products (name, description, price, category_id, sku, status, stock_quantity, image_url, sort_order, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
      [
        data.name.trim(),
        data.description?.trim() || null,
        parseFloat(data.price),
        data.category_id,
        data.sku?.trim() || null,
        data.stock_quantity !== undefined ? parseInt(data.stock_quantity, 10) : -1,
        data.image_url || null,
        maxOrder + 1,
        now(), now(),
        adminId
      ]
    );

    const inserted = await this.getProduct(res.lastID);
    await this._recordHistory('product', res.lastID, 'create', null, inserted, adminId);

    logger.info('PRODUCT', `Product created: "${data.name}" (id=${res.lastID}) by admin ${adminId}`);
    return { ok: true, id: res.lastID, product: inserted };
  }

  /**
   * Update an existing product.
   */
  async updateProduct(id, changes, adminId) {
    const product = await this.getProduct(id);
    if (!product) return { ok: false, error: 'Product not found.' };
    if (product.status === 'archived') return { ok: false, error: 'Cannot edit an archived product. Restore it first.' };

    const err = this._validateProduct(changes, true);
    if (err) return { ok: false, error: err };

    // Category check if changing
    if (changes.category_id && changes.category_id !== product.category_id) {
      const cat = await this.getCategory(changes.category_id);
      if (!cat || cat.status !== 'active') return { ok: false, error: 'Target category not found or inactive.' };
    }

    // SKU uniqueness if changing
    if (changes.sku && changes.sku !== product.sku) {
      const dup = await get(`SELECT id FROM products WHERE sku = ? AND status != 'archived' AND id != ?`, [changes.sku.trim(), id]);
      if (dup) return { ok: false, error: `SKU "${changes.sku}" already exists.` };
    }

    const fields = [];
    const vals = [];
    const allowedFields = ['name', 'description', 'price', 'category_id', 'sku', 'stock_quantity', 'image_url', 'status'];

    for (const field of allowedFields) {
      if (changes[field] !== undefined) {
        fields.push(`${field} = ?`);
        if (field === 'price') vals.push(parseFloat(changes[field]));
        else if (field === 'stock_quantity') vals.push(parseInt(changes[field], 10));
        else if (field === 'name' || field === 'description' || field === 'sku') vals.push(changes[field]?.trim?.() ?? changes[field]);
        else vals.push(changes[field]);
      }
    }

    if (fields.length === 0) return { ok: false, error: 'No changes provided.' };

    fields.push(`updated_at = ?`);
    vals.push(now());
    vals.push(id);

    const oldData = { ...product };
    await run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, vals);

    const updated = await this.getProduct(id);
    await this._recordHistory('product', id, 'update', oldData, updated, adminId);

    logger.info('PRODUCT', `Product updated: id=${id} by admin ${adminId}`);
    return { ok: true, product: updated };
  }

  /**
   * Soft-delete a product.
   */
  async deleteProduct(id, adminId) {
    const product = await this.getProduct(id);
    if (!product) return { ok: false, error: 'Product not found.' };
    if (product.status === 'archived') return { ok: false, error: 'Product is already archived.' };

    await run(`UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?`, [now(), id]);
    await this._recordHistory('product', id, 'delete', product, { ...product, status: 'archived' }, adminId);

    logger.info('PRODUCT', `Product deleted: id=${id} "${product.name}" by admin ${adminId}`);
    return { ok: true };
  }

  /**
   * Restore a product.
   */
  async restoreProduct(id, adminId) {
    const product = await this.getProduct(id);
    if (!product) return { ok: false, error: 'Product not found.' };
    if (product.status === 'active') return { ok: false, error: 'Product is already active.' };

    // Check if category still exists
    const cat = await this.getCategory(product.category_id);
    if (!cat || cat.status !== 'active') {
      return { ok: false, error: 'Cannot restore: the product\'s category is archived or missing. Restore the category first.' };
    }

    await run(`UPDATE products SET status = 'active', updated_at = ? WHERE id = ?`, [now(), id]);
    await this._recordHistory('product', id, 'restore', product, { ...product, status: 'active' }, adminId);

    logger.info('PRODUCT', `Product restored: id=${id} by admin ${adminId}`);
    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Parse CSV text into product rows.
   * Expected columns: sku, name, description, price, category_name, stock_quantity
   * OR:               sku, name, description, price, category_id, stock_quantity
   * Returns { rows: [], errors: [] }
   */
  async parseBulkCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { rows: [], errors: ['File must have a header row and at least one data row.'] };

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredCols = ['name', 'price'];
    for (const col of requiredCols) {
      if (!header.includes(col)) return { rows: [], errors: [`Missing required column: ${col}`] };
    }

    // Build category name→id map for resolution
    const allCats = await all(`SELECT id, name FROM categories WHERE status = 'active'`);
    const catNameMap = new Map(allCats.map(c => [c.name.toLowerCase(), c.id]));
    const catIdSet = new Set(allCats.map(c => c.id));

    const rows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = this._parseCSVLine(lines[i]);
      if (vals.length !== header.length) {
        errors.push(`Row ${i + 1}: column count mismatch (expected ${header.length}, got ${vals.length})`);
        continue;
      }

      const row = {};
      header.forEach((col, idx) => { row[col] = vals[idx]?.trim(); });

      // Resolve category
      let categoryId = null;
      if (row.category_id) {
        categoryId = parseInt(row.category_id, 10);
        if (!catIdSet.has(categoryId)) {
          errors.push(`Row ${i + 1}: category_id ${row.category_id} does not exist`);
          continue;
        }
      } else if (row.category_name || row.category) {
        const catName = (row.category_name || row.category).toLowerCase();
        categoryId = catNameMap.get(catName);
        if (!categoryId) {
          errors.push(`Row ${i + 1}: category "${row.category_name || row.category}" not found`);
          continue;
        }
      } else {
        errors.push(`Row ${i + 1}: no category_id or category_name specified`);
        continue;
      }

      const price = parseFloat(row.price);
      if (isNaN(price) || price < 0) {
        errors.push(`Row ${i + 1}: invalid price "${row.price}"`);
        continue;
      }

      rows.push({
        sku: row.sku || null,
        name: row.name,
        description: row.description || null,
        price,
        category_id: categoryId,
        stock_quantity: row.stock_quantity ? parseInt(row.stock_quantity, 10) : -1,
        _line: i + 1
      });
    }

    return { rows, errors };
  }

  /** Simple CSV line parser (handles quoted fields). */
  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  /**
   * Create a bulk import preview (no data written yet).
   */
  async createBulkPreview(csvText, adminId) {
    const parsed = await this.parseBulkCSV(csvText);
    const batchId = generateBatchId();

    // Check for duplicate SKUs within the batch
    const skuSet = new Set();
    for (const row of parsed.rows) {
      if (row.sku) {
        if (skuSet.has(row.sku)) {
          parsed.errors.push(`Row ${row._line}: duplicate SKU "${row.sku}" within batch`);
        }
        skuSet.add(row.sku);
      }
    }

    // Check existing SKUs in DB
    for (const row of parsed.rows) {
      if (row.sku) {
        const existing = await get(`SELECT id FROM products WHERE sku = ? AND status != 'archived'`, [row.sku]);
        if (existing) {
          row._existingId = existing.id;
          row._action = 'update';
        } else {
          row._action = 'create';
        }
      } else {
        row._action = 'create';
      }
    }

    await run(
      `INSERT INTO bulk_operations (batch_id, type, status, total_items, preview_data, errors, created_by, created_at)
       VALUES (?, 'import', 'pending_preview', ?, ?, ?, ?, ?)`,
      [batchId, parsed.rows.length, JSON.stringify(parsed.rows), JSON.stringify(parsed.errors), adminId, now()]
    );

    return {
      batchId,
      totalRows: parsed.rows.length,
      creates: parsed.rows.filter(r => r._action === 'create').length,
      updates: parsed.rows.filter(r => r._action === 'update').length,
      errors: parsed.errors,
      previewRows: parsed.rows.slice(0, 15) // Show first 15 in preview
    };
  }

  /**
   * Commit a previously previewed bulk import.
   * Processes in batches of 100 for performance with progress callbacks.
   */
  async commitBulkOperation(batchId, adminId, progressCallback = null) {
    const op = await get(`SELECT * FROM bulk_operations WHERE batch_id = ?`, [batchId]);
    if (!op) return { ok: false, error: 'Bulk operation not found.' };
    if (op.status === 'committed') return { ok: false, error: 'This operation was already committed.' };
    if (op.status === 'reverted') return { ok: false, error: 'This operation was reverted.' };

    const rows = JSON.parse(op.preview_data || '[]');
    if (rows.length === 0) return { ok: false, error: 'No rows to process.' };

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      await rawRun('BEGIN TRANSACTION');
      try {
        for (const row of batch) {
          try {
            if (row._action === 'update' && row._existingId) {
              const res = await this.updateProduct(row._existingId, {
                name: row.name,
                description: row.description,
                price: row.price,
                category_id: row.category_id,
                stock_quantity: row.stock_quantity
              }, adminId);
              if (!res.ok) throw new Error(res.error);
              // Tag history with batchId
              await run(
                `UPDATE product_history SET batch_id = ? WHERE entity_type = 'product' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
                [batchId, row._existingId]
              );
            } else {
              const res = await this.addProduct({
                name: row.name,
                description: row.description,
                price: row.price,
                category_id: row.category_id,
                sku: row.sku,
                stock_quantity: row.stock_quantity
              }, adminId);
              if (!res.ok) throw new Error(res.error);
              // Tag history
              await run(
                `UPDATE product_history SET batch_id = ? WHERE entity_type = 'product' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
                [batchId, res.id]
              );
            }
            successCount++;
          } catch (err) {
            errorCount++;
            errors.push(`Row ${row._line || '?'}: ${err.message}`);
          }
        }
        await rawRun('COMMIT');
      } catch (txErr) {
        await rawRun('ROLLBACK');
        logger.error('PRODUCT', `Bulk batch rollback at offset ${i}`, txErr);
        errorCount += batch.length;
      }

      // Progress callback
      if (progressCallback) {
        await progressCallback(Math.min(i + BATCH_SIZE, rows.length), rows.length, successCount, errorCount);
      }
    }

    // Update the bulk operation record
    await run(
      `UPDATE bulk_operations SET status = 'committed', success_count = ?, error_count = ?, errors = ?, committed_at = ? WHERE batch_id = ?`,
      [successCount, errorCount, JSON.stringify(errors), now(), batchId]
    );

    this._invalidateCategoryCache();
    logger.info('PRODUCT', `Bulk import committed: batch=${batchId}, success=${successCount}, errors=${errorCount}`);
    return { ok: true, successCount, errorCount, errors };
  }

  /**
   * Revert a committed bulk operation.
   */
  async revertBulkOperation(batchId, adminId) {
    const op = await get(`SELECT * FROM bulk_operations WHERE batch_id = ?`, [batchId]);
    if (!op) return { ok: false, error: 'Bulk operation not found.' };
    if (op.status !== 'committed') return { ok: false, error: 'Can only revert committed operations.' };

    // Get all history entries for this batch
    const entries = await all(
      `SELECT * FROM product_history WHERE batch_id = ? AND reverted = 0 ORDER BY id DESC`,
      [batchId]
    );

    let revertedCount = 0;
    for (const entry of entries) {
      try {
        await this._revertSingleEntry(entry, adminId);
        revertedCount++;
      } catch (err) {
        logger.error('PRODUCT', `Failed to revert history entry ${entry.id}`, err);
      }
    }

    await run(
      `UPDATE bulk_operations SET status = 'reverted' WHERE batch_id = ?`, [batchId]
    );

    this._invalidateCategoryCache();
    logger.info('PRODUCT', `Bulk revert: batch=${batchId}, reverted=${revertedCount}/${entries.length}`);
    return { ok: true, revertedCount, total: entries.length };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  EXPORT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Export products as CSV text.
   */
  async exportProductsCSV(categoryId = null) {
    let where = `WHERE p.status = 'active'`;
    let params = [];
    if (categoryId) {
      where += ` AND p.category_id = ?`;
      params.push(categoryId);
    }

    const rows = await all(`
      SELECT p.sku, p.name, p.description, p.price, c.name AS category_name, p.stock_quantity
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${where}
      ORDER BY c.name ASC, p.sort_order ASC, p.name ASC
    `, params);

    const header = 'sku,name,description,price,category_name,stock_quantity';
    const csvLines = rows.map(r => {
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [esc(r.sku), esc(r.name), esc(r.description), r.price, esc(r.category_name), r.stock_quantity].join(',');
    });

    return [header, ...csvLines].join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HISTORY & REVERT
  // ═══════════════════════════════════════════════════════════════════════

  async _recordHistory(entityType, entityId, action, oldData, newData, changedBy, batchId = null) {
    await run(
      `INSERT INTO product_history (entity_type, entity_id, action, old_data, new_data, changed_by, changed_at, batch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [entityType, entityId, action, oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null, changedBy, now(), batchId]
    );
  }

  /**
   * Get recent history entries.
   */
  async getRecentHistory(limit = 20, entityType = null) {
    let where = '';
    const params = [];
    if (entityType) {
      where = 'WHERE entity_type = ?';
      params.push(entityType);
    }
    params.push(limit);
    return all(
      `SELECT * FROM product_history ${where} ORDER BY id DESC LIMIT ?`, params
    );
  }

  /**
   * Get history for a specific entity.
   */
  async getEntityHistory(entityType, entityId, limit = 30) {
    return all(
      `SELECT * FROM product_history WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT ?`,
      [entityType, entityId, limit]
    );
  }

  /**
   * Revert a single history entry.
   */
  async revertChange(historyId, adminId) {
    const entry = await get(`SELECT * FROM product_history WHERE id = ?`, [historyId]);
    if (!entry) return { ok: false, error: 'History entry not found.' };
    if (entry.reverted) return { ok: false, error: 'This change has already been reverted.' };

    const result = await this._revertSingleEntry(entry, adminId);
    this._invalidateCategoryCache();
    return result;
  }

  async _revertSingleEntry(entry, adminId) {
    const { entity_type, entity_id, action, old_data } = entry;
    const old = old_data ? JSON.parse(old_data) : null;

    if (action === 'create') {
      // Revert a create → archive the item
      if (entity_type === 'product') {
        await run(`UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?`, [now(), entity_id]);
      } else {
        await run(`UPDATE categories SET status = 'archived', updated_at = ? WHERE id = ?`, [now(), entity_id]);
      }
    } else if (action === 'delete' && old) {
      // Revert a delete → restore to active
      if (entity_type === 'product') {
        await run(`UPDATE products SET status = 'active', updated_at = ? WHERE id = ?`, [now(), entity_id]);
      } else {
        await run(`UPDATE categories SET status = 'active', updated_at = ? WHERE id = ?`, [now(), entity_id]);
      }
    } else if (action === 'update' && old) {
      // Revert an update → restore old field values
      if (entity_type === 'product') {
        await run(
          `UPDATE products SET name = ?, description = ?, price = ?, category_id = ?, sku = ?,
           stock_quantity = ?, status = ?, updated_at = ? WHERE id = ?`,
          [old.name, old.description, old.price, old.category_id, old.sku,
           old.stock_quantity ?? -1, old.status || 'active', now(), entity_id]
        );
      } else {
        await run(
          `UPDATE categories SET name = ?, parent_id = ?, status = ?, updated_at = ? WHERE id = ?`,
          [old.name, old.parent_id, old.status || 'active', now(), entity_id]
        );
      }
    }

    // Mark as reverted
    await run(`UPDATE product_history SET reverted = 1 WHERE id = ?`, [entry.id]);

    // Record the revert as a new history entry
    const current = entity_type === 'product'
      ? await this.getProduct(entity_id)
      : await this.getCategory(entity_id);
    await this._recordHistory(entity_type, entity_id, 'revert', null, current, adminId);

    return { ok: true };
  }

  /**
   * Get list of committed bulk operations (for revert UI).
   */
  async getBulkOperations(limit = 10) {
    return all(
      `SELECT * FROM bulk_operations ORDER BY id DESC LIMIT ?`, [limit]
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  STATS
  // ═══════════════════════════════════════════════════════════════════════

  async getStats() {
    const [categories, products, archived, history] = await Promise.all([
      get(`SELECT COUNT(*) AS c FROM categories WHERE status = 'active'`),
      get(`SELECT COUNT(*) AS c FROM products WHERE status = 'active'`),
      get(`SELECT COUNT(*) AS c FROM products WHERE status = 'archived'`),
      get(`SELECT COUNT(*) AS c FROM product_history`)
    ]);
    return {
      activeCategories: categories?.c || 0,
      activeProducts: products?.c || 0,
      archivedProducts: archived?.c || 0,
      historyEntries: history?.c || 0
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Singleton export
// ═══════════════════════════════════════════════════════════════════════

const productManager = new ProductManager();
export default productManager;
