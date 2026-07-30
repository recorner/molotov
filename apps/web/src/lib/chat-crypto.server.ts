import crypto from 'crypto';

/**
 * AES-256-GCM encryption-at-rest for chat message bodies. The DB never stores
 * plaintext. Key derives from CHAT_ENCRYPTION_KEY (preferred) or JWT_SECRET.
 * Format: v1:<iv b64>:<tag b64>:<ciphertext b64>
 */
const KEY = crypto
  .createHash('sha256')
  .update(process.env.CHAT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'sereni-dev-key')
  .digest();

export function encryptMessage(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptMessage(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith('v1:')) return stored; // tolerate any legacy plaintext
  try {
    const [, ivB64, tagB64, dataB64] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '[message could not be decrypted]';
  }
}
