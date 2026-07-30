import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  // Check if user came from registration or has session data
  const codes = url.searchParams.get('codes');
  const username = url.searchParams.get('username');
  
  if (!codes || !username) {
    // If no codes, redirect to login
    throw redirect(302, '/auth/login');
  }
  
  return {
    md2faCodes: codes.split(','),
    username
  };
};
