import prisma from '$lib/prisma';
import { ProductTags, ProductType } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { stockCount } from '$lib/util';

export const load: PageServerLoad = async ({ params }) => {
  const product = await prisma.product
    .findUnique({
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
        seller: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    })
    .then((product) =>
      product
        ? {
            ...product,
            stock: product.type != ProductType.LICENSE ? '∞' : stockCount(product.stock),
          }
        : null
    );

  if (!product || product.tags.includes(ProductTags.DELETED)) throw error(404, 'Product not found');

  return {
    product,
  };
};

export const actions: Actions = {
  async add({ params, request, cookies }) {
    const body = await request.formData();

    const product = await prisma.product
      .findUnique({
        where: {
          id: Number(params.id),
        },
        select: {
          id: true,
          stock: true,
          type: true,
          tags: true,
        },
      })
      .then((product) =>
        product
          ? {
              ...product,
              stock: product.type != ProductType.LICENSE ? '∞' : stockCount(product.stock),
            }
          : null
      );

    if (!product || product.tags.includes(ProductTags.DELETED)) return fail(404, { error: 'product' });

    const quantity = Number(body.get('quantity'));
    if (isNaN(quantity) || quantity < 1 || (typeof product.stock == 'number' && quantity > product.stock))
      return fail(400, { error: 'quantity' });

    const cart = JSON.parse(cookies.get('cart') || '[]');
    const index = cart.findIndex((item) => item.id == product.id);
    const oldQuantity = index == -1 ? 0 : cart[index].quantity;
    if (index == -1) cart.push({ id: product.id, quantity });
    else
      cart[index].quantity = Math.min(
        cart[index].quantity + quantity,
        typeof product.stock == 'number' ? product.stock : 1
      );

    // check if quantity did not change
    if (oldQuantity == cart[index]?.quantity) return fail(400, { error: 'full' });

    cookies.set('cart', JSON.stringify(cart), { path: '/' });

    return {
      success: true,
    };
  },
};
