// utils/prebuiltTranslations.js - Load pre-built translations efficiently
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PrebuiltTranslations {
  constructor() {
    this.translations = new Map();
    this.allTranslationsData = null;
    this.metadata = null;
    this.isLoaded = false;
    this.translationsDir = path.join(__dirname, '../generated/translations');
  }

  // Load all pre-built translations
  async loadTranslations() {
    if (this.isLoaded) {
      return;
    }

    const startTime = Date.now();
    
    try {
      // Check if pre-built translations exist
      const allTranslationsPath = path.join(this.translationsDir, 'all.json');
      const metadataPath = path.join(this.translationsDir, 'metadata.json');

      if (!fs.existsSync(allTranslationsPath)) {
        logger.warn('PREBUILT', 'Pre-built translations not found. Run "npm run build:translations" first.');
        return false;
      }

      // Load combined translations file
      const translationsContent = fs.readFileSync(allTranslationsPath, 'utf8');
      const translationsData = JSON.parse(translationsContent);

      // Store the original data structure for getAllTranslations()
      this.allTranslationsData = translationsData;

      // Load metadata
      if (fs.existsSync(metadataPath)) {
        const metadataContent = fs.readFileSync(metadataPath, 'utf8');
        this.metadata = JSON.parse(metadataContent);
      }

      // Store translations in memory for fast access
      for (const [language, templates] of Object.entries(translationsData)) {
        for (const [templateKey, translation] of Object.entries(templates)) {
          const cacheKey = `${templateKey}:${language}`;
          this.translations.set(cacheKey, translation);
        }
      }

      const loadTime = Date.now() - startTime;
      const languageCount = Object.keys(translationsData).length;
      const translationCount = this.translations.size;

      this.isLoaded = true;

      logger.info('PREBUILT', `Loaded ${translationCount} translations for ${languageCount} languages in ${loadTime}ms`);
      
      if (this.metadata) {
        if (this.metadata.efficiency) {
          logger.info('PREBUILT', `Build time: ${this.metadata.buildTime}, Efficiency: ${this.metadata.efficiency}%`);
        } else if (this.metadata.successfulTranslations && this.metadata.failedTranslations) {
          logger.info('PREBUILT', `Build time: ${this.metadata.buildTime}, Efficiency: ${Math.round((this.metadata.successfulTranslations / (this.metadata.successfulTranslations + this.metadata.failedTranslations)) * 100)}%`);
        }
      }

      return true;

    } catch (error) {
      logger.error('PREBUILT', `Failed to load pre-built translations: ${error.message}`);
      return false;
    }
  }

  // Get translation from pre-built cache
  getTranslation(templateKey, language) {
    if (!this.isLoaded) {
      return null;
    }

    const cacheKey = `${templateKey}:${language}`;
    return this.translations.get(cacheKey);
  }

  // Check if translations are available
  hasTranslations() {
    return this.isLoaded && this.translations.size > 0;
  }

  // Get all translations in the original format
  getAllTranslations() {
    if (!this.isLoaded || !this.allTranslationsData) {
      return null;
    }
    return this.allTranslationsData;
  }

  // Get statistics
  getStats() {
    return {
      isLoaded: this.isLoaded,
      cacheSize: this.translations.size,
      metadata: this.metadata,
      memoryUsage: this.getMemoryUsage()
    };
  }

  // Estimate memory usage
  getMemoryUsage() {
    if (!this.isLoaded) return 0;
    
    let totalBytes = 0;
    for (const [key, value] of this.translations) {
      totalBytes += Buffer.byteLength(key, 'utf8');
      totalBytes += Buffer.byteLength(value, 'utf8');
    }
    
    return {
      bytes: totalBytes,
      kb: Math.round(totalBytes / 1024),
      mb: Math.round(totalBytes / (1024 * 1024) * 100) / 100
    };
  }

  // Get supported languages
  getSupportedLanguages() {
    if (!this.metadata) return [];
    return this.metadata.languages || [];
  }

  // Check if specific language is supported
  isLanguageSupported(language) {
    return this.getSupportedLanguages().includes(language);
  }

  // Get build information
  getBuildInfo() {
    return this.metadata || null;
  }
}

// Create singleton instance
const prebuiltTranslations = new PrebuiltTranslations();

export default prebuiltTranslations;
