// utils/uiOptimizer.js - UI/UX optimization for better mobile and desktop experience
import logger from './logger.js';

/**
 * UI Optimizer class for consistent, mobile-optimized interface design
 */
class UIOptimizer {
  constructor() {
    // Button design constants for optimal mobile experience
    this.MAX_BUTTON_LENGTH = 24; // Optimal for mobile screens
    this.MAX_BUTTONS_PER_ROW = 2; // Mobile-friendly layout
    this.EMOJI_SPACING = ' '; // Consistent emoji spacing
    
    // Message formatting constants
    this.MAX_MESSAGE_LENGTH = 4000; // Telegram limit with buffer
    this.SECTION_SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━';
    this.SUBSECTION_SEPARATOR = '────────────────────';
  }

  /**
   * Create optimized button layout for mobile and desktop
   * @param {Array} buttonData - Array of {text, callback_data, url} objects
   * @param {string} layout - 'grid', 'list', 'compact', 'payment'
   */
  createButtonLayout(buttonData, layout = 'grid') {
    const buttons = [];
    
    switch (layout) {
      case 'grid':
        return this.createGridLayout(buttonData);
      case 'list':
        return this.createListLayout(buttonData);
      case 'compact':
        return this.createCompactLayout(buttonData);
      case 'payment':
        return this.createPaymentLayout(buttonData);
      case 'navigation':
        return this.createNavigationLayout(buttonData);
      default:
        return this.createGridLayout(buttonData);
    }
  }

  /**
   * Grid layout - 2 buttons per row for mobile optimization
   */
  createGridLayout(buttonData) {
    const buttons = [];
    const optimizedButtons = buttonData.map(btn => this.optimizeButtonText(btn));
    
    for (let i = 0; i < optimizedButtons.length; i += 2) {
      const row = optimizedButtons.slice(i, i + 2);
      buttons.push(row);
    }
    
    return buttons;
  }

  /**
   * List layout - one button per row for important actions
   */
  createListLayout(buttonData) {
    return buttonData.map(btn => [this.optimizeButtonText(btn)]);
  }

  /**
   * Compact layout - up to 3 small buttons per row
   */
  createCompactLayout(buttonData) {
    const buttons = [];
    const optimizedButtons = buttonData.map(btn => this.optimizeButtonText(btn, true));
    
    for (let i = 0; i < optimizedButtons.length; i += 3) {
      const row = optimizedButtons.slice(i, i + 3);
      buttons.push(row);
    }
    
    return buttons;
  }

  /**
   * Payment layout - optimized for payment flow
   */
  createPaymentLayout(buttonData) {
    const buttons = [];
    
    // Payment methods (2 per row)
    const paymentMethods = buttonData.filter(btn => 
      btn.callback_data && btn.callback_data.includes('pay_')
    );
    
    // Action buttons (help, cancel, etc.)
    const actionButtons = buttonData.filter(btn => 
      btn.callback_data && !btn.callback_data.includes('pay_')
    );
    
    // Add payment methods in pairs
    for (let i = 0; i < paymentMethods.length; i += 2) {
      const row = paymentMethods.slice(i, i + 2).map(btn => this.optimizeButtonText(btn));
      buttons.push(row);
    }
    
    // Add action buttons in pairs
    for (let i = 0; i < actionButtons.length; i += 2) {
      const row = actionButtons.slice(i, i + 2).map(btn => this.optimizeButtonText(btn));
      buttons.push(row);
    }
    
    return buttons;
  }

  /**
   * Navigation layout - for main menu and back buttons
   */
  createNavigationLayout(buttonData) {
    const buttons = [];
    
    // Main actions first (2 per row)
    const mainActions = buttonData.filter(btn => 
      !btn.text.includes('🔙') && !btn.text.includes('❌') && !btn.url
    );
    
    // Links and external actions
    const linkActions = buttonData.filter(btn => btn.url);
    
    // Back and cancel buttons
    const navActions = buttonData.filter(btn => 
      btn.text.includes('🔙') || btn.text.includes('❌')
    );
    
    // Add main actions
    for (let i = 0; i < mainActions.length; i += 2) {
      const row = mainActions.slice(i, i + 2).map(btn => this.optimizeButtonText(btn));
      buttons.push(row);
    }
    
    // Add link actions (one per row for clarity)
    linkActions.forEach(btn => {
      buttons.push([this.optimizeButtonText(btn)]);
    });
    
    // Add navigation actions (2 per row if multiple)
    for (let i = 0; i < navActions.length; i += 2) {
      const row = navActions.slice(i, i + 2).map(btn => this.optimizeButtonText(btn));
      buttons.push(row);
    }
    
    return buttons;
  }

