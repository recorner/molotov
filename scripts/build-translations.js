#!/usr/bin/env node
// scripts/build-translations  // Get templates and languages to process
  getTemplatesAndLanguages() {
    const templates = Object.keys(messageTranslator.messageTemplates);
    // Use configured languages from environment, always include English
    const languages = ['en', ...this.supportedLanguages];
    
    this.stats.totalTemplates = templates.length;
    this.stats.totalLanguages = languages.length;
    
    console.log(`📊 Found ${templates.length} templates for ${languages.length} languages`);
    return { templates, languages };
  }d-time translation generator
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import translation service and templates
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';

class TranslationBuilder {
  constructor() {
    this.outputDir = path.join(__dirname, '../generated/translations');
    this.translationsData = {};
    this.supportedLanguages = this.getSupportedLanguagesFromEnv();
    this.stats = {
      totalTemplates: 0,
      totalLanguages: 0,
      successfulTranslations: 0,
      failedTranslations: 0,
      startTime: Date.now()
    };
  }

  // Get supported languages from environment
  getSupportedLanguagesFromEnv() {
    const envLanguages = process.env.SUPPORTED_LANGUAGES;
    
    if (!envLanguages) {
      console.warn('⚠️ SUPPORTED_LANGUAGES not set in environment, using default languages');
      return ['es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja'];
    }

    const languages = envLanguages.split(',').map(lang => lang.trim()).filter(lang => lang);
    console.log(`📋 Building translations for configured languages: ${languages.join(', ')}`);
    return languages;
  }

  // Ensure output directory exists
  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`✅ Created output directory: ${this.outputDir}`);
    }
  }

  // Get all template keys and languages
  getTemplatesAndLanguages() {
    const templates = Object.keys(messageTranslator.messageTemplates);
    const languages = Object.keys(translationService.getSupportedLanguages());
    
    this.stats.totalTemplates = templates.length;
    this.stats.totalLanguages = languages.length;
    
    return { templates, languages };
  }

  // Build translations for all languages
  async buildAllTranslations() {
    console.log('🔨 Building translations...');
    this.ensureOutputDir();

    const { templates, languages } = this.getTemplatesAndLanguages();
    
    // Initialize translations data structure
    for (const lang of languages) {
      this.translationsData[lang] = {};
    }

    // English is the source language - just copy templates
    console.log('📋 Processing English (source language)...');
    for (const templateKey of templates) {
      this.translationsData.en[templateKey] = messageTranslator.messageTemplates[templateKey];
    }
    this.stats.successfulTranslations += templates.length;

    // Process other languages
    const targetLanguages = languages.filter(lang => lang !== 'en');
    console.log(`🌍 Processing ${targetLanguages.length} target languages...`);

    for (const language of targetLanguages) {
      console.log(`\n🔄 Translating to ${language.toUpperCase()}...`);
      await this.buildLanguageTranslations(language, templates);
    }

    // Save all translations to files
    await this.saveTranslations();
    this.printStats();
  }

  // Build translations for a specific language
  async buildLanguageTranslations(language, templates) {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < templates.length; i++) {
      const templateKey = templates[i];
      const templateText = messageTranslator.messageTemplates[templateKey];

      try {
        // Add small delay to avoid overwhelming the API
        if (i > 0 && i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        const translation = await translationService.translate(templateText, language);
        
        if (translation && translation !== templateText) {
          this.translationsData[language][templateKey] = translation;
          successCount++;
          this.stats.successfulTranslations++;
        } else {
          // Fallback to English
          this.translationsData[language][templateKey] = templateText;
          failCount++;
          this.stats.failedTranslations++;
        }

        // Progress indicator
        if ((i + 1) % 10 === 0) {
          const progress = Math.round(((i + 1) / templates.length) * 100);
          process.stdout.write(`\r   Progress: ${i + 1}/${templates.length} (${progress}%) - Success: ${successCount}, Failed: ${failCount}`);
        }

      } catch (error) {
        console.warn(`\n   ⚠️  Failed to translate "${templateKey}": ${error.message}`);
        this.translationsData[language][templateKey] = templateText; // Fallback
        failCount++;
        this.stats.failedTranslations++;
      }
    }

    console.log(`\n   ✅ ${language.toUpperCase()}: ${successCount} successful, ${failCount} failed`);
  }

  // Save translations to JSON files
  async saveTranslations() {
    console.log('\n💾 Saving translation files...');

    // Save individual language files
    for (const [language, translations] of Object.entries(this.translationsData)) {
      const filename = `${language}.json`;
      const filepath = path.join(this.outputDir, filename);
      
      const content = JSON.stringify(translations, null, 2);
      fs.writeFileSync(filepath, content, 'utf8');
      
      console.log(`   📄 Saved ${filename} (${Object.keys(translations).length} translations)`);
    }

    // Save combined file for easy loading
    const combinedFilepath = path.join(this.outputDir, 'all.json');
    const combinedContent = JSON.stringify(this.translationsData, null, 2);
    fs.writeFileSync(combinedFilepath, combinedContent, 'utf8');
    console.log(`   📦 Saved combined file: all.json`);

    // Save metadata
    const metadata = {
      buildTime: new Date().toISOString(),
      buildDuration: Date.now() - this.stats.startTime,
      stats: this.stats,
      languages: Object.keys(this.translationsData),
      templateCount: this.stats.totalTemplates
    };

    const metadataFilepath = path.join(this.outputDir, 'metadata.json');
    fs.writeFileSync(metadataFilepath, JSON.stringify(metadata, null, 2), 'utf8');
    console.log(`   📊 Saved metadata.json`);
  }

  // Print build statistics
  printStats() {
    const duration = Date.now() - this.stats.startTime;
    const efficiency = Math.round((this.stats.successfulTranslations / (this.stats.successfulTranslations + this.stats.failedTranslations)) * 100);

    console.log('\n🎉 Translation build completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Build time: ${Math.round(duration / 1000)}s`);
    console.log(`🌍 Languages: ${this.stats.totalLanguages}`);
    console.log(`📋 Templates: ${this.stats.totalTemplates}`);
    console.log(`✅ Successful: ${this.stats.successfulTranslations}`);
    console.log(`❌ Failed: ${this.stats.failedTranslations}`);
    console.log(`📈 Efficiency: ${efficiency}%`);
    console.log(`💾 Output: ${this.outputDir}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting translation build process...\n');
    
    // Test LibreTranslate connection first
    console.log('🔍 Testing LibreTranslate connection...');
    try {
      await translationService.translate('Hello', 'fr');
      console.log('✅ LibreTranslate connection successful\n');
    } catch (error) {
      console.error('❌ LibreTranslate connection failed:', error.message);
      console.log('💡 Make sure LibreTranslate is running on localhost:5000');
      process.exit(1);
    }

    const builder = new TranslationBuilder();
    await builder.buildAllTranslations();
    
    console.log('\n🎯 Next steps:');
    console.log('1. Run "npm start" to start the bot with pre-built translations');
    console.log('2. Translation files are cached and bot startup will be much faster');
    
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Build failed:', error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default TranslationBuilder;
