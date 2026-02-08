// utils/instantTranslationService.js - Ultra-fast translation service with Redis
import redisTranslationCache from './redisTranslationCache.js';
import translationService from './translationService.js';
import logger from './logger.js';

class InstantTranslationService {
  constructor() {
    this.fallbackToLibreTranslate = true;
    this.isRedisEnabled = process.env.TRANSLATION_CACHE_ENABLED === 'true';
    this.instantMode = process.env.INSTANT_RESPONSE_MODE === 'true';
  }

  // Initialize the instant translation service
  async initialize() {
    try {
      if (this.isRedisEnabled) {
        const redisInitialized = await redisTranslationCache.initialize();
        if (!redisInitialized) {
          logger.warn('INSTANT_TRANS', 'Redis cache not available, using memory fallback');
          this.isRedisEnabled = false;
        }
      }

      logger.info('INSTANT_TRANS', `Instant translation service initialized (Redis: ${this.isRedisEnabled})`);
      return true;

    } catch (error) {
      logger.warn('INSTANT_TRANS', `Initialization error: ${error.message}`);
      return false;
    }
  }

  // Get translation with instant response
  async getTranslation(templateKey, language, templateText = null) {
    // English is always instant (no translation needed)
    if (language === 'en' || !language) {
      return templateText || templateKey;
    }

    // Skip if language is not enabled in env
    if (!translationService.isLanguageEnabled(language)) {
      return templateText || templateKey;
    }

    try {
      // 1. Try Redis cache first (instant response)
      if (this.isRedisEnabled) {
        const cachedTranslation = await redisTranslationCache.getTranslation(templateKey, language);
        if (cachedTranslation) {
          return cachedTranslation;
        }
      }

      // 2. Use translationService.translate() which checks:
      //    - preloadedUI (in-memory, instant)
      //    - runtime cache (in-memory, instant)
      //    - fallback hardcoded translations (instant)
      //    - LibreTranslate API (only if available, skipped in instant mode)
      if (templateText) {
        const translation = await translationService.translate(templateText, language);
        
        if (translation && translation !== templateText) {
          // Cache the successful translation in Redis for next time
          if (this.isRedisEnabled) {
            await redisTranslationCache.setTranslation(templateKey, language, translation).catch(() => {});
          }
          return translation;
        }
      }

      // 3. Final fallback to English
      return templateText || templateKey;

    } catch (error) {
      logger.warn('INSTANT_TRANS', `Error getting translation for ${templateKey}:${language} - ${error.message}`);
      return templateText || templateKey;
    }
  }

  // Pre-load translations into Redis cache
  async preloadTranslationsToRedis(translationsData) {
    if (!this.isRedisEnabled) {
      logger.warn('INSTANT_TRANS', 'Redis not enabled, cannot preload translations');
      return false;
    }

    try {
      await redisTranslationCache.loadPrebuiltTranslations(translationsData);
      logger.info('INSTANT_TRANS', 'Pre-built translations loaded into Redis cache');
      return true;

    } catch (error) {
      logger.warn('INSTANT_TRANS', `Error preloading translations: ${error.message}`);
      return false;
    }
  }

  // Cache a single translation
  async cacheTranslation(templateKey, language, translation) {
    if (!this.isRedisEnabled) {
      return false;
    }

    try {
      return await redisTranslationCache.setTranslation(templateKey, language, translation);
    } catch (error) {
      logger.warn('INSTANT_TRANS', `Error caching translation: ${error.message}`);
      return false;
    }
  }

  // Remove all cached translations for a specific language from Redis
  async removeLanguageFromRedis(langCode) {
    if (!this.isRedisEnabled) return false;
    try {
      return await redisTranslationCache.removeLanguage(langCode);
    } catch (error) {
      logger.warn('INSTANT_TRANS', `Error removing ${langCode} from Redis: ${error.message}`);
      return false;
    }
  }

  // Get cache statistics
  async getCacheStats() {
    if (!this.isRedisEnabled) {
      return { enabled: false };
    }

    try {
      const stats = await redisTranslationCache.getStats();
      return { enabled: true, ...stats };
    } catch (error) {
      logger.warn('INSTANT_TRANS', `Error getting cache stats: ${error.message}`);
      return { enabled: true, error: error.message };
    }
  }

  // Warm up cache for specific language
  async warmupLanguage(language, messageTemplates) {
    if (!this.isRedisEnabled || language === 'en') {
      return false;
    }

    try {
      let warmedCount = 0;
      
      for (const [templateKey, templateText] of Object.entries(messageTemplates)) {
        const hasCache = await redisTranslationCache.hasTranslation(templateKey, language);
        
        if (!hasCache) {
          // Translate and cache
          const translation = await translationService.translate(templateText, language);
          if (translation && translation !== templateText) {
            await redisTranslationCache.setTranslation(templateKey, language, translation);
            warmedCount++;
          }
        }
      }

      if (warmedCount > 0) {
        logger.info('INSTANT_TRANS', `Warmed up ${warmedCount} translations for ${language}`);
      }

      return warmedCount;

    } catch (error) {
      logger.warn('INSTANT_TRANS', `Error warming up ${language}: ${error.message}`);
      return 0;
    }
  }

  // Clear all cached translations
  async clearCache() {
    if (!this.isRedisEnabled) {
      return false;
    }

    try {
      return await redisTranslationCache.clearCache();
    } catch (error) {
      logger.warn('INSTANT_TRANS', `Error clearing cache: ${error.message}`);
      return false;
    }
  }

  // Get supported languages from translationService (single source of truth from env)
  getSupportedLanguages() {
    return translationService.getEnabledCodes().filter(c => c !== 'en');
  }

  // Check if language is supported
  isLanguageSupported(language) {
    return translationService.isLanguageEnabled(language);
  }

  // Whether product/category names should be translated
  shouldTranslateNames() {
    return translationService.shouldTranslateNames();
  }
}

// Create singleton instance
const instantTranslationService = new InstantTranslationService();

export default instantTranslationService;
