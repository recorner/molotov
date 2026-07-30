#!/usr/bin/env node
/**
 * Verifies the merge: same row counts, intact relationships, and — the point of
 * the whole exercise — the web app (Prisma) and the bot (raw SQL) reading the
 * SAME rows from the SAME tables.
 */
import sqlite3 from 'sqlite3';
import pg from 'pg';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdb = new sqlite3.Database(path.join(__dirname, '../apps/bot/store.db'), sqlite3.OPEN_READONLY);
const sql = (q) => new Promise((r, j) => sdb.all(q, (e, x) => (e ? j(e) : r(x))));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const one = async (q) => Number((await pool.query(q)).rows[0].c);
const sOne = async (q) => Number((await sql(q))[0].c);

console.log('\n── Row counts (SQLite → Postgres) ──');
for (const t of [
  'users', 'categories', 'products', 'orders', 'wallet_addresses',
  'detected_transactions', 'payouts', 'otp_license_keys', 'news_delivery_log',
  'removed_users_ledger', 'product_history'
]) {
  const before = await sOne(`SELECT COUNT(*) c FROM ${t}`);
  const after = await one(`SELECT COUNT(*) c FROM "${t}"`);
  // Three tables legitimately exceed their SQLite source now that the merged
  // database is live rather than a migration target:
  //   users                 +1 system seller, +27 rebuilt buyers, then real signups
  //   detected_transactions grows once blockchain monitoring is actually running
  // Everything else must still match the source exactly.
  const MIGRATION_BASELINE = { users: before + 28, detected_transactions: before };
  const baseline = MIGRATION_BASELINE[t];
  const ok = baseline !== undefined ? after >= baseline : after === before;
  const note = baseline !== undefined && after > baseline ? ` (+${after - baseline} since migration)` : '';
  check(t.padEnd(22), ok, `${before} → ${after}${note}`);
}

console.log('\n── Referential integrity ──');
check('every order has a real buyer',
  (await one(`SELECT COUNT(*) c FROM orders o LEFT JOIN users u ON o.user_id=u.id WHERE u.id IS NULL`)) === 0);
check('no order lost in migration',
  (await one(`SELECT COUNT(*) c FROM orders`)) === (await sOne(`SELECT COUNT(*) c FROM orders`)),
  `${await one(`SELECT COUNT(*) c FROM orders`)} orders`);
check('every product has a seller',
  (await one(`SELECT COUNT(*) c FROM products p LEFT JOIN users u ON p.seller_id=u.id WHERE u.id IS NULL`)) === 0);
check('category tree parents resolve',
  (await one(`SELECT COUNT(*) c FROM categories c LEFT JOIN categories p ON c.parent_id=p.id
              WHERE c.parent_id IS NOT NULL AND p.id IS NULL`)) === 0);
check('telegram ids unique + preserved',
  (await one(`SELECT COUNT(DISTINCT telegram_id) c FROM users WHERE telegram_id IS NOT NULL`)) ===
  (await sOne(`SELECT COUNT(DISTINCT telegram_id) c FROM users`)) + 27);

const statuses = (await pool.query(`SELECT status, COUNT(*) c FROM orders GROUP BY status ORDER BY c DESC`)).rows;
check('order statuses mapped to enum', statuses.length > 0,
  statuses.map((r) => `${r.status}:${r.c}`).join(' '));

console.log('\n── Web app path (Prisma client) ──');
const p = await prisma.product.findFirst({ include: { seller: true, category: true } });
check('Prisma reads migrated product', !!p, p ? `"${p.name.slice(0, 34)}" $${p.price}` : 'none');
check('  → seller relation resolves', !!p?.seller, p?.seller?.username);
check('  → category relation resolves', !!p?.category, p?.category?.name);

const o = await prisma.order.findFirst({
  where: { cart: { some: {} } },
  include: { buyer: true, cart: { include: { product: true } } }
});
check('Prisma reads migrated order', !!o, o ? `#${o.id} ${o.status}` : 'none');
check('  → buyer relation resolves', !!o?.buyer, o?.buyer?.username);
check('  → cart entry resolves', (o?.cart?.length ?? 0) > 0, o?.cart?.[0]?.product?.name?.slice(0, 30));

// 25 of the 164 orders point at products deleted from the catalog long ago, so
// they legitimately get no cart entry. Assert the accounting rather than hide it.
const withCart = await one(`SELECT COUNT(DISTINCT order_id) c FROM cart_entries`);
const danglingProduct = await one(
  `SELECT COUNT(*) c FROM orders o WHERE o.product_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = o.product_id)`
);
check('cart entries account for every order',
  withCart + danglingProduct === (await one(`SELECT COUNT(*) c FROM orders`)),
  `${withCart} with cart + ${danglingProduct} whose product was deleted = ${withCart + danglingProduct}`);

console.log('\n── Bot path (raw SQL, unchanged shape) ──');
const roots = (await pool.query(`SELECT id, name FROM categories WHERE parent_id IS NULL ORDER BY id`)).rows;
check('root categories via bot SQL', roots.length > 0, `${roots.length}: ${roots.slice(0, 3).map((r) => r.name).join(', ')}`);
const byTg = (await pool.query(
  `SELECT id, username, first_name FROM users WHERE telegram_id = $1`,
  [String((await sql(`SELECT telegram_id FROM users LIMIT 1`))[0].telegram_id)]
)).rows;
check('user lookup by telegram_id', byTg.length === 1, byTg[0] && `id=${byTg[0].id} @${byTg[0].username}`);
const wal = (await pool.query(`SELECT currency, COUNT(*) c FROM wallet_addresses GROUP BY currency`)).rows;
check('wallet addresses by currency', wal.length > 0, wal.map((r) => `${r.currency}:${r.c}`).join(' '));

console.log('\n── The point: one row, both lenses ──');
const u = await prisma.user.findFirst({ where: { telegramId: { not: null } } });
const raw = (await pool.query(`SELECT id, username, telegram_id, login_username FROM users WHERE id = $1`, [u.id])).rows[0];
check('same user row, web + bot naming',
  String(raw.telegram_id) === u.telegramId && raw.login_username === u.username && raw.username === u.telegramUsername,
  `web .username="${u.username}" | bot username="${raw.username}" | tg=${raw.telegram_id}`);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : `${fail} CHECK(S) FAILED`} — ${pass} passed, ${fail} failed\n`);
sdb.close();
await pool.end();
await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
