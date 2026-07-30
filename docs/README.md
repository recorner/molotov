# 🚀 Molotov Bot - Production-Grade Cryptocurrency Management

A sophisticated Telegram bot with advanced cryptocurrency transaction management featuring the **Sidekick System** - a production-ready suite for Bitcoin and Litecoin operations.

## 🌟 Key Features

### 🔐 Enterprise-Grade Security
- **AES-256-GCM Encryption** for all sensitive data
- **PBKDF2 Key Derivation** with 100,000+ iterations
- **Transaction PINs** with attempt limiting and lockout protection
- **Encrypted Database Fields** for private keys, PINs, and notes
- **Session-based Security** with automatic expiration
- **Comprehensive Audit Logging** for all security events

### 💰 Advanced Transaction Management (Sidekick System)
- **Real-time Blockchain Monitoring** for BTC/LTC addresses
- **Manual & Batch Payout Processing** with PIN verification
- **Scheduled Payouts** with recurring payment support
- **Auto-Settlement Rules** with percentage-based distribution
- **Complete Transaction History** with filtering and export
- **Fee Estimation & Optimization** for all transactions

### 📊 Professional Dashboard
- **Real-time Balance Tracking** across all currencies
- **USD Conversion** with live exchange rates
- **Comprehensive Statistics** and analytics
- **System Health Monitoring** with automatic alerts
- **Admin Controls** with role-based permissions

### 🔧 Production Features
- **Database Migrations** for seamless upgrades
- **Backward Compatibility** protection
- **Automatic Cleanup** and maintenance
- **Error Handling** with graceful degradation
- **Performance Monitoring** and optimization
- **External API Integration** for enhanced reliability

## 🚀 Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- SQLite3
- Telegram Bot Token

### Installation

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd molotov
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run Migrations**
   ```bash
   npm run migrate
   ```

4. **Start the Bot**
   ```bash
   npm start
   ```

## 🔧 Configuration

### Environment Variables

#### Core Settings
```env
BOT_TOKEN=your_telegram_bot_token
ADMIN_IDS=123456789,987654321
ADMIN_GROUP=-1001234567890
```

#### Cryptocurrency Addresses
```env
BTC_ADDRESS=bc1q...
LTC_ADDRESS=LfM...
```

#### Optional: External APIs
```env
BLOCKCYPHER_API_KEY=your_api_key
BLOCKCHAIN_INFO_API_KEY=your_api_key
```

#### Optional: Node RPC
```env
BITCOIN_RPC_URL=http://localhost:8332
BITCOIN_RPC_USER=bitcoin
BITCOIN_RPC_PASS=secure_password
```

## 📱 User Commands

### For Users
- `/start` - Begin interaction with the bot
- `/sidekick` - Access the Sidekick transaction management system (Admin only)

### Admin Commands
- `/admin` - Access admin panel
- `/wallet` - Manage wallet addresses
- `/panel` - Administrative controls

## 🎛️ Sidekick System Usage

### Access the Sidekick System
```
/sidekick → Main Menu
```

### Key Features

#### 📊 Dashboard
- View current balances across all currencies
- Monitor recent transaction activity
- Track pending operations
- Quick access to common actions

#### 💸 Payout Management
- **Create New Payouts**: Step-by-step guided creation
- **Batch Processing**: Handle multiple payouts simultaneously
- **Scheduled Payouts**: Set future execution dates
- **History Tracking**: Complete audit trail

#### ⚡ Auto-Settlement
- **Percentage Rules**: Distribute percentages to specific addresses
- **Threshold Triggers**: Automatic execution when balances reach limits
- **Multi-Currency Support**: Independent rules for BTC/LTC
- **Manual Override**: Force execution or pause rules

#### 🔐 Security Management
- **Transaction PINs**: Secure all sensitive operations
- **Private Key Management**: Encrypted storage and backup
- **Security Logs**: Track all security-related events
- **Access Controls**: Role-based permissions

## 🔒 Security Features

### Encryption
- All private keys encrypted with AES-256-GCM
- Database field-level encryption for sensitive data
- Unique salt and IV for each encrypted field
- HKDF key derivation for different contexts

### Authentication
- PIN-based transaction verification
- Failed attempt tracking and lockout
- Session-based security with TTL
- Admin-only access controls

### Audit Trail
- Complete transaction history
- Security event logging
- Failed login attempt tracking
- System access monitoring

