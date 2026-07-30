import prisma from '$lib/prisma';
import { ProductTags, ProductType, Role } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { userFromToken } from '$lib/util';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { user } = await parent();

  const product = await prisma.product.findUnique({
    where: {
      id: Number(params.id),
    },
    select: {
      id: true,
      name: true,
      description: true,
      shortDesc: true,
      image: true,
      price: true,
      stock: true,
      type: true,
      tags: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      seller: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!product || product.tags.includes(ProductTags.DELETED) || product.seller.id !== user.id)
    throw error(404, 'Product not found');

  return {
    product,
  };
};

export const actions: Actions = {
  async update({ request, params, cookies }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user?.id || !user.role.includes(Role.SELLER)) return fail(401, { error: 'unauthorized' });
    const body = await request.formData();

    if ((body.get('name') as string)?.length > 60 || (body.get('description') as string)?.length > 4096 || (body.get('shortDesc') as string)?.length > 100)
      return fail(400, { error: 'length' });

    // verify that we are the seller of this product
    const product = await prisma.product.findUnique({
      where: {
        id: Number(params.id),
      },
      select: {
        seller: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!product || product.seller.id !== user.id) return fail(401, { error: 'unauthorized' });

    await prisma.product.update({
      where: {
        id: Number(params.id),
      },
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
      return { success: true };
    } else {
      return fail(500, { error: 'product' });
    }
  },

  async delete({ params, cookies }) {
    const user = userFromToken(cookies.get('__token'));
    if (!user?.id || !user.role.includes(Role.SELLER)) return fail(401, { error: 'unauthorized' });

    const product = await prisma.product.findUnique({
      where: { id: Number(params.id) },
      select: { tags: true, seller: { select: { id: true } } },
    });
    if (!product || product.seller.id !== user.id) return fail(401, { error: 'unauthorized' });

    // Soft delete: tag as DELETED (preserves order history / delivered content)
    await prisma.product.update({
      where: { id: Number(params.id) },
      data: {
        tags: Array.from(new Set([...product.tags, ProductTags.DELETED])),
      },
    });

    return { success: true, deleted: true };
  },
};
