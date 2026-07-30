import prisma from '$lib/prisma';
import { OrderStatus, ProductTags, ProductType } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { stockCount, userFromToken } from '$lib/util';

export const load: PageServerLoad = async ({ parent, cookies }) => {
  let { cart } = await parent();

  const products = await prisma.product
    .findMany({
      where: {
        id: {
          in: cart.map((item) => item.id),
        },
      },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        type: true,
        category: {
          select: {
            name: true,
          },
        },
      },
    })
    .then((products) =>
      products
        .map((product) => ({
          ...product,
          stock: product.type != ProductType.LICENSE ? '∞' : stockCount(product.stock),
        }))
        .filter((product) => typeof product.stock == 'string' || product.stock > 0)
    );

  return {
    products: products
      .map((product) => ({
        ...product,
        quantity: cart.find((item) => item.id == product.id)?.quantity ?? 0,
      }))
      .filter((product) => product.quantity > 0),
  };
};

export const actions: Actions = {
  async checkout({ request, cookies }) {
    let user = userFromToken(cookies.get('__token')) as any;
    if (!user) return fail(401);

    user = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        balance: true,
      },
    });

    const body = await request.formData();
    const cart = body
      .getAll('products')
      .map((id, i) => ({ id: parseInt(id as string), quantity: parseInt(body.getAll('quantities')[i] as string) }));

    // validate cart
    const products = await prisma.product.findMany({
      where: {
        id: {
          in: cart.map((item) => item.id),
        },
        NOT: {
          tags: {
            has: ProductTags.DELETED,
          },
        },
      },
      select: {
        id: true,
        price: true,
        stock: true,
        type: true,
        seller: {
          select: {
            id: true,
          },
        },
      },
    });

    const validCart = cart
      .map((item) => {
        const product = products.find((product) => product.id == item.id);
        if (!product) return null;
        // Per-type purchase cap: licenses & services one-per-customer; downloads unlimited.
        const typeCap = product.type === ProductType.LICENSE || product.type === ProductType.SERVICE ? 1 : 99;
        let qty = Math.min(item.quantity, typeCap);
        if (product.type == ProductType.LICENSE) qty = Math.min(qty, stockCount(product.stock));
        return { ...item, quantity: qty };
      })
      .filter((item) => item?.quantity && item.quantity > 0);

    const cartChanged = validCart.some((item) => item?.quantity != item?.quantity);

    cookies.set('cart', JSON.stringify(validCart), { path: '/' });
    if (cartChanged) return fail(400, { error: 'changed' });
    if (validCart.length == 0) return fail(400, { error: 'empty' });
    if (validCart.length != cart.length) return fail(400, { error: 'invalid' });

    const total = validCart.reduce((total, item) => {
      const product = products.find((product) => product.id == item.id);
      if (!product) return total;
      return total + product.price * item.quantity;
    }, 0);

    // paranoid check
    user = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        balance: true,
      },
    });

    if (user.balance < total) return fail(400, { error: 'insufficient' });

    // create order
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        balance: {
          decrement: total,
        },
      },
    });

    const fee = await prisma.settings
      .findUnique({
        where: {
          key: 'fee',
        },
        select: {
          value: true,
        },
      })
      .then((data) => data?.value ?? 0)
      .then((data) => 1 - parseFloat(data || '0') / 100);

    const order = await prisma.order.create({
      data: {
        buyer: {
          connect: {
            id: user.id,
          },
        },
        status: OrderStatus.PAID,
        cart: {
          createMany: {
            data: await Promise.all(
              validCart.map(async (item) => {
                const product = products.find((product) => product.id == item.id);
                if (!product) return null;

                // credit seller
                await prisma.user.update({
                  where: {
                    id: product.seller.id,
                  },
                  data: {
                    balance: {
                      increment: product.price * item.quantity * fee,
                    },
                  },
                });

                if (product.type == ProductType.DOWNLOAD || product.type == ProductType.SERVICE) {
                  return {
                    productId: item.id,
                    quantity: item.quantity,
                    delivered: product.stock,
                  };
                } else if (product.type == ProductType.LICENSE) {
                  await prisma.product.update({
                    where: {
                      id: product.id,
                    },
                    data: {
                      stock: product.stock.split('\n').slice(item.quantity).join('\n'),
                    },
                  });

                  return {
                    productId: item.id,
                    quantity: item.quantity,
                    delivered: product.stock.split('\n').slice(0, item.quantity).join('\n'),
                  };
                }
              })
            ).then((data) => data.filter((data) => data)),
          },
        },
      },
    });

    // clear cart
    cookies.set('cart', JSON.stringify([]), { path: '/' });

    return { success: true };
  },
};
