# Sereni

A calm, trusted marketplace for **digital products and services**, built with SvelteKit and deployed on Vercel.

## Tech Stack

- **Framework**: SvelteKit 2 (Svelte 5) + TypeScript
- **Hosting**: Vercel (`@sveltejs/adapter-vercel`, Node serverless runtime)
- **Database**: PostgreSQL via Prisma (Vercel Postgres)
- **Object storage**: Vercel Blob (`@vercel/blob`)
- **Auth**: JWT sessions, Argon2 password hashing, TOTP 2FA, SVG captcha
- **Payments**: NOWPayments (crypto top-ups → account balance)
- **Notifications**: Telegram Bot API
- **Styling**: TailwindCSS

## Features

- User registration, login, logout, 2FA, recovery codes
- Account dashboard & balance management (top-ups, history)
- Multi-vendor catalog: **Download**, **License**, and **Service** product types (no physical goods)
- Cart & instant order fulfilment
- Seller dashboard (products, payouts, analytics)
- Admin panel (users, deposits, payouts, settings, Telegram config)

## Product types

| Type       | Stock model              | Delivery                                            |
| ---------- | ------------------------ | --------------------------------------------------- |
| `DOWNLOAD` | Unlimited                | Full content delivered to every buyer               |
| `SERVICE`  | Unlimited                | Instructions / booking / contact details delivered  |
| `LICENSE`  | One line per buyer       | Next available line delivered; stock decrements     |

## Local development

```bash
pnpm install
cp .env.example .env   # fill in values (see below)
pnpm prisma migrate dev
pnpm dev
```

App runs at http://localhost:5173.

## Environment variables

See [.env.example](.env.example). Key ones:

| Variable                  | Purpose                                                        |
| ------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`            | Postgres connection (auto-set by Vercel Postgres)              |
| `BLOB_READ_WRITE_TOKEN`   | Vercel Blob token (auto-set by Vercel Blob)                    |
| `JWT_SECRET`              | Session/captcha signing secret                                |
| `NOWPAYMENTS_API_KEY`     | NOWPayments API key                                           |
| `NOWPAYMENTS_IPN_SECRET`  | NOWPayments IPN/webhook HMAC secret                           |
| `PAYMENT_CALLBACK_URL`    | `https://<domain>/api/payment/ipn`                            |
| `TELEGRAM_BOT_TOKEN`      | Telegram bot token                                            |
| `TELEGRAM_ADMIN_CHAT_ID`  | Channel/group ID for notifications                            |
| `TELEGRAM_ADMIN_GROUP_ID` | Channel/group ID for notifications                            |

**NOWPayments setup:** in the NOWPayments dashboard, set the IPN callback URL to
`https://<your-domain>/api/payment/ipn` and use the same IPN secret here.

**Telegram setup:** the bot must be an **admin** of the target channel/group to post.

## Branding

The Sereni mark lives at [src/lib/logo.svg](src/lib/logo.svg). To regenerate all
favicon / app-icon sizes:

```bash
pnpm favicons
```

To use a custom brand image instead, drop a licensed, un-watermarked PNG at
`static/brand-source.png` and re-run `pnpm favicons`.

## Deployment (Vercel)

1. `vercel link` (scope: **koyagroup**, project: **sereni**)
2. Attach a **Postgres** store and a **Blob** store to the project (auto-injects
   `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`).
3. Set the remaining env vars (`JWT_SECRET`, NOWPayments, Telegram).
4. `pnpm prisma migrate deploy` against the production database.
5. `vercel --prod` and attach the domain `olesereni.site`.
