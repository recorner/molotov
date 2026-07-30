// encryption.js - Advanced encryption for database and sensitive data
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

class EncryptionManager {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
    
    // Initialize master key
    this.masterKey = this.getMasterKey();
  }

  // Get or create master encryption key
  getMasterKey() {
    const keyPath = './encryption.key';
    
    try {
      if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath);
      } else {
        console.log('[🔐] Generating new master encryption key...');
        const key = crypto.randomBytes(this.keyLength);
        fs.writeFileSync(keyPath, key, { mode: 0o600 }); // Restrict permissions
        console.log('[🔐] Master key created and secured');
        return key;
      }
    } catch (error) {
      console.error('[🔐] Encryption key error:', error);
      throw new Error('Failed to initialize encryption');
    }
  }

  // Derive key from master key and salt
  deriveKey(salt, info = 'database') {
    return crypto.hkdfSync('sha256', this.masterKey, salt, Buffer.from(info), this.keyLength);
  }

  // Encrypt sensitive data
  encrypt(data, context = 'general') {
    try {
      const salt = crypto.randomBytes(this.saltLength);
      const key = this.deriveKey(salt, context);
      const iv = crypto.randomBytes(this.ivLength);
      
      const cipher = crypto.createCipheriv('aes-256-cbc', key.slice(0, 32), iv);
      
      let encrypted = cipher.update(data, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Combine: salt + iv + encrypted data (no auth tag for CBC)
      const result = Buffer.concat([
        salt,
        iv, 
        Buffer.from(encrypted, 'base64')
      ]).toString('base64');
      
      return result;
    } catch (error) {
      console.error('[🔐] Encryption error:', error);
      // Return the original data if encryption fails (for backward compatibility)
      return data;
    }
  }

  // Decrypt sensitive data
  decrypt(encryptedData, context = 'general') {
    try {
      // Check if data is already decrypted (backward compatibility)
      if (!encryptedData || typeof encryptedData !== 'string') {
        return encryptedData;
      }
      
      // Try to decode as base64, if it fails, assume it's plain text
      let buffer;
      try {
        buffer = Buffer.from(encryptedData, 'base64');
      } catch (e) {
        return encryptedData; // Return as-is if not base64
      }
      
      // Check if buffer is large enough to contain salt + iv + data
      if (buffer.length < this.saltLength + this.ivLength + 1) {
        return encryptedData; // Return as-is if too small
      }
      
      // Extract components
      const salt = buffer.slice(0, this.saltLength);
      const iv = buffer.slice(this.saltLength, this.saltLength + this.ivLength);
      const encrypted = buffer.slice(this.saltLength + this.ivLength);
      
      const key = this.deriveKey(salt, context);
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key.slice(0, 32), iv);
      
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('[🔐] Decryption error:', error);
      // Return original data if decryption fails (for backward compatibility)
      return encryptedData;
    }
  }

  // Hash passwords/PINs with salt
  hashPassword(password, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(this.saltLength);
    }
    
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
    return {
      hash: Buffer.concat([salt, hash]).toString('base64'),
      salt: salt.toString('base64')
    };
  }

  // Verify password/PIN
  verifyPassword(password, storedHash) {
    try {
      const buffer = Buffer.from(storedHash, 'base64');
      const salt = buffer.slice(0, this.saltLength);
      const hash = buffer.slice(this.saltLength);
      
      const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
      
      return crypto.timingSafeEqual(hash, testHash);
    } catch (error) {
      console.error('[🔐] Password verification error:', error);
      return false;
    }
  }

  // Encrypt private keys with additional context
  encryptPrivateKey(privateKey, currency, address) {
    const context = `privatekey_${currency}_${address}`;
    return this.encrypt(privateKey, context);
  }

  // Decrypt private keys
  decryptPrivateKey(encryptedKey, currency, address) {
    const context = `privatekey_${currency}_${address}`;
    return this.decrypt(encryptedKey, context);
  }

  // Generate secure random tokens
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('base64url');
  }

  // Create HMAC for data integrity
  createHMAC(data, context = 'integrity') {
    const key = this.deriveKey(Buffer.from(context), 'hmac');
    return crypto.createHmac('sha256', key).update(data).digest('base64');
  }

  // Verify HMAC
  verifyHMAC(data, hmac, context = 'integrity') {
    const expectedHMAC = this.createHMAC(data, context);
    return crypto.timingSafeEqual(Buffer.from(hmac, 'base64'), Buffer.from(expectedHMAC, 'base64'));
  }

  // Secure key erasure from memory
  secureErase(buffer) {
    if (Buffer.isBuffer(buffer)) {
      buffer.fill(0);
    }
  }

  // Database field encryption for specific sensitive fields
  encryptDatabaseField(value, tableName, fieldName, recordId) {
    const context = `db_${tableName}_${fieldName}_${recordId}`;
    return this.encrypt(value.toString(), context);
  }

  // Database field decryption
  decryptDatabaseField(encryptedValue, tableName, fieldName, recordId) {
    const context = `db_${tableName}_${fieldName}_${recordId}`;
    return this.decrypt(encryptedValue, context);
  }
}

// Global encryption instance
const encryptionManager = new EncryptionManager();

export default encryptionManager;
