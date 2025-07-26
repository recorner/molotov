// test_translation.js - Simple test for translation service
import translationService from './utils/translationService.js';

async function testTranslation() {
  console.log('🔄 Testing translation service...');
  
  try {
    // Test connection
    const connected = await translationService.testConnection();
    console.log(`📡 LibreTranslate connection: ${connected ? '✅ OK' : '❌ Failed'}`);
    
    // Test basic translation
    const result = await translationService.translate('Hello world', 'ru');
    console.log(`🇷🇺 Russian translation: "${result}"`);
    
    // Test Chinese translation
    const chineseResult = await translationService.translate('Welcome to our store', 'zh');
    console.log(`🇨🇳 Chinese translation: "${chineseResult}"`);
    
    // Test Spanish translation
    const spanishResult = await translationService.translate('Buy now', 'es');
    console.log(`🇪🇸 Spanish translation: "${spanishResult}"`);
    
    // Test supported languages
    const langs = translationService.getSupportedLanguages();
    console.log(`🌍 Supported languages: ${Object.keys(langs).length}`);
    
    // Test fallback translation
    const fallback = await translationService.translate('Main Categories', 'ru');
    console.log(`🔄 Fallback test (ru): "${fallback}"`);
    
    console.log('✅ All translation tests passed!');
    
  } catch (error) {
    console.error('❌ Translation test failed:', error.message);
  }
}

testTranslation();
