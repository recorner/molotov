import { userFromToken } from '$lib/util';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/prisma';
import { Role } from '@prisma/client';
import { uploadImage } from '$lib/storage';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id || !user.role.includes(Role.ADMIN)) return json({ error: 'auth' }, { status: 401 });

  const body = await request.formData();
  const current = await prisma.category.findUnique({
    where: {
      id: Number(body.get('id')),
    },
  });
  if (!current) return json({ error: 'not found' }, { status: 404 });

  const file = body.get('image');
  if (!file || typeof file === 'string') return json({ error: 'no file' }, { status: 400 });

  const image = await uploadImage(file);
  if (!image) return json({ error: 'upload failed' }, { status: 500 });

  await prisma.category.update({

    where: {
      id: current.id,
    },
    data: {
      image,
    },
  });

  return json({ success: true });
};
