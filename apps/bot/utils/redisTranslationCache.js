// utils/redisTranslationCache.js - Instant Redis-based translation cache
import Redis from 'ioredis';
import logger from './logger.js';

class RedisTranslationCache {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.translationPrefix = 'molotov:translation:';
    this.metadataKey = 'molotov:translation:metadata';
    this.defaultTTL = process.env.REDIS_TRANSLATION_TTL || 86400; // 24 hours
  }

  // Initialize Redis connection
  async initialize() {
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        db: parseInt(process.env.REDIS_DB) || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      };

      if (process.env.REDIS_PASSWORD) {
        redisConfig.password = process.env.REDIS_PASSWORD;
      }

      this.redis = new Redis(redisConfig);

      // Event handlers
      this.redis.on('connect', () => {
        this.isConnected = true;
        logger.info('REDIS', 'Connected to Redis server');
      });

      this.redis.on('error', (err) => {
        this.isConnected = false;
        logger.warn('REDIS', `Redis connection error: ${err.message}`);
      });

      this.redis.on('close', () => {
        this.isConnected = false;
        logger.warn('REDIS', 'Redis connection closed');
      });

      // Test connection
      await this.redis.ping();
      this.isConnected = true;
      
      logger.info('REDIS', 'Redis translation cache initialized successfully');
      return true;

    } catch (error) {
      logger.warn('REDIS', `Failed to initialize Redis: ${error.message}`);
      this.isConnected = false;
      return false;
    }
  }

  // Create cache key
  createKey(templateKey, language) {
    return `${this.translationPrefix}${language}:${templateKey}`;
  }

  // Get translation from cache (instant)
  async getTranslation(templateKey, language) {
    if (!this.isConnected || !this.redis) {
      return null;
    }

    try {
      const key = this.createKey(templateKey, language);
      const translation = await this.redis.get(key);
      
      if (translation) {
        logger.debug('REDIS', `Cache HIT: ${templateKey}:${language}`);
        return translation;
      }
      
      logger.debug('REDIS', `Cache MISS: ${templateKey}:${language}`);
      return null;

    } catch (error) {
      logger.warn('REDIS', `Error getting translation: ${error.message}`);
      return null;
    }
  }

  // Set translation in cache
  async setTranslation(templateKey, language, translation, ttl = null) {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const key = this.createKey(templateKey, language);
      const expiry = ttl || this.defaultTTL;
      
      await this.redis.setex(key, expiry, translation);
      logger.debug('REDIS', `Cached: ${templateKey}:${language}`);
      return true;

    } catch (error) {
      logger.warn('REDIS', `Error setting translation: ${error.message}`);
      return false;
    }
  }

  // Bulk set translations (for pre-loading)
  async bulkSetTranslations(translations, ttl = null) {
    if (!this.isConnected || !this.redis || !translations || translations.length === 0) {
      return false;
    }

    try {
      const pipeline = this.redis.pipeline();
      const expiry = ttl || this.defaultTTL;
      let count = 0;

      for (const { templateKey, language, translation } of translations) {
        const key = this.createKey(templateKey, language);
        pipeline.setex(key, expiry, translation);
        count++;
      }

      await pipeline.exec();
      logger.info('REDIS', `Bulk cached ${count} translations`);
      return true;

    } catch (error) {
      logger.warn('REDIS', `Error bulk setting translations: ${error.message}`);
      return false;
    }
  }

  // Load pre-built translations into Redis
  async loadPrebuiltTranslations(translationsData) {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const startTime = Date.now();
      const translations = [];

      // Convert pre-built data to Redis format
      for (const [language, templates] of Object.entries(translationsData)) {
        if (language === 'en') continue; // Skip English (default)
        
        for (const [templateKey, translation] of Object.entries(templates)) {
          translations.push({
            templateKey,
            language,
            translation
          });
        }
      }

      // Bulk load into Redis
      await this.bulkSetTranslations(translations);

      // Store metadata
      const metadata = {
        loadTime: new Date().toISOString(),
        translationCount: translations.length,
        languages: Object.keys(translationsData).filter(lang => lang !== 'en'),
        loadDuration: Date.now() - startTime
      };

      await this.redis.setex(this.metadataKey, this.defaultTTL, JSON.stringify(metadata));

      logger.info('REDIS', `Loaded ${translations.length} pre-built translations in ${Date.now() - startTime}ms`);
      return true;

    } catch (error) {
      logger.warn('REDIS', `Error loading pre-built translations: ${error.message}`);
      return false;
    }
  }

  // Remove all cached translations for a specific language
  async removeLanguage(langCode) {
    if (!this.isConnected || !this.redis) return false;
    try {
      const pattern = `${this.translationPrefix}${langCode}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
        logger.info('REDIS', `Removed ${keys.length} cached translations for ${langCode}`);
      }
      return true;
    } catch (error) {
      logger.warn('REDIS', `Error removing ${langCode} translations: ${error.message}`);
      return false;
    }
  }

  // Get cache statistics
  async getStats() {
    if (!this.isConnected || !this.redis) {
      return null;
    }

    try {
      const pattern = `${this.translationPrefix}*`;
      const keys = await this.redis.keys(pattern);
      const metadata = await this.redis.get(this.metadataKey);

      return {
        isConnected: this.isConnected,
        totalKeys: keys.length,
        metadata: metadata ? JSON.parse(metadata) : null,
        memoryUsage: await this.redis.memory('usage')
      };

    } catch (error) {
      logger.warn('REDIS', `Error getting stats: ${error.message}`);
      return null;
    }
  }

  // Clear translation cache
  async clearCache() {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const pattern = `${this.translationPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info('REDIS', `Cleared ${keys.length} cached translations`);
      }

      await this.redis.del(this.metadataKey);
      return true;

    } catch (error) {
      logger.warn('REDIS', `Error clearing cache: ${error.message}`);
      return false;
    }
  }

  // Check if translation exists in cache
  async hasTranslation(templateKey, language) {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const key = this.createKey(templateKey, language);
      const exists = await this.redis.exists(key);
      return exists === 1;

    } catch (error) {
      logger.warn('REDIS', `Error checking translation existence: ${error.message}`);
      return false;
    }
  }

  // Get all cached languages
  async getCachedLanguages() {
    if (!this.isConnected || !this.redis) {
      return [];
    }

    try {
      const pattern = `${this.translationPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      const languages = new Set();
      keys.forEach(key => {
        const match = key.match(new RegExp(`${this.translationPrefix}([^:]+):`));
        if (match) {
          languages.add(match[1]);
        }
      });

      return Array.from(languages);

    } catch (error) {
      logger.warn('REDIS', `Error getting cached languages: ${error.message}`);
      return [];
    }
  }

  // Close Redis connection
  async close() {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      logger.info('REDIS', 'Redis connection closed');
    }
  }
}

// Create singleton instance
const redisTranslationCache = new RedisTranslationCache();

export default redisTranslationCache;
