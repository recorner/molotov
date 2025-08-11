// Enhanced message templates for improved UI/UX
// These templates are optimized for mobile-first design with better formatting

export const enhancedTemplates = {
  // Welcome and onboarding messages with better formatting
  welcome_message: "🚀 **Welcome to Molotov**\n\n💎 Your premium digital marketplace\n🔐 Secure • Fast • Reliable",
  
  welcome_back_enhanced: "👋 **Welcome back, {firstName}!**\n\n🏪 **Premium Digital Store**\n━━━━━━━━━━━━━━━━━━━━━\n\n🛒 **Available Products:**\n• ⚡ Instant Access Services\n• 📱 Verified Applications\n• 🌐 Premium Networks\n• 📞 Trusted Numbers\n\n💳 **Payment:** Bitcoin • Litecoin\n🛡️ **Security:** Maximum Level",
  
  // Category browsing with improved formatting
  categories_header: "🏪 **Store Categories**",
  categories_subtitle: "Select a category to browse products",
  
  // Product listings with better structure
  products_header: "🛍️ **Available Products**",
  product_item: "**{index}.** {name}\n💭 _{description}_\n💰 **{price}**",
  
  // Payment flow with enhanced clarity
  payment_header: "💳 **Payment Details**",
  order_summary_enhanced: "🧾 **Order Summary**\n━━━━━━━━━━━━━━━━━━━━━",
  payment_instructions: "📋 **Payment Instructions**\n\n💡 Follow these steps to complete your order:",
  
  // Status messages with better visual hierarchy
  status_processing: "🔄 **Processing...**\nPlease wait while we handle your request.",
  status_success: "✅ **Success!**\nYour request has been completed successfully.",
  status_error: "❌ **Error**\nSomething went wrong. Please try again.",
  
  // Button text optimized for mobile
  buttons: {
    browse_store: "🛍️ Browse Store",
    contact_support: "💬 Support",
    change_language: "🌍 Language",
    back: "🔙 Back",
    cancel: "❌ Cancel",
    confirm: "✅ Confirm",
    copy: "📋 Copy",
    help: "💡 Help",
    refresh: "🔄 Refresh"
  },
  
  // Payment method labels
  payment_methods: {
    bitcoin: "₿ Bitcoin",
    litecoin: "🪙 Litecoin",
    guide: "💡 Guide",
    help: "❓ Help"
  },
  
  // Loading and progress messages
  loading: "⏳ Loading...",
  processing_payment: "🔄 Processing payment verification...",
  generating_address: "🔐 Generating secure address...",
  
  // Error messages with helpful context
  errors: {
    network: "🌐 **Connection Error**\nPlease check your connection and try again.",
    payment: "💳 **Payment Error**\nThere was an issue processing your payment.",
    product_not_found: "🔍 **Product Not Found**\nThis product is no longer available.",
    invalid_selection: "⚠️ **Invalid Selection**\nPlease choose a valid option."
  },
  
  // Success messages with positive reinforcement
  success: {
    order_placed: "🎉 **Order Placed Successfully!**\nYou'll receive your product shortly.",
    payment_confirmed: "✅ **Payment Confirmed**\nThank you for your purchase!",
    language_updated: "🌍 **Language Updated**\nInterface is now in {language}."
  },
  
  // Admin messages with professional tone
  admin: {
    welcome: "🔧 **Admin Panel**\nManage your store with powerful tools.",
    stats: "📊 **Statistics**\nView detailed analytics and reports.",
    orders: "📦 **Orders**\nManage customer orders and deliveries."
  },
  
  // Time and date formatting
  time_formats: {
    order_time: "⏰ **Order Time:** {time}",
    estimated_delivery: "🚚 **Estimated Delivery:** {time}",
    last_updated: "🔄 **Last Updated:** {time}"
  }
};

// Message formatting utilities
export class MessageFormatter {
  static formatPrice(price, currency = 'USD') {
    const symbols = {
      'USD': '$',
      'BTC': '₿',
      'LTC': '🪙',
      'EUR': '€'
    };
    
    const symbol = symbols[currency] || currency;
    return `${symbol}${parseFloat(price).toFixed(2)}`;
  }
  
  static formatProductList(products) {
    return products.map((product, index) => 
      enhancedTemplates.product_item
        .replace('{index}', index + 1)
        .replace('{name}', product.name)
        .replace('{description}', product.description || 'No description')
        .replace('{price}', this.formatPrice(product.price))
    ).join('\n\n');
  }
  
  static formatOrderSummary(order) {
    return `${enhancedTemplates.order_summary_enhanced}\n\n` +
           `🛒 **Product:** ${order.product_name}\n` +
           `💰 **Price:** ${this.formatPrice(order.price)}\n` +
           `${enhancedTemplates.time_formats.order_time.replace('{time}', new Date().toLocaleString())}`;
  }
  
  static formatSection(title, content, options = {}) {
    const { addSeparator = false, addTimestamp = false } = options;
    
    let message = `**${title}**\n\n${content}`;
    
    if (addSeparator) {
      message += '\n\n━━━━━━━━━━━━━━━━━━━━━';
    }
    
    if (addTimestamp) {
      message += `\n\n🕒 ${new Date().toLocaleString()}`;
    }
    
    return message;
  }
  
  static createStatusMessage(type, title, details = '') {
    const icons = {
      loading: '⏳',
      success: '✅',
      error: '❌',
      info: 'ℹ️',
      warning: '⚠️'
    };
    
    const icon = icons[type] || 'ℹ️';
    return `${icon} **${title}**${details ? `\n\n${details}` : ''}`;
  }
}

export default enhancedTemplates;
