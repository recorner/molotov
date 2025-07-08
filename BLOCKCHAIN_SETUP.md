# 🚀 Production Blockchain Monitoring Setup Guide

## 📋 Overview
The bot now uses **real production APIs** for blockchain monitoring instead of mock data. All APIs are configurable via environment variables.

## 🔧 Required API Keys

### 1. **Blockchair API** (Recommended)
- **Website**: https://blockchair.com/api
- **Free Tier**: 100 requests/day
- **Paid Plans**: Starting at $99/month for unlimited requests
- **Supports**: Bitcoin, Litecoin, and 15+ other cryptocurrencies
- **Features**: Address monitoring, transaction details, block data

### 2. **BlockCypher API** (Optional)
- **Website**: https://accounts.blockcypher.com/
- **Free Tier**: 200 requests/hour, 5 requests/second
- **Paid Plans**: Starting at $85/month for 10,000 requests/hour
- **Supports**: Bitcoin, Litecoin, Dogecoin
- **Features**: Real-time webhooks, transaction broadcasting

### 3. **Free APIs** (No API Key Required)
- **Blockstream.info**: Bitcoin-only, very reliable
- **Mempool.space**: Bitcoin-only, excellent uptime
- **Rate Limits**: Usually 1-10 requests/second

## 🛠️ Setup Instructions

### Step 1: Get API Keys
1. Sign up for Blockchair API at https://blockchair.com/api
2. (Optional) Sign up for BlockCypher at https://accounts.blockcypher.com/
3. Copy your API keys securely

### Step 2: Configure Environment
1. Copy the example environment file:
   ```bash
   cp env_template.txt .env
   ```

2. Edit `.env` and add your API keys:
   ```bash
   # Required for enhanced monitoring
   BLOCKCHAIR_API_KEY=your_blockchair_api_key_here
   
   # Optional for additional redundancy
   BLOCKCYPHER_API_KEY=your_blockcypher_api_key_here
   
   # Monitoring frequency (30 seconds = 30000ms)
   BLOCKCHAIN_CHECK_INTERVAL=30000
   ```

### Step 3: Verify Setup
1. Start the bot: `node bot.js`
2. Check logs for: `Production blockchain monitoring started`
3. Verify API connectivity in Sidekick Dashboard

## 📊 Monitoring Features

### Real-Time Transaction Detection
- ✅ Monitors Bitcoin addresses via Blockstream.info
- ✅ Monitors Litecoin addresses via Blockchair
- ✅ Automatic failover between API providers
- ✅ Duplicate transaction prevention
- ✅ Configurable check intervals

### Enhanced Dashboard
- ✅ System uptime and memory usage
- ✅ Transaction statistics (24h, 7d, total)
- ✅ API status monitoring
- ✅ Payout statistics
- ✅ Database metrics

### Production-Ready Features
- ✅ Rate limiting compliance
- ✅ Error handling and retry logic
- ✅ Comprehensive logging
- ✅ API key rotation support
- ✅ Webhook integration ready

## 🔍 API Endpoints Used

### Bitcoin APIs
```
Primary: https://blockstream.info/api
Fallback: https://mempool.space/api
Enhanced: https://api.blockchair.com/bitcoin
```

### Litecoin APIs
```
Primary: https://api.blockchair.com/litecoin
Fallback: https://api.blockcypher.com/v1/ltc/main
```

## 📈 Rate Limits & Recommendations

### Free Tier Usage
- **Blockstream/Mempool**: ~2-3 requests per check
- **Recommended Interval**: 30-60 seconds
- **Addresses Supported**: Up to 50 addresses

### Paid Tier Usage
- **Blockchair Premium**: Unlimited requests
- **Recommended Interval**: 15-30 seconds  
- **Addresses Supported**: Unlimited

### Best Practices
1. Start with free APIs for testing
2. Upgrade to paid APIs for production
3. Monitor API usage in dashboard
4. Set up alerts for API failures

## 🚨 Error Handling

The system includes comprehensive error handling:
- **API Failures**: Automatic failover to backup APIs
- **Rate Limiting**: Intelligent backoff and retry
- **Network Issues**: Graceful degradation
- **Invalid Responses**: Data validation and sanitization

## 🔐 Security Features

- **API Key Protection**: Environment variables only
- **Request Signing**: For APIs that support it
- **SSL/TLS**: All API calls use HTTPS
- **Data Validation**: All API responses validated

## 📞 Support

If you encounter issues:
1. Check the logs for specific API errors
2. Verify your API keys are valid
3. Test API endpoints manually
4. Check rate limit status in dashboard

## 🎯 Next Steps

1. **Set up your API keys** using the instructions above
2. **Test the monitoring** by sending test transactions
3. **Configure webhooks** for real-time notifications (coming soon)
4. **Set up monitoring alerts** for production deployment

---
*The bot is now production-ready with real blockchain monitoring! 🚀*
