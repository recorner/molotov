// utils/translationService.js - Multi-language translation service
import logger from './logger.js';
import db from '../database.js';

class TranslationService {
  constructor() {
    this.libretranslateUrl = 'http://localhost:5000';
    this.supportedLanguages = {
      'en': { name: 'English', flag: '🇺🇸' },
      'ru': { name: 'Русский', flag: '🇷🇺' },
      'zh': { name: '中文', flag: '🇨🇳' },
      'es': { name: 'Español', flag: '🇪🇸' },
      'fr': { name: 'Français', flag: '🇫🇷' },
      'de': { name: 'Deutsch', flag: '🇩🇪' },
      'it': { name: 'Italiano', flag: '🇮🇹' },
      'pt': { name: 'Português', flag: '🇵🇹' },
      'pl': { name: 'Polski', flag: '🇵🇱' },
      'tr': { name: 'Türkçe', flag: '🇹🇷' },
      'ar': { name: 'العربية', flag: '🇸🇦' },
      'ja': { name: '日本語', flag: '🇯🇵' },
      'ko': { name: '한국어', flag: '🇰🇷' },
      'hi': { name: 'हिंदी', flag: '🇮🇳' },
      'nl': { name: 'Nederlands', flag: '🇳🇱' },
      'sv': { name: 'Svenska', flag: '🇸🇪' },
      'no': { name: 'Norsk', flag: '🇳🇴' },
      'da': { name: 'Dansk', flag: '🇩🇰' },
      'fi': { name: 'Suomi', flag: '🇫🇮' },
      'uk': { name: 'Українська', flag: '🇺🇦' }
    };
    
    // Cache for translations to reduce API calls
    this.translationCache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    
    // Fallback translations for critical messages
    this.fallbackTranslations = {
      'ru': {
        'Welcome to Molotov Bot': 'Добро пожаловать в бота Molotov',
        'Select your language': 'Выберите ваш язык',
        'Language set successfully': 'Язык успешно установлен',
        'Main Categories': 'Основные категории',
        'Contact Admin': 'Связаться с администратором',
        'Buy': 'Купить',
        'Back to Categories': 'Вернуться к категориям',
        'No products found': 'Товары не найдены',
        'Error loading': 'Ошибка загрузки',
        'Invalid selection': 'Неверный выбор',
        'Price': 'Цена',
        'Products in this Category': 'Товары в этой категории'
      },
      'zh': {
        'Welcome to Molotov Bot': '欢迎使用 Molotov 机器人',
        'Select your language': '选择您的语言',
        'Language set successfully': '语言设置成功',
        'Main Categories': '主要类别',
        'Contact Admin': '联系管理员',
        'Buy': '购买',
        'Back to Categories': '返回类别',
        'No products found': '未找到产品',
        'Error loading': '加载错误',
        'Invalid selection': '无效选择',
        'Price': '价格',
        'Products in this Category': '此类别中的产品'
      },
      'es': {
        'Welcome to Molotov Bot': 'Bienvenido al Bot Molotov',
        'Select your language': 'Selecciona tu idioma',
        'Language set successfully': 'Idioma configurado exitosamente',
        'Main Categories': 'Categorías principales',
        'Contact Admin': 'Contactar administrador',
        'Buy': 'Comprar',
        'Back to Categories': 'Volver a categorías',
        'No products found': 'No se encontraron productos',
        'Error loading': 'Error al cargar',
        'Invalid selection': 'Selección inválida',
        'Price': 'Precio',
        'Products in this Category': 'Productos en esta categoría'
      },
      'fr': {
        'Welcome to Molotov Bot': 'Bienvenue sur le Bot Molotov',
        'Select your language': 'Sélectionnez votre langue',
        'Language set successfully': 'Langue définie avec succès',
        'Main Categories': 'Catégories principales',
        'Contact Admin': 'Contacter l\'administrateur',
        'Buy': 'Acheter',
        'Back to Categories': 'Retour aux catégories',
        'No products found': 'Aucun produit trouvé',
        'Error loading': 'Erreur de chargement',
        'Invalid selection': 'Sélection invalide',
        'Price': 'Prix',
        'Products in this Category': 'Produits dans cette catégorie'
      },
      'de': {
        'Welcome to Molotov Bot': 'Willkommen bei Molotov Bot',
        'Select your language': 'Wählen Sie Ihre Sprache',
        'Language set successfully': 'Sprache erfolgreich eingestellt',
        'Main Categories': 'Hauptkategorien',
        'Contact Admin': 'Administrator kontaktieren',
        'Buy': 'Kaufen',
        'Back to Categories': 'Zurück zu Kategorien',
        'No products found': 'Keine Produkte gefunden',
        'Error loading': 'Fehler beim Laden',
        'Invalid selection': 'Ungültige Auswahl',
        'Price': 'Preis',
        'Products in this Category': 'Produkte in dieser Kategorie'
      }
    };
  }

  // Get user's language preference from database
  async getUserLanguage(telegramId) {
    return new Promise((resolve) => {
      db.get(
        'SELECT language_code FROM users WHERE telegram_id = ?',
        [telegramId],
        (err, row) => {
          if (err || !row || !row.language_code) {
            resolve('en'); // Default to English
          } else {
            resolve(row.language_code);
          }
        }
      );
    });
  }

