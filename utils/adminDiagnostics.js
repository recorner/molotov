// utils/adminDiagnostics.js
import logger from './logger.js';

/**
 * Admin Diagnostics Utility
 * Helps diagnose and fix admin callback issues
 */
class AdminDiagnostics {
  
  /**
   * Analyze callback data and provide diagnostic information
   * @param {string} callbackData - The callback data received
   * @param {number} userId - User ID who clicked
   * @returns {object} Diagnostic information
   */
  analyzeCallback(callbackData, userId) {
    const analysis = {
      raw: callbackData,
      userId: userId,
      timestamp: new Date().toISOString(),
      isValid: false,
      issues: [],
      suggestions: []
    };

    if (!callbackData) {
      analysis.issues.push('Callback data is empty or null');
      analysis.suggestions.push('This indicates a corrupted button');
      return analysis;
    }

    // Check if it's an admin action
    if (callbackData.startsWith('admin_')) {
      analysis.type = 'admin_action';
      
      const parts = callbackData.split('_');
      analysis.parts = parts;
      
      if (parts.length < 4) {
        analysis.issues.push(`Incomplete admin action: expected 4 parts, got ${parts.length}`);
        analysis.issues.push(`Parts: [${parts.join(', ')}]`);
        
        if (parts.length === 2) {
          analysis.suggestions.push('This appears to be a truncated callback from an old or corrupted message');
          analysis.suggestions.push('Admin should find the latest payment notification');
        }
      } else {
        analysis.action = parts[1];
        analysis.orderId = parts[2];
        analysis.targetUserId = parts[3];
        analysis.isValid = true;
        
        // Validate data types
        if (isNaN(analysis.orderId)) {
          analysis.issues.push(`Order ID is not a number: ${analysis.orderId}`);
          analysis.isValid = false;
        }
        
        if (isNaN(analysis.targetUserId)) {
          analysis.issues.push(`Target User ID is not a number: ${analysis.targetUserId}`);
          analysis.isValid = false;
        }
      }
    }
    
    return analysis;
  }

  /**
   * Generate a helpful error message for admins
   * @param {object} analysis - Analysis from analyzeCallback
   * @returns {string} User-friendly error message
   */
  generateErrorMessage(analysis) {
    if (analysis.isValid) {
      return null; // No error
    }

    let message = '🔧 **Admin Action Diagnostic**\n\n';
    message += `❌ **Issue Detected**\n`;
    message += `📋 **Callback Data:** \`${analysis.raw}\`\n`;
    message += `⏰ **Time:** ${new Date(analysis.timestamp).toLocaleString()}\n\n`;
    
    if (analysis.issues.length > 0) {
      message += `🔍 **Problems Found:**\n`;
      analysis.issues.forEach(issue => {
        message += `• ${issue}\n`;
      });
      message += '\n';
    }
    
    if (analysis.suggestions.length > 0) {
      message += `💡 **Solutions:**\n`;
      analysis.suggestions.forEach(suggestion => {
        message += `• ${suggestion}\n`;
      });
      message += '\n';
    }
    
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🔄 **How to Fix:**\n`;
    message += `1. Find the latest payment notification\n`;
    message += `2. Use the buttons from that message\n`;
    message += `3. If no recent notifications, ask customer to resend payment confirmation\n`;
    message += `4. Contact technical support if issue persists`;
    
    return message;
  }

  /**
   * Log diagnostic information
   * @param {object} analysis - Analysis from analyzeCallback
   */
  logDiagnostic(analysis) {
    logger.warn('ADMIN_DIAGNOSTIC', 'Callback analysis', {
      raw: analysis.raw,
      userId: analysis.userId,
      type: analysis.type,
      isValid: analysis.isValid,
      issues: analysis.issues,
      parts: analysis.parts
    });
  }
}

// Export singleton instance
const adminDiagnostics = new AdminDiagnostics();
export default adminDiagnostics;
