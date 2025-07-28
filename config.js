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