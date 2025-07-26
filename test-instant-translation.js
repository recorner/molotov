#!/usr/bin/env node
// test-instant-translation.js - Test instant translation response times
import 'dotenv/config';
import instantTranslationService from './utils/instantTranslationService.js';
import messageTranslator from './utils/messageTranslator.js';

async function testInstantTranslation() {
  console.log('🚀 Testing Instant Translation Performance');
  console.log('==========================================');

  try {
    // Initialize services
    await instantTranslationService.initialize();
    await messageTranslator.initialize();

    // Test languages
    const testLanguages = ['es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja'];
    const testTemplates = ['welcome_message', 'select_language', 'main_categories', 'buy_product'];

    console.log('\n📊 Testing translation response times...\n');

    for (const template of testTemplates) {
      console.log(`🧪 Testing template: ${template}`);
      
      for (const language of testLanguages) {
        const startTime = Date.now();
        
        // Test instant translation
        const translation = await messageTranslator.translateTemplate(template, language);
        
        const responseTime = Date.now() - startTime;
        
        console.log(`  ${language.toUpperCase()}: ${responseTime}ms - "${translation.substring(0, 50)}..."`);
      }
      
      console.log('');
    }

    // Test cache statistics
    const cacheStats = await instantTranslationService.getCacheStats();
    console.log('📈 Cache Statistics:');
    console.log(`  Redis Enabled: ${cacheStats.enabled}`);
    if (cacheStats.enabled && cacheStats.totalKeys !== undefined) {
      console.log(`  Total Cached: ${cacheStats.totalKeys} translations`);
      if (cacheStats.metadata) {
        console.log(`  Build Time: ${cacheStats.metadata.loadTime}`);
        console.log(`  Languages: ${cacheStats.metadata.languages.length}`);
      }
    }

    console.log('\n✅ Performance test completed successfully!');

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
testInstantTranslation();
