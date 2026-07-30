import { userFromToken } from '$lib/util';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { ProductType, Role } from '@prisma/client';
import prisma from '$lib/prisma';

export const actions: Actions = {
  async publish({ request, cookies }) {
    const user = userFromToken(cookies.get('__token'));
    console.log(user);
    if (!user?.id || !user.role.includes(Role.SELLER)) return fail(401, { error: 'unauthorized' });

    const body = await request.formData();

    // validate length of fields
    if ((body.get('name') as string)?.length > 60 || (body.get('description') as string)?.length > 4096 || (body.get('shortDesc') as string)?.length > 100)
      return fail(400, { error: 'length' });

    const product = await prisma.product.create({
      data: {
        name: body.get('name') as string,
        description: body.get('description') as string,
        shortDesc: body.get('shortDesc') as string,
        image: (body.get('image') as string) || null,
        type: body.get('type') as ProductType,
        price: Number(body.get('price')),
        stock: (body.get('stock') as string)
          .split('\n')
          .filter((line) => line.trim() !== '')
          .join('\n'),
        seller: {
          connect: {
            id: user.id,
          },
        },
        category: {
          connect: {
            id: Number(body.get('category')),
          },
        },
      },
    });

    if (product) {
      throw redirect(302, `/seller/products/${product.id}`);
    } else {
      return fail(500, { error: 'product' });
    }
  },
};
