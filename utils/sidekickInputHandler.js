// sidekickInputHandler.js - Enhanced transaction input handling
import db from '../database.js';
import adminManager from './adminManager.js';
import TransactionManager from './transactionManager.js';
import PinManager from './pinManager.js';

const activeSidekickInputs = new Map();

class SidekickInputHandler {
  constructor(bot) {
    this.bot = bot;
    this.transactionManager = new TransactionManager(bot);
    this.pinManager = new PinManager();
  }

  // Handle text input for sidekick operations
  async handleInput(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text?.trim();

    // Validate user permissions with dynamic admin manager
    const isUserAdmin = await adminManager.isAdmin(userId);
    if (!isUserAdmin) return false;

    // Validate input exists
    if (!text || text.length === 0) {
      await this.bot.sendMessage(chatId, '❌ Please provide valid input.');
      return true;
    }

    // Check for session
    const session = activeSidekickInputs.get(chatId);
    if (!session) return false;

    // Validate session timeout (30 minutes)
    if (Date.now() - session.startTime > 1800000) {
      this.clearSession(chatId);
      await this.bot.sendMessage(chatId, '⏰ Session expired. Please start again.');
      return true;
    }

    try {
      switch (session.type) {
        case 'new_payout':
          return await this.handlePayoutInput(msg, session);
        
        case 'set_pin':
          return await this.handlePinInput(msg, session);
        
        case 'verify_pin':
          return await this.handlePinVerification(msg, session);
        
        case 'add_settlement_rule':
          return await this.handleSettlementRuleInput(msg, session);
        
        case 'batch_payout':
          return await this.handleBatchPayoutInput(msg, session);
        
        default:
          this.clearSession(chatId);
          return false;
      }
    } catch (error) {
      console.error('[Sidekick Input] Error:', error);
      await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
      this.clearSession(chatId);
      return true;
    }
  }

  // Handle payout creation input
  async handlePayoutInput(msg, session) {
    const chatId = msg.chat.id;
    const text = msg.text.trim().toUpperCase();

    if (!session.step) session.step = 'currency';

    switch (session.step) {
      case 'currency':
        if (!['BTC', 'LTC', 'BITCOIN', 'LITECOIN'].includes(text)) {
          return this.bot.sendMessage(chatId, '❌ Please enter a valid currency (BTC or LTC):');
        }
        session.currency = text.startsWith('BTC') || text === 'BITCOIN' ? 'BTC' : 'LTC';
        session.step = 'address';
        return this.bot.sendMessage(chatId, `📬 Enter the destination ${session.currency} address:`);

      case 'address':
        const originalText = msg.text.trim(); // Keep original case for address
        
        // Enhanced address validation
        if (!this.validateAddress(originalText, session.currency)) {
          return this.bot.sendMessage(chatId, `❌ Invalid ${session.currency} address format. Please try again:`);
        }
        
        session.address = originalText;
        session.step = 'amount';
        return this.bot.sendMessage(chatId, '💰 Enter the amount to send:');

      case 'amount':
        const amount = parseFloat(msg.text.trim());
        if (isNaN(amount) || amount <= 0 || amount > 1000) {
          return this.bot.sendMessage(chatId, '❌ Please enter a valid amount (0.001 - 1000):');
        }
        session.amount = amount;
        session.step = 'notes';
        return this.bot.sendMessage(chatId, '📝 Enter a note for this payout (or type "skip"):');

      case 'notes':
        const noteText = msg.text.trim();
        session.notes = noteText.toLowerCase() === 'skip' ? '' : noteText;
        
        // Create the payout
        try {
          const payout = await this.transactionManager.createPayout(
            session.currency,
            session.address,
            session.amount,
            msg.from.id,
            session.notes
          );

          const message = `✅ *Payout Created Successfully!*

💱 Currency: ${payout.currency}
📬 Address: \`${payout.toAddress}\`
💰 Amount: ${payout.amount}
📝 Notes: ${payout.notes || 'None'}
🆔 Payout ID: #${payout.id}

The payout is now pending. Use the Sidekick menu to process it.`;

          this.clearSession(chatId);
          return this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

        } catch (error) {
          this.clearSession(chatId);
          return this.bot.sendMessage(chatId, `❌ Failed to create payout: ${error.message}`);
        }
    }
  }