  /**
   * Optimize button text for better mobile experience
   */
  optimizeButtonText(button, compact = false) {
    let text = button.text.trim();
    const maxLength = compact ? 16 : this.MAX_BUTTON_LENGTH;
    
    // Ensure proper emoji spacing
    text = this.formatEmojis(text);
    
    // Truncate if too long
    if (text.length > maxLength) {
      text = text.substring(0, maxLength - 1) + '…';
    }
    
    return {
      text: text,
      callback_data: button.callback_data,
      url: button.url
    };
  }

  /**
   * Format emojis with consistent spacing
   */
  formatEmojis(text) {
    // Add space after emoji if not present
    return text.replace(/(\p{Emoji})\s*/gu, '$1 ').trim();
  }

  /**
   * Create optimized message text with proper formatting
   */
  formatMessage(title, content, options = {}) {
    const {
      addSeparator = false,
      addTimestamp = false,
      addFooter = null,
      maxLength = this.MAX_MESSAGE_LENGTH,
      style = 'default'
    } = options;
    
    let message = '';
    
    // Add title with style-appropriate formatting
    if (title) {
      if (style === 'compact') {
        message += `**${title}**\n\n`;
      } else {
        message += `**${title}**\n\n`;
      }
    }
    
    // Add content
    message += content;
    
    // Add separator (style-dependent)
    if (addSeparator) {
      if (style === 'compact') {
        message += `\n\n${'─'.repeat(20)}`;
      } else {
        message += `\n\n${this.SECTION_SEPARATOR}`;
      }
    }
    
    // Add timestamp
    if (addTimestamp) {
      const time = new Date().toLocaleString();
      message += `\n🕒 ${time}`;
    }
    
    // Add footer
    if (addFooter) {
      message += `\n\n${addFooter}`;
    }
    
    // Truncate if too long
    if (message.length > maxLength) {
      message = message.substring(0, maxLength - 4) + '...';
    }
    
    return message;
  }

  /**
   * Create category buttons with optimized layout
   */
  createCategoryButtons(categories, additionalButtons = []) {
    const categoryButtons = categories.map(cat => ({
      text: `📂 ${cat.name}`,
      callback_data: `cat_${cat.id}`
    }));
    
    const buttons = this.createGridLayout(categoryButtons);
    
    // Add additional buttons (contact, language, etc.) using navigation layout
    if (additionalButtons.length > 0) {
      const navButtons = this.createNavigationLayout(additionalButtons);
      buttons.push(...navButtons);
    }
    
    return buttons;
  }

  /**
   * Create product buttons with pagination
   */
  createProductButtons(products, currentPage, totalPages, categoryId, additionalButtons = []) {
    const productButtons = products.map(product => ({
      text: `🛍️ ${product.name} - $${product.price}`,
      callback_data: `buy_${product.id}`
    }));
    
    const buttons = this.createListLayout(productButtons);
    
    // Add pagination if needed
    if (totalPages > 1) {
      const paginationRow = [];
      
      if (currentPage > 1) {
        paginationRow.push({
          text: '⬅️ Prev',
          callback_data: `page_${categoryId}_${currentPage - 1}`
        });
      }
      
      paginationRow.push({
        text: `📄 ${currentPage}/${totalPages}`,
        callback_data: 'ignore'
      });
      
      if (currentPage < totalPages) {
        paginationRow.push({
          text: 'Next ➡️',
          callback_data: `page_${categoryId}_${currentPage + 1}`
        });
      }
      
      buttons.push(paginationRow);
    }
    
    // Add additional buttons
    if (additionalButtons.length > 0) {
      const navButtons = this.createNavigationLayout(additionalButtons);
      buttons.push(...navButtons);
    }
    
    return buttons;
  }

  /**
   * Create payment flow buttons
   */
  createPaymentButtons(productId, stage = 'select') {
    const buttons = [];
    
    switch (stage) {
      case 'select':
        buttons.push(
          [
            { text: '₿ Bitcoin', callback_data: `pay_btc_${productId}` },
            { text: '🪙 Litecoin', callback_data: `pay_ltc_${productId}` }
          ],
          [
            { text: '💡 Guide', callback_data: `guide_${productId}` },
            { text: '❌ Cancel', callback_data: `cancel_order_${productId}` }
          ],
          [
            { text: '🔙 Back to Store', callback_data: 'load_categories' }
          ]
        );
        break;
        
      case 'confirm':
        buttons.push(
          [
            { text: '✅ Confirm Payment', callback_data: `confirm_${productId}` },
            { text: '📋 Copy Address', callback_data: `copy_address_${productId}` }
          ],
          [
            { text: '💡 Help', callback_data: `help_payment_${productId}` },
            { text: '🔄 Check Status', callback_data: `status_${productId}` }
          ],
          [
            { text: '❌ Cancel Order', callback_data: `cancel_order_${productId}` }
          ]
        );
        break;
    }
    
    return buttons;
  }

