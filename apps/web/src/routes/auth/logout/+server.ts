import { redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ cookies }) => {
  cookies.delete('__token', { path: '/' });
  throw redirect(302, '/auth/login');
};
