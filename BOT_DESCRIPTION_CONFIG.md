# Bot Description Configuration

## Overview
The bot's description, short description, and about text can now be configured via environment variables in your `.env` file.

## Environment Variables to Add

Add these variables to your `.env` file to customize your bot's description:

```env
# Bot Description and About Text (Customizable)
BOT_DESCRIPTION=🚀 Molotov Bot - Your premium digital marketplace for cryptocurrency products. Secure payments via Bitcoin and Litecoin. Browse verified accounts, proxy networks, phone numbers, and more. Trusted by professionals worldwide.

BOT_SHORT_DESCRIPTION=💎 Premium digital marketplace for crypto products. Secure, verified, trusted.

BOT_ABOUT_TEXT=🛒 Premium Digital Marketplace\n\n💎 Molotov Bot offers exclusive digital products and services for cryptocurrency payments. We specialize in verified accounts, proxy networks, phone numbers, and premium digital tools.\n\n🔐 Secure payments via Bitcoin & Litecoin\n🌍 Worldwide trusted platform\n⚡ Instant delivery\n🛡️ Professional support
```

## What Each Variable Controls

### `BOT_DESCRIPTION`
- **Where it appears**: Bot profile page when users view bot details
- **Character limit**: Up to 512 characters
- **Purpose**: Main description that explains what your bot does

### `BOT_SHORT_DESCRIPTION`
- **Where it appears**: Search results when users search for bots
- **Character limit**: Up to 120 characters  
- **Purpose**: Brief description for discovery

### `BOT_ABOUT_TEXT`
- **Where it appears**: When users use `/help` command
- **Character limit**: Up to 4096 characters
- **Purpose**: Detailed information about your bot and services

## Important Notes

1. **Line breaks**: Use `\n` for line breaks in your descriptions
2. **Emojis**: You can use emojis to make descriptions more attractive
3. **Markdown**: The about text supports Telegram markdown formatting
4. **Fallback**: If you don't set these variables, the bot will use default descriptions
5. **Multi-language**: These descriptions will be translated automatically for different user languages

## Usage

1. Add the variables to your `.env` file with your custom text
2. Restart your bot
3. The bot will automatically update its description in all supported languages

## Example Custom Configuration

```env
BOT_DESCRIPTION=🎯 YourBot - The ultimate crypto marketplace! Trade safely with Bitcoin & Litecoin. Premium accounts, tools & more. Trusted by 10K+ users worldwide!

BOT_SHORT_DESCRIPTION=⚡ Premium crypto marketplace. Safe, fast, trusted.

BOT_ABOUT_TEXT=🏪 Welcome to YourBot!\n\n🚀 We're the #1 marketplace for digital products with crypto payments.\n\n✅ What we offer:\n• Verified social media accounts\n• Private proxies & VPNs\n• Phone numbers & SMS\n• Digital tools & software\n\n💰 Payment methods:\n• Bitcoin (BTC)\n• Litecoin (LTC)\n\n🛡️ Why choose us:\n• 10,000+ satisfied customers\n• Instant delivery\n• 24/7 support\n• Money-back guarantee\n\nStart shopping now! 🛒
```