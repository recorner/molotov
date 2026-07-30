import { redirect } from '@sveltejs/kit';
import { userFromToken } from '$lib/util';

export const load = async ({ cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  
  if (!user?.id) {
    throw redirect(302, '/auth/login');
  }
  
  if (!user.role.includes('ADMIN')) {
    throw redirect(302, '/');
  }

  return {};
};
