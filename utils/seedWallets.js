import db from '../database.js';
import { BTC_ADDRESS, LTC_ADDRESS, ADMIN_IDS } from '../config.js';

const seedWallets = () => {
  const now = new Date().toISOString();
  const wallets = [
    {
      currency: 'BTC',
      address: BTC_ADDRESS,
      label: 'Primary BTC',
      tag: 'Ledger Vault',
      added_by: ADMIN_IDS[0],
      added_at: now
    },
    {
      currency: 'LTC',
      address: LTC_ADDRESS,
      label: 'Primary LTC',
      tag: 'Coinomi Cold Storage',
      added_by: ADMIN_IDS[0],
      added_at: now
    }
  ];

  wallets.forEach(w => {
    db.run(`
      INSERT INTO wallet_addresses (currency, address, label, tag, added_by, added_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [w.currency, w.address, w.label, w.tag, w.added_by, w.added_at], function (err) {
      if (err) console.error(`[SEED] Failed to insert ${w.currency}:`, err.message);
      else console.log(`[SEED] Inserted ${w.currency} wallet (ID: ${this.lastID})`);
    });
  });
};

seedWallets();
