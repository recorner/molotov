# Molotov — unified marketplace

One product, two front doors, **one database**:

| | Path | Runs on | Talks to Postgres via |
|---|---|---|---|
| Telegram bot | `apps/bot` | this server, under PM2 | raw SQL through `db/pgCompat.js` |
| Web marketplace (Sereni) | `apps/web` | Vercel (SvelteKit) | Prisma client |

Both read and write the **same physical tables**. A product added by an admin in
Telegram is the product a customer buys on the website; a user who links their
Telegram account is one row, not two.

```
                    ┌──────────────────┐
   Telegram ───────▶│    apps/bot      │─┐
                    └──────────────────┘ │   ┌──────────────────┐
                                         ├──▶│    PostgreSQL    │
                    ┌──────────────────┐ │   │ prisma/schema.   │
   Browser ────────▶│    apps/web      │─┘   │     prisma       │
                    └──────────────────┘     └──────────────────┘
```

## How the two schemas were reconciled

The bot was built on SQLite with `snake_case` tables; the web app on Postgres
with Prisma's `camelCase` models. Rather than rewrite either side, the schema
maps between them: **physical columns keep the bot's original names**, and
**Prisma model fields keep the web app's original names**, bridged by
`@map`/`@@map`. Neither codebase had to be restructured to share storage.

Where both sides genuinely wanted the same name, each kept its own contract:

| Collision | Bot keeps | Web keeps |
|---|---|---|
| `users.username` | the Telegram handle | login handle → `login_username` |
| `payouts` | crypto payouts (`SidekickPayout`) | seller payouts → `seller_payouts` |
| `categories.name` | tree with repeatable names | unique, now scoped per parent |
| `orders.status` | `pending`, `delivered`, … | `OrderStatus` enum, extended |

⚠️ **Foreign keys:** most bot tables store *Telegram IDs* in their `user_id` /
`created_by` columns — not `users.id`. Those columns are `BigInt` with no FK,
deliberately. `orders` carries both: `user_id` (a real FK) and `telegram_id`.

## Setup

```bash
npm install                 # installs both workspaces
npm run db:push             # create tables from prisma/schema.prisma
npm run db:import           # migrate legacy apps/bot/store.db into Postgres
node scripts/verify-merge.mjs   # 28 integrity checks
```

`DATABASE_URL` lives in the root `.env` and is shared by both apps.

## Running

```bash
pm2 start apps/bot/ecosystem.config.cjs   # bot (also restored on reboot)
npm run web:dev                           # web app, localhost:5173
```

Only **one** process may poll Telegram at a time — the bot. The web app sends
notifications through the Telegram API directly, so it never needs to poll.
(neo's standalone `bot/telegram-bot.js` was removed for exactly this reason; it
would have fought `apps/bot` for the token and thrown HTTP 409.)

## Migration status

The bot reaches Postgres through `apps/bot/db/pgCompat.js`, which speaks the
`sqlite3` API (`run`/`get`/`all`, `this.lastID`, `this.changes`) and translates
dialect — placeholders, `INSERT OR REPLACE` → `ON CONFLICT`, `datetime('now')`,
boolean `0`/`1`, and the order-status enum. This is a bridge, not a destination:
the ~165 call sites across `handlers/` and `utils/` can migrate to Prisma
incrementally, and the shim shrinks as they do.

Set `DB_DRIVER=sqlite` to fall back to the legacy local `store.db`.
