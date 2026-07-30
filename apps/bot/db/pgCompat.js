// apps/bot/db/pgCompat.js
//
// Drop-in replacement for the bot's sqlite3 `db` handle, backed by the shared
// Postgres database. Exposes the same run/get/all/each/serialize surface —
// including `this.lastID` / `this.changes` inside run() callbacks — so molotov's
// existing call sites keep working while they migrate to Prisma incrementally.
//
// It translates dialect, not schema: the Prisma models map onto molotov's
// original snake_case tables, so the bot's SQL still names the columns it always
// named. What differs between SQLite and Postgres, and is handled here:
//
//   ?                       -> $1, $2, ...
//   INSERT OR IGNORE        -> ON CONFLICT DO NOTHING
//   INSERT OR REPLACE       -> ON CONFLICT (<unique cols>) DO UPDATE
//   datetime('now', '-7 d') -> NOW() - INTERVAL '7 days'
//   this.lastID             -> RETURNING id
//   0 / 1                   -> TRUE / FALSE for boolean columns
//   'pending'               -> 'PENDING' for the orders.status enum
//   CREATE TABLE / PRAGMA   -> no-op (Prisma owns the schema now)

import pg from 'pg';
import logger from '../utils/logger.js';

// Telegram IDs exceed 2^31, so they live in BIGINT/TEXT columns. node-postgres
// hands BIGINT back as a string to protect precision; the bot has always treated
// these as numbers and they're well inside Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// NUMERIC -> float, matching SQLite's REAL behaviour.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

const ORDER_STATUS = new Set([
  'PENDING', 'PAID', 'CONFIRMED', 'AWAITING_PRODUCT',
  'AWAITING_DELIVERY', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'REFUNDED'
]);

