# Molotov Bot — Complete Function Reference

> **Version:** 2.0.0 | **Runtime:** Node.js + SQLite + Redis | **Framework:** node-telegram-bot-api  
> **Generated:** 2026-02-19

---

## Table of Contents

1. [Bot Commands](#bot-commands)
2. [User Journey](#user-journey)
3. [Admin Panel](#admin-panel)
4. [Handler Reference](#handler-reference)
5. [Utility Reference](#utility-reference)
6. [Database Schema](#database-schema)
7. [Callback Routing Map](#callback-routing-map)
8. [Scheduled Tasks](#scheduled-tasks)
9. [Configuration](#configuration)

---

## Bot Commands

All `bot.onText` patterns registered in `bot.js`:

| Command | Regex | Access | Description |
|---------|-------|--------|-------------|
| `/start` | `/\/start/` | Public | Register new user or welcome back existing user |
| `/help` | `/\/help/` | Public | Show bot info, about text, and support contact |
| `/addcategory` | `/^\/(addcategory\|addsubcategory\|addproduct)(.*)/` | Admin | Legacy category/product creation commands |
| `/addsubcategory` | *(same regex)* | Admin | Legacy subcategory creation |
| `/addproduct` | *(same regex)* | Admin | Legacy product creation |
| `/cocktail` | `/\/cocktail/` | Admin | Open admin control panel |
| `/poke` | `/\/poke/` | Admin | Send direct messages to users by username |
| `/merger` | `/\/merger/` | Admin | Trigger manual username normalization sync |
| `/ledger` | `/\/ledger/` | Admin | View removed-users ledger |
| `/heads` | `/\/heads/` | Admin | List current admin members |
| `/tomcat` | `/\/tomcat/` | Admin | Open product manager panel |
| `/promote` | `/\/promote/` | Super Admin | Promote user to admin |
| `/demote` | `/\/demote/` | Super Admin | Demote admin user |
| `/news` | `/\/news/` | Admin | Open news & announcements panel |
| `/lingo` | `/\/lingo/` | Admin | Open language management panel |
| `/sidekick` | `/\/sidekick/` | Admin | Open Sidekick transaction manager |
| `/otpbot` | `/\/otpbot/` | Licensed/Admin | Open OTP Bot service panel |
| `/key-gen` | `/\/key-gen(.*)/` | Admin | Generate OTP license keys for users |

---

## User Journey

```
/start
  │
  ├── New User ──► Language Selection ──► Welcome + Banner ──► Browse Categories
  │                    (lang_xx)              (insert into users)
  │
  └── Existing User ──► Welcome Back ──► Browse Categories
                                              │
                                    ┌─────────┴──────────┐
                                    ▼                    ▼
                              Sub-Categories         Products List
                              (cat_XX)               (paginated)
                                    │                    │
                                    └────────┬───────────┘
                                             ▼
                                    Product Details (buy_XX)
                                             │
                                     ┌───────┴───────┐
                                     ▼               ▼
                                  Pay BTC          Pay LTC
                                  (pay_btc_XX)    (pay_ltc_XX)
                                     │               │
                                     └───────┬───────┘
                                             ▼
                                  Payment Instructions
                                  (address + steps)
                                             │
                                     ┌───────┴───────┐
                                     ▼               ▼
                               Confirm Payment   Cancel Order
                               (confirm_XX)      (cancel_order_XX)
                                     │
                                     ▼
                              Admin Notification
                              (admin_confirm_XX / admin_cancel_XX)
                                     │
                                     ▼
                              Product Delivery
                              (reply with file/photo/text)
                                     │
                                     ▼
                              Order Complete
                              (vouch channel post)
```

---

## Admin Panel

Accessed via `/cocktail`. All buttons and their callback data:

### Main Panel Buttons

| Button | Callback Data | Description |
|--------|--------------|-------------|
| 💰 Wallets | `panel_address` | Wallet address management |
| 📦 Orders | `panel_orders` | Order management & stats |
| 👥 Users | `panel_users` | User management & analytics |
| 📊 Stats | `panel_stats` | System performance statistics |
| 📢 News | `panel_news` | News & announcements system |
| ✅ Vouch | `panel_vouch` | Vouch channel settings |
| 🌍 Languages | `panel_language_stats` | Language & translation dashboard |
| 🔑 OTP Keys | `otp_admin_keys` | OTP license key management |
| 🔧 Settings | `panel_settings` | System settings |
| 📋 Logs | `panel_logs` | System log viewer |
| 🔄 Refresh | `panel_refresh` | Refresh panel data |

### Wallet Management Sub-Panel (`panel_address`)

| Button | Callback Data | Description |
|--------|--------------|-------------|
| 📋 Active Wallets | `wallet_list` | Show current active wallet addresses |
| ♻️ Update Wallet | `wallet_refresh` | Start wallet update wizard |
| 📜 History | `wallet_history_menu` | View wallet address history |
| 📊 Analytics | `wallet_analytics` | Wallet performance analytics |
| 🔙 Back | `cocktail_back` | Return to main admin panel |

### Language Dashboard Sub-Panel (`panel_language_stats`)

| Button | Callback Data | Description |
|--------|--------------|-------------|
| ➕ Add Language | `lang_admin_add` | Show available languages to enable |
| ➖ Remove Language | `lang_admin_remove` | Show enabled languages to disable |
| 🔄 Restart LibreTranslate | `lang_admin_restart_libre` | Restart Docker translation engine |
| 📊 User Stats | `lang_detailed` | Show user language distribution |
| 🔃 Refresh | `panel_language_stats` | Refresh language dashboard |
| 🔙 Back | `cocktail_back` | Return to main admin panel |

### News Sub-Panel (`panel_news` / `/news`)

| Button | Callback Data | Description |
|--------|--------------|-------------|
| 📝 Create Announcement | `news_create` | Start announcement creation wizard |
| 📋 View Drafts | `news_drafts` | Show saved draft announcements |
| 📤 Scheduled Messages | `news_scheduled` | View scheduled broadcasts |
| 📊 Sent Messages | `news_history` | View broadcast history |
| 🌍 Language Statistics | `news_lang_stats` | User distribution by language |
| 👥 User Segments | `news_segments` | User segmentation view |
| ⚙️ Broadcast Settings | `news_settings` | Configure broadcast options |
| 🔙 Back to Admin | `cocktail_back` | Return to main admin panel |

---

## Handler Reference

### adminHandler.js

| Function | Description |
|----------|-------------|
| `handleAdminCommand(bot, msg)` | Handle `/cocktail` command; show admin panel with mobile-optimized layout |
| `handleAdminCallback(bot, query)` | Route all admin panel callbacks (`panel_*`, `admin_*`, `lang_admin_*`, `vouch_*`, `export_*`, `cocktail_back`) |
| `getRealLanguageStats()` | Query DB for user language distribution (internal) |
| `showStatsPanel(bot, chatId, messageId)` | Display system statistics panel (internal) |
| `showUsersPanel(bot, chatId, messageId)` | Display user management panel (internal) |
| `showOrdersPanel(bot, chatId, messageId)` | Display order management panel (internal) |
| `showSystemPanel(bot, chatId, messageId)` | Display system control panel (internal) |

### categoryHandler.js

| Function | Description |
|----------|-------------|
| `handleCategoryNavigation(bot, query)` | Navigate `cat_XX` callbacks; show subcategories or products in category |

### userHandler.js

| Function | Description |
|----------|-------------|
| `handleStart(bot, msg)` | Handle `/start`; reject users without username, register new users with language selection, welcome back existing users |
| `showCategoriesMenu(bot, userId, isWelcome)` | Show welcome message and/or root categories with translated buttons |
| `handleLanguageSelection(bot, query)` | Handle `lang_XX` callbacks; update user language, notify admin group, transition to categories |

### paymentHandler.js

| Function | Description |
|----------|-------------|
| `handleBuyCallback(bot, query)` | Handle `buy_XX`; show order summary with payment options (BTC/LTC) |
| `handlePaymentSelection(bot, query)` | Handle `pay_XX_XX`; create order, show payment address and instructions |
| `handlePaymentConfirmation(bot, query)` | Handle `confirm_XX`; validate order, send confirmation to user and admin notification |
| `handleAdminPaymentAction(bot, query)` | Handle `admin_confirm_XX` / `admin_cancel_XX`; confirm or cancel order from admin side |
| `handleProductDelivery(bot, msg, orderId)` | Process product delivery (file/photo/video/text); send to buyer, update status, post to vouch channel |
| `handlePaymentGuide(bot, query)` | Handle `guide_XX`; show translated step-by-step crypto payment guide |
| `handlePaymentHelp(bot, query)` | Handle `help_payment_XX`; show crypto help (wallets, exchanges, explorers) |
| `handleOrderStatus(bot, query)` | Handle `status_XX`; show translated order status with details |
| `handleCancelOrder(bot, query)` | Handle `cancel_order_XX`; cancel pending order, notify admin, redirect to categories |
| `handleCopyAddress(bot, query)` | Handle `copy_address_XX`; show wallet address for easy copying |
| `handleDeliveryReply(bot, msg)` | Detect admin reply to delivery message; forward to buyer with translated header |
| `handleReplyToAdmin(bot, query)` | Handle `reply_to_admin_XX`; activate reply mode for buyer to message admin |

### walletHandler.js

| Function | Description |
|----------|-------------|
| `handleWalletCallback(bot, query)` | Route all `wallet_*` callbacks (list, history, refresh, cancel, save) |
| `handleWalletInput(bot, msg)` | Handle wallet update wizard text input (address → label → tag → private key) |
| `handleWalletFinalSave(bot, query)` | Handle `wallet_save_confirm`; save wallet to DB, notify other admins |
| `validateAddress(address, currency)` | Validate BTC (bc1) or LTC (L/M/3) address format (internal) |

### productHandler.js

| Function | Description |
|----------|-------------|
| `showProductsInCategory(bot, chatId, categoryId, page, messageId)` | Display paginated products in a category with buy buttons and navigation |

### rootCategoryHandler.js

| Function | Description |
|----------|-------------|
| `showRootCategories(bot, chatId, messageId)` | Show top-level categories with translated names and banner |

### pokeHandler.js

| Function | Description |
|----------|-------------|
| `handlePokeCommand(bot, msg)` | Handle `/poke`; parse usernames or start poke session wizard |
| `handlePokeInput(bot, msg)` | Handle poke session text input (usernames → message → send to each user) |

### otpBotHandler.js

| Function | Description |
|----------|-------------|
| `handleOtpBotCommand(bot, msg)` | Handle `/otpbot`; check license, show main OTP menu or license activation prompt |
| `handleKeyGenCommand(bot, msg)` | Handle `/key-gen @user`; generate OTP license key for a target user |
| `handleOtpCallback(bot, query)` | Route all `otp_*` callbacks (intercept, SS7, location, license mgmt, admin keys) |
| `handleOtpInput(bot, msg)` | Handle OTP session text input (license key entry, phone numbers, etc.) |

### sidekickHandler.js

| Function | Description |
|----------|-------------|
| `initializeSidekickInputHandler(bot)` | Create and return SidekickInputHandler instance |
| `handleSidekickCallback(bot, query)` | Route all `sidekick_*` callbacks (dashboard, payouts, balances, security, settings) |
| `showSidekickMainMenu(bot, chatId, messageId)` | Show Sidekick main menu (internal) |
| `showSidekickDashboard(bot, chatId, messageId)` | Show dashboard with blockchain stats (internal) |
| `showPayoutMenu(bot, chatId, messageId)` | Show payout management menu (internal) |
| `showBalanceMenu(bot, chatId, messageId)` | Show wallet balances (internal) |
| `showAutoSettlementMenu(bot, chatId, messageId)` | Show auto-settlement configuration (internal) |
| `showTransactionHistory(bot, chatId, messageId)` | Show transaction history list (internal) |
| `showSecurityMenu(bot, chatId, messageId)` | Show security options (PIN, keys) (internal) |
| `showSettingsMenu(bot, chatId, messageId)` | Show Sidekick system settings (internal) |

### productManagerHandler.js

| Function | Description |
|----------|-------------|
| `handleTomcatCommand(bot, msg)` | Handle `/tomcat`; show product manager main menu |
| `handleProductManagerCallback(bot, query)` | Route all `pm_*` callbacks (categories, products, bulk import, export, search, history) |
| `handleProductManagerInput(bot, msg)` | Handle product manager wizard text input (add/edit name, price, desc, stock, SKU) |
| `handleProductManagerDocument(bot, msg)` | Handle CSV file upload for bulk product import |
| `handleProductAddSave(bot, query)` | Handle `pm_prod_add_save`; save new product to DB |

### newsHandler.js

| Function | Description |
|----------|-------------|
| `handleNewsCommand(bot, msg)` | Handle `/news`; show news panel with stats |
| `handleNewsCallback(bot, query)` | Route all `news_*` callbacks (create, drafts, scheduled, history, language, type, template, send, test) |
| `handleNewsMessageInput(bot, msg)` | Handle news session text input (message creation, title editing, content editing) |

### lingoHandler.js

| Function | Description |
|----------|-------------|
| `handleLingoCommand(bot, msg)` | Handle `/lingo`; show language control panel dashboard |
| `handleLingoCallback(bot, query)` | Route all `lingo_*` callbacks (add, remove, enable, disable, rebuild, restart, stats, status) |

---

## Utility Reference

| File | Purpose | Key Exports |
|------|---------|-------------|
| `adminManager.js` | Live admin system polling ADMIN_GROUP chat admins | `adminManager` (singleton): `isAdmin()`, `isSuperAdmin()`, `initializeAdminSystem()`, `getAdminIds()`, `handleHeadsCommand()`, `handlePromoteCommand()`, `handleDemoteCommand()` |
| `adminDiagnostics.js` | Diagnose and fix admin callback data issues | `adminDiagnostics` (singleton): `analyzeCallback()`, `logDiagnostic()`, `generateErrorMessage()` |
| `blockchainMonitor.js` | Production blockchain monitoring via Blockstream/Mempool/BlockCypher APIs | `BlockchainMonitor` (class): `startMonitoring()`, `stopMonitoring()`, `loadWalletAddresses()`, `checkTransactions()` |
| `date.js` | Date formatting utilities | `getTodayISODate()`, `formatTimeAgo(date)` |
| `deliveryTracker.js` | Track delivery confirmation messages for reply handling | `deliveryTracker` (singleton): `trackDeliveryMessage()`, `getTrackingData()`, `cleanup()` |
| `encryption.js` | AES-256-GCM encryption for database fields and state | `encryptionManager` (singleton): `encrypt()`, `decrypt()`, `encryptDatabaseField()`, `decryptDatabaseField()`, `hashPassword()`, `verifyPassword()` |
| `instantTranslationService.js` | Ultra-fast translation with Redis cache layer | `instantTranslationService` (singleton): `initialize()`, `getTranslation()`, `preloadTranslationsToRedis()` |
| `libreTranslateManager.js` | Self-managing LibreTranslate Docker container | `libreTranslateManager` (singleton): `setEnabledLanguages()`, `ensureRunning()`, `recompileWithLanguages()`, `healthCheck()`, `stopContainer()` |
| `logger.js` | Advanced file + console logging system | `logger` (singleton): `info()`, `warn()`, `error()`, `debug()`, `logSystemEvent()`, `cleanupOldLogs()` |
| `markdownSafeTranslator.js` | Translate text while preserving Markdown formatting | `markdownSafeTranslator` (singleton): `translateSafely()`, `extractMarkdown()`, `restoreMarkdown()` |
| `messageTranslator.js` | Message translation middleware with template system | `messageTranslator` (singleton): `initialize()`, `translateTemplateForUser()`, `sendTranslatedMessage()`, `answerTranslatedCallback()`, `createLanguageSelectionMessage()`, `sendBannerWithMessage()`, `updateBotDescription()`, `updateBotDescriptionsForAllLanguages()`, `getTemplates()` |
| `migrations.js` | Database schema migration system | `MigrationManager` (class): `runMigrationsIfNeeded()` |
| `newsBroadcaster.js` | Redis-queued news broadcasting to user segments | `newsBroadcaster` (singleton): `broadcast()`, `getTargetUsers()`, `getStatus()` |
| `newsSessionManager.js` | Manage admin news editing sessions with timeout | `newsSessionManager` (singleton): `createSession()`, `getSession()`, `clearSession()`, `cleanupExpiredSessions()` |
| `notifyGroup.js` | Admin group notification system | `notifyGroup()`, `notifyNewUser()`, `notifyAdminAlert()`, `notifyNewOrder()`, `notifyPaymentReceived()`, `notifySystemStatus()`, `notifyError()`, `notifyUserActivity()` |
| `pinManager.js` | Transaction PIN management with lockout protection | `PinManager` (class): `setPin()`, `verifyPin()`, `hashPin()`, `cleanupExpiredSessions()` |
| `prebuiltTranslations.js` | Load pre-built translation JSON files from disk | `prebuiltTranslations` (singleton): `loadTranslations()`, `getAllTranslations()`, `getStats()` |
| `productManager.js` | Core product & category CRUD, bulk ops, history/audit | `productManager` (singleton): `getStats()`, `getRootCategories()`, `getCategory()`, `getSubcategories()`, `getProduct()`, `searchProducts()`, `addProduct()`, `updateProduct()`, `deleteProduct()`, `isLeafCategory()`, `exportProductsCSV()`, `importProductsCSV()` |
| `redisTranslationCache.js` | Redis-based translation caching layer | `redisTranslationCache` (singleton): `initialize()`, `get()`, `set()`, `bulkSet()`, `flush()` |
| `safeMessageEdit.js` | Safe Telegram message editing with error handling | `safeEditMessage()`, `safeEditPhotoCaption()`, `safeEditMessageReplyMarkup()`, `replaceMessage()`, `safeReplacePhoto()` |
| `sidekickInputHandler.js` | Handle text input for Sidekick payout/PIN/settlement wizards | `SidekickInputHandler` (class): `handleInput()`, `startSession()` |
| `smartMessageManager.js` | Smart message sending with banner/photo management | `smartMessageManager` (singleton): `sendOrEditSmart()`, `forceBannerNext()`, `markAsPhotoMessage()` |
| `spamPrevention.js` | Rate limiting and duplicate confirmation prevention | `spamPrevention` (singleton): `canPerformAction()`, `getTimeRemaining()`, `isDuplicateConfirmation()`, `recordConfirmation()`, `cleanup()` |
| `stateManager.js` | Encrypted persistent state management (bot_state.encrypted) | `stateManager` (singleton): `get()`, `set()`, `delete()`, `cleanup()`, `exportState()`, `loadState()`, `saveState()` |
| `telegramQueue.js` | Redis-based message queue for Telegram rate limiting | `telegramQueue` (singleton): `enqueue()`, `process()`, `getQueueSize()` |
| `telegramSafety.js` | Monkey-patch bot methods for safe Markdown handling | `TelegramSafety` (class): `patchBot()`, `stripMarkdown()`, `sanitizeText()` |
| `transactionManager.js` | Handle blockchain payout transactions | `TransactionManager` (class): `createPayout()`, `processPayout()`, `getPayoutById()`, `getPendingPayouts()` |
| `translationService.js` | Core multi-language translation service (state-driven) | `translationService` (singleton): `setUserLanguage()`, `getUserLanguage()`, `getSupportedLanguages()`, `getEnabledCodes()`, `getDisabledLanguages()`, `getAllAvailableLanguages()`, `addLanguage()`, `removeLanguage()`, `shouldTranslateNames()`, `initializeLibreTranslate()`, `buildAndLoadTranslations()`, `buildForSingleLanguage()`, `loadPrebuiltData()`, `getStats()`, `getLibreTranslateStatus()` |
| `uiOptimizer.js` | Mobile-optimized UI formatting and button layouts | `uiOptimizer` (singleton): `formatMessage()`, `createButtonLayout()`, `createMobileAdminLayout()`, `createCategoryButtons()`, `createProductButtons()`, `createPaymentButtons()`, `formatPrice()`, `createStatusMessage()` |
| `usernameNormalizer.js` | Daily username sync & stale account cleanup | `usernameNormalizer` (singleton): `setupDailySync()`, `handleMergerCommand()`, `handleLedgerCommand()`, `runSync()` |
| `vouchChannel.js` | Post completed order proofs to vouch channel | `vouchChannelManager` (singleton): `postOrderSuccess()` |

---

## Database Schema

### `categories`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Category ID |
| `name` | TEXT NOT NULL | Category display name |
| `parent_id` | INTEGER FK | Parent category ID (NULL = root) |

### `products`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Product ID |
| `name` | TEXT NOT NULL | Product display name |
| `description` | TEXT | Product description |
| `price` | REAL NOT NULL | Price in USD |
| `category_id` | INTEGER FK | Parent category ID |

### `orders`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Order ID |
| `user_id` | INTEGER NOT NULL | Buyer's Telegram user ID |
| `product_id` | INTEGER NOT NULL | Purchased product ID |
| `price` | REAL NOT NULL | Order price at time of purchase |
| `currency` | TEXT NOT NULL | Payment currency (BTC/LTC) |
| `status` | TEXT DEFAULT 'pending' | Order status: pending / awaiting_product / delivered / cancelled |
| `created_at` | TEXT DEFAULT CURRENT_TIMESTAMP | Order creation timestamp |

### `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Internal user ID |
| `telegram_id` | INTEGER UNIQUE | Telegram user ID |
| `first_name` | TEXT | User's first name |
| `last_name` | TEXT | User's last name |
| `username` | TEXT | Telegram @username |
| `language_code` | TEXT | User's chosen interface language |
| `created_at` | TEXT DEFAULT CURRENT_TIMESTAMP | Registration timestamp |
| `last_activity` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Last interaction timestamp |

### `wallet_addresses`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Wallet record ID |
| `currency` | TEXT NOT NULL | Currency code (BTC/LTC) |
| `address` | TEXT NOT NULL | Public wallet address |
| `private_key` | TEXT | Private key (🔐 encrypted) |
| `label` | TEXT NOT NULL | Descriptive wallet label |
| `tag` | TEXT NOT NULL | Source/exchange tag |
| `added_by` | INTEGER NOT NULL | Admin user ID who added |
| `added_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | When address was added |
| `is_encrypted` | BOOLEAN DEFAULT 1 | Encryption status flag |

### `detected_transactions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Transaction record ID |
| `txid` | TEXT NOT NULL UNIQUE | Blockchain transaction ID |
| `currency` | TEXT NOT NULL | Currency (BTC/LTC) |
| `address` | TEXT NOT NULL | Receiving wallet address |
| `amount` | REAL NOT NULL | Transaction amount |
| `confirmations` | INTEGER DEFAULT 0 | Number of block confirmations |
| `block_height` | INTEGER | Block number |
| `detected_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Detection timestamp |
| `processed` | BOOLEAN DEFAULT FALSE | Whether transaction was processed |
| `notification_sent` | BOOLEAN DEFAULT FALSE | Whether admin was notified |

### `payouts`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Payout record ID |
| `currency` | TEXT NOT NULL | Currency (BTC/LTC) |
| `to_address` | TEXT NOT NULL | Destination wallet address |
| `amount` | REAL NOT NULL | Payout amount |
| `status` | TEXT DEFAULT 'pending' | Status: pending / completed / failed |
| `txid` | TEXT | Blockchain transaction ID after sending |
| `created_by` | INTEGER NOT NULL | Admin who created payout |
| `created_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Creation time |
| `processed_at` | TIMESTAMP | Processing completion time |
| `notes` | TEXT | Notes (🔐 encrypted) |
| `fee_amount` | REAL DEFAULT 0 | Transaction fee |
| `priority` | TEXT DEFAULT 'normal' | Priority level |
| `batch_id` | TEXT | Batch operation identifier |

### `auto_settlement`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Settlement rule ID |
| `currency` | TEXT NOT NULL | Currency (BTC/LTC) |
| `address` | TEXT NOT NULL | Destination address |
| `percentage` | REAL NOT NULL | Percentage of balance to settle |
| `label` | TEXT NOT NULL | Rule label |
| `enabled` | BOOLEAN DEFAULT TRUE | Whether rule is active |
| `created_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Creation time |
| `min_threshold` | REAL DEFAULT 0 | Minimum balance threshold |
| `max_amount` | REAL | Maximum settlement amount |

### `transaction_pins`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | PIN record ID |
| `user_id` | INTEGER NOT NULL UNIQUE | Admin user ID |
| `pin_hash` | TEXT NOT NULL | PIN hash (🔐 encrypted) |
| `created_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | PIN creation time |
| `last_used` | TIMESTAMP | Last successful PIN use |
| `failed_attempts` | INTEGER DEFAULT 0 | Consecutive failed attempts |
| `locked_until` | TIMESTAMP | Lockout expiry time |

### `sidekick_settings`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Setting record ID |
| `key` | TEXT UNIQUE NOT NULL | Setting key name |
| `value` | TEXT NOT NULL | Setting value (🔐 encrypted) |
| `category` | TEXT DEFAULT 'general' | Setting category grouping |
| `updated_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Last update time |
| `updated_by` | INTEGER | Admin who last updated |

### `security_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Log entry ID |
| `user_id` | INTEGER NOT NULL | User who performed action |
| `action` | TEXT NOT NULL | Action name/type |
| `details` | TEXT | Action details |
| `ip_address` | TEXT | IP address (if available) |
| `user_agent` | TEXT | User agent string |
| `success` | BOOLEAN NOT NULL | Whether action succeeded |
| `timestamp` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Action timestamp |

### `admin_groups`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Record ID |
| `group_id` | INTEGER UNIQUE NOT NULL | Telegram group/chat ID |
| `group_name` | TEXT | Group display name |
| `added_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Registration time |
| `is_active` | BOOLEAN DEFAULT 1 | Whether group is active |

### `group_admins`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Record ID |
| `group_id` | INTEGER NOT NULL FK | Admin group ID |
| `user_id` | INTEGER NOT NULL | Admin user's Telegram ID |
| `username` | TEXT | Admin's @username |
| `first_name` | TEXT | Admin's first name |
| `status` | TEXT DEFAULT 'administrator' | Admin role in group |
| `added_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | First seen time |
| `last_seen` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Last poll time |

### `news_announcements`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Announcement ID |
| `title` | TEXT NOT NULL | Announcement title |
| `content` | TEXT NOT NULL | Announcement body text |
| `target_languages` | TEXT NOT NULL | JSON array of target language codes |
| `created_by` | INTEGER NOT NULL FK | Admin who created |
| `created_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Creation time |
| `scheduled_at` | TIMESTAMP | Scheduled send time |
| `sent_at` | TIMESTAMP | Actual send time |
| `status` | TEXT DEFAULT 'draft' | Status: draft / scheduled / sending / sent / failed |
| `recipients_count` | INTEGER DEFAULT 0 | Total target recipients |
| `success_count` | INTEGER DEFAULT 0 | Successfully delivered |
| `failed_count` | INTEGER DEFAULT 0 | Failed deliveries |

### `news_recipients`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Record ID |
| `announcement_id` | INTEGER NOT NULL FK | Announcement ID |
| `user_id` | INTEGER NOT NULL FK | Target user's Telegram ID |
| `status` | TEXT DEFAULT 'pending' | Delivery status: pending / sent / failed |
| `sent_at` | TIMESTAMP | Delivery timestamp |
| `error_message` | TEXT | Error details if failed |

### `news_delivery_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Log entry ID |
| `announcement_id` | INTEGER NOT NULL FK | Announcement ID |
| `user_id` | INTEGER NOT NULL | Recipient user ID |
| `status` | TEXT NOT NULL | Delivery result: sent / failed / skipped |
| `error_message` | TEXT | Error details if failed |
| `delivered_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Delivery timestamp |

### `removed_users_ledger`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Ledger entry ID |
| `telegram_id` | INTEGER NOT NULL | Removed user's Telegram ID |
| `username` | TEXT | Username at time of removal |
| `first_name` | TEXT | First name at time of removal |
| `last_name` | TEXT | Last name at time of removal |
| `language_code` | TEXT | Language preference |
| `original_created_at` | TEXT | Original registration date |
| `last_activity` | TEXT | Last activity before removal |
| `removal_reason` | TEXT NOT NULL | Why user was removed |
| `removal_category` | TEXT NOT NULL | Category: deleted / blocked / unreachable |
| `api_error_message` | TEXT | Telegram API error if applicable |
| `removed_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Removal timestamp |
| `restored_at` | TIMESTAMP | Restoration timestamp (if restored) |
| `notes` | TEXT | Additional notes |

### `otp_license_keys`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTO | Key record ID |
| `license_key` | TEXT UNIQUE NOT NULL | License key string (OTP-XXXX-XXXX-XXXX) |
| `user_id` | INTEGER | Assigned user's Telegram ID |
| `username` | TEXT | Assigned user's @username |
| `key_type` | TEXT DEFAULT 'standard' | Key type (standard / premium) |
| `duration` | TEXT DEFAULT '1_day' | Duration: 1_day / 1_week / 1_month |
| `created_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Key generation time |
| `activated_at` | TIMESTAMP | Activation timestamp |
| `expires_at` | TIMESTAMP | Expiry timestamp |
| `status` | TEXT DEFAULT 'pending' | Status: pending / active / expired / revoked |
| `generated_by` | INTEGER NOT NULL | Admin who generated key |
| `notes` | TEXT | Admin notes |

---

## Callback Routing Map

Priority order of callback routing in `bot.js` `callback_query` handler:

| # | Prefix Pattern | Handler | Description |
|---|---------------|---------|-------------|
| 1 | `lingo_*` | `handleLingoCallback` | Language management panel (must precede `lang_`) |
| 2 | `lang_admin_*` / `lang_detailed` | `handleAdminCallback` | Admin language settings (must precede general `lang_`) |
| 3 | `lang_*` / `change_language` | `handleLanguageSelection` | User language selection |
| 4 | `cat_*` | `handleCategoryNavigation` | Category navigation |
| 5 | `page_*` | `showProductsInCategory` | Product pagination (`page_categoryId_pageNum`) |
| 6 | `back_to_categories` / `load_categories` | `showRootCategories` | Return to root categories |
| 7 | `buy_*` | `handleBuyCallback` | Buy product flow |
| 8 | `pay_*` | `handlePaymentSelection` | Payment method selection |
| 9 | `confirm_*` | `handlePaymentConfirmation` | Payment confirmation |
| 10 | `copy_address_*` | `handleCopyAddress` | Copy wallet address |
| 11 | `guide_*` | `handlePaymentGuide` | Payment guide display |
| 12 | `help_payment_*` | `handlePaymentHelp` | Payment help / FAQ |
| 13 | `status_*` | `handleOrderStatus` | Order status check |
| 14 | `cancel_order_*` | `handleCancelOrder` | Cancel order |
| 15 | `reply_to_admin_*` | `handleReplyToAdmin` | Buyer reply to admin |
| 16 | `pm_*` | `handleProductManagerCallback` | Product manager (Tomcat) |
| 16a | `pm_prod_add_save` | `handleProductAddSave` | Special case: save new product |
| 17 | `admin_confirm_*` / `admin_cancel_*` | `handleAdminPaymentAction` | Admin confirm/cancel payment |
| 18 | `panel_*` / `admin_*` / `cocktail_back` / `vouch_*` / `export_*` | `handleAdminCallback` | Admin panel system |
| 19 | `news_*` / `news_main` | `handleNewsCallback` | News & announcements |
| 20 | `walletcheck_*` | `handleWalletPromptResponse` | Daily wallet check prompt |
| 21 | `wallet_save_confirm` | `handleWalletFinalSave` | Wallet save confirmation |
| 22 | `wallet_*` | `handleWalletCallback` | Wallet management |
| 23 | `otp_*` | `handleOtpCallback` | OTP Bot system |
| 24 | `sidekick_*` | `handleSidekickCallback` | Sidekick transaction manager |
| 25 | `admin_confirm` / `admin_cancel` (no ID) | Error handler | Incomplete/corrupted admin action |
| 26 | `contact_support` / `support` | Inline alert | Show support contact |
| 27 | `ignore` | No-op | Placeholder buttons |
| 28 | *(fallback)* | Translated error | Unknown callback data |

---

## Scheduled Tasks

| Task | Schedule | Trigger | Description |
|------|----------|---------|-------------|
| Daily Wallet Prompt | `0 8 * * *` (08:00 Africa/Nairobi) | `cron` in `scheduler.js` | Ask admins if they want to update wallet addresses today |
| Wallet Prompt Reminder | 5 min after prompt | `setTimeout` | Remind admin if they haven't responded to wallet prompt |
| Username Sync | Configurable via `USERNAME_SYNC_CRON` (default `0 3 * * *`) | `cron` via `usernameNormalizer` | Sync usernames, remove deleted/blocked accounts, archive to ledger |
| System Health Check | Every 5 minutes | `setInterval` | Check DB connectivity and external service health |
| Log & State Cleanup | Every 1 hour | `setInterval` | Clean old logs (7 days), expired state, expired PIN sessions |
| Daily Maintenance | Every 24 hours | `setInterval` | VACUUM database, security audit, backup critical data |
| Admin Group Polling | Every 5 seconds (env-configurable) | `setInterval` in `adminManager` | Poll ADMIN_GROUP for current admin list |
| Spam Prevention Cleanup | Every 5 minutes | `setInterval` in `spamPrevention` | Remove expired rate-limit entries |
| Poke Session Cleanup | Every 1 minute | `setInterval` in `pokeHandler` | Remove expired poke sessions (>5 min) |
| News Session Cleanup | Every 5 minutes | `setInterval` in `newsSessionManager` | Remove expired editing sessions (>30 min) |
| Delivery Tracker Cleanup | Every 1 hour | `setInterval` in `deliveryTracker` | Remove old delivery tracking data (>24 hours) |
| Bot Description Updates | On startup (non-blocking) | `initializeBot()` | Update bot description/about for all supported languages |
| Translation Rebuild | On startup if outdated | `initializeBot()` | Background rebuild of translations if new languages/templates detected |

---

## Configuration

All variables from `config.js` (loaded via `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_TOKEN` | *(required)* | Telegram Bot API token |
| `ADMIN_IDS` | `[]` | Comma-separated super admin Telegram IDs |
| `DB_PATH` | `./store.db` | SQLite database file path |
| `BTC_ADDRESS` | *(env)* | Fallback BTC receiving address |
| `LTC_ADDRESS` | *(env)* | Fallback LTC receiving address |
| `ADMIN_GROUP` | `null` | Telegram group ID for admin notifications and admin polling |
| `VOUCH_CHANNEL` | `null` | Telegram channel ID for order completion vouches |
| `SUPPORT_USERNAME` | *(env)* | Support contact @username |
| `USERNAME_SYNC_ENABLED` | `true` | Enable/disable daily username normalization |
| `USERNAME_SYNC_CRON` | `0 3 * * *` | Cron schedule for username sync |
| `USERNAME_SYNC_TIMEZONE` | `Africa/Nairobi` | Timezone for username sync schedule |
| `BOT_DESCRIPTION` | *(default text)* | Bot description shown in Telegram profile |
| `BOT_SHORT_DESCRIPTION` | *(default text)* | Short bot description for search |
| `BOT_ABOUT_TEXT` | *(default text)* | Bot about section text |
| `AVAILABLE_LANGUAGES` | `en,es,fr,de` | Comma-separated language codes available for LibreTranslate |
| `DEFAULT_LANGUAGE` | `en` | Default interface language |
| `TRANSLATE_PRODUCT_NAMES` | `false` | Whether to translate product/category names |
| `LIBRETRANSLATE_URL` | `http://localhost:5000` | LibreTranslate API URL |
| `LIBRETRANSLATE_PORT` | `5000` | LibreTranslate Docker port |
| `LIBRETRANSLATE_CONTAINER_NAME` | `molotov-libretranslate` | Docker container name |
| `LIBRETRANSLATE_AUTO_START` | `true` | Auto-start LibreTranslate Docker container |
| `ADMIN_POLL_INTERVAL` | `5000` | Admin group polling interval in ms |
| `BLOCKCHAIN_CHECK_INTERVAL` | `30000` | Blockchain monitoring check interval in ms |
| `REDIS_HOST` | `localhost` | Redis server host |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_DB` | `0` | Redis database number |
| `REDIS_PASSWORD` | *(none)* | Redis authentication password |
| `REDIS_TRANSLATION_TTL` | `86400` | Redis translation cache TTL in seconds |
| `TRANSLATION_CACHE_ENABLED` | `false` | Enable Redis translation caching |
| `INSTANT_RESPONSE_MODE` | `false` | Enable instant response translation mode |
| `BLOCKSTREAM_API` | `https://blockstream.info/api` | Blockstream API endpoint |
| `MEMPOOL_API` | `https://mempool.space/api` | Mempool.space API endpoint |
| `BLOCKCYPHER_API` | `https://api.blockcypher.com/v1/btc/main` | BlockCypher API endpoint |
| `BLOCKCYPHER_API_KEY` | *(none)* | BlockCypher API key (optional) |

---

## Encrypted Fields

The `SecureDatabase` wrapper in `database.js` automatically encrypts/decrypts these fields:

| Table | Encrypted Fields |
|-------|-----------------|
| `wallet_addresses` | `private_key` |
| `transaction_pins` | `pin_hash` |
| `payouts` | `notes` |
| `sidekick_settings` | `value` |

Encryption uses AES-256-GCM via `encryptionManager` with a master key stored in `./encryption.key`.

---

## Message Handlers (bot.on 'message')

The raw `message` event handler in `bot.js` processes messages in this priority order:

| # | Condition | Handler | Description |
|---|-----------|---------|-------------|
| 1 | `global.replyMode.has(userId)` | Inline (bot.js) | Forward buyer reply to admin group |
| 2 | Reply to "Product Upload Required" | `handleProductDelivery()` | Admin uploading product for delivery |
| 3 | Reply to "Product Delivered Successfully" | `handleDeliveryReply()` | Admin messaging buyer post-delivery |
| 4 | `msg.document` (CSV) | `handleProductManagerDocument()` | Product manager bulk CSV import |
| 5 | Text starts with `/` | *(skip)* | Commands handled by `onText` |
| 6 | Text input | `handleProductManagerInput()` | Product manager wizard steps |
| 7 | Text input | `handleOtpInput()` | OTP bot license/phone input |
| 8 | Text input | `handlePokeInput()` | Poke message composition |
| 9 | Text input | `sidekickInputHandler.handleInput()` | Sidekick payout/PIN wizards |
| 10 | Text input | `handleNewsMessageInput()` | News message creation/editing |
| 11 | Text input | `handleWalletInput()` | Wallet update wizard steps |