  // Set user's language preference in database
  async setUserLanguage(telegramId, languageCode) {
    return new Promise((resolve, reject) => {
      if (!this.supportedLanguages[languageCode]) {
        languageCode = 'en'; // Fallback to English for unsupported languages
      }

      // First, try to update existing user
      db.run(
        'UPDATE users SET language_code = ? WHERE telegram_id = ?',
        [languageCode, telegramId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }

          // If no rows were updated, insert new user record
          if (this.changes === 0) {
            db.run(
              'INSERT OR IGNORE INTO users (telegram_id, language_code) VALUES (?, ?)',
              [telegramId, languageCode],
              (err) => {
                if (err) reject(err);
                else resolve(languageCode);
              }
            );
          } else {
            resolve(languageCode);
          }
        }
      );
    });
  }

  // Generate cache key for translation
  getCacheKey(text, targetLang) {
    return `${text}:${targetLang}`;
  }

  // Check if cached translation is still valid
  isCacheValid(cacheEntry) {
    return Date.now() - cacheEntry.timestamp < this.cacheExpiry;
  }

  // Translate text using LibreTranslate API
  async translateWithLibre(text, targetLang) {
    try {
      const response = await fetch(`${this.libretranslateUrl}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'en',
          target: targetLang,
          format: 'text'
        }),
      });

      if (!response.ok) {
        throw new Error(`LibreTranslate API error: ${response.status}`);
      }

      const data = await response.json();
      return data.translatedText;
    } catch (error) {
      logger.warn('TRANSLATION', `LibreTranslate failed for ${targetLang}`, error);
      throw error;
    }
  }

  // Get fallback translation from pre-defined translations
  getFallbackTranslation(text, targetLang) {
    const langFallbacks = this.fallbackTranslations[targetLang];
    if (langFallbacks && langFallbacks[text]) {
      return langFallbacks[text];
    }
    return text; // Return original text if no fallback available
  }

  // Main translation function
  async translate(text, targetLang = 'en', telegramId = null) {
    // If target language is English or text is empty, return as-is
    if (!text || targetLang === 'en' || !this.supportedLanguages[targetLang]) {
      return text;
    }

    // Get user language if telegram ID provided
    if (telegramId && !targetLang) {
      targetLang = await this.getUserLanguage(telegramId);
    }

    const cacheKey = this.getCacheKey(text, targetLang);
    
    // Check cache first
    const cached = this.translationCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached.translation;
    }

    try {
      // Try LibreTranslate first
      const translation = await this.translateWithLibre(text, targetLang);
      
      // Cache successful translation
      this.translationCache.set(cacheKey, {
        translation,
        timestamp: Date.now()
      });
      
      logger.debug('TRANSLATION', `Translated to ${targetLang}: ${text.substring(0, 50)}...`);
      return translation;
      
    } catch (error) {
      // Fallback to pre-defined translations
      logger.warn('TRANSLATION', `Using fallback for ${targetLang}`, error);
      const fallback = this.getFallbackTranslation(text, targetLang);
      
      // Cache fallback translation too (shorter expiry)
      this.translationCache.set(cacheKey, {
        translation: fallback,
        timestamp: Date.now()
      });
      
      return fallback;
    }
  }

  // Translate text for specific user (gets language from DB)
  async translateForUser(text, telegramId) {
    const userLang = await this.getUserLanguage(telegramId);
    return await this.translate(text, userLang, telegramId);
  }

  // Get language selection keyboard
  getLanguageKeyboard() {
    const keyboard = [];
    const langs = Object.entries(this.supportedLanguages);
    
    // Create rows of 2 languages each
    for (let i = 0; i < langs.length; i += 2) {
      const row = [];
      
      for (let j = i; j < Math.min(i + 2, langs.length); j++) {
        const [code, info] = langs[j];
        row.push({
          text: `${info.flag} ${info.name}`,
          callback_data: `lang_${code}`
        });
      }
      
      keyboard.push(row);
    }
    
    return keyboard;
  }

  // Get supported languages list
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  // Clean up old cache entries
  cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.translationCache.entries()) {
      if (now - entry.timestamp > this.cacheExpiry) {
        this.translationCache.delete(key);
      }
    }
    logger.debug('TRANSLATION', `Cache cleanup: ${this.translationCache.size} entries remaining`);
  }

  // Batch translate multiple texts
  async batchTranslate(texts, targetLang, telegramId = null) {
    const promises = texts.map(text => this.translate(text, targetLang, telegramId));
    return await Promise.all(promises);
  }

  // Test LibreTranslate connectivity
  async testConnection() {
    try {
      const result = await this.translateWithLibre('Hello world', 'ru');
      logger.info('TRANSLATION', 'LibreTranslate connection test successful');
      return true;
    } catch (error) {
      logger.error('TRANSLATION', 'LibreTranslate connection test failed', error);
      return false;
    }
  }
}

// Create singleton instance
const translationService = new TranslationService();

// Test connection on startup
translationService.testConnection().then(async (success) => {
  if (success) {
    console.log('[✅] LibreTranslate service is ready');
  } else {
    console.log('[⚠️] LibreTranslate service unavailable - using fallback translations');
  }
});

// Clean up cache periodically
setInterval(() => {
  translationService.cleanupCache();
}, 60 * 60 * 1000); // Every hour

export default translationService;
