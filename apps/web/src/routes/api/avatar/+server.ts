import { json, type RequestHandler } from '@sveltejs/kit';
import { userFromToken } from '$lib/util';
import prisma from '$lib/prisma';
import { uploadImage, isStorageConfigured } from '$lib/storage';

export const POST: RequestHandler = async ({ cookies, request }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id) return json({ error: 'Not authorized' }, { status: 401 });
  if (!isStorageConfigured()) return json({ error: 'Image storage is not configured yet.' }, { status: 503 });

  const body = await request.formData();
  const file = body.get('file');
  if (!file || typeof file === 'string') return json({ error: 'Please choose an image.' }, { status: 400 });

  const url = await uploadImage(file);
  if (!url) return json({ error: 'Upload failed — make sure it’s a valid image.' }, { status: 500 });

  await prisma.user.update({ where: { id: user.id }, data: { avatar: url } });
  return json({ avatar: url });
};
