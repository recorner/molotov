import prisma from '$lib/prisma';
import { ProductTags, ProductType } from '@prisma/client';
import type { PageServerLoad } from './$types';
import { stockCount } from '$lib/util';

export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();

  // Get user's order count
  const orders = await prisma.order.count({
    where: {
      buyer: {
        id: user.id,
      },
    },
  });

  // Homepage showcase + advertising configuration (admin-managed key/value settings).
  const settingsRows = await prisma.settings.findMany({ select: { key: true, value: true } });
  const s = Object.fromEntries(settingsRows.map((r) => [r.key, r.value])) as Record<string, string>;
  const truthy = (v?: string) => v === '1' || v === 'true' || v === 'on';

  const home = {
    heroTitle: s.home_hero_title || 'Everything digital, delivered instantly',
    heroSubtitle:
      s.home_hero_subtitle ||
      'Buy and sell digital products, licenses and services with secure escrow, instant delivery and crypto payments.',
    heroCtaLabel: s.home_hero_cta_label || 'Browse marketplace',
    heroCtaLink: s.home_hero_cta_link || '#categories',
    ads: {
      primary: {
        enabled: truthy(s.ad_primary_enabled),
        type: s.ad_primary_type || 'image',
        media: s.ad_primary_media || '',
        link: s.ad_primary_link || '',
        title: s.ad_primary_title || '',
        caption: s.ad_primary_caption || '',
      },
      secondary: {
        enabled: truthy(s.ad_secondary_enabled),
        type: s.ad_secondary_type || 'image',
        media: s.ad_secondary_media || '',
        link: s.ad_secondary_link || '',
        title: s.ad_secondary_title || '',
        caption: s.ad_secondary_caption || '',
      },
    },
  };

  // Get latest announcements
  const announcements = await prisma.announcement.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      poster: {
        select: {
          username: true,
        },
      },
    },
  });

  // Get featured/trending products - you can modify this logic
  const featuredProducts = await prisma.product.findMany({
    where: {
      NOT: {
        tags: {
          has: ProductTags.DELETED,
        },
      },
    },
    orderBy: [
      { createdAt: 'desc' }
    ],
    take: 8,
    select: {
      id: true,
      name: true,
      shortDesc: true,
      price: true,
      stock: true,
      type: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      seller: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  }).then((products) =>
    products.map((product) => ({
      ...product,
      stock: product.type !== ProductType.LICENSE ? '∞' : stockCount(product.stock),
    }))
  );

  // Get top-selling products (based on order count)
  const topSellingProducts = await prisma.product.findMany({
    where: {
      NOT: {
        tags: {
          has: ProductTags.DELETED,
        },
      },
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      seller: {
        select: {
          id: true,
          username: true,
        },
      },
      cartEntries: {
        where: {
          order: {
            status: 'PAID',
          },
        },
        select: {
          quantity: true,
        },
      },
    },
    take: 20,
  }).then((products) => {
    // Calculate total sales and sort by popularity
    const withSales = products.map((product) => ({
      id: product.id,
      name: product.name,
      shortDesc: product.shortDesc,
      price: product.price,
      stock: product.type !== ProductType.LICENSE ? '∞' : stockCount(product.stock),
      type: product.type,
      category: product.category,
      seller: product.seller,
      totalSales: product.cartEntries.reduce((sum, entry) => sum + entry.quantity, 0),
    }));

    return withSales
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 6);
  });

  // Get recent products
  const recentProducts = await prisma.product.findMany({
    where: {
      NOT: {
        tags: {
          has: ProductTags.DELETED,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 6,
    select: {
      id: true,
      name: true,
      shortDesc: true,
      price: true,
      stock: true,
      type: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      seller: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  }).then((products) =>
    products.map((product) => ({
      ...product,
      stock: product.type !== ProductType.LICENSE ? '∞' : stockCount(product.stock),
    }))
  );

  // Get categories with product counts
  const categoriesWithCounts = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      image: true,
      _count: {
        select: {
          products: {
            where: {
              NOT: {
                tags: {
                  has: ProductTags.DELETED,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      order: 'asc',
    },
  }).then((categories) =>
    categories.map((category) => ({
      ...category,
      image: category.image ? `${process.env.UPLOAD_PREFIX}/${category.image}` : null,
      productCount: category._count.products,
    }))
  );

  return {
    user,
    orders,
    announcements,
    featuredProducts,
    topSellingProducts,
    recentProducts,
    categoriesWithCounts,
    home,
  };
};
