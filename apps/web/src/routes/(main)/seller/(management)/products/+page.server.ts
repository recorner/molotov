import prisma from '$lib/prisma';
import { ProductTags, ProductType } from '@prisma/client';
import type { PageServerLoad } from './$types';
import { stockCount } from '$lib/util';

export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();

  // Get products with additional stats
  const products = await prisma.product
    .findMany({
      where: {
        seller: {
          id: user.id,
        },
        NOT: {
          tags: {
            has: ProductTags.DELETED,
          },
        },
      },
      select: {
        id: true,
        name: true,
        image: true,
        price: true,
        stock: true,
        type: true,
        createdAt: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            cartEntries: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
    .then((products) =>
      products.map((product) => ({
        ...product,
        stock: product.type != ProductType.LICENSE ? '∞' : stockCount(product.stock),
        salesCount: product._count.cartEntries,
      }))
    );

  // Calculate dashboard stats
  const stats = {
    totalProducts: products.length,
    inStockProducts: products.filter(p => 
      p.type === ProductType.DOWNLOAD || 
      (typeof p.stock === 'string' ? parseInt(p.stock) : p.stock) > 0
    ).length,
    lowStockProducts: products.filter(p => {
      if (p.type === ProductType.DOWNLOAD) return false;
      const stock = typeof p.stock === 'string' ? parseInt(p.stock) : p.stock;
      return stock > 0 && stock < 10;
    }).length,
    outOfStockProducts: products.filter(p => {
      if (p.type === ProductType.DOWNLOAD) return false;
      const stock = typeof p.stock === 'string' ? parseInt(p.stock) : p.stock;
      return stock === 0;
    }).length,
    totalSales: await prisma.cartEntry.count({
      where: {
        product: {
          seller: {
            id: user.id,
          },
        },
        order: {
          status: 'PAID',
        },
      },
    }),
  };

  return {
    products,
    stats,
  };
};