  // Handle PIN input
  async handlePinInput(msg, session) {
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (!session.step) session.step = 'new_pin';

    switch (session.step) {
      case 'new_pin':
        if (!/^\d{4,8}$/.test(text)) {
          return this.bot.sendMessage(chatId, '❌ PIN must be 4-8 digits. Please try again:');
        }
        session.newPin = text;
        session.step = 'confirm_pin';
        return this.bot.sendMessage(chatId, '🔄 Confirm your PIN by entering it again:');

      case 'confirm_pin':
        if (text !== session.newPin) {
          session.step = 'new_pin';
          return this.bot.sendMessage(chatId, '❌ PINs do not match. Enter your new PIN:');
        }

        try {
          await this.pinManager.setPin(msg.from.id, session.newPin);
          this.clearSession(chatId);
          return this.bot.sendMessage(chatId, '✅ PIN set successfully! You can now use it for transaction verification.');
        } catch (error) {
          this.clearSession(chatId);
          return this.bot.sendMessage(chatId, `❌ Failed to set PIN: ${error.message}`);
        }
    }
  }

  // Handle PIN verification
  async handlePinVerification(msg, session) {
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    try {
      await this.pinManager.verifyUserPin(msg.from.id, text);
      
      // Execute the pending action
      if (session.pendingAction) {
        await this.executePendingAction(session.pendingAction, msg);
      }
      
      this.clearSession(chatId);
      return this.bot.sendMessage(chatId, '✅ PIN verified! Action completed.');

    } catch (error) {
      return this.bot.sendMessage(chatId, `❌ ${error.message}`);
    }
  }

  // Handle settlement rule input
  async handleSettlementRuleInput(msg, session) {
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (!session.step) session.step = 'currency';

    switch (session.step) {
      case 'currency':
        if (!['BTC', 'LTC'].includes(text.toUpperCase())) {
          return this.bot.sendMessage(chatId, '❌ Please enter a valid currency (BTC or LTC):');
        }
        session.currency = text.toUpperCase();
        session.step = 'address';
        return this.bot.sendMessage(chatId, '📬 Enter the settlement address:');

      case 'address':
        session.address = text;
        session.step = 'percentage';
        return this.bot.sendMessage(chatId, '📊 Enter the percentage (0-100):');

      case 'percentage':
        const percentage = parseFloat(text);
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
          return this.bot.sendMessage(chatId, '❌ Please enter a valid percentage (0-100):');
        }
        session.percentage = percentage;
        session.step = 'label';
        return this.bot.sendMessage(chatId, '🏷️ Enter a label for this rule:');

      case 'label':
        session.label = text;
        
        try {
          await this.createSettlementRule(session);
          this.clearSession(chatId);
          return this.bot.sendMessage(chatId, '✅ Auto-settlement rule created successfully!');
        } catch (error) {
          this.clearSession(chatId);
          return this.bot.sendMessage(chatId, `❌ Failed to create rule: ${error.message}`);
        }
    }
  }

  // Create settlement rule in database
  async createSettlementRule(session) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO auto_settlement (currency, address, percentage, label) VALUES (?, ?, ?, ?)`,
        [session.currency, session.address, session.percentage, session.label],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Execute pending action after PIN verification
  async executePendingAction(action, msg) {
    switch (action.type) {
      case 'process_payout':
        // Process the payout with the provided private key
        await this.transactionManager.processPayout(action.payoutId, action.privateKey);
        break;
      
      case 'trigger_settlement':
        // Trigger auto-settlement
        await this.transactionManager.executeAutoSettlement(action.currency);
        break;
    }
  }

  // Start a new input session
  startSession(chatId, type, data = {}) {
    activeSidekickInputs.set(chatId, { 
      type, 
      ...data, 
      startTime: Date.now(),
      startedAt: Date.now() 
    });
    
    // Auto-cleanup after 30 minutes
    setTimeout(() => {
      if (activeSidekickInputs.has(chatId)) {
        this.clearSession(chatId);
        this.bot.sendMessage(chatId, '⏰ Session expired due to inactivity.');
      }
    }, 1800000); // 30 minutes
  }

  // Clear input session
  clearSession(chatId) {
    activeSidekickInputs.delete(chatId);
  }

  // Check if there's an active session
  hasActiveSession(chatId) {
    return activeSidekickInputs.has(chatId);
  }

  // Validate cryptocurrency addresses
  validateAddress(address, currency) {
    if (!address || typeof address !== 'string') return false;
    
    address = address.trim();
    
    switch (currency) {
      case 'BTC':
        // Bitcoin address validation
        return (
          (address.startsWith('1') && address.length >= 26 && address.length <= 35) ||
          (address.startsWith('3') && address.length >= 26 && address.length <= 35) ||
          (address.startsWith('bc1') && address.length >= 42 && address.length <= 62)
        );
        
      case 'LTC':
        // Litecoin address validation
        return (
          (address.startsWith('L') && address.length >= 26 && address.length <= 35) ||
          (address.startsWith('M') && address.length >= 26 && address.length <= 35) ||
          (address.startsWith('ltc1') && address.length >= 43 && address.length <= 62)
        );
        
      default:
        return false;
    }
  }
}

export default SidekickInputHandler;
