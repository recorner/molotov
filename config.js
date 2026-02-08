// config.js
import dotenv from 'dotenv';
dotenv.config();

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim()))
  : [];
export const DB_PATH = './store.db';
export const BTC_ADDRESS = process.env.BTC_ADDRESS;
export const LTC_ADDRESS = process.env.LTC_ADDRESS;
export const ADMIN_GROUP = process.env.ADMIN_GROUP ? parseInt(process.env.ADMIN_GROUP) : null;
export const VOUCH_CHANNEL = process.env.VOUCH_CHANNEL ? parseInt(process.env.VOUCH_CHANNEL) : null;
export const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME;

// Username Sync / Normalization settings
export const USERNAME_SYNC_ENABLED = process.env.USERNAME_SYNC_ENABLED !== 'false'; // default ON
export const USERNAME_SYNC_CRON = process.env.USERNAME_SYNC_CRON || '0 3 * * *'; // default 03:00 daily
export const USERNAME_SYNC_TIMEZONE = process.env.USERNAME_SYNC_TIMEZONE || 'Africa/Nairobi';

// Bot description and about configuration
export const BOT_DESCRIPTION = process.env.BOT_DESCRIPTION || '🚀 Molotov Bot - Your premium digital marketplace for cryptocurrency products. Secure payments via Bitcoin and Litecoin. Browse verified accounts, proxy networks, phone numbers, and more. Trusted by professionals worldwide.';
export const BOT_SHORT_DESCRIPTION = process.env.BOT_SHORT_DESCRIPTION || '💎 Premium digital marketplace for crypto products. Secure, verified, trusted.';
export const BOT_ABOUT_TEXT = process.env.BOT_ABOUT_TEXT || '🛒 Premium Digital Marketplace\n\n💎 Molotov Bot offers exclusive digital products and services for cryptocurrency payments. We specialize in verified accounts, proxy networks, phone numbers, and premium digital tools.\n\n🔐 Secure payments via Bitcoin & Litecoin\n🌍 Worldwide trusted platform\n⚡ Instant delivery\n🛡️ Professional support';

// === Language & Translation Settings ===
// All language models LibreTranslate should have ready (not necessarily enabled)
// Enabled languages are managed at runtime via /lingo and persisted in bot state
export const AVAILABLE_LANGUAGES = (() => {
  const env = process.env.AVAILABLE_LANGUAGES;
  if (env) {
    const codes = env.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
    return ['en', ...codes.filter(c => c !== 'en')];
  }
  return ['en', 'es', 'fr', 'de'];
})();

export const DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || 'en';

// false = keep original product/category names (recommended to avoid confusion)
export const TRANSLATE_PRODUCT_NAMES = process.env.TRANSLATE_PRODUCT_NAMES === 'true';

export const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000';

// LibreTranslate Docker management
export const LIBRETRANSLATE_PORT = parseInt(process.env.LIBRETRANSLATE_PORT || '5000', 10);
export const LIBRETRANSLATE_CONTAINER_NAME = process.env.LIBRETRANSLATE_CONTAINER_NAME || 'molotov-libretranslate';
export const LIBRETRANSLATE_AUTO_START = process.env.LIBRETRANSLATE_AUTO_START !== 'false'; // default ON