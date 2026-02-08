// utils/translationService.js - Multi-language translation service (env-driven)
import logger from './logger.js';
import db from '../database.js';
import {
  ENABLED_LANGUAGES,
  DEFAULT_LANGUAGE,
  TRANSLATE_PRODUCT_NAMES,
  LIBRETRANSLATE_URL,
  PRELOAD_TRANSLATIONS
} from '../config.js';
import libreTranslateManager from './libreTranslateManager.js';

class TranslationService {
  constructor() {
    this.libretranslateUrl = LIBRETRANSLATE_URL;
    this.libreAvailable = false;

    // All known languages (master catalogue)
    this.allLanguages = {
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
      'uk': { name: 'Українська', flag: '🇺🇦' },
      'cs': { name: 'Čeština', flag: '🇨🇿' },
      'el': { name: 'Ελληνικά', flag: '🇬🇷' }
    };

    // Enabled languages from env (always includes en)
    this.enabledCodes = ENABLED_LANGUAGES;
    this.supportedLanguages = {};
    for (const code of this.enabledCodes) {
      if (this.allLanguages[code]) {
        this.supportedLanguages[code] = this.allLanguages[code];
      }
    }

    // In-memory translation cache
    this.translationCache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 h

    // Pre-loaded UI translations (filled at startup)
    this.preloadedUI = new Map(); // key = `text:lang` value = translated string

    // Config flags
    this.translateProductNames = TRANSLATE_PRODUCT_NAMES;
    this.preloadEnabled = PRELOAD_TRANSLATIONS;
    this.defaultLanguage = DEFAULT_LANGUAGE;

    // Comprehensive fallback translations
    this.fallbackTranslations = this._buildFallbackTranslations();

    logger.info('TRANSLATION', `Initialized with ${this.enabledCodes.length} languages: ${this.enabledCodes.join(', ')}`);
    logger.info('TRANSLATION', `Translate product/category names: ${this.translateProductNames}`);
  }

  // ═══════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════

  /** Check whether a language code is enabled */
  isLanguageEnabled(code) {
    return !!this.supportedLanguages[code];
  }

  /** Get the map of enabled languages { code: { name, flag } } */
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  /** Get flat array of enabled language codes */
  getEnabledCodes() {
    return [...this.enabledCodes];
  }

  /** Whether product/category names should be translated */
  shouldTranslateNames() {
    return this.translateProductNames;
  }

  // -- User language persistence --

  async getUserLanguage(telegramId) {
    return new Promise((resolve) => {
      db.get(
        'SELECT language_code FROM users WHERE telegram_id = ?',
        [telegramId],
        (err, row) => {
          if (err || !row || !row.language_code) {
            resolve(this.defaultLanguage);
          } else {
            const code = row.language_code;
            resolve(this.isLanguageEnabled(code) ? code : this.defaultLanguage);
          }
        }
      );
    });
  }

