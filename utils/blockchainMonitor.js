// blockchainMonitor.js - Monitors blockchain for incoming transactions
import db from '../database.js';
import { ADMIN_GROUP } from '../config.js';

class BlockchainMonitor {
  constructor(bot) {
    this.bot = bot;
    this.monitoringActive = false;
    this.lastCheckedBlocks = {
      BTC: 0,
      LTC: 0
    };
    this.checkInterval = 30000; // 30 seconds
  }

  async startMonitoring() {
    if (this.monitoringActive) return;
    
    this.monitoringActive = true;
    console.log('[🔍] Blockchain monitoring started');
    
    // Start monitoring loop
    this.monitorLoop();
  }

  async stopMonitoring() {
    this.monitoringActive = false;
    console.log('[🔍] Blockchain monitoring stopped');
  }

  async monitorLoop() {
    if (!this.monitoringActive) return;

    try {
      await this.checkBitcoinTransactions();
      await this.checkLitecoinTransactions();
    } catch (error) {
      console.error('[🔍] Monitor error:', error);
    }

    // Schedule next check
    setTimeout(() => this.monitorLoop(), this.checkInterval);
  }

  async checkBitcoinTransactions() {
    // Get our BTC addresses
    const addresses = await this.getMonitoredAddresses('BTC');
    if (!addresses.length) return;

    for (const address of addresses) {
      try {
        // In a real implementation, you'd use a proper Bitcoin API
        // For now, this is a placeholder that simulates detection
        const transactions = await this.simulateTransactionCheck(address, 'BTC');
        
        for (const tx of transactions) {
          await this.processDetectedTransaction(tx);
        }
      } catch (error) {
        console.error(`[🔍] BTC check error for ${address}:`, error);
      }
    }
  }

  async checkLitecoinTransactions() {
    // Get our LTC addresses
    const addresses = await this.getMonitoredAddresses('LTC');
    if (!addresses.length) return;

    for (const address of addresses) {
      try {
        // In a real implementation, you'd use a proper Litecoin API
        const transactions = await this.simulateTransactionCheck(address, 'LTC');
        
        for (const tx of transactions) {
          await this.processDetectedTransaction(tx);
        }
      } catch (error) {
        console.error(`[🔍] LTC check error for ${address}:`, error);
      }
    }
  }

  async getMonitoredAddresses(currency) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT DISTINCT address FROM wallet_addresses WHERE currency = ?`,
        [currency],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.address));
        }
      );
    });
  }

  // Placeholder for actual blockchain API integration
  async simulateTransactionCheck(address, currency) {
    // This would be replaced with real API calls to:
    // - BlockCypher API
    // - Blockchain.info API
    // - Your own node RPC
    
    // For demonstration, we'll simulate random transactions
    if (Math.random() < 0.001) { // Very low chance for demo
      return [{
        txid: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        currency,
        address,
        amount: (Math.random() * 0.1 + 0.001).toFixed(8),
        confirmations: Math.floor(Math.random() * 6),
        block_height: 800000 + Math.floor(Math.random() * 1000)
      }];
    }
    
    return [];
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
          console.error('[🔍] Failed to save detected transaction:', err);
          return;
        }

        console.log(`[🔍] New ${tx.currency} transaction detected: ${tx.amount} to ${tx.address}`);
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
      console.error('[🔍] Failed to send notification:', error);
    }
  }

  // Real-world integration methods with actual API implementations
  async integrateBlockCypher() {
    // BlockCypher API integration
    const axios = require('axios');
    const baseUrl = 'https://api.blockcypher.com/v1';
    
    try {
      // Check Bitcoin addresses
      const btcAddresses = await this.getMonitoredAddresses('BTC');
      for (const address of btcAddresses) {
        const response = await axios.get(`${baseUrl}/btc/main/addrs/${address}/full`);
        const txs = response.data.txs || [];
        
        for (const tx of txs.slice(0, 10)) { // Check latest 10 transactions
          await this.processBlockCypherTransaction(tx, address, 'BTC');
        }
      }
      
      // Check Litecoin addresses
      const ltcAddresses = await this.getMonitoredAddresses('LTC');
      for (const address of ltcAddresses) {
        const response = await axios.get(`${baseUrl}/ltc/main/addrs/${address}/full`);
        const txs = response.data.txs || [];
        
        for (const tx of txs.slice(0, 10)) {
          await this.processBlockCypherTransaction(tx, address, 'LTC');
        }
      }
    } catch (error) {
      console.error('[🔍] BlockCypher API error:', error);
    }
  }

  async processBlockCypherTransaction(tx, address, currency) {
    // Find outputs to our address
    for (const output of tx.outputs || []) {
      if (output.addresses && output.addresses.includes(address)) {
        const amount = (output.value / 100000000).toFixed(8); // Convert satoshis to coins
        
        const transactionData = {
          txid: tx.hash,
          currency,
          address,
          amount: parseFloat(amount),
          confirmations: tx.confirmations || 0,
          block_height: tx.block_height || 0
        };
        
        await this.processDetectedTransaction(transactionData);
      }
    }
  }

  async integrateBlockchainInfo() {
    // Blockchain.info API integration
    const axios = require('axios');
    
    try {
      const btcAddresses = await this.getMonitoredAddresses('BTC');
      
      for (const address of btcAddresses) {
        try {
          const response = await axios.get(`https://blockchain.info/rawaddr/${address}?limit=10`);
          const data = response.data;
          
