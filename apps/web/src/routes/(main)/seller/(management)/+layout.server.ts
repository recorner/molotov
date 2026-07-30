import { Role } from '@prisma/client';
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ parent }) => {
  const { user } = await parent();

  if (!user || !user.role.includes(Role.SELLER)) {
    throw redirect(302, '/');
  }
};
