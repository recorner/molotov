import { put } from '@vercel/blob';
import crypto from 'crypto';
import sharp from 'sharp';

/**
 * Object storage backed by Vercel Blob.
 *
 * Requires the BLOB_READ_WRITE_TOKEN environment variable (provided automatically
 * when a Blob store is attached to the Vercel project, or set manually for local dev).
 *
 * uploadImage validates that the upload is a real image, stores it under a
 * content-addressed name, and returns the public URL (or null on failure).
 */

const token = process.env.BLOB_READ_WRITE_TOKEN;

export const isStorageConfigured = () => Boolean(token);

export const uploadImage = async (file: File): Promise<string | null> => {
  if (!token) return null;

  const buffer = Buffer.from(await file.arrayBuffer());

  // validate the buffer is a decodable image
  const meta = await sharp(buffer)
    .metadata()
    .catch(() => null);
  if (!meta) return null;

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = (file.name.split('.').at(-1) || 'png').toLowerCase();
  const name = `uploads/${hash}.${ext}`;

  try {
    const { url } = await put(name, buffer, {
      access: 'public',
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: file.type || `image/${ext}`,
    });
    return url;
  } catch (err) {
    console.error('Blob upload failed:', err);
    return null;
  }
};

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export type UploadedFile = { url: string; name: string; type: string } | { error: 'too_large' | 'failed' } | null;

/** Upload any file type (chat attachments) to Vercel Blob. Returns metadata or an error. */
export const uploadFile = async (file: File): Promise<UploadedFile> => {
  if (!token) return null;
  if (file.size > MAX_FILE_BYTES) return { error: 'too_large' };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = (file.name.split('.').at(-1) || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const name = `chat/${hash}.${ext}`;
    const { url } = await put(name, buffer, {
      access: 'public',
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: file.type || 'application/octet-stream',
    });
    return { url, name: file.name, type: file.type || 'application/octet-stream' };
  } catch (err) {
    console.error('Blob file upload failed:', err);
    return { error: 'failed' };
  }
};
