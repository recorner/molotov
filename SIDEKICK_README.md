# Molotov Bot - Sidekick System

## 🚀 Sidekick System Overview

The Sidekick System is an advanced onchain transaction management module for the Molotov bot. It provides comprehensive blockchain monitoring, transaction management, and automated payout capabilities for Bitcoin and Litecoin.

## ✨ Key Features

### 🔍 Blockchain Monitoring
- **Real-time Transaction Detection**: Monitors Bitcoin and Litecoin addresses for incoming transactions
- **Automatic Notifications**: Sends alerts to admin group when transactions are detected
- **Confirmation Tracking**: Tracks confirmation counts for detected transactions
- **Multi-Currency Support**: Supports BTC and LTC with extensible architecture

### 💸 Payout Management
- **Manual Payouts**: Create and process individual payouts
- **Batch Payouts**: Process multiple payouts simultaneously
- **Scheduled Payouts**: Set up recurring or delayed payouts
- **Status Tracking**: Monitor payout status from creation to completion

### ⚡ Auto-Settlement
- **Percentage-based Distribution**: Automatically distribute funds based on preset percentages
- **Threshold Triggers**: Execute settlements when balance reaches specified amounts
- **Multi-address Support**: Send to multiple addresses in a single settlement
- **Custom Rules**: Create complex settlement rules with conditions

### 🔐 Security Features
- **Transaction PINs**: Secure all transactions with user-defined PINs
- **Private Key Management**: Secure storage and handling of private keys
- **Attempt Limiting**: Protection against brute force attacks
- **Session Management**: Secure session handling for sensitive operations

### 💰 Balance Management
- **Real-time Balance Tracking**: Monitor wallet balances across currencies
- **USD Conversion**: Display approximate USD values
- **Balance History**: Track balance changes over time
- **Refresh Capabilities**: Manual and automatic balance updates

## 🎯 Quick Start

### Access Sidekick
1. Use `/sidekick` command in any chat (admin only)
2. Click "🚀 Open Sidekick" button
3. Navigate through the main menu

### First-time Setup
1. **Set Transaction PIN**: Go to Security → Set PIN
2. **Configure Settlement Rules**: Go to Auto Settlement → Add Rule
3. **Test Connectivity**: Check Dashboard for balance updates

## 📱 User Interface

### Main Menu
- **📊 Dashboard**: Overview of balances, recent activity, and pending payouts
- **💸 Payouts**: Create and manage outgoing transactions
- **💰 Balances**: View and refresh wallet balances
- **⚡ Auto Settlement**: Configure automated distribution rules
- **📜 Transactions**: View transaction history and details
- **🔐 Security**: Manage PINs and security settings
- **⚙️ Settings**: System configuration and preferences

### Dashboard Features
- Current balances for all currencies
- Recent transaction activity
- Pending payout count
- Quick action buttons

### Payout Workflow
1. Select "New Payout" from Payouts menu
2. Enter currency (BTC/LTC)
3. Enter destination address
4. Enter amount
5. Add optional notes
6. Confirm creation
7. Process when ready (requires PIN)

## 🛠️ Technical Architecture

### Database Schema
```sql
-- Detected blockchain transactions
detected_transactions (id, txid, currency, address, amount, confirmations, block_height, detected_at, processed)

-- Payout management
payouts (id, currency, to_address, amount, status, txid, created_by, created_at, processed_at, notes)

-- Auto-settlement rules
auto_settlement (id, currency, address, percentage, label, enabled, created_at)

-- Transaction security PINs
transaction_pins (id, user_id, pin_hash, created_at, last_used)

-- System settings
sidekick_settings (id, key, value, updated_at)
```

### Core Components

#### BlockchainMonitor
- Monitors blockchain APIs for new transactions
- Configurable check intervals
- Supports multiple address monitoring
- Handles API rate limiting and errors

#### TransactionManager
- Creates and processes blockchain transactions
- Manages transaction fees and confirmation
- Handles batch operations
- Integrates with wallet libraries

#### PinManager
- Secure PIN hashing and verification
- Attempt limiting and lockout protection
- Session-based PIN verification
- PIN strength validation

#### SidekickInputHandler
- Manages multi-step input workflows
- Session-based input tracking
- Type-specific input validation
- Automatic session cleanup

## 🔧 Configuration

### Environment Variables
```env
BOT_TOKEN=your_telegram_bot_token
ADMIN_IDS=admin_user_ids_comma_separated
ADMIN_GROUP=admin_group_chat_id
BTC_ADDRESS=your_btc_address
LTC_ADDRESS=your_ltc_address
```

### Blockchain Integration
Currently implemented with simulation for demonstration. For production:

1. **Bitcoin Integration**:
   - Use `bitcoinjs-lib` for transaction creation
   - Connect to Bitcoin Core RPC or use services like BlockCypher
   - Implement proper fee estimation

2. **Litecoin Integration**:
   - Use `litecore-lib` for transaction handling
   - Connect to Litecoin Core RPC
   - Implement Litecoin-specific features

## 🚨 Security Considerations

### PIN Security
- PINs are hashed using PBKDF2 with 10,000 iterations
- Salt-based hashing prevents rainbow table attacks
- Failed attempt tracking with automatic lockouts
- Session-based verification for sensitive operations

### Private Key Handling
- Private keys stored encrypted in database
- Memory cleanup after transaction creation
- Separate key storage for different currencies
- Optional hardware wallet integration

### Access Control
- Admin-only access to all sidekick features
- User ID verification on all operations
- Session validation for multi-step processes
- Automatic session expiration

## 📊 Monitoring and Logging

### Transaction Logs
All transactions are logged with:
- Transaction ID and block information
- Source and destination addresses
- Amount and currency
- Timestamp and confirmation status
- Processing notes and error messages

### System Monitoring
- Balance change notifications
- Failed transaction alerts
- Security event logging
- Performance metrics tracking

## 🔮 Future Enhancements

### Planned Features
- **Multi-signature Support**: Enhanced security for large transactions
- **DeFi Integration**: Support for DeFi protocols and yield farming
- **NFT Support**: Basic NFT transaction capabilities
- **Advanced Analytics**: Detailed reporting and analysis tools
- **Mobile App**: Dedicated mobile interface
- **Hardware Wallet**: Ledger and Trezor integration

### API Extensions
- **WebSocket Monitoring**: Real-time blockchain monitoring
- **Custom Tokens**: Support for ERC-20 and other token standards
- **Cross-chain Swaps**: Automated currency exchange
- **Lightning Network**: Bitcoin Lightning Network support

## 🆘 Troubleshooting

### Common Issues

1. **Transaction Not Detected**
   - Check address format and network
   - Verify blockchain API connectivity
   - Review monitoring logs

2. **Payout Failed**
   - Verify sufficient balance
   - Check private key validity
   - Review network fees

3. **PIN Issues**
   - Check attempt count and lockout status
   - Verify PIN format (4-8 digits)
   - Reset PIN if necessary

### Debug Mode
Enable debug logging by setting environment variable:
```env
DEBUG=true
```

This will provide detailed logs for:
- Blockchain API calls
- Transaction processing steps
- PIN verification attempts
- Session management events

## 📞 Support

For technical support or feature requests, contact the development team through the admin group or create an issue in the project repository.

---

*Built with ❤️ for secure and efficient blockchain transaction management*
