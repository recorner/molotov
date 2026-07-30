import { userFromToken } from '$lib/util';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Role } from '@prisma/client';
import { uploadImage, isStorageConfigured } from '$lib/storage';

export const POST: RequestHandler = async ({ cookies, request }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user || !user.role.includes(Role.SELLER)) return json({ error: 'Not authorized' }, { status: 401 });

  if (!isStorageConfigured()) {
    return json({ error: 'Image storage is not configured yet. Add BLOB_READ_WRITE_TOKEN.' }, { status: 503 });
  }

  const body = await request.formData();

  const file = body.get('file');
  if (!file || typeof file == 'string') return json({ error: 'Please choose a valid image file' }, { status: 400 });

  const image = await uploadImage(file);
  if (!image) return json({ error: 'Upload failed. Make sure the file is a valid image.' }, { status: 500 });

  // uploadImage returns the full public Blob URL
  return json({ image });
};
