# Telegram Bot Integration - Deployment Guide

## Overview

This guide walks you through setting up a production-grade Telegram login system with webhook integration, session management, and secure authentication flows.

## Features

✅ **Production-Ready Telegram Bot**
- Webhook-based message handling
- Secure 6-digit login codes
- Session management with auto-expiry
- Account linking/unlinking
- Comprehensive error handling

✅ **Enhanced Login System**
- Regular username/password login
- Telegram-based instant login
- Two-factor authentication support
- Secure session management

✅ **Registration Flow**
- Fixed success handling
- Backup codes generation
- Seamless redirect to login

## Setup Instructions

### 1. Create Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Create a new bot with `/newbot`
3. Choose a name and username for your bot
4. Save the bot token from BotFather

### 2. Configure Environment Variables

Update your `.env` file:

```bash
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_here
PUBLIC_APP_URL=https://your-domain.com
TELEGRAM_WEBHOOK_SECRET=your_secure_webhook_secret

# Optional
TELEGRAM_SESSION_TIMEOUT=300000  # 5 minutes in milliseconds
```

### 3. Database Migration

The system automatically adds Telegram session tables:

```bash
npx prisma migrate deploy
```

### 4. Deploy the Application

#### Option A: Docker Deployment

```bash
# Build and start
docker-compose up -d

# The bot will auto-initialize via startup.sh
```

#### Option B: Manual Deployment

```bash
# Install dependencies
pnpm install

# Build application
pnpm run build

# Initialize bot
pnpm run bot:init

# Start application
node build/index.js
```

### 5. Configure Webhook

#### Automatic (Recommended)
The bot automatically sets up webhooks when `PUBLIC_APP_URL` is configured.

#### Manual
```bash
# Set webhook
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${PUBLIC_APP_URL}/api/telegram/webhook\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\"
  }"
```

### 6. Test the Integration

1. **Find your bot**: Search for your bot username on Telegram
2. **Start conversation**: Send `/start` to the bot
3. **Link account**: Use `/link` and follow instructions
4. **Test login**: Use `/login` to get a 6-digit code
5. **Login**: Use the code on your website's login page

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and main menu |
| `/link` | Link Telegram account with website username |
| `/login` | Generate 6-digit login code |
| `/status` | Check session status and active codes |
| `/unlink` | Disconnect Telegram from account |
| `/help` | Show detailed help information |

## API Endpoints

### Webhook Endpoint
- **URL**: `/api/telegram/webhook`
- **Method**: `POST`
- **Purpose**: Receives updates from Telegram
- **Security**: Validates webhook secret token

### Bot Management
- **URL**: `/api/telegram/bot`
- **Methods**: `GET`, `POST`
- **Actions**: 
  - `start` - Initialize bot and set webhook
  - `stop` - Stop bot
  - `status` - Check bot status
  - `cleanup` - Clean expired sessions

## Security Features

### Session Management
- ✅ 5-minute session expiry
- ✅ Single-use login codes
- ✅ Automatic cleanup of expired sessions
- ✅ User session isolation

### Authentication
- ✅ Webhook secret validation
- ✅ JWT-based user authentication
- ✅ Secure password hashing with Argon2
- ✅ Rate limiting protection

### Data Protection
- ✅ No sensitive data stored in Telegram
- ✅ Encrypted database connections
- ✅ Secure environment variable handling

## Maintenance

### Session Cleanup
Run daily to clean expired sessions:
```bash
pnpm run cleanup:sessions
```

### Bot Status Check
```bash
pnpm run bot:status
```

### Restart Bot
```bash
pnpm run bot:webhook
```

## Troubleshooting

### Common Issues

#### Bot Not Responding
1. Check bot token in environment variables
2. Verify webhook URL is accessible
3. Check webhook secret configuration
4. Review server logs for errors

#### Login Codes Not Working
1. Verify session hasn't expired (5 minutes)
2. Check database connectivity
3. Ensure code hasn't been used already
4. Validate session cleanup isn't too aggressive

#### Webhook Failures
1. Confirm HTTPS is properly configured
2. Check webhook secret matches
3. Verify content-type headers
4. Review Telegram webhook logs

### Debug Commands

```bash
# Check webhook info
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# Get bot info
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# Check application logs
docker logs -f neo_app_1

# Database session query
npx prisma studio
```

## Production Considerations

### Load Balancing
- Use sticky sessions for webhook handling
- Consider Redis for session storage in multi-instance deployments

### Monitoring
- Set up alerts for webhook failures
- Monitor session creation/cleanup rates
- Track login success/failure rates

### Backup
- Regular database backups
- Environment variable backup
- Bot configuration documentation

### Security
- Regular bot token rotation
- Webhook secret updates
- SSL certificate monitoring
- Access log monitoring

## Performance Optimization

1. **Database Indexing**: Sessions are indexed on critical fields
2. **Cleanup Automation**: Cron job for session cleanup
3. **Connection Pooling**: Prisma handles database connections
4. **Webhook Validation**: Early validation prevents unnecessary processing

## Support

For issues or questions:
1. Check application logs
2. Review Telegram webhook status
3. Verify environment configuration
4. Test with development bot first

---

**Security Note**: Always use HTTPS in production and keep your bot token secure. Never commit tokens to version control.
