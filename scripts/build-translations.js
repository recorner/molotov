#!/usr/bin/env node
// scripts/build-translations.js - Build-time translation generator
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
    // Use enabled languages from translationService (reads from persisted state)
    this.supportedLanguages = translationService.getEnabledCodes().filter(c => c !== 'en');
    // Note: call translationBuilder.init() before building to connect LibreTranslate
    this.stats = {
      totalTemplates: 0,
      totalLanguages: 0,
      successfulTranslations: 0,
      failedTranslations: 0,
      startTime: Date.now()
    };
    console.log(`📋 Building translations for: ${this.supportedLanguages.join(', ')}`);
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
    const languages = ['en', ...this.supportedLanguages];
    
    this.stats.totalTemplates = templates.length;
    this.stats.totalLanguages = languages.length;
    
    console.log(`📊 Found ${templates.length} templates for ${languages.length} languages`);
    return { templates, languages };
  }

  // Build translations for all languages
  async buildAllTranslations() {
    console.log('🔨 Building translations...');
    this.ensureOutputDir();

    const { templates, languages } = this.getTemplatesAndLanguages();
    
    for (const lang of languages) {
      this.translationsData[lang] = {};
    }

    console.log('📋 Processing English (source language)...');
    for (const templateKey of templates) {
      this.translationsData.en[templateKey] = messageTranslator.messageTemplates[templateKey];
    }
    this.stats.successfulTranslations += templates.length;

    const targetLanguages = languages.filter(lang => lang !== 'en');
    console.log(`🌍 Processing ${targetLanguages.length} target languages...`);

    for (const language of targetLanguages) {
      console.log(`\n🔄 Translating to ${language.toUpperCase()}...`);
      await this.buildLanguageTranslations(language, templates);
    }

    await this.saveTranslations();
    this.printStats();
  }

  async buildLanguageTranslations(language, templates) {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < templates.length; i++) {
      const templateKey = templates[i];
      const templateText = messageTranslator.messageTemplates[templateKey];

      try {
        if (i > 0 && i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        const translation = await translationService.translate(templateText, language);
        
        if (translation && translation !== templateText) {
          this.translationsData[language][templateKey] = translation;
          successCount++;
          this.stats.successfulTranslations++;
        } else {
          this.translationsData[language][templateKey] = templateText;
          failCount++;
          this.stats.failedTranslations++;
        }

        if ((i + 1) % 10 === 0) {
          const progress = Math.round(((i + 1) / templates.length) * 100);
          process.stdout.write(`\r   Progress: ${i + 1}/${templates.length} (${progress}%) - Success: ${successCount}, Failed: ${failCount}`);
        }

      } catch (error) {
        console.warn(`\n   ⚠️  Failed to translate "${templateKey}": ${error.message}`);
        this.translationsData[language][templateKey] = templateText;
        failCount++;
        this.stats.failedTranslations++;
      }
    }

    console.log(`\n   ✅ ${language.toUpperCase()}: ${successCount} successful, ${failCount} failed`);
  }

  async saveTranslations() {
    console.log('\n💾 Saving translation files...');

    for (const [language, translations] of Object.entries(this.translationsData)) {
      const filename = `${language}.json`;
      const filepath = path.join(this.outputDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(translations, null, 2), 'utf8');
      console.log(`   📄 Saved ${filename} (${Object.keys(translations).length} translations)`);
    }

    const combinedFilepath = path.join(this.outputDir, 'all.json');
    fs.writeFileSync(combinedFilepath, JSON.stringify(this.translationsData, null, 2), 'utf8');
    console.log(`   📦 Saved combined file: all.json`);

    const metadata = {
      buildTime: new Date().toISOString(),
      buildDuration: Date.now() - this.stats.startTime,
      stats: this.stats,
      languages: Object.keys(this.translationsData),
      templateCount: this.stats.totalTemplates
    };
    fs.writeFileSync(path.join(this.outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
    console.log(`   📊 Saved metadata.json`);
  }

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

async function main() {
  try {
    console.log('🚀 Starting translation build process...\n');
    
    console.log('🔍 Testing LibreTranslate connection...');
    const libreOk = await translationService.testConnection();
    if (libreOk) {
      console.log('✅ LibreTranslate connection successful\n');
    } else {
      console.log('⚠️ LibreTranslate unavailable - using fallback translations only\n');
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default TranslationBuilder;
