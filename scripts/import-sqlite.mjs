#!/usr/bin/env node
/**
 * One-shot ETL: molotov's SQLite store.db -> the unified Postgres database.
 *
 * Most bot tables copy verbatim, because the Prisma schema deliberately maps
 * onto molotov's existing snake_case column names. Only the four shared
 * entities need real transformation:
 *
 *   users      login_username is synthesised (Telegram users have no web handle)
 *   categories tree preserved; parents inserted before children
 *   products   assigned to the system seller (Sereni requires a seller FK)
 *   orders     user_id held a *Telegram ID* in SQLite -> resolved to users.id,
 *              status upper-cased to the enum, and one CartEntry emitted per
 *              order so the web order pages render migrated history
 *
 * Orders whose buyer no longer exists are preserved by reconstructing the user
 * from removed_users_ledger, or synthesising a minimal placeholder. Dropping
 * order history to satisfy a foreign key would be the wrong trade.
 *
 * Safe to re-run: every table is truncated first (RESTART IDENTITY CASCADE).
 */
import sqlite3 from 'sqlite3';
import pg from 'pg';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../apps/bot/store.db');

const sdb = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY);
const sql = (q, p = []) => new Promise((res, rej) => sdb.all(q, p, (e, r) => (e ? rej(e) : res(r))));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const pq = (q, p = []) => pool.query(q, p);

const log = (...a) => console.log(...a);
const stats = {};

