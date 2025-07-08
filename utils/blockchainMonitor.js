// blockchainMonitor.js - Production blockchain monitoring with real APIs
import db from '../database.js';
import { ADMIN_GROUP } from '../config.js';
import logger from './logger.js';

class BlockchainMonitor {
  constructor(bot) {
    this.bot = bot;
    this.isMonitoring = false;
    this.btcAddresses = new Set();
    this.ltcAddresses = new Set();
    this.lastCheckedBlocks = {
      btc: null,
      ltc: null
    };
    
    // Production API endpoints
    this.apis = {
      btc: {
        blockstream: process.env.BLOCKSTREAM_API || 'https://blockstream.info/api',
        mempool: process.env.MEMPOOL_API || 'https://mempool.space/api',
        blockchair: process.env.BLOCKCHAIR_API || 'https://api.blockchair.com/bitcoin'
      },
      ltc: {
        blockchair: process.env.BLOCKCHAIR_LTC_API || 'https://api.blockchair.com/litecoin',
        blockcypher: process.env.BLOCKCYPHER_API || 'https://api.blockcypher.com/v1/ltc/main'
      }
    };
    
    // API keys from environment
    this.apiKeys = {
      blockchair: process.env.BLOCKCHAIR_API_KEY,
      blockcypher: process.env.BLOCKCYPHER_API_KEY
    };
    
    this.checkInterval = parseInt(process.env.BLOCKCHAIN_CHECK_INTERVAL) || 30000; // 30 seconds
    this.processedTxs = new Set(); // Track processed transactions
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
      db.all(`SELECT address, currency FROM wallet_addresses WHERE active = 1 OR active IS NULL`, (err, rows) => {
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
        // Try Blockstream API first (most reliable)
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
          logger.warn('BLOCKCHAIN', 'Mempool API failed, trying Blockchair', e.message);
        }
        
        // Fallback to Blockchair
        const url = this.apiKeys.blockchair 
          ? `${this.apis.btc.blockchair}/stats?key=${this.apiKeys.blockchair}`
          : `${this.apis.btc.blockchair}/stats`;
          
        const response = await fetch(url);
        const data = await response.json();
        return data.data.blocks;
        
      } else if (currency === 'ltc') {
        // Try Blockchair for LTC
        const url = this.apiKeys.blockchair 
          ? `${this.apis.ltc.blockchair}/stats?key=${this.apiKeys.blockchair}`
          : `${this.apis.ltc.blockchair}/stats`;
          
        const response = await fetch(url);
        const data = await response.json();
        return data.data.blocks;
      }
    } catch (error) {
      logger.error('BLOCKCHAIN', `Failed to get ${currency.toUpperCase()} block height`, error);
      throw error;
    }
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
      // Use Blockchair for Litecoin
      const url = this.apiKeys.blockchair 
        ? `${this.apis.ltc.blockchair}/dashboards/address/${address}?key=${this.apiKeys.blockchair}`
        : `${this.apis.ltc.blockchair}/dashboards/address/${address}`;
        
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.data && data.data[address] && data.data[address].transactions) {
        return this.formatLitecoinTransactions(data.data[address].transactions, address);
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
}

export default BlockchainMonitor;