  /**
   * Create admin panel buttons with organized layout
   */
  createAdminButtons(sections) {
    const buttons = [];
    
    // Group related sections
    const mainSections = sections.filter(s => s.priority === 'high');
    const secondarySections = sections.filter(s => s.priority === 'medium');
    const utilitySections = sections.filter(s => s.priority === 'low');
    
    // Add main sections (2 per row)
    for (let i = 0; i < mainSections.length; i += 2) {
      const row = mainSections.slice(i, i + 2);
      buttons.push(row);
    }
    
    // Add secondary sections
    for (let i = 0; i < secondarySections.length; i += 2) {
      const row = secondarySections.slice(i, i + 2);
      buttons.push(row);
    }
    
    // Add utility sections (3 per row for compact layout)
    for (let i = 0; i < utilitySections.length; i += 3) {
      const row = utilitySections.slice(i, i + 3);
      buttons.push(row);
    }
    
    return buttons;
  }

  /**
   * Format price display consistently
   */
  formatPrice(price, currency = 'USD') {
    const symbols = {
      'USD': '$',
      'BTC': '₿',
      'LTC': '🪙',
      'EUR': '€',
      'GBP': '£'
    };
    
    const symbol = symbols[currency] || currency;
    return `${symbol}${parseFloat(price).toFixed(2)}`;
  }

  /**
   * Create mobile-optimized admin button layout
   * @param {Array} sections - Array of section objects with text, callback_data, and priority
   * @returns {Array} 2D array of inline keyboard buttons optimized for mobile
   */
  createMobileAdminLayout(sections) {
    if (!sections || !Array.isArray(sections)) return [];

    // Group by priority with mobile-first approach
    const core = sections.filter(s => s.priority === 'core');
    const secondary = sections.filter(s => s.priority === 'secondary');
    const utility = sections.filter(s => s.priority === 'utility');

    const buttons = [];

    // Core functions: 2 per row (easy thumb access)
    for (let i = 0; i < core.length; i += 2) {
      const row = [core[i]];
      if (core[i + 1]) row.push(core[i + 1]);
      buttons.push(row);
    }

    // Secondary functions: 2 per row
    for (let i = 0; i < secondary.length; i += 2) {
      const row = [secondary[i]];
      if (secondary[i + 1]) row.push(secondary[i + 1]);
      buttons.push(row);
    }

    // Utility functions: 3 per row (compact)
    for (let i = 0; i < utility.length; i += 3) {
      const row = [utility[i]];
      if (utility[i + 1]) row.push(utility[i + 1]);
      if (utility[i + 2]) row.push(utility[i + 2]);
      buttons.push(row);
    }

    return buttons;
  }

  /**
   * Create admin-specific button layouts with priority organization
   * @param {Array} sections - Array of section objects with text, callback_data, and priority
   * @returns {Array} 2D array of inline keyboard buttons
   */
  createAdminButtons(sections) {
    if (!sections || !Array.isArray(sections)) return [];

    // Group by priority
    const highPriority = sections.filter(s => s.priority === 'high');
    const mediumPriority = sections.filter(s => s.priority === 'medium');
    const lowPriority = sections.filter(s => s.priority === 'low');

    const buttons = [];

    // High priority: 2 per row for important functions
    for (let i = 0; i < highPriority.length; i += 2) {
      const row = [highPriority[i]];
      if (highPriority[i + 1]) row.push(highPriority[i + 1]);
      buttons.push(row);
    }

    // Medium priority: 2 per row for moderate functions
    for (let i = 0; i < mediumPriority.length; i += 2) {
      const row = [mediumPriority[i]];
      if (mediumPriority[i + 1]) row.push(mediumPriority[i + 1]);
      buttons.push(row);
    }

    // Low priority: 3 per row for utilities
    for (let i = 0; i < lowPriority.length; i += 3) {
      const row = [lowPriority[i]];
      if (lowPriority[i + 1]) row.push(lowPriority[i + 1]);
      if (lowPriority[i + 2]) row.push(lowPriority[i + 2]);
      buttons.push(row);
    }

    return buttons;
  }

  /**
   * Create loading/status messages with consistent formatting
   */
  createStatusMessage(type, content, options = {}) {
    const icons = {
      'loading': '⏳',
      'success': '✅',
      'error': '❌',
      'info': 'ℹ️',
      'warning': '⚠️',
      'processing': '🔄'
    };
    
    const icon = icons[type] || 'ℹ️';
    
    return this.formatMessage(
      `${icon} ${content}`,
      options.details || '',
      options
    );
  }
}

// Create singleton instance
const uiOptimizer = new UIOptimizer();

export default uiOptimizer;
