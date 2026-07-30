import { userFromToken } from '$lib/util';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Role } from '@prisma/client';
import { uploadImage, uploadFile } from '$lib/storage';

/** Admin-only upload for homepage ad media (images or short video clips). Returns a public URL. */
export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id || !user.role.includes(Role.ADMIN)) return json({ error: 'auth' }, { status: 401 });

  const body = await request.formData();
  const file = body.get('file');
  if (!file || typeof file === 'string') return json({ error: 'no file' }, { status: 400 });

  const isVideo = (file as File).type?.startsWith('video/');

  if (isVideo) {
    const result = await uploadFile(file);
    if (!result || 'error' in result) {
      return json({ error: result && 'error' in result ? result.error : 'upload failed' }, { status: 500 });
    }
    return json({ url: result.url });
  }

  const url = await uploadImage(file);
  if (!url) return json({ error: 'upload failed' }, { status: 500 });
  return json({ url });
};
