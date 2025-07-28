#!/usr/bin/env node
// scripts/build-translations-optimized.js - Build translations for configured languages only
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import translation service and templates
import translationService from '../utils/translationService.js';
import messageTranslator from '../utils/messageTranslator.js';

class OptimizedTranslationBuilder {
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
      console.warn('⚠️ SUPPORTED_LANGUAGES not set in environment, using default set');
      return ['es', 'fr', 'de', 'ru', 'zh'];
    }

    const languages = envLanguages.split(',').map(lang => lang.trim()).filter(lang => lang);
    
    if (languages.length === 0) {
      console.warn('⚠️ No valid languages found in SUPPORTED_LANGUAGES, using default set');
      return ['es', 'fr', 'de', 'ru', 'zh'];
    }
    
    console.log(`🎯 Building translations for configured languages: ${languages.join(', ')}`);
    return languages;
  }

  // Ensure output directory exists
  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`✅ Created output directory: ${this.outputDir}`);
    }
  }

  // Get templates and languages to process
  getTemplatesAndLanguages() {
    const templates = Object.keys(messageTranslator.messageTemplates);
    // Use configured languages from environment, always include English
    const languages = ['en', ...this.supportedLanguages];
    
    this.stats.totalTemplates = templates.length;
    this.stats.totalLanguages = languages.length;
    
    console.log(`📊 Found ${templates.length} templates for ${languages.length} languages`);
    return { templates, languages };
  }

  // Build translations for all languages
  async buildAllTranslations() {
    console.log('🔨 Building optimized translations...');
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

      // Show progress
      if (i % 10 === 0) {
        const progress = Math.round((i / templates.length) * 100);
        console.log(`  📈 Progress: ${i}/${templates.length} (${progress}%)`);
      }

      try {
        // Translate with timeout
        const translatedText = await Promise.race([
          translationService.translate(templateText, language),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]);

        if (translatedText && translatedText !== templateText && translatedText.length > 0) {
          this.translationsData[language][templateKey] = translatedText;
          successCount++;
          this.stats.successfulTranslations++;
        } else {
          // Use English fallback
          this.translationsData[language][templateKey] = templateText;
          failCount++;
          this.stats.failedTranslations++;
        }

      } catch (error) {
        // Use English fallback for any error
        this.translationsData[language][templateKey] = templateText;
        failCount++;
        this.stats.failedTranslations++;
      }

      // Small delay to avoid overwhelming translation service
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const efficiency = Math.round((successCount / templates.length) * 100);
    console.log(`  ✅ ${language.toUpperCase()}: ${successCount} success, ${failCount} failed (${efficiency}% efficiency)`);
  }

  // Save translations to individual language files and combined file
  async saveTranslations() {
    console.log('\n💾 Saving translation files...');

    try {
      // Save individual language files
      for (const [language, translations] of Object.entries(this.translationsData)) {
        const filePath = path.join(this.outputDir, `${language}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(translations, null, 2), 'utf8');
        console.log(`  ✅ Saved ${language}.json (${Object.keys(translations).length} translations)`);
      }

      // Save combined file for all languages
      const allFilePath = path.join(this.outputDir, 'all.json');
      await fs.promises.writeFile(allFilePath, JSON.stringify(this.translationsData, null, 2), 'utf8');
      console.log(`  ✅ Saved all.json (${Object.keys(this.translationsData).length} languages)`);

      // Save metadata
      const metadata = {
        buildTime: new Date().toISOString(),
        totalLanguages: this.stats.totalLanguages,
        totalTemplates: this.stats.totalTemplates,
        successfulTranslations: this.stats.successfulTranslations,
        failedTranslations: this.stats.failedTranslations,
        efficiency: Math.round((this.stats.successfulTranslations / (this.stats.successfulTranslations + this.stats.failedTranslations)) * 100),
        buildDuration: Date.now() - this.stats.startTime,
        supportedLanguages: this.supportedLanguages
      };

      const metadataPath = path.join(this.outputDir, 'metadata.json');
      await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
      console.log(`  ✅ Saved metadata.json`);

    } catch (error) {
      console.error(`❌ Error saving translations: ${error.message}`);
      throw error;
    }
  }

  // Print build statistics
  printStats() {
    const duration = Date.now() - this.stats.startTime;
    const efficiency = Math.round((this.stats.successfulTranslations / (this.stats.successfulTranslations + this.stats.failedTranslations)) * 100);
    
    console.log('\n📊 Build Statistics:');
    console.log(`  🏗️  Total Templates: ${this.stats.totalTemplates}`);
    console.log(`  🌍 Languages Built: ${this.stats.totalLanguages} (${this.supportedLanguages.join(', ')})`);
    console.log(`  ✅ Successful: ${this.stats.successfulTranslations}`);
    console.log(`  ❌ Failed: ${this.stats.failedTranslations}`);
    console.log(`  📈 Efficiency: ${efficiency}%`);
    console.log(`  ⏱️  Duration: ${Math.round(duration / 1000)}s`);
    console.log(`  💾 Output: ${this.outputDir}`);
  }
}

// Main execution
async function main() {
  console.log('🚀 Optimized Translation Build Process Started');
  console.log('===============================================');

  const builder = new OptimizedTranslationBuilder();

  try {
    // Build all translations with automatic fallbacks
    await builder.buildAllTranslations();
    
    console.log('\n🎉 Optimized translation build completed successfully!');
    console.log('💡 Tip: Run "node load-translations-to-redis.js" to load into Redis cache');

  } catch (error) {
    console.error(`\n❌ Translation build failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
