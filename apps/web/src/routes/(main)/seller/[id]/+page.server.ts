import prisma from '$lib/prisma';
import { stockCount } from '$lib/util';
import { ProductTags, ProductType } from '@prisma/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const seller = await prisma.user
    .findUnique({
      where: {
        id: Number(params.id),
      },
      select: {
        id: true,
        username: true,
        role: true,
        telegram: true,
        products: {
          where: {
            NOT: {
              tags: {
                has: ProductTags.DELETED,
              },
            },
          },
          select: {
            id: true,
            name: true,
            shortDesc: true,
            image: true,
            stock: true,
            type: true,
            price: true,
          },
        },
      },
    })
    .then((seller) => ({
      ...seller,
      products: seller?.products.map((product) => ({
        ...product,
        stock: product.type != ProductType.LICENSE ? '∞' : stockCount(product.stock),
      })),
    }));

  return {
    seller,
  };
};
