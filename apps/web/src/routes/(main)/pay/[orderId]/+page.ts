import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
  const { user } = await parent();
  
  if (!user) {
    throw error(401, 'Authentication required');
  }

  const { orderId } = params;
  
  return {
    orderId,
    user,
  };
};