          for (const tx of data.txs || []) {
            // Find outputs to our address
            for (const output of tx.out || []) {
              if (output.addr === address) {
                const amount = (output.value / 100000000).toFixed(8);
                
                const transactionData = {
                  txid: tx.hash,
                  currency: 'BTC',
                  address,
                  amount: parseFloat(amount),
                  confirmations: tx.block_height ? (await this.getCurrentBlockHeight('BTC')) - tx.block_height + 1 : 0,
                  block_height: tx.block_height || 0
                };
                
                await this.processDetectedTransaction(transactionData);
              }
            }
          }
        } catch (addressError) {
          console.error(`[🔍] Blockchain.info error for ${address}:`, addressError);
        }
      }
    } catch (error) {
      console.error('[🔍] Blockchain.info API error:', error);
    }
  }

  async getCurrentBlockHeight(currency) {
    const axios = require('axios');
    
    try {
      if (currency === 'BTC') {
        const response = await axios.get('https://blockchain.info/latestblock');
        return response.data.height;
      } else if (currency === 'LTC') {
        // Use alternative API for Litecoin
        const response = await axios.get('https://api.blockcypher.com/v1/ltc/main');
        return response.data.height;
      }
    } catch (error) {
      console.error(`[🔍] Failed to get current block height for ${currency}:`, error);
      return 0;
    }
  }

  async integrateBitcoinNode() {
    // Direct Bitcoin node RPC integration
    // This requires a running Bitcoin Core node with RPC enabled
    const axios = require('axios');
    
    const rpcConfig = {
      url: process.env.BITCOIN_RPC_URL || 'http://localhost:8332',
      auth: {
        username: process.env.BITCOIN_RPC_USER || 'bitcoin',
        password: process.env.BITCOIN_RPC_PASS || 'password'
      }
    };

    try {
      const addresses = await this.getMonitoredAddresses('BTC');
      
      for (const address of addresses) {
        // Get transactions for address
        const response = await axios.post(rpcConfig.url, {
          jsonrpc: '1.0',
          id: 'molotov',
          method: 'getaddressinfo',
          params: [address]
        }, { auth: rpcConfig.auth });
        
        // This is a simplified example - full implementation would use
        // listunspent, getrawtransaction, etc.
        console.log('[🔍] Bitcoin node response:', response.data);
      }
    } catch (error) {
      console.error('[🔍] Bitcoin node RPC error:', error);
    }
  }

  async integrateLitecoinNode() {
    // Direct Litecoin node RPC integration
    const axios = require('axios');
    
    const rpcConfig = {
      url: process.env.LITECOIN_RPC_URL || 'http://localhost:9332',
      auth: {
        username: process.env.LITECOIN_RPC_USER || 'litecoin',
        password: process.env.LITECOIN_RPC_PASS || 'password'
      }
    };

    try {
      const addresses = await this.getMonitoredAddresses('LTC');
      
      for (const address of addresses) {
        const response = await axios.post(rpcConfig.url, {
          jsonrpc: '1.0',
          id: 'molotov',
          method: 'getaddressinfo',
          params: [address]
        }, { auth: rpcConfig.auth });
        
        console.log('[🔍] Litecoin node response:', response.data);
      }
    } catch (error) {
      console.error('[🔍] Litecoin node RPC error:', error);
    }
  }

  // Enhanced monitoring with multiple API sources
  async enhancedMonitoring() {
    if (!this.monitoringActive) return;

    try {
      // Try different APIs in order of preference
      await this.integrateBlockCypher();
      await this.integrateBlockchainInfo();
      
      // If node RPC is configured, use it too
      if (process.env.BITCOIN_RPC_URL) {
        await this.integrateBitcoinNode();
      }
      if (process.env.LITECOIN_RPC_URL) {
        await this.integrateLitecoinNode();
      }
    } catch (error) {
      console.error('[🔍] Enhanced monitoring error:', error);
    }
  }
}

export default BlockchainMonitor;
