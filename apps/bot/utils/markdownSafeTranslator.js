// utils/markdownSafeTranslator.js - Safe markdown translation handler
import translationService from './translationService.js';
import logger from './logger.js';

class MarkdownSafeTranslator {
  constructor() {
    // Markdown patterns that need special handling
    this.markdownPatterns = {
      bold: /\*([^*]+)\*/g,
      italic: /_([^_]+)_/g,
      code: /`([^`]+)`/g,
      link: /\[([^\]]+)\]\(([^)]+)\)/g,
      strikethrough: /~([^~]+)~/g
    };
    
    // Placeholder patterns for safe translation
    this.placeholders = {
      bold: '§BOLD§',
      italic: '§ITALIC§',
      code: '§CODE§',
      link: '§LINK§',
      strikethrough: '§STRIKE§'
    };
  }

  // Extract markdown formatting and replace with placeholders
  extractMarkdown(text) {
    const extracted = {
      text: text,
      formatting: []
    };

    // Extract bold text
    extracted.text = extracted.text.replace(this.markdownPatterns.bold, (match, content, offset) => {
      extracted.formatting.push({
        type: 'bold',
        content: content,
        placeholder: `${this.placeholders.bold}${extracted.formatting.length}${this.placeholders.bold}`
      });
      return `${this.placeholders.bold}${extracted.formatting.length - 1}${this.placeholders.bold}`;
    });

    // Extract italic text
    extracted.text = extracted.text.replace(this.markdownPatterns.italic, (match, content, offset) => {
      extracted.formatting.push({
        type: 'italic',
        content: content,
        placeholder: `${this.placeholders.italic}${extracted.formatting.length}${this.placeholders.italic}`
      });
      return `${this.placeholders.italic}${extracted.formatting.length - 1}${this.placeholders.italic}`;
    });

    // Extract code text
    extracted.text = extracted.text.replace(this.markdownPatterns.code, (match, content, offset) => {
      extracted.formatting.push({
        type: 'code',
        content: content,
        placeholder: `${this.placeholders.code}${extracted.formatting.length}${this.placeholders.code}`
      });
      return `${this.placeholders.code}${extracted.formatting.length - 1}${this.placeholders.code}`;
    });

    // Extract links
    extracted.text = extracted.text.replace(this.markdownPatterns.link, (match, text, url, offset) => {
      extracted.formatting.push({
        type: 'link',
        content: text,
        url: url,
        placeholder: `${this.placeholders.link}${extracted.formatting.length}${this.placeholders.link}`
      });
      return `${this.placeholders.link}${extracted.formatting.length - 1}${this.placeholders.link}`;
    });

    return extracted;
  }

  // Restore markdown formatting after translation
  restoreMarkdown(translatedText, formatting) {
    let result = translatedText;

    formatting.forEach((format, index) => {
      const placeholder = `${this.placeholders[format.type]}${index}${this.placeholders[format.type]}`;
      
      let replacement;
      switch (format.type) {
        case 'bold':
          replacement = `*${format.content}*`;
          break;
        case 'italic':
          replacement = `_${format.content}_`;
          break;
        case 'code':
          replacement = `\`${format.content}\``;
          break;
        case 'link':
          replacement = `[${format.content}](${format.url})`;
          break;
        case 'strikethrough':
          replacement = `~${format.content}~`;
          break;
        default:
          replacement = format.content;
      }
      
      result = result.replace(placeholder, replacement);
    });

    return result;
  }

  // Safely translate text with markdown
  async translateWithMarkdown(text, targetLang, telegramId = null) {
    try {
      if (!text || targetLang === 'en') {
        return text;
      }

      // Extract markdown formatting
      const extracted = this.extractMarkdown(text);
      
      // Translate the plain text
      const translatedPlainText = await translationService.translate(
        extracted.text, 
        targetLang, 
        telegramId
      );
      
      // Translate the content within markdown formatting
      for (let format of extracted.formatting) {
        if (format.content && format.type !== 'code') { // Don't translate code blocks
          format.content = await translationService.translate(
            format.content, 
            targetLang, 
            telegramId
          );
        }
      }
      
      // Restore markdown formatting
      const result = this.restoreMarkdown(translatedPlainText, extracted.formatting);
      
      logger.debug('MARKDOWN_TRANSLATOR', `Safely translated: ${text.substring(0, 50)}...`);
      return result;
      
    } catch (error) {
      logger.error('MARKDOWN_TRANSLATOR', 'Translation failed, returning original', error);
      return text; // Return original text if translation fails
    }
  }

  // Clean text for safe telegram sending
  sanitizeForTelegram(text) {
    if (!text) return text;
    
    // Remove potentially problematic characters
    let cleaned = text
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
      .replace(/\*{3,}/g, '**') // Fix multiple asterisks
      .replace(/_{3,}/g, '__') // Fix multiple underscores
      .replace(/`{3,}/g, '``'); // Fix multiple backticks
    
    // Ensure markdown is properly closed
    const openBold = (cleaned.match(/\*/g) || []).length;
    const openItalic = (cleaned.match(/_/g) || []).length;
    const openCode = (cleaned.match(/`/g) || []).length;
    
    // Close unclosed markdown
    if (openBold % 2 !== 0) cleaned += '*';
    if (openItalic % 2 !== 0) cleaned += '_';
    if (openCode % 2 !== 0) cleaned += '`';
    
    return cleaned;
  }

  // Escape markdown special characters for literal text
  escapeMarkdown(text) {
    if (!text) return text;
    
    return text
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/`/g, '\\`')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~');
  }
}

// Create singleton instance
const markdownSafeTranslator = new MarkdownSafeTranslator();

export default markdownSafeTranslator;
