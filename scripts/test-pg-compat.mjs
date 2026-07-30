#!/usr/bin/env node
/** Exercises the Postgres compat layer with real SQL shapes taken from the bot. */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { default: db } = await import('../apps/bot/db/pgCompat.js');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); c ? pass++ : fail++; };
const get = (s, p = []) => new Promise((r, j) => db.get(s, p, (e, x) => (e ? j(e) : r(x))));
const all = (s, p = []) => new Promise((r, j) => db.all(s, p, (e, x) => (e ? j(e) : r(x))));
const run = (s, p = []) => new Promise((r, j) => db.run(s, p, function (e) { e ? j(e) : r(this); }));

console.log('\n── Translation ──');
await db.ready;
const t1 = db.translate('SELECT * FROM users WHERE telegram_id = ?', [123]);
ok('? becomes $1', t1.text.includes('$1'), t1.text);
const t2 = db.translate('CREATE TABLE IF NOT EXISTS foo (id INTEGER)');
ok('CREATE TABLE is a no-op', t2.noop === true);
const t3 = db.translate("SELECT * FROM orders WHERE created_at > datetime('now','-7 days')");
ok("datetime('now','-7 days')", /INTERVAL '7 day/.test(t3.text), t3.text.slice(t3.text.indexOf('NOW')));
const t4 = db.translate('INSERT OR IGNORE INTO users (telegram_id, language_code) VALUES (?, ?)', [1, 'en']);
ok('OR IGNORE -> ON CONFLICT', /ON CONFLICT DO NOTHING/.test(t4.text));
const t5 = db.translate('INSERT OR REPLACE INTO admin_groups (group_id, group_name, is_active) VALUES (?, ?, 1)', [5, 'G']);
ok('OR REPLACE -> upsert on unique', /ON CONFLICT \("group_id"\) DO UPDATE/.test(t5.text), t5.text.slice(t5.text.indexOf('ON CONFLICT')));
ok('boolean literal 1 -> TRUE', /TRUE/.test(t5.text));

console.log('\n── Reads (real migrated data) ──');
const u = await get('SELECT id, username, telegram_id FROM users WHERE telegram_id = ?', [7081512132]);
ok('lookup by telegram_id', !!u, u && `id=${u.id} @${u.username}`);
const roots = await all('SELECT id, name FROM categories WHERE parent_id IS NULL ORDER BY sort_order, id');
ok('root categories', roots.length === 11, `${roots.length} roots`);
const prods = await all('SELECT id, name, price FROM products WHERE category_id = ? LIMIT 3', [roots[0]?.id]);
ok('products by category', Array.isArray(prods), `${prods.length} rows`);
const cnt = await get('SELECT COUNT(*) AS c FROM orders WHERE status = ?', ['pending']);
ok('status param upper-cased to enum', Number(cnt.c) === 109, `${cnt.c} pending`);
const act = await all('SELECT group_id FROM admin_groups WHERE is_active = 1');
ok('is_active = 1 on boolean column', act.length >= 1, `${act.length} active group(s)`);

console.log('\n── Writes ──');
const ins = await run(
  'INSERT INTO security_log (user_id, action, details, success) VALUES (?, ?, ?, ?)',
  [7081512132, 'COMPAT_TEST', 'pg compat layer', 1]
);
ok('INSERT exposes this.lastID', ins.lastID > 0, `lastID=${ins.lastID}`);
const upd = await run('UPDATE security_log SET details = ? WHERE id = ?', ['updated', ins.lastID]);
ok('UPDATE exposes this.changes', upd.changes === 1, `changes=${upd.changes}`);
const back = await get('SELECT details, success FROM security_log WHERE id = ?', [ins.lastID]);
ok('round-trip value + boolean', back.details === 'updated' && back.success === true, JSON.stringify(back));
const del = await run('DELETE FROM security_log WHERE id = ?', [ins.lastID]);
ok('DELETE reports changes', del.changes === 1);

const ord = await run(
  'INSERT INTO orders (user_id, product_id, price, currency, status, telegram_id) VALUES (?, ?, ?, ?, ?, ?)',
  [u.id, 1, 9.99, 'BTC', 'pending', String(u.telegram_id)]
);
ok('order insert with lowercase status', ord.lastID > 0, `order #${ord.lastID}`);
const chk = await get('SELECT status FROM orders WHERE id = ?', [ord.lastID]);
ok('  → stored as enum value', chk.status === 'PENDING', chk.status);
await run('DELETE FROM orders WHERE id = ?', [ord.lastID]);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : `${fail} FAILED`} — ${pass} passed, ${fail} failed\n`);
db.close();
process.exit(fail === 0 ? 0 : 1);
