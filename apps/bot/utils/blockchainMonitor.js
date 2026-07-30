// blockchainMonitor.js - Production blockchain monitoring with real APIs (NO BLOCKCHAIR)
import db from '../database.js';
import { ADMIN_GROUP } from '../config.js';
import logger from './logger.js';

class BlockchainMonitor {
  constructor(bot) {
    this.bot = bot;
    this.isMonitoring = false;
    // Set during the one-time historical backfill so it records without alerting.
    this.suppressNotifications = false;
    this.btcAddresses = new Set();
    this.ltcAddresses = new Set();
    this.lastCheckedBlocks = {
      btc: null,
      ltc: null
    };
    
    // Production API endpoints - FREE APIS ONLY
    this.apis = {
      btc: {
        blockstream: process.env.BLOCKSTREAM_API || 'https://blockstream.info/api',
        mempool: process.env.MEMPOOL_API || 'https://mempool.space/api',
        blockcypher: process.env.BLOCKCYPHER_API || 'https://api.blockcypher.com/v1/btc/main'
      },
      ltc: {
        blockcypher: process.env.BLOCKCYPHER_API || 'https://api.blockcypher.com/v1/ltc/main',
        sochain: 'https://chain.so/api/v2'
      }
    };
    
    // API keys from environment (optional)
    this.apiKeys = {
      blockcypher: process.env.BLOCKCYPHER_API_KEY
    };
    
    this.checkInterval = parseInt(process.env.BLOCKCHAIN_CHECK_INTERVAL) || 30000; // 30 seconds
    this.processedTxs = new Set(); // Track processed transactions
    this.walletBalances = new Map(); // Cache wallet balances
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('BLOCKCHAIN', 'Monitoring already started');
      return;
    }