  async setUserLanguage(telegramId, languageCode) {
    if (!this.isLanguageEnabled(languageCode)) {
      languageCode = this.defaultLanguage;
    }
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET language_code = ? WHERE telegram_id = ?',
        [languageCode, telegramId],
        function (err) {
          if (err) return reject(err);
          if (this.changes === 0) {
            db.run(
              'INSERT OR IGNORE INTO users (telegram_id, language_code) VALUES (?, ?)',
              [telegramId, languageCode],
              (err2) => (err2 ? reject(err2) : resolve(languageCode))
            );
          } else {
            resolve(languageCode);
          }
        }
      );
    });
  }

  // -- Translation functions --

  /**
   * Main translation function.
   * Returns cached / preloaded / LibreTranslate / fallback result.
   */
  async translate(text, targetLang = 'en', _telegramId = null) {
    if (!text || targetLang === 'en' || !this.isLanguageEnabled(targetLang)) {
      return text;
    }

    const cacheKey = this.getCacheKey(text, targetLang);

    // 1. Preloaded UI cache (instant)
    const preloaded = this.preloadedUI.get(cacheKey);
    if (preloaded) return preloaded;

    // 2. Runtime cache
    const cached = this.translationCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) return cached.translation;

    // 3. Fallback hardcoded translations
    const fallback = this.getFallbackTranslation(text, targetLang);
    if (fallback !== text) {
      this.translationCache.set(cacheKey, { translation: fallback, timestamp: Date.now() });
      return fallback;
    }

    // 4. LibreTranslate (live)
    if (this.libreAvailable) {
      try {
        const translated = await this.translateWithLibre(text, targetLang);
        this.translationCache.set(cacheKey, { translation: translated, timestamp: Date.now() });
        return translated;
      } catch {
        // fall through
      }
    }

    // 5. Return original
    return text;
  }

  /** Translate for a specific user */
  async translateForUser(text, telegramId) {
    const lang = await this.getUserLanguage(telegramId);
    return this.translate(text, lang, telegramId);
  }

  /** Batch translate */
  async batchTranslate(texts, targetLang) {
    return Promise.all(texts.map(t => this.translate(t, targetLang)));
  }

  // -- Preloading --

  /**
   * Preload all UI template translations into memory.
   * Called once at startup from bot.js.
   */
  async preloadAllUITranslations(templates) {
    if (!this.preloadEnabled) {
      logger.info('TRANSLATION', 'Preloading disabled by config');
      return 0;
    }

    const startTime = Date.now();
    let count = 0;

    for (const lang of this.enabledCodes) {
      if (lang === 'en') continue;

      for (const [key, englishText] of Object.entries(templates)) {
        const cacheKeyByKey = `${key}:${lang}`;
        const cacheKeyByText = this.getCacheKey(englishText, lang);

        if (this.preloadedUI.has(cacheKeyByKey)) { count++; continue; }

        // Try fallback first
        const fb = this.getFallbackTranslation(englishText, lang);
        if (fb !== englishText) {
          this.preloadedUI.set(cacheKeyByKey, fb);
          this.preloadedUI.set(cacheKeyByText, fb);
          count++;
          continue;
        }

        // Try LibreTranslate
        if (this.libreAvailable) {
          try {
            const translated = await this.translateWithLibre(englishText, lang);
            if (translated && translated !== englishText) {
              this.preloadedUI.set(cacheKeyByKey, translated);
              this.preloadedUI.set(cacheKeyByText, translated);
              count++;
            }
          } catch { /* skip */ }
        }
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info('TRANSLATION', `Preloaded ${count} UI translations for ${this.enabledCodes.length - 1} languages in ${elapsed}ms`);
    return count;
  }

  /**
   * Load translations from a prebuilt JSON file.
   */
  loadPrebuiltData(data) {
    if (!data) return 0;
    let count = 0;
    for (const [lang, templates] of Object.entries(data)) {
      if (!this.isLanguageEnabled(lang)) continue;
      for (const [key, value] of Object.entries(templates)) {
        this.preloadedUI.set(`${key}:${lang}`, value);
        count++;
      }
    }
    logger.info('TRANSLATION', `Loaded ${count} prebuilt translations into memory`);
    return count;
  }

  // -- Language keyboard --

  getLanguageKeyboard() {
    const keyboard = [];
    const langs = Object.entries(this.supportedLanguages);
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

  // -- LibreTranslate connectivity --

  async testConnection() {
    try {
      // First try the /languages endpoint (always works if server is up)
      const langRes = await fetch(`${this.libretranslateUrl}/languages`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!langRes.ok) throw new Error('Languages endpoint failed');

      // Then try a real translate with the first non-English enabled language
      const testLang = this.enabledCodes.find(c => c !== 'en') || 'es';
      const res = await fetch(`${this.libretranslateUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'Hello', source: 'en', target: testLang, format: 'text' }),
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        this.libreAvailable = true;
        logger.info('TRANSLATION', `LibreTranslate connection OK (tested with ${testLang})`);
        return true;
      }
    } catch { /* ignore */ }
    this.libreAvailable = false;
    logger.warn('TRANSLATION', 'LibreTranslate unavailable - using fallback translations only');
    return false;
  }

  /**
   * Initialize LibreTranslate via Docker manager.
   * Ensures the container is running with the correct languages.
   * Called from bot.js during startup.
   */
  async initializeLibreTranslate() {
    try {
      logger.info('TRANSLATION', 'Initializing LibreTranslate via Docker manager...');
      const ready = await libreTranslateManager.ensureRunning();
      this.libreAvailable = ready;

      if (ready) {
        logger.info('TRANSLATION', '✅ LibreTranslate Docker container is ready');
      } else {
        logger.warn('TRANSLATION', '⚠️ LibreTranslate not available - fallback translations only');
      }

      return ready;
    } catch (error) {
      logger.error('TRANSLATION', `LibreTranslate init failed: ${error.message}`);
      this.libreAvailable = false;
      return false;
    }
  }

  /**
   * Dynamically add a language at runtime.
   * Updates internal state and triggers LibreTranslate recompile.
   */
  async addLanguage(code) {
    code = code.toLowerCase().trim();
    if (!this.allLanguages[code]) {
      logger.warn('TRANSLATION', `Unknown language code: ${code}`);
      return { success: false, reason: 'unknown_language' };
    }
    if (this.isLanguageEnabled(code)) {
      return { success: true, reason: 'already_enabled' };
    }

    // Add to runtime config
    this.enabledCodes.push(code);
    this.supportedLanguages[code] = this.allLanguages[code];

    // Trigger LibreTranslate recompile with new language set
    logger.info('TRANSLATION', `Adding language: ${code} (${this.allLanguages[code].name})`);
    const recompileOk = await libreTranslateManager.addLanguage(code);

    if (recompileOk) {
      this.libreAvailable = true;
      logger.info('TRANSLATION', `Language ${code} added and LibreTranslate recompiled`);
    } else {
      logger.warn('TRANSLATION', `Language ${code} added but LibreTranslate recompile failed (fallbacks available)`);
    }

    return { success: true, recompiled: recompileOk };
  }

  /**
   * Dynamically remove a language at runtime.
   * Updates internal state and triggers LibreTranslate recompile.
   */
  async removeLanguage(code) {
    code = code.toLowerCase().trim();
    if (code === 'en') {
      return { success: false, reason: 'cannot_remove_english' };
    }
    if (!this.isLanguageEnabled(code)) {
      return { success: true, reason: 'not_enabled' };
    }

    // Remove from runtime config
    this.enabledCodes = this.enabledCodes.filter(c => c !== code);
    delete this.supportedLanguages[code];

    // Clean preloaded translations for this language
    for (const key of this.preloadedUI.keys()) {
      if (key.endsWith(`:${code}`)) {
        this.preloadedUI.delete(key);
      }
    }

    // Trigger LibreTranslate recompile
    logger.info('TRANSLATION', `Removing language: ${code}`);
    const recompileOk = await libreTranslateManager.removeLanguage(code);

    return { success: true, recompiled: recompileOk };
  }

  /**
   * Get all available languages (master catalogue) that can be enabled.
   */
  getAllAvailableLanguages() {
    return { ...this.allLanguages };
  }

  /**
   * Get disabled languages (available but not enabled).
   */
  getDisabledLanguages() {
    const disabled = {};
    for (const [code, info] of Object.entries(this.allLanguages)) {
      if (!this.isLanguageEnabled(code)) {
        disabled[code] = info;
      }
    }
    return disabled;
  }

  /**
   * Get LibreTranslate Docker status.
   */
  async getLibreTranslateStatus() {
    return libreTranslateManager.getStatus();
  }

  // ═══════════════════════════════════════
  //  INTERNAL HELPERS
  // ═══════════════════════════════════════

  getCacheKey(text, lang) {
    return `${text}:${lang}`;
  }

  isCacheValid(entry) {
    return Date.now() - entry.timestamp < this.cacheExpiry;
  }

  async translateWithLibre(text, targetLang) {
    const res = await fetch(`${this.libretranslateUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: targetLang, format: 'text' }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`LibreTranslate ${res.status}`);
    const data = await res.json();
    return data.translatedText;
  }

  getFallbackTranslation(text, lang) {
    const langFb = this.fallbackTranslations[lang];
    if (langFb && langFb[text]) return langFb[text];
    return text;
  }

  cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.translationCache.entries()) {
      if (now - entry.timestamp > this.cacheExpiry) {
        this.translationCache.delete(key);
      }
    }
    logger.debug('TRANSLATION', `Cache cleanup: ${this.translationCache.size} runtime entries`);
  }

  getStats() {
    return {
      enabledLanguages: this.enabledCodes,
      preloadedCount: this.preloadedUI.size,
      runtimeCacheCount: this.translationCache.size,
      libreAvailable: this.libreAvailable,
      translateNames: this.translateProductNames
    };
  }

  // ═══════════════════════════════════════
  //  HARDCODED FALLBACK TRANSLATIONS
  // ═══════════════════════════════════════

  _buildFallbackTranslations() {
    return {
      'ru': {
        'Welcome to Molotov Bot': 'Добро пожаловать в Molotov Bot',
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
        'Products in this Category': 'Товары в этой категории',
        'Change Language': 'Изменить язык',
        'Browse Categories': 'Просмотр категорий',
        'Back': 'Назад',
        'Cancel': 'Отмена',
        'Confirm': 'Подтвердить',
        'Loading...': 'Загрузка...',
        'Please wait': 'Пожалуйста, подождите',
        'Payment': 'Оплата',
        'Order': 'Заказ',
        'Description': 'Описание',
        'No description available': 'Описание недоступно',
        'Send Payment To': 'Отправить платёж на',
        "I've Sent Payment": 'Я отправил платёж',
        'Copy Address': 'Копировать адрес',
        'Payment Help': 'Помощь с оплатой',
        'Refresh Status': 'Обновить статус',
        'Back to Store': 'Вернуться в магазин',
        'Cancel Order': 'Отменить заказ',
        'Previous': 'Предыдущая',
        'Next': 'Следующая',
        'Choose a Category': 'Выберите категорию',
        'No Categories Available': 'Категории не доступны',
        'Contact Support': 'Связаться с поддержкой'
      },
      'es': {
        'Welcome to Molotov Bot': 'Bienvenido a Molotov Bot',
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
        'Products in this Category': 'Productos en esta categoría',
        'Change Language': 'Cambiar idioma',
        'Browse Categories': 'Explorar categorías',
        'Back': 'Atrás',
        'Cancel': 'Cancelar',
        'Confirm': 'Confirmar',
        'Loading...': 'Cargando...',
        'Please wait': 'Por favor espera',
        'Payment': 'Pago',
        'Order': 'Pedido',
        'Description': 'Descripción',
        'No description available': 'Descripción no disponible',
        'Send Payment To': 'Enviar pago a',
        "I've Sent Payment": 'He enviado el pago',
        'Copy Address': 'Copiar dirección',
        'Payment Help': 'Ayuda con el pago',
        'Refresh Status': 'Actualizar estado',
        'Back to Store': 'Volver a la tienda',
        'Cancel Order': 'Cancelar pedido',
        'Previous': 'Anterior',
        'Next': 'Siguiente',
        'Choose a Category': 'Elige una categoría',
        'No Categories Available': 'No hay categorías disponibles',
        'Contact Support': 'Contactar soporte'
      },
      'fr': {
        'Welcome to Molotov Bot': 'Bienvenue sur Molotov Bot',
        'Select your language': 'Sélectionnez votre langue',
        'Language set successfully': 'Langue définie avec succès',
        'Main Categories': 'Catégories principales',
        'Contact Admin': "Contacter l'administrateur",
        'Buy': 'Acheter',
        'Back to Categories': 'Retour aux catégories',
        'No products found': 'Aucun produit trouvé',
        'Error loading': 'Erreur de chargement',
        'Invalid selection': 'Sélection invalide',
        'Price': 'Prix',
        'Products in this Category': 'Produits dans cette catégorie',
        'Change Language': 'Changer de langue',
        'Browse Categories': 'Parcourir les catégories',
        'Back': 'Retour',
        'Cancel': 'Annuler',
        'Confirm': 'Confirmer',
        'Loading...': 'Chargement...',
        'Please wait': 'Veuillez patienter',
        'Choose a Category': 'Choisissez une catégorie',
        'Contact Support': 'Contacter le support'
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
        'Products in this Category': 'Produkte in dieser Kategorie',
        'Change Language': 'Sprache ändern',
        'Browse Categories': 'Kategorien durchsuchen',
        'Back': 'Zurück',
        'Cancel': 'Abbrechen',
        'Confirm': 'Bestätigen',
        'Loading...': 'Laden...',
        'Please wait': 'Bitte warten',
        'Choose a Category': 'Wählen Sie eine Kategorie',
        'Contact Support': 'Support kontaktieren'
      },
      'zh': {
        'Welcome to Molotov Bot': '欢迎使用 Molotov Bot',
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
        'Products in this Category': '此类别中的产品',
        'Change Language': '更改语言',
        'Browse Categories': '浏览类别',
        'Back': '返回',
        'Cancel': '取消',
        'Confirm': '确认',
        'Loading...': '加载中...',
        'Please wait': '请稍候',
        'Choose a Category': '选择类别',
        'Contact Support': '联系客服'
      },
      'it': {
        'Welcome to Molotov Bot': 'Benvenuto su Molotov Bot',
        'Select your language': 'Seleziona la tua lingua',
        'Language set successfully': 'Lingua impostata con successo',
        'Main Categories': 'Categorie principali',
        'Contact Admin': "Contatta l'amministratore",
        'Buy': 'Acquista',
        'Back to Categories': 'Torna alle categorie',
        'No products found': 'Nessun prodotto trovato',
        'Price': 'Prezzo',
        'Change Language': 'Cambia lingua',
        'Back': 'Indietro',
        'Cancel': 'Annulla',
        'Confirm': 'Conferma',
        'Choose a Category': 'Scegli una categoria',
        'Contact Support': 'Contatta il supporto'
      },
      'pt': {
        'Welcome to Molotov Bot': 'Bem-vindo ao Molotov Bot',
        'Select your language': 'Selecione seu idioma',
        'Language set successfully': 'Idioma definido com sucesso',
        'Main Categories': 'Categorias principais',
        'Contact Admin': 'Contatar administrador',
        'Buy': 'Comprar',
        'Back to Categories': 'Voltar às categorias',
        'No products found': 'Nenhum produto encontrado',
        'Price': 'Preço',
        'Change Language': 'Alterar idioma',
        'Back': 'Voltar',
        'Cancel': 'Cancelar',
        'Confirm': 'Confirmar',
        'Choose a Category': 'Escolha uma categoria',
        'Contact Support': 'Contatar suporte'
      },
      'pl': {
        'Select your language': 'Wybierz język',
        'Language set successfully': 'Język ustawiony pomyślnie',
        'Main Categories': 'Główne kategorie',
        'Buy': 'Kup',
        'Back to Categories': 'Powrót do kategorii',
        'Price': 'Cena',
        'Change Language': 'Zmień język',
        'Back': 'Wstecz',
        'Cancel': 'Anuluj',
        'Confirm': 'Potwierdź',
        'Choose a Category': 'Wybierz kategorię',
        'Contact Support': 'Skontaktuj się z pomocą'
      },
      'tr': {
        'Select your language': 'Dilinizi seçin',
        'Language set successfully': 'Dil başarıyla ayarlandı',
        'Main Categories': 'Ana Kategoriler',
        'Buy': 'Satın Al',
        'Back to Categories': 'Kategorilere Dön',
        'Price': 'Fiyat',
        'Change Language': 'Dil Değiştir',
        'Back': 'Geri',
        'Cancel': 'İptal',
        'Confirm': 'Onayla',
        'Choose a Category': 'Bir kategori seçin',
        'Contact Support': 'Destek ile iletişime geçin'
      },
      'ar': {
        'Select your language': 'اختر لغتك',
        'Main Categories': 'الفئات الرئيسية',
        'Buy': 'شراء',
        'Price': 'السعر',
        'Back': 'رجوع',
        'Cancel': 'إلغاء',
        'Confirm': 'تأكيد',
        'Choose a Category': 'اختر فئة',
        'Contact Support': 'اتصل بالدعم'
      },
      'ja': {
        'Select your language': '言語を選択してください',
        'Main Categories': 'メインカテゴリ',
        'Buy': '購入',
        'Price': '価格',
        'Back': '戻る',
        'Cancel': 'キャンセル',
        'Confirm': '確認',
        'Choose a Category': 'カテゴリを選択',
        'Contact Support': 'サポートに連絡'
      },
      'ko': {
        'Select your language': '언어를 선택하세요',
        'Main Categories': '주요 카테고리',
        'Buy': '구매',
        'Price': '가격',
        'Back': '뒤로',
        'Cancel': '취소',
        'Confirm': '확인',
        'Choose a Category': '카테고리를 선택하세요',
        'Contact Support': '고객 지원 문의'
      },
      'hi': {
        'Select your language': 'अपनी भाषा चुनें',
        'Main Categories': 'मुख्य श्रेणियाँ',
        'Buy': 'खरीदें',
        'Price': 'कीमत',
        'Back': 'वापस',
        'Cancel': 'रद्द करें',
        'Confirm': 'पुष्टि करें',
        'Choose a Category': 'एक श्रेणी चुनें',
        'Contact Support': 'सहायता से संपर्क करें'
      },
      'uk': {
        'Select your language': 'Виберіть мову',
        'Main Categories': 'Основні категорії',
        'Buy': 'Купити',
        'Price': 'Ціна',
        'Back': 'Назад',
        'Cancel': 'Скасувати',
        'Confirm': 'Підтвердити',
        'Choose a Category': 'Виберіть категорію',
        'Contact Support': "Зв'язатися з підтримкою"
      }
    };
  }
}

// Singleton
const translationService = new TranslationService();

// Note: LibreTranslate initialization is now handled by bot.js via initializeLibreTranslate()
// which uses the Docker manager to auto-start the container.
// testConnection() is still available for manual/fallback checks.

// Periodic cache cleanup
setInterval(() => translationService.cleanupCache(), 60 * 60 * 1000);

export default translationService;