## 🗄️ Database Schema

### Core Tables
- `categories` - Product categories
- `products` - Available products
- `orders` - Customer orders
- `users` - User information

### Sidekick Tables
- `wallet_addresses` - Monitored cryptocurrency addresses
- `detected_transactions` - Blockchain transaction monitoring
- `payouts` - Outgoing transaction management
- `auto_settlement` - Automated distribution rules
- `transaction_pins` - Secure PIN storage
- `security_log` - Security audit trail

### Migration System
- `migrations` - Database version tracking
- Automatic schema updates
- Backward compatibility protection

## 🔧 API Integration

### Blockchain Monitoring
The system supports multiple blockchain APIs for enhanced reliability:

#### BlockCypher API
```javascript
// Automatically monitors addresses for new transactions
// Supports both Bitcoin and Litecoin networks
```

#### Blockchain.info
```javascript
// Backup monitoring service
// Real-time transaction detection
```

#### Direct Node RPC
```javascript
// For users running their own nodes
// Maximum privacy and reliability
```

## 📈 Performance & Monitoring

### System Health
- Automatic health checks every 5 minutes
- Database connectivity monitoring
- External service availability checking
- Performance metrics collection

### Cleanup & Maintenance
- Daily database optimization (VACUUM)
- Log rotation (30-day retention)
- Expired session cleanup
- Security audit automation

### Error Handling
- Graceful degradation on service failures
- Automatic retry mechanisms
- Comprehensive error logging
- User-friendly error messages

## 🚀 Production Deployment

### Recommended Setup
```bash
# Use PM2 for process management
npm install -g pm2
pm2 start bot.js --name molotov-bot

# Set up log rotation
pm2 install pm2-logrotate

# Monitor the application
pm2 monit
```

### Security Checklist
- [ ] Secure .env file permissions (600)
- [ ] Regular database backups
- [ ] Monitor security logs
- [ ] Update dependencies regularly
- [ ] Use HTTPS for webhook mode (if applicable)

## 🔄 Upgrading

### From Previous Versions
The migration system ensures seamless upgrades:

```bash
# Run migrations
npm run migrate

# Check migration status
npm run migrate -- --status

# Rollback if needed (use with caution)
npm run migrate -- --rollback
```

### Breaking Changes
- Version 2.0.0: Added encryption for all sensitive fields
- Automatic data migration ensures no data loss
- Backward compatibility maintained

## 🐛 Troubleshooting

### Common Issues

#### Database Locked
```bash
# Stop the bot
pm2 stop molotov-bot

# Check for zombie processes
ps aux | grep node

# Restart
pm2 start molotov-bot
```

#### Encryption Errors
```bash
# Check encryption key file
ls -la encryption.key

# Verify permissions
chmod 600 encryption.key
```

#### Missing Transactions
```bash
# Check blockchain monitoring logs
tail -f logs/blockchain.log

# Verify API connectivity
npm run health
```

## 📊 Monitoring & Analytics

### Log Files
- `logs/system.log` - General system events
- `logs/security.log` - Security-related events
- `logs/transactions.log` - Transaction processing
- `logs/blockchain.log` - Blockchain monitoring
- `logs/admin.log` - Administrative actions

### Performance Metrics
- Transaction processing time
- Blockchain sync status
- API response times
- Database query performance
- Memory and CPU usage

## 🤝 Contributing

### Development Setup
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests (when available)
npm test
```

### Code Standards
- ESM modules required
- Comprehensive error handling
- Security-first approach
- Detailed logging
- Backward compatibility

## 📄 License

ISC License - See LICENSE file for details.

## 🆘 Support

For technical support or feature requests:
1. Check the troubleshooting section
2. Review the logs for error details
3. Ensure your configuration is correct
4. Verify all dependencies are installed

## 🚀 Future Enhancements

### Planned Features
- Multi-signature wallet support
- Additional cryptocurrency support (ETH, USDT)
- Advanced analytics dashboard
- Mobile app companion
- Hardware wallet integration
- DeFi protocol integration

### API Extensions
- WebSocket monitoring for real-time updates
- REST API for external integrations
- Webhook support for third-party services
- GraphQL interface for advanced queries

---

**Molotov Bot v2.0.0** - Production-ready cryptocurrency management with enterprise-grade security and the powerful Sidekick System.