    try {
      // Load wallet addresses from database
      await this.loadWalletAddresses();
      
      // Get initial block heights
      await this.initializeBlockHeights();
      
      this.isMonitoring = true;

      // Monitoring was inert for a long time (see loadWalletAddresses), so the
      // first working run would otherwise treat the entire on-chain history as
      // "new" and blast the admin group. Record it silently once instead.
      await this.runInitialSyncIfNeeded();

      // Start monitoring loop
      this.monitorLoop();
      
      logger.info('BLOCKCHAIN', 'Production blockchain monitoring started', {
        btcAddresses: this.btcAddresses.size,
        ltcAddresses: this.ltcAddresses.size,
        checkInterval: this.checkInterval
      });
      
    } catch (error) {
      logger.error('BLOCKCHAIN', 'Failed to start monitoring', error);
      throw error;
    }
  }

  async stopMonitoring() {
    this.isMonitoring = false;
    logger.info('BLOCKCHAIN', 'Blockchain monitoring stopped');
  }

  async loadWalletAddresses() {
    return new Promise((resolve, reject) => {
      // wallet_addresses has never had an `active` column, so the old
      // `WHERE active = 1 OR active IS NULL` filter threw on every run and
      // silently disabled blockchain monitoring. Every stored address is live.
      db.all(`SELECT address, currency FROM wallet_addresses`, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        rows.forEach(row => {
          if (row.currency === 'BTC') {
            this.btcAddresses.add(row.address);
          } else if (row.currency === 'LTC') {
            this.ltcAddresses.add(row.address);
          }
        });
        
        logger.info('BLOCKCHAIN', 'Loaded wallet addresses', {
          btc: this.btcAddresses.size,
          ltc: this.ltcAddresses.size
        });
        
        resolve();
      });
    });
  }

  async initializeBlockHeights() {
    try {
      // Get current block heights from APIs
      const btcHeight = await this.getCurrentBlockHeight('btc');
      const ltcHeight = await this.getCurrentBlockHeight('ltc');
      
      this.lastCheckedBlocks.btc = btcHeight;
      this.lastCheckedBlocks.ltc = ltcHeight;
      
      logger.info('BLOCKCHAIN', 'Initialized block heights', {
        btc: btcHeight,
        ltc: ltcHeight
      });
    } catch (error) {
      logger.error('BLOCKCHAIN', 'Failed to initialize block heights', error);
      // Use default values if API fails
      this.lastCheckedBlocks.btc = 0;
      this.lastCheckedBlocks.ltc = 0;
    }
  }

  async getCurrentBlockHeight(currency) {
    try {
      if (currency === 'btc') {
        // Try Blockstream API first (most reliable and free)
        try {
          const response = await fetch(`${this.apis.btc.blockstream}/blocks/tip/height`);
          if (response.ok) {
            const height = await response.text();
            return parseInt(height);
          }
        } catch (e) {
          logger.warn('BLOCKCHAIN', 'Blockstream API failed, trying mempool', e.message);
        }
        
        // Fallback to Mempool API
        try {
          const response = await fetch(`${this.apis.btc.mempool}/blocks/tip/height`);
          if (response.ok) {
            const height = await response.text();
            return parseInt(height);
          }
        } catch (e) {
          logger.warn('BLOCKCHAIN', 'Mempool API failed, trying BlockCypher', e.message);
        }
        
        // Fallback to BlockCypher
        const url = this.apiKeys.blockcypher 
          ? `${this.apis.btc.blockcypher}?token=${this.apiKeys.blockcypher}`
          : `${this.apis.btc.blockcypher}`;
          
        const response = await fetch(url);
        const data = await response.json();
        return data.height;
        
      } else if (currency === 'ltc') {
        // Try BlockCypher for LTC
        try {
          const url = this.apiKeys.blockcypher 
            ? `${this.apis.ltc.blockcypher}?token=${this.apiKeys.blockcypher}`
            : `${this.apis.ltc.blockcypher}`;
            
          const response = await fetch(url);
          const data = await response.json();
          return data.height;
        } catch (e) {
          logger.warn('BLOCKCHAIN', 'BlockCypher failed for LTC, trying SoChain', e.message);
        }
        
        // Fallback to SoChain
        const response = await fetch(`${this.apis.ltc.sochain}/get_info/LTC`);
        const data = await response.json();
        return parseInt(data.data.blocks);
      }
    } catch (error) {
      logger.error('BLOCKCHAIN', `Failed to get ${currency.toUpperCase()} block height`, error);
      throw error;
    }
  }

  /**
   * On first successful activation, sweep every watched address and record what
   * is already on-chain without notifying. Only transactions that appear after
   * this point are genuinely new and worth alerting on.
   */
  async runInitialSyncIfNeeded() {
    const alreadySynced = await new Promise((resolve) => {
      db.get(
        `SELECT value FROM sidekick_settings WHERE key = ?`,
        ['blockchain_initial_sync'],
        (err, row) => resolve(!!row)
      );
    });
    if (alreadySynced) return;

    logger.info('BLOCKCHAIN', 'First activation — backfilling on-chain history silently');
    this.suppressNotifications = true;
    try {
      await this.checkForNewTransactions();
    } finally {
      this.suppressNotifications = false;
    }

    await new Promise((resolve) => {
      db.run(
        `INSERT INTO sidekick_settings (key, value) VALUES (?, ?)`,
        ['blockchain_initial_sync', new Date().toISOString()],
        () => resolve()
      );
    });
    logger.info('BLOCKCHAIN', 'Backfill complete — new transactions will notify from now on');
  }

  async monitorLoop() {
    while (this.isMonitoring) {
      try {
        await this.checkForNewTransactions();
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
      } catch (error) {
        logger.error('BLOCKCHAIN', 'Monitor loop error', error);
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
      }
    }
  }

  async checkForNewTransactions() {
    // Check Bitcoin addresses
    for (const address of this.btcAddresses) {
      try {
        await this.checkAddressTransactions(address, 'BTC');
      } catch (error) {
        logger.error('BLOCKCHAIN', `Failed to check BTC address ${address}`, error);
      }
    }
    
    // Check Litecoin addresses
    for (const address of this.ltcAddresses) {
      try {
        await this.checkAddressTransactions(address, 'LTC');
      } catch (error) {
        logger.error('BLOCKCHAIN', `Failed to check LTC address ${address}`, error);
      }
    }
  }

  async checkAddressTransactions(address, currency) {
    try {
      let transactions = [];
      
      if (currency === 'BTC') {
        transactions = await this.getBitcoinTransactions(address);
      } else if (currency === 'LTC') {
        transactions = await this.getLitecoinTransactions(address);
      }
      
      // Process new transactions
      for (const tx of transactions) {
        if (!this.processedTxs.has(tx.txid)) {
          await this.processDetectedTransaction(tx);
          this.processedTxs.add(tx.txid);
        }
      }
      
    } catch (error) {
      logger.error('BLOCKCHAIN', `Error checking ${currency} address ${address}`, error);
    }
  }

  async getBitcoinTransactions(address) {
    try {
      // Try Blockstream API first
      try {
        const response = await fetch(`${this.apis.btc.blockstream}/address/${address}/txs`);
        if (response.ok) {
          const txs = await response.json();
          return this.formatBitcoinTransactions(txs, address);
        }
      } catch (e) {
        logger.warn('BLOCKCHAIN', 'Blockstream tx API failed, trying mempool', e.message);
      }
      
      // Fallback to Mempool API
      try {
        const response = await fetch(`${this.apis.btc.mempool}/address/${address}/txs`);
        if (response.ok) {
          const txs = await response.json();
          return this.formatBitcoinTransactions(txs, address);
        }
      } catch (e) {
        logger.warn('BLOCKCHAIN', 'Mempool tx API failed', e.message);
      }
      
      return [];
    } catch (error) {
      logger.error('BLOCKCHAIN', `Failed to get Bitcoin transactions for ${address}`, error);
      return [];
    }
  }

  async getLitecoinTransactions(address) {
    try {
      // Try BlockCypher for Litecoin
      try {
        const url = this.apiKeys.blockcypher 
          ? `${this.apis.ltc.blockcypher}/addrs/${address}?token=${this.apiKeys.blockcypher}`
          : `${this.apis.ltc.blockcypher}/addrs/${address}`;
          
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.txrefs) {
          return this.formatLitecoinTransactionsCypher(data.txrefs, address);
        }
      } catch (e) {
        logger.warn('BLOCKCHAIN', 'BlockCypher failed for LTC, trying SoChain', e.message);
      }
      
      // Fallback to SoChain
      try {
        const response = await fetch(`${this.apis.ltc.sochain}/get_tx_received/LTC/${address}`);
        const data = await response.json();
        
        if (data.status === 'success' && data.data && data.data.txs) {
          return this.formatLitecoinTransactionsSoChain(data.data.txs, address);
        }
      } catch (e) {
        logger.warn('BLOCKCHAIN', 'SoChain API failed for LTC', e.message);
      }
      
      return [];
    } catch (error) {
      logger.error('BLOCKCHAIN', `Failed to get Litecoin transactions for ${address}`, error);
      return [];
    }
  }

  formatBitcoinTransactions(txs, address) {
    return txs.slice(0, 10).map(tx => { // Only check last 10 transactions
      const output = tx.vout.find(vout => 
        vout.scriptpubkey_address === address
      );
      
      if (output) {
        return {
          txid: tx.txid,
          currency: 'BTC',
          address: address,
          amount: (output.value / 100000000).toFixed(8), // Convert satoshis to BTC
          confirmations: tx.status.confirmed ? tx.status.block_height : 0,
          block_height: tx.status.block_height || 0,
          timestamp: tx.status.block_time || Math.floor(Date.now() / 1000)
        };
      }
      return null;
    }).filter(Boolean);
  }

  formatLitecoinTransactionsCypher(txrefs, address) {
    return txrefs.slice(0, 10).map(txref => ({
      txid: txref.tx_hash,
      currency: 'LTC',
      address: address,
      amount: (txref.value / 100000000).toFixed(8), // Convert satoshis to LTC
      confirmations: txref.confirmations || 0,
      block_height: txref.block_height || 0,
      timestamp: new Date(txref.confirmed).getTime() / 1000 || Math.floor(Date.now() / 1000)
    }));
  }

  formatLitecoinTransactionsSoChain(txs, address) {
    return txs.slice(0, 10).map(tx => ({
      txid: tx.txid,
      currency: 'LTC',
      address: address,
      amount: parseFloat(tx.value),
      confirmations: tx.confirmations || 0,
      block_height: tx.block_no || 0,
      timestamp: tx.time || Math.floor(Date.now() / 1000)
    }));
  }

  formatLitecoinTransactions(txs, address) {
    return txs.slice(0, 10).map(txid => ({ // Only check last 10 transactions
      txid: txid,
      currency: 'LTC',
      address: address,
      amount: 0, // Will need to fetch individual tx details
      confirmations: 1,
      block_height: 0,
      timestamp: Math.floor(Date.now() / 1000)
    }));
  }

  async processDetectedTransaction(tx) {
    // Check if already processed
    const exists = await new Promise((resolve) => {
      db.get(
        `SELECT id FROM detected_transactions WHERE txid = ?`,
        [tx.txid],
        (err, row) => resolve(!!row)
      );
    });

    if (exists) return;

    // Save to database
    db.run(
      `INSERT INTO detected_transactions 
       (txid, currency, address, amount, confirmations, block_height) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tx.txid, tx.currency, tx.address, tx.amount, tx.confirmations, tx.block_height],
      (err) => {
        if (err) {
          logger.error('BLOCKCHAIN', 'Failed to save detected transaction', err);
          return;
        }

        if (this.suppressNotifications) {
          logger.info('BLOCKCHAIN', `Backfilled ${tx.currency} tx ${String(tx.txid).slice(0, 12)}… (no alert)`);
          return;
        }

        logger.info('BLOCKCHAIN', `New ${tx.currency} transaction detected: ${tx.amount} to ${tx.address}`);
        this.notifyTransaction(tx);
      }
    );
  }

  async notifyTransaction(tx) {
    if (!ADMIN_GROUP) return;

    const message = `🚨 *Onchain Transaction Detected!*

💱 Currency: *${tx.currency}*
💰 Amount: \`${tx.amount} ${tx.currency}\`
📬 Address: \`${tx.address}\`
🔗 TXID: \`${tx.txid}\`
✅ Confirmations: ${tx.confirmations}

Would you like to start the Sidekick menu for transaction management?`;

    try {
      await this.bot.sendMessage(ADMIN_GROUP, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚀 Start Sidekick', callback_data: 'sidekick_start' },
              { text: '❌ Ignore', callback_data: 'sidekick_ignore' }
            ]
          ]
        }
      });
    } catch (error) {
      logger.error('BLOCKCHAIN', 'Failed to send notification', error);
    }
  }

  // Add new address to monitoring
  async addAddress(address, currency) {
    if (currency === 'BTC') {
      this.btcAddresses.add(address);
    } else if (currency === 'LTC') {
      this.ltcAddresses.add(address);
    }
    
    logger.info('BLOCKCHAIN', `Added ${currency} address to monitoring: ${address}`);
  }

  // Remove address from monitoring
  async removeAddress(address, currency) {
    if (currency === 'BTC') {
      this.btcAddresses.delete(address);
    } else if (currency === 'LTC') {
      this.ltcAddresses.delete(address);
    }
    
    logger.info('BLOCKCHAIN', `Removed ${currency} address from monitoring: ${address}`);
  }

  // Get monitoring stats
  getStats() {
    return {
      isMonitoring: this.isMonitoring,
      btcAddresses: this.btcAddresses.size,
      ltcAddresses: this.ltcAddresses.size,
      checkInterval: this.checkInterval,
      processedTransactions: this.processedTxs.size,
      lastCheckedBlocks: this.lastCheckedBlocks
    };
  }

  // Real balance checking methods
  async getAddressBalance(address, currency) {
    try {
      if (currency === 'BTC') {
        return await this.getBitcoinBalance(address);
      } else if (currency === 'LTC') {
        return await this.getLitecoinBalance(address);
      }
      return 0;
    } catch (error) {
      logger.error('BLOCKCHAIN', `Failed to get balance for ${address}`, error);
      return 0;
    }
  }

  async getBitcoinBalance(address) {
    try {
      // Try Blockstream API first
      try {
        const response = await fetch(`${this.apis.btc.blockstream}/address/${address}`);
        if (response.ok) {
          const data = await response.json();
          return (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum) / 100000000; // Convert satoshis to BTC
        }
      } catch (e) {
        logger.warn('BLOCKCHAIN', 'Blockstream balance API failed, trying mempool', e.message);
      }
      
      // Fallback to Mempool API
      try {
        const response = await fetch(`${this.apis.btc.mempool}/address/${address}`);
        if (response.ok) {
          const data = await response.json();
          return (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum) / 100000000;
        }
      } catch (e) {
        logger.warn('BLOCKCHAIN', 'Mempool balance API failed, trying BlockCypher', e.message);
      }
      
      // Fallback to BlockCypher
      const url = this.apiKeys.blockcypher 
        ? `${this.apis.btc.blockcypher}/addrs/${address}/balance?token=${this.apiKeys.blockcypher}`
        : `${this.apis.btc.blockcypher}/addrs/${address}/balance`;
        
      const response = await fetch(url);
      const data = await response.json();
      return data.balance / 100000000; // Convert satoshis to BTC
      
    } catch (error) {
      logger.error('BLOCKCHAIN', `Failed to get Bitcoin balance for ${address}`, error);
      return 0;
    }
  }

  async getLitecoinBalance(address) {
    try {
      // Try BlockCypher for Litecoin
      try {
        const url = this.apiKeys.blockcypher 
          ? `${this.apis.ltc.blockcypher}/addrs/${address}/balance?token=${this.apiKeys.blockcypher}`
          : `${this.apis.ltc.blockcypher}/addrs/${address}/balance`;
          
        const response = await fetch(url);
        const data = await response.json();
        return data.balance / 100000000; // Convert satoshis to LTC
      } catch (e) {
        logger.warn('BLOCKCHAIN', 'BlockCypher failed for LTC balance, trying SoChain', e.message);
      }
      
      // Fallback to SoChain
      const response = await fetch(`${this.apis.ltc.sochain}/get_address_balance/LTC/${address}`);
      const data = await response.json();
      
      if (data.status === 'success') {
        return parseFloat(data.data.confirmed_balance);
      }
      
      return 0;
    } catch (error) {
      logger.error('BLOCKCHAIN', `Failed to get Litecoin balance for ${address}`, error);
      return 0;
    }
  }

  async getAllWalletBalances() {
    const balances = new Map();
    
    // Get all BTC balances
    for (const address of this.btcAddresses) {
      try {
        const balance = await this.getBitcoinBalance(address);
        balances.set(`BTC_${address}`, { currency: 'BTC', address, balance });
      } catch (error) {
        logger.error('BLOCKCHAIN', `Failed to get BTC balance for ${address}`, error);
      }
    }
    
    // Get all LTC balances
    for (const address of this.ltcAddresses) {
      try {
        const balance = await this.getLitecoinBalance(address);
        balances.set(`LTC_${address}`, { currency: 'LTC', address, balance });
      } catch (error) {
        logger.error('BLOCKCHAIN', `Failed to get LTC balance for ${address}`, error);
      }
    }
    
    return balances;
  }

  async getTotalBalances() {
    const balances = await this.getAllWalletBalances();
    const totals = { BTC: 0, LTC: 0 };
    
    for (const [key, data] of balances) {
      totals[data.currency] += data.balance;
    }
    
    return totals;
  }

  async getCryptoPrices() {
    try {
      // Use CoinGecko free API
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,litecoin&vs_currencies=usd');
      const data = await response.json();
      
      return {
        BTC: data.bitcoin?.usd || 0,
        LTC: data.litecoin?.usd || 0
      };
    } catch (error) {
      logger.error('BLOCKCHAIN', 'Failed to get crypto prices', error);
      return { BTC: 0, LTC: 0 };
    }
  }
}

export default BlockchainMonitor;
