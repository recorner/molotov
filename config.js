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

// Bot description and about configuration
export const BOT_DESCRIPTION = process.env.BOT_DESCRIPTION || '🚀 Molotov Bot - Your premium digital marketplace for cryptocurrency products. Secure payments via Bitcoin and Litecoin. Browse verified accounts, proxy networks, phone numbers, and more. Trusted by professionals worldwide.';
export const BOT_SHORT_DESCRIPTION = process.env.BOT_SHORT_DESCRIPTION || '💎 Premium digital marketplace for crypto products. Secure, verified, trusted.';
export const BOT_ABOUT_TEXT = process.env.BOT_ABOUT_TEXT || '🛒 Premium Digital Marketplace\n\n💎 Molotov Bot offers exclusive digital products and services for cryptocurrency payments. We specialize in verified accounts, proxy networks, phone numbers, and premium digital tools.\n\n🔐 Secure payments via Bitcoin & Litecoin\n🌍 Worldwide trusted platform\n⚡ Instant delivery\n🛡️ Professional support';