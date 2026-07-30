# Telegram Notification System

This document explains the systematic Telegram notification system for payment events.

## Overview

The system sends automatic notifications for:
1. **Payment Creation**: When a user initiates a new payment
2. **Payment Confirmation**: When a payment is successfully confirmed

## Architecture

### Standalone Bot Service
- Runs as a separate Docker container (`telegram-bot`)
- Independent of the main application
- Handles all Telegram communications
- Configured via environment variables

### Notification Flow
```
Payment Event → Notification Service → Bot Service → Telegram API
```

## Notification Recipients

### Admin Notifications (Always Sent)
- **Admin Personal Chat**: Direct messages to the configured admin
- **Admin Group**: Messages to the configured admin group (optional)

### User Notifications (Conditional)
- **Personal User Chat**: Only if user provided Telegram username and has linked account

## Configuration

### Environment Variables
Configure these in your `.env` file:

```env
# Required
TELEGRAM_BOT_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ
TELEGRAM_ADMIN_CHAT_ID=123456789

# Optional
TELEGRAM_ADMIN_GROUP_ID=-123456789
TELEGRAM_SUPPORT_CONTACT=@nova_chok
```

### Bot Commands
The bot supports these commands:
- `/start` - Welcome message and setup
- `/help` - Show available commands
- `/balance` - Check account balance (linked users only)
- `/link` - Link Telegram account to Neo Shop account
- `/unlink` - Unlink account
- `/status` - Bot status (admin only)

## Deployment

### Docker Compose
The bot service is included in docker-compose configurations:

```yaml
telegram-bot:
  restart: unless-stopped
  build:
    context: .
    dockerfile: Dockerfile.bot
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    - TELEGRAM_ADMIN_CHAT_ID=${TELEGRAM_ADMIN_CHAT_ID}
    - TELEGRAM_ADMIN_GROUP_ID=${TELEGRAM_ADMIN_GROUP_ID}
  depends_on:
    - postgres
```

### Manual Deployment
```bash
# Build bot image
docker build -f Dockerfile.bot -t neo-bot .

# Run bot container
docker run -d \
  --name neo-telegram-bot \
  --env-file .env \
  --network neo_default \
  neo-bot
```

## Message Templates

### Payment Created
```
💰 New Payment Created

👤 User: {username}
💵 Amount: ${amount}
🪙 Currency: {currency}
🆔 Payment ID: {payment_id}
📱 Telegram: {telegram_username or "Not provided"}

⏳ Waiting for payment confirmation...
```

### Payment Confirmed (Admin)
```
✅ Payment Confirmed!

👤 User: {username}
💰 Amount: ${amount}
🪙 Currency: {currency}
🆔 Payment ID: {payment_id}
💳 New Balance: ${new_balance}

🎉 Balance updated successfully!
```

### Payment Confirmed (User)
```
🎉 Payment Confirmed!

💰 Amount: ${amount}
🪙 Currency: {currency}
🆔 Payment ID: {payment_id}

Your balance has been updated! 🚀
```

## Setup Instructions

### 1. Create Telegram Bot
1. Message @BotFather on Telegram
2. Send `/newbot` and follow instructions
3. Copy the bot token to your `.env` file

### 2. Get Chat IDs
- **Personal**: Message @userinfobot or start your bot and check logs
- **Group**: Add bot to group, make it admin, get group ID (starts with -)

### 3. Configure Environment
Update your `.env` file:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ADMIN_CHAT_ID=your_chat_id_here
TELEGRAM_ADMIN_GROUP_ID=-group_id_here  # Optional
```

### 4. Deploy Bot Service
```bash
# Start the bot service
docker-compose up -d telegram-bot

# Check logs
docker-compose logs -f telegram-bot

# Restart after config changes
docker-compose restart telegram-bot
```

### 5. Verify Setup
1. Go to `/admin/telegram` in your admin panel
2. Check configuration status
3. Send a test notification
4. Message your bot with `/start`

## Monitoring

### Admin Panel
- Access `/admin/telegram` for configuration status
- View environment variable status
- Send test notifications
- Monitor bot health

### Logs
```bash
# Bot service logs
docker-compose logs -f telegram-bot

# Check for errors
docker-compose logs telegram-bot | grep -i error
```

### Health Checks
The bot service includes health checks:
- Docker health check every 30 seconds
- Bot status command for admins
- Automatic restart on failure

## Troubleshooting

### Bot Not Responding
1. Check bot token is correct
2. Verify bot is running: `docker-compose ps telegram-bot`
3. Check logs: `docker-compose logs telegram-bot`
4. Restart: `docker-compose restart telegram-bot`

### Messages Not Sending
1. Verify chat IDs are correct
2. Check bot has permission to send messages
3. Ensure bot is admin in groups
4. Test with `/status` command

### Configuration Issues
1. Check environment variables are set
2. Verify `.env` file format
3. Restart services after changes
4. Use admin panel to verify status

## Technical Implementation

### Files
- `bot/telegram-bot.js`: Standalone bot service
- `bot/package.json`: Bot dependencies
- `Dockerfile.bot`: Bot container configuration
- `src/lib/telegram-notifications.ts`: Notification service
- `src/routes/(main)/admin/telegram/+page.svelte`: Admin interface

### Integration Points
- `src/routes/api/payment/+server.ts`: Calls `notifyPaymentCreated()`
- `src/routes/api/payment/ipn/+server.ts`: Calls `notifyPaymentConfirmed()`

### Error Handling
- All Telegram API calls are wrapped in try-catch
- Failures are logged but don't interrupt payment processing
- Fallback console logging for all notifications
- Graceful degradation when bot is unavailable

## Security

### Bot Token Security
- Store token in environment variables only
- Never commit tokens to version control
- Rotate tokens periodically
- Use least-privilege bot permissions

### Chat ID Privacy
- Chat IDs are stored securely in database
- Only visible to administrators
- Users can unlink accounts at any time

## Future Enhancements

1. **Rich Message Formatting**: Buttons, keyboards, and inline menus
2. **Multiple Admin Support**: Support for multiple admin chat IDs
3. **Notification Preferences**: User-configurable notification types
4. **Bot Analytics**: Message delivery stats and user engagement
5. **Advanced Commands**: Balance operations, order status, etc.
6. **Webhook Support**: Alternative to polling for better performance
