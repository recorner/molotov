// utils/languageStats.js - Language statistics and analytics
import { db } from '../database.js';
import logger from './logger.js';
import translationService from './translationService.js';

class LanguageStatsManager {
  constructor() {
    this.updateInterval = 60 * 60 * 1000; // Update every hour
    this.startPeriodicUpdates();
  }

  // Update language usage statistics
  async updateLanguageStats() {
    return new Promise((resolve, reject) => {
      // Get current user language distribution
      db.all(`
        SELECT 
          language_code, 
          COUNT(*) as user_count,
          COUNT(CASE WHEN last_activity > datetime('now', '-7 days') THEN 1 END) as active_users,
          COUNT(CASE WHEN last_activity > datetime('now', '-1 day') THEN 1 END) as daily_users
        FROM users 
        WHERE language_code IS NOT NULL 
        GROUP BY language_code
        ORDER BY user_count DESC
      `, [], (err, rows) => {
        if (err) {
          logger.error('LANG_STATS', 'Failed to fetch language stats', err);
          reject(err);
          return;
        }

        // Update or insert language statistics
        rows.forEach(row => {
          db.run(`
            INSERT OR REPLACE INTO language_stats 
            (language_code, user_count, active_users, daily_users, last_updated) 
            VALUES (?, ?, ?, ?, ?)
          `, [
            row.language_code, 
            row.user_count, 
            row.active_users || 0,
            row.daily_users || 0,
            new Date().toISOString()
          ], (err) => {
            if (err) {
              logger.error('LANG_STATS', `Failed to update stats for ${row.language_code}`, err);
            }
          });
        });

        logger.info('LANG_STATS', `Updated statistics for ${rows.length} languages`);
        resolve(rows);
      });
    });
  }

  // Get language statistics for admin panel
  async getLanguageStats() {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          ls.*,
          CASE 
            WHEN ls.user_count > 0 THEN 
              ROUND((ls.active_users * 100.0 / ls.user_count), 2) 
            ELSE 0 
          END as activity_rate
        FROM language_stats ls
        ORDER BY ls.user_count DESC
      `, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []); // Return empty array if no results
        }
      });
    });
  }

  // Get top languages by user count
  async getTopLanguages(limit = 10) {
    const stats = await this.getLanguageStats();
    return stats.slice(0, limit);
  }

  // Get language diversity metrics
  async getLanguageDiversity() {
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(DISTINCT language_code) as total_languages,
          COUNT(*) as total_users,
          MAX(user_count) as max_users_per_lang,
          AVG(user_count) as avg_users_per_lang
        FROM language_stats
      `, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Format language statistics for admin display
  async formatLanguageReport() {
    try {
      const stats = await this.getLanguageStats();
      const diversity = await this.getLanguageDiversity();
      const supportedLanguages = translationService.getSupportedLanguages();

      let report = `📊 *Language Statistics Report*\n\n`;
      report += `🌍 Total Languages: ${diversity.total_languages}\n`;
      report += `👥 Total Users: ${diversity.total_users}\n`;
      report += `📈 Avg Users/Language: ${Math.round(diversity.avg_users_per_lang || 0)}\n\n`;

      report += `🏆 *Top Languages:*\n`;
      
      stats.slice(0, 10).forEach((lang, index) => {
        const langInfo = supportedLanguages[lang.language_code];
        const flag = langInfo?.flag || '🌐';
        const name = langInfo?.name || lang.language_code;
        
        report += `${index + 1}. ${flag} ${name}\n`;
        report += `   👥 ${lang.user_count} users (${lang.activity_rate}% active)\n`;
        report += `   📅 ${lang.daily_users} daily, ${lang.active_users} weekly\n\n`;
      });

      // Revenue potential analysis
      report += `💰 *Revenue Insights:*\n`;
      
      const topMarkets = stats.slice(0, 5);
      let totalPotential = 0;
      
      topMarkets.forEach(lang => {
        const langInfo = supportedLanguages[lang.language_code];
        const marketMultiplier = this.getMarketMultiplier(lang.language_code);
        const potential = lang.user_count * marketMultiplier;
        totalPotential += potential;
        
        report += `${langInfo?.flag || '🌐'} ${langInfo?.name || lang.language_code}: `;
        report += `$${potential.toFixed(0)} potential/month\n`;
      });
      
      report += `\n💎 Total Market Potential: $${totalPotential.toFixed(0)}/month\n`;

      return report;
    } catch (error) {
      logger.error('LANG_STATS', 'Failed to format language report', error);
      return '❌ Error generating language report';
    }
  }

  // Get market multiplier based on language/region
  getMarketMultiplier(languageCode) {
    const multipliers = {
      'en': 50,   // English - Premium market
      'ru': 75,   // Russian - High-value crypto market
      'zh': 100,  // Chinese - Largest potential market
      'de': 80,   // German - Strong economy
      'fr': 60,   // French - Developed market
      'es': 40,   // Spanish - Large user base
      'it': 55,   // Italian - Good economy
      'pt': 35,   // Portuguese - Growing market
      'pl': 30,   // Polish - Emerging market
      'tr': 25,   // Turkish - Developing market
      'ar': 45,   // Arabic - Oil economies
      'ja': 90,   // Japanese - Tech-savvy market
      'ko': 70,   // Korean - High tech adoption
      'hi': 20,   // Hindi - Large but price-sensitive
      'nl': 65,   // Dutch - Strong economy
      'sv': 70,   // Swedish - High income
      'no': 85,   // Norwegian - Very high income
      'da': 75,   // Danish - Strong economy
      'fi': 65,   // Finnish - Tech-forward
      'uk': 40    // Ukrainian - Emerging market
    };
    
    return multipliers[languageCode] || 30; // Default for unlisted languages
  }

  // Start periodic statistics updates
  startPeriodicUpdates() {
    // Update immediately
    this.updateLanguageStats().catch(err => {
      logger.error('LANG_STATS', 'Initial stats update failed', err);
    });

    // Then update every hour
    setInterval(() => {
      this.updateLanguageStats().catch(err => {
        logger.error('LANG_STATS', 'Periodic stats update failed', err);
      });
    }, this.updateInterval);

    logger.info('LANG_STATS', 'Started periodic language statistics updates');
  }

  // Track user language changes
  async trackLanguageChange(userId, oldLang, newLang) {
    try {
      // Log the change
      logger.info('LANG_STATS', `User ${userId} changed language from ${oldLang} to ${newLang}`);
      
      // Update user's language change timestamp
      db.run(
        'UPDATE users SET language_updated_at = ? WHERE telegram_id = ?',
        [new Date().toISOString(), userId],
        (err) => {
          if (err) {
            logger.error('LANG_STATS', 'Failed to update language change timestamp', err);
          }
        }
      );

      // Trigger stats update
      setTimeout(() => this.updateLanguageStats(), 5000);
      
    } catch (error) {
      logger.error('LANG_STATS', 'Failed to track language change', error);
    }
  }

  // Get translation cache statistics
  async getTranslationCacheStats() {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          target_language,
          COUNT(*) as cached_translations,
          AVG(hit_count) as avg_hits,
          MAX(created_at) as last_update
        FROM translation_cache 
        WHERE expires_at > datetime('now')
        GROUP BY target_language
        ORDER BY cached_translations DESC
      `, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

// Create singleton instance
const languageStatsManager = new LanguageStatsManager();

export default languageStatsManager;
