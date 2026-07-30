import { userFromToken } from '$lib/util';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import prisma from '$lib/prisma';
import { Role } from '@prisma/client';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id || !user.role.includes(Role.ADMIN)) return json({ error: 'auth' }, { status: 401 });

  const body = await request.json();
  const current = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  const toCreate = body.filter((category: { id: number }) => !current.find((c) => c.id === category.id));
  const toDelete = current.filter((category: { id: number }) => !body.find((c) => c.id === category.id));
  const toUpdate = body.filter((category: { id: number }) => current.find((c) => c.id === category.id));

  // Check if any categories to delete have products
  const categoriesWithProducts = toDelete.filter((category) => {
    const currentCategory = current.find((c) => c.id === category.id);
    return currentCategory && currentCategory._count.products > 0;
  });

  if (categoriesWithProducts.length > 0) {
    const categoryDetails = categoriesWithProducts.map(category => {
      const currentCategory = current.find((c) => c.id === category.id);
      return {
        id: category.id,
        name: currentCategory?.name || 'Unknown',
        productCount: currentCategory?._count.products || 0
      };
    });
    
    return json({ 
      error: 'Cannot delete categories that contain products. Please move or delete the products first.',
      categoriesWithProducts: categoryDetails
    }, { status: 400 });
  }

  // Safe to delete categories with no products
  if (toDelete.length > 0) {
    await prisma.category.deleteMany({
      where: {
        id: {
          in: toDelete.map((c) => c.id),
        },
      },
    });
  }

  await prisma.category.createMany({
    data: toCreate.map((c) => ({
      name: c.name,
      order: c.order,
    })),
  });

  for (const category of toUpdate) {
    await prisma.category.update({
      where: {
        id: category.id,
      },
      data: {
        name: category.name,
        order: category.order,
      },
    });
  }

  return json({ success: true });
};