/** Postgres column types, so values can be coerced without hand-written maps. */
async function columnTypes(table) {
  const { rows } = await pq(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  return Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
}

function coerce(value, type) {
  if (value === null || value === undefined) return null;
  switch (type) {
    case 'boolean':
      return value === 1 || value === '1' || value === true || value === 'true';
    case 'timestamp with time zone':
    case 'timestamp without time zone': {
      if (value === '' || value === 0) return null;
      // SQLite stores these as 'YYYY-MM-DD HH:MM:SS' text or epoch numbers.
      const d = typeof value === 'number' ? new Date(value) : new Date(String(value).replace(' ', 'T'));
      return isNaN(d.getTime()) ? null : d;
    }
    case 'integer':
    case 'bigint':
    case 'double precision':
    case 'real':
    case 'numeric': {
      const n = Number(value);
      return isNaN(n) ? null : n;
    }
    case 'text':
    case 'character varying':
      return String(value);
    default:
      return value;
  }
}

/** Copy a table whose columns already line up on both sides. */
async function copyTable(table, { transform, source } = {}) {
  const types = await columnTypes(table);
  if (!Object.keys(types).length) throw new Error(`missing Postgres table: ${table}`);
  const rows = await sql(`SELECT * FROM ${source || table}`);
  let written = 0;

  for (const raw of rows) {
    const row = transform ? await transform(raw) : raw;
    if (!row) continue;
    const cols = Object.keys(row).filter((c) => c in types);
    const values = cols.map((c) => coerce(row[c], types[c]));
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    await pq(
      `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
      values
    );
    written++;
  }
  stats[table] = written;
  log(`  ${table.padEnd(24)} ${written}`);
  return written;
}

/** Reset a Postgres sequence so future inserts don't collide with copied ids. */
async function resyncSequence(table, col = 'id') {
  await pq(
    `SELECT setval(pg_get_serial_sequence('"${table}"','${col}'),
       GREATEST((SELECT COALESCE(MAX("${col}"),0) FROM "${table}"), 1))`
  );
}

const ORDER_STATUS = {
  pending: 'PENDING',
  paid: 'PAID',
  confirmed: 'CONFIRMED',
  awaiting_product: 'AWAITING_PRODUCT',
  awaiting_delivery: 'AWAITING_DELIVERY',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  expired: 'EXPIRED',
  refunded: 'REFUNDED'
};

async function main() {
  log(`\nSource : ${SQLITE_PATH}`);
  log(`Target : ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}\n`);

  // --- wipe target (idempotent re-runs) ------------------------------------
  const { rows: tables } = await pq(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`
  );
  await pq(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} RESTART IDENTITY CASCADE`
  );
  log(`Truncated ${tables.length} tables\n`);

  // --- users ---------------------------------------------------------------
  log('Shared entities:');
  const seenHandles = new Set();
  const loginHandle = (u) => {
    // Telegram handles aren't unique or always present; the web login handle is.
    let base = (u.username || '').trim().replace(/[^A-Za-z0-9_.-]/g, '');
    if (!base) base = `tg_${u.telegram_id}`;
    let handle = base;
    let n = 1;
    while (seenHandles.has(handle.toLowerCase())) handle = `${base}_${n++}`;
    seenHandles.add(handle.toLowerCase());
    return handle;
  };

  await copyTable('users', {
    transform: (u) => ({
      ...u,
      login_username: loginHandle(u),
      md2fa_codes: '{}',
      role: '{BUYER}',
      telegram_linked: true,
      balance: 0
    })
  });

  const { rows: maxRow } = await pq(`SELECT COALESCE(MAX(id),0) AS m FROM users`);
  let nextUserId = Number(maxRow[0].m) + 1;

  // System seller: Sereni's Product.seller is a required relation, and migrated
  // catalog items have no per-seller owner in molotov.
  const SYSTEM_SELLER_ID = nextUserId++;
  await pq(
    `INSERT INTO users (id, login_username, role, md2fa_codes, balance, status, first_name)
     VALUES ($1,'system','{ADMIN,SELLER}','{}',0,'active','Molotov')`,
    [SYSTEM_SELLER_ID]
  );
  log(`  ${'users (system seller)'.padEnd(24)} id=${SYSTEM_SELLER_ID}`);

  // Buyers referenced by orders but absent from `users` — rebuild rather than
  // lose the order history.
  const tgToId = new Map();
  for (const u of await sql(`SELECT id, telegram_id FROM users`)) {
    tgToId.set(String(u.telegram_id), u.id);
  }
  const orphans = await sql(
    `SELECT DISTINCT user_id FROM orders WHERE user_id NOT IN (SELECT telegram_id FROM users)`
  );
  let rebuilt = 0;
  let synthesised = 0;
  for (const { user_id } of orphans) {
    const [ledger] = await sql(
      `SELECT username, first_name, last_name, language_code, original_created_at
         FROM removed_users_ledger WHERE telegram_id = ? ORDER BY removed_at DESC LIMIT 1`,
      [user_id]
    );
    const id = nextUserId++;
    const src = ledger || {};
    await pq(
      `INSERT INTO users (id, login_username, telegram_id, username, first_name, last_name,
                          language_code, role, md2fa_codes, balance, status, telegram_linked)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'{BUYER}','{}',0,$8,true)`,
      [
        id,
        loginHandle({ username: src.username, telegram_id: user_id }),
        String(user_id),
        src.username || null,
        src.first_name || null,
        src.last_name || null,
        src.language_code || null,
        ledger ? 'removed' : 'unknown'
      ]
    );
    tgToId.set(String(user_id), id);
    ledger ? rebuilt++ : synthesised++;
  }
  log(`  ${'users (rebuilt buyers)'.padEnd(24)} ${rebuilt} from ledger, ${synthesised} synthesised`);
  await resyncSequence('users');

  // --- categories (parents before children) --------------------------------
  const cats = await sql(`SELECT * FROM categories`);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const ordered = [];
  const placed = new Set();
  const place = (c, guard = 0) => {
    if (!c || placed.has(c.id) || guard > 50) return;
    if (c.parent_id && byId.has(c.parent_id)) place(byId.get(c.parent_id), guard + 1);
    if (!placed.has(c.id)) {
      placed.add(c.id);
      ordered.push(c);
    }
  };
  cats.forEach((c) => place(c));

  const catTypes = await columnTypes('categories');
  let catCount = 0;
  for (const c of ordered) {
    const row = { ...c, sort_order: c.sort_order ?? 0 };
    const cols = Object.keys(row).filter((k) => k in catTypes);
    await pq(
      `INSERT INTO categories (${cols.map((c2) => `"${c2}"`).join(',')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`,
      cols.map((k) => coerce(row[k], catTypes[k]))
    );
    catCount++;
  }
  stats.categories = catCount;
  log(`  ${'categories'.padEnd(24)} ${catCount}`);
  await resyncSequence('categories');

  // --- products ------------------------------------------------------------
  const validCats = new Set((await pq(`SELECT id FROM categories`)).rows.map((r) => r.id));
  await copyTable('products', {
    transform: (p) => ({
      ...p,
      seller_id: SYSTEM_SELLER_ID,
      category_id: validCats.has(p.category_id) ? p.category_id : null,
      description: p.description || '',
      short_desc: '',
      stock: '',
      type: 'DOWNLOAD',
      tags: '{}'
    })
  });
  await resyncSequence('products');

  // --- orders + cart entries ----------------------------------------------
  const validProducts = new Set((await pq(`SELECT id FROM products`)).rows.map((r) => r.id));
  let unresolved = 0;
  await copyTable('orders', {
    transform: (o) => {
      const uid = tgToId.get(String(o.user_id));
      if (!uid) {
        unresolved++;
        return null;
      }
      return {
        ...o,
        user_id: uid,
        telegram_id: String(o.user_id),
        status: ORDER_STATUS[String(o.status || 'pending').toLowerCase()] || 'PENDING'
      };
    }
  });
  await resyncSequence('orders');

  let cartRows = 0;
  for (const o of await sql(`SELECT id, product_id FROM orders`)) {
    if (!validProducts.has(o.product_id)) continue;
    const { rowCount } = await pq(`SELECT 1 FROM orders WHERE id = $1`, [o.id]);
    if (!rowCount) continue;
    await pq(
      `INSERT INTO cart_entries (quantity, product_id, order_id) VALUES (1,$1,$2)`,
      [o.product_id, o.id]
    );
    cartRows++;
  }
  stats.cart_entries = cartRows;
  log(`  ${'cart_entries'.padEnd(24)} ${cartRows}`);
  if (unresolved) log(`  ! ${unresolved} orders had unresolvable buyers`);

  // --- bot-only tables: identical columns on both sides --------------------
  log('\nBot tables:');
  const verbatim = [
    'wallet_addresses',
    'detected_transactions',
    'payouts',
    'auto_settlement',
    'settlement_executions',
    'transaction_pins',
    'sidekick_settings',
    'security_log',
    'admin_groups',
    'group_admins',
    'news_announcements',
    'news_recipients',
    'news_delivery_log',
    'removed_users_ledger',
    'legacy_users',
    'otp_license_keys',
    'translation_cache',
    'product_history',
    'bulk_operations',
    'language_stats',
    'migrations'
  ];
  for (const t of verbatim) {
    try {
      await copyTable(t);
      await resyncSequence(t);
    } catch (e) {
      log(`  ${t.padEnd(24)} SKIPPED (${e.message})`);
    }
  }

  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  log(`\nDone — ${total} rows across ${Object.keys(stats).length} tables.\n`);

  sdb.close();
  await pool.end();
}

main().catch(async (e) => {
  console.error('\nImport failed:', e.message);
  console.error(e.stack);
  sdb.close();
  await pool.end();
  process.exit(1);
});
