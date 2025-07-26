#!/usr/bin/env node
// load-translations-to-redis.js - Load pre-built translations into Redis
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import redisTranslationCache from './utils/redisTranslationCache.js';

async function loadTranslationsToRedis() {
  console.log('🚀 Loading Pre-built Translations into Redis');
  console.log('=============================================');

  try {
    // Initialize Redis
    await redisTranslationCache.initialize();

    // Load the combined translations file
    const translationsPath = path.join(process.cwd(), 'generated', 'translations', 'all.json');
    
    if (!fs.existsSync(translationsPath)) {
      throw new Error('Pre-built translations not found. Run "npm run build:translations" first.');
    }

    const translationsContent = fs.readFileSync(translationsPath, 'utf8');
    const translationsData = JSON.parse(translationsContent);

    console.log(`📊 Found translations for ${Object.keys(translationsData).length} languages`);

    // Load translations into Redis
    await redisTranslationCache.loadPrebuiltTranslations(translationsData);

    // Verify loading
    const stats = await redisTranslationCache.getStats();
    console.log('\n📈 Redis Cache Statistics:');
    console.log(`  Connected: ${stats.isConnected}`);
    console.log(`  Total Keys: ${stats.totalKeys}`);
    if (stats.metadata) {
      console.log(`  Load Time: ${stats.metadata.loadTime}`);
      console.log(`  Translation Count: ${stats.metadata.translationCount}`);
      console.log(`  Languages: ${stats.metadata.languages.join(', ')}`);
    }

    // Test a few translations
    console.log('\n🧪 Testing Redis cache retrieval:');
    const testCases = [
      { template: 'welcome_message', lang: 'es' },
      { template: 'select_language', lang: 'fr' },
      { template: 'buy_product', lang: 'de' }
    ];

    for (const { template, lang } of testCases) {
      const translation = await redisTranslationCache.getTranslation(template, lang);
      if (translation) {
        console.log(`  ✅ ${template}:${lang} - "${translation.substring(0, 50)}..."`);
      } else {
        console.log(`  ❌ ${template}:${lang} - Not found`);
      }
    }

    console.log('\n🎉 Translations successfully loaded into Redis!');
    console.log('Bot will now have instant translation responses.');

  } catch (error) {
    console.error(`❌ Failed to load translations: ${error.message}`);
    console.error(error.stack);
  } finally {
    await redisTranslationCache.close();
  }
}

// Run the loader
loadTranslationsToRedis();