class PgCompatDatabase {
  constructor(connectionString) {
    this.pool = new pg.Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX || 10),
      idleTimeoutMillis: 30000
    });
    this.columnTypes = new Map(); // table -> { column: data_type }
    this.uniqueCols = new Map();  // table -> [[col, ...], ...]
    this.ready = this.#loadMetadata();
    this.pool.on('error', (e) => logger.error('DB', `Postgres pool error: ${e.message}`));
  }

  /** One-time introspection: column types and unique constraints. */
  async #loadMetadata() {
    const { rows: cols } = await this.pool.query(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns WHERE table_schema = 'public'`
    );
    for (const c of cols) {
      if (!this.columnTypes.has(c.table_name)) this.columnTypes.set(c.table_name, {});
      this.columnTypes.get(c.table_name)[c.column_name] = c.data_type;
    }

    const { rows: uniq } = await this.pool.query(
      `SELECT t.relname AS table_name,
              -- cast: attname has type "name", which node-postgres cannot parse as an array
              array_agg(a.attname::text ORDER BY k.ord) AS cols
         FROM pg_index i
         JOIN pg_class t ON t.oid = i.indrelid
         JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE i.indisunique AND t.relkind = 'r'
        GROUP BY t.relname, i.indexrelid`
    );
    for (const u of uniq) {
      if (!this.uniqueCols.has(u.table_name)) this.uniqueCols.set(u.table_name, []);
      this.uniqueCols.get(u.table_name).push(u.cols);
    }
    logger.info('DB', `Postgres compat layer ready (${this.columnTypes.size} tables)`);
  }

  #typeOf(table, column) {
    return this.columnTypes.get(table)?.[column];
  }

  /** Pick the unique index matching the columns being inserted. */
  #conflictTarget(table, insertCols) {
    const candidates = this.uniqueCols.get(table) || [];
    const set = new Set(insertCols);
    // Prefer the most specific unique index fully covered by the insert.
    const match = candidates
      .filter((cols) => cols.every((c) => set.has(c)) && !(cols.length === 1 && cols[0] === 'id'))
      .sort((a, b) => b.length - a.length)[0];
    return match || null;
  }

  #coerce(table, column, value) {
    if (value === undefined) return null;
    const type = this.#typeOf(table, column);
    if (value === null) return null;
    if (type === 'boolean') {
      return value === 1 || value === '1' || value === true || value === 'true';
    }
    if (table === 'orders' && column === 'status' && typeof value === 'string') {
      const up = value.toUpperCase();
      return ORDER_STATUS.has(up) ? up : value;
    }
    if ((type === 'text' || type === 'character varying') && typeof value === 'number') {
      return String(value); // e.g. telegram_id stored as text on users
    }
    if (type === 'bigint' && typeof value === 'string') {
      const n = Number(value);
      return isNaN(n) ? value : n;
    }
    return value;
  }

  /**
   * Translate one SQLite statement into Postgres.
   * @returns {{noop:true}|{text:string, values:any[], returnsId:boolean}}
   */
  translate(sqlText, params = []) {
    let sql = String(sqlText).trim();

    // Prisma owns the schema; DDL from the bot's bootstrap is inert.
    if (/^\s*(CREATE\s+(TABLE|INDEX|UNIQUE)|PRAGMA|ALTER\s+TABLE|DROP\s+(TABLE|INDEX))/i.test(sql)) {
      return { noop: true };
    }

    const table = (sql.match(/\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+["`]?(\w+)["`]?/i) || [])[1];
    const isInsert = /^\s*INSERT/i.test(sql);

    // --- conflict handling ---------------------------------------------------
    let conflictClause = '';
    if (/^\s*INSERT\s+OR\s+IGNORE/i.test(sql)) {
      sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE/i, 'INSERT');
      conflictClause = ' ON CONFLICT DO NOTHING';
    } else if (/^\s*INSERT\s+OR\s+REPLACE/i.test(sql)) {
      sql = sql.replace(/^\s*INSERT\s+OR\s+REPLACE/i, 'INSERT');
      const cols = this.#insertColumns(sql);
      const target = table ? this.#conflictTarget(table, cols) : null;
      if (target) {
        const updates = cols
          .filter((c) => !target.includes(c))
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        conflictClause = updates
          ? ` ON CONFLICT (${target.map((c) => `"${c}"`).join(',')}) DO UPDATE SET ${updates}`
          : ` ON CONFLICT (${target.map((c) => `"${c}"`).join(',')}) DO NOTHING`;
      } else {
        conflictClause = ' ON CONFLICT DO NOTHING';
      }
    }

    // --- date/time functions -------------------------------------------------
    sql = sql
      .replace(/datetime\(\s*'now'\s*,\s*'([+-]?\d+)\s+(\w+?)s?'\s*\)/gi,
        (_, n, unit) => `(NOW() ${n.startsWith('-') ? '-' : '+'} INTERVAL '${Math.abs(+n)} ${unit}')`)
      .replace(/datetime\(\s*'now'\s*\)/gi, 'NOW()')
      .replace(/\bIFNULL\s*\(/gi, 'COALESCE(')
      .replace(/\bGROUP_CONCAT\s*\(/gi, 'STRING_AGG(');

    // --- boolean literals on known boolean columns ---------------------------
    // Applies to SELECT too: the bot writes `WHERE is_active = 1` throughout,
    // and Postgres has no boolean = integer operator.
    const boolTable = table || this.#selectTable(sql);
    if (boolTable) {
      sql = sql.replace(/\b(\w+)\s*=\s*([01])\b(?!\s*\))/g, (m, col, val) =>
        this.#typeOf(boolTable, col) === 'boolean' ? `${col} = ${val === '1' ? 'TRUE' : 'FALSE'}` : m);
    }

    // --- placeholders --------------------------------------------------------
    const values = [];
    let idx = 0;
    const cols = this.#paramColumns(sql, isInsert);
    const target = table || this.#selectTable(sql);
    sql = sql.replace(/\?/g, () => {
      const col = cols[idx] ?? null;
      values.push(target && col ? this.#coerce(target, col, params[idx]) : params[idx]);
      idx++;
      return `$${idx}`;
    });
    for (let i = values.length; i < params.length; i++) values.push(params[i]);

    // --- boolean literals inside INSERT ... VALUES ---------------------------
    if (isInsert && table) sql = this.#coerceInsertLiterals(sql, table);

    let returnsId = false;
    if (isInsert && !/RETURNING/i.test(sql) && this.#typeOf(table, 'id')) {
      returnsId = true;
    }

    return { text: sql + conflictClause + (returnsId ? ' RETURNING id' : ''), values, returnsId };
  }

  /**
   * Column each `?` binds to, in order. INSERT placeholders map positionally to
   * the column list; everywhere else (SET x = ?, WHERE y = ?) the column is the
   * identifier immediately preceding the operator.
   */
  #paramColumns(sql, isInsert) {
    const segments = sql.split('?');
    const cols = [];
    if (isInsert) {
      const insertCols = this.#insertColumns(sql);
      for (let i = 0; i < segments.length - 1; i++) cols.push(insertCols[i] ?? null);
      return cols;
    }
    for (let i = 0; i < segments.length - 1; i++) {
      const m = segments[i].match(
        /["`]?(\w+)["`]?\s*(?:=|<>|!=|>=|<=|>|<|\bLIKE\b|\bILIKE\b|\bIN\s*\(|\bIS\b)\s*$/i
      );
      cols.push(m ? m[1] : null);
    }
    return cols;
  }

  #selectTable(sql) {
    return (sql.match(/\bFROM\s+["`]?(\w+)["`]?/i) || [])[1];
  }

  #insertColumns(sql) {
    const m = sql.match(/INSERT\s+INTO\s+["`]?\w+["`]?\s*\(([^)]+)\)/i);
    return m ? m[1].split(',').map((c) => c.trim().replace(/["`]/g, '')) : [];
  }

  #updateColumns(sql) {
    const m = sql.match(/\bSET\b([\s\S]*?)(?:\bWHERE\b|$)/i);
    if (!m) return [];
    return m[1]
      .split(',')
      .map((p) => (p.match(/["`]?(\w+)["`]?\s*=/) || [])[1])
      .filter(Boolean);
  }

  /** Replace bare 0/1 literals in a VALUES list for boolean columns. */
  #coerceInsertLiterals(sql, table) {
    const cols = this.#insertColumns(sql);
    if (!cols.length) return sql;
    return sql.replace(/VALUES\s*\(([^)]*)\)/i, (full, list) => {
      const parts = list.split(',').map((p) => p.trim());
      if (parts.length !== cols.length) return full;
      const out = parts.map((p, i) =>
        /^[01]$/.test(p) && this.#typeOf(table, cols[i]) === 'boolean'
          ? p === '1' ? 'TRUE' : 'FALSE'
          : p);
      return `VALUES (${out.join(', ')})`;
    });
  }

  async #exec(sqlText, params) {
    await this.ready;
    const q = this.translate(sqlText, params);
    if (q.noop) return { rows: [], rowCount: 0, noop: true };
    try {
      return await this.pool.query(q.text, q.values);
    } catch (e) {
      logger.error('DB', `Query failed: ${e.message} | ${q.text.slice(0, 200)}`);
      throw e;
    }
  }

  // ---- sqlite3-compatible surface ------------------------------------------

  run(sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    this.#exec(sql, params || []).then(
      (res) => {
        // sqlite3 exposes lastID/changes via `this` inside the callback.
        const ctx = { lastID: res.rows?.[0]?.id ?? 0, changes: res.rowCount ?? 0 };
        if (cb) cb.call(ctx, null);
      },
      (err) => { if (cb) cb.call({ lastID: 0, changes: 0 }, err); }
    );
    return this;
  }

  get(sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    this.#exec(sql, params || []).then(
      (res) => cb && cb(null, res.rows[0]),
      (err) => cb && cb(err)
    );
    return this;
  }

  all(sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    this.#exec(sql, params || []).then(
      (res) => cb && cb(null, res.rows),
      (err) => cb && cb(err, [])
    );
    return this;
  }

  each(sql, params, rowCb, doneCb) {
    if (typeof params === 'function') { doneCb = rowCb; rowCb = params; params = []; }
    this.#exec(sql, params || []).then(
      (res) => {
        for (const row of res.rows) rowCb && rowCb(null, row);
        if (doneCb) doneCb(null, res.rowCount);
      },
      (err) => { if (doneCb) doneCb(err, 0); }
    );
    return this;
  }

  // Postgres has no statement-ordering caveat to serialize around; the pool
  // preserves per-query ordering for the awaited callers.
  serialize(fn) { if (fn) fn(); return this; }
  parallelize(fn) { if (fn) fn(); return this; }

  exec(sql, cb) { return this.run(sql, [], cb); }

  close(cb) { this.pool.end().then(() => cb && cb(null), (e) => cb && cb(e)); }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — the bot and web app share one Postgres database');
}

const db = new PgCompatDatabase(connectionString);
export default db;
export { PgCompatDatabase };